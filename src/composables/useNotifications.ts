/**
 * useNotifications — singleton store for buzzybee.notifications.
 *
 * Module-level state (one list, one unread count) is shared across the bell
 * dropdown and the /inbox page. Realtime subscription is owned by this module
 * so we get one channel for the whole app.
 *
 * Mirrors the MikeSteelv2 pattern.
 */

import { computed, ref, type Component } from 'vue'
import { useRouter } from 'vue-router'
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  Bell,
  AtSign,
  MessageCircle,
  AlertCircle,
  CheckCircle2,
  UserPlus,
  ListChecks,
  Video
} from 'lucide-vue-next'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useTasksStore } from '@/stores/tasks'
import { useClientsStore } from '@/stores/clients'
import { useProjectsStore } from '@/stores/projects'

export interface Notification {
  id: string
  user_id: string
  type:
    | 'task_assigned'
    | 'task_unassigned'
    | 'task_status_changed'
    | 'task_completed'
    | 'task_due_soon'
    | 'task_handoff'
    | 'project_added'
    | 'comment'
    | 'mention'
    | 'subtask_assigned'
    | 'ticket_created'
    | 'ticket_status'
    | 'ticket_assigned'
    | 'ticket_comment'
    | 'meeting_starting'
  source_type: 'task' | 'project' | 'comment' | 'ticket' | 'meeting'
  source_id: string | null
  source_ref: string | null
  actor_id: string | null
  actor_name: string | null
  title: string
  preview: string | null
  link: string | null
  is_read: boolean
  created_at: string
}

const PAGE_SIZE = 30

const notifications = ref<Notification[]>([])
const loading = ref(false)
const hasMore = ref(true)
let currentOffset = 0
let initializedFor: string | null = null
let channel: RealtimeChannel | null = null

const unreadCount = computed(
  () => notifications.value.filter((n) => !n.is_read).length
)

// Listeners fired once per genuinely-new incoming notification — realtime
// INSERT only, never on initial load / pagination / mark-read. The toast host
// registers here; see applyRealtime's INSERT branch for the fire point.
const newListeners = new Set<(n: Notification) => void>()
export function onNewNotification(cb: (n: Notification) => void): () => void {
  newListeners.add(cb)
  return () => newListeners.delete(cb)
}

/** Icon for a notification type — shared by the inbox row and the toast. */
export function typeIcon(t: Notification['type']): Component {
  switch (t) {
    case 'task_assigned':
    case 'task_handoff':
    case 'project_added':
      return UserPlus
    case 'subtask_assigned':
      return ListChecks
    case 'task_completed':
      return CheckCircle2
    case 'task_status_changed':
    case 'ticket_status':
      return AlertCircle
    case 'comment':
    case 'ticket_comment':
      return MessageCircle
    case 'mention':
      return AtSign
    case 'meeting_starting':
      return Video
    default:
      return Bell
  }
}
/** Accent color (text-*) for a notification type. */
export function typeColor(t: Notification['type']): string {
  switch (t) {
    case 'task_assigned':
    case 'task_handoff':
    case 'project_added':
    case 'subtask_assigned':
      return 'text-info'
    case 'task_completed':
      return 'text-success'
    case 'task_status_changed':
    case 'ticket_status':
      return 'text-warning'
    case 'comment':
    case 'ticket_comment':
      return 'text-info'
    case 'mention':
      return 'text-accent'
    case 'meeting_starting':
      return 'text-primary'
    default:
      return 'text-base-content/50'
  }
}

async function fetchPage(userId: string, reset = false) {
  if (!userId) return
  if (reset) {
    currentOffset = 0
    notifications.value = []
    hasMore.value = true
  }
  if (loading.value || !hasMore.value) return
  loading.value = true
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(currentOffset, currentOffset + PAGE_SIZE - 1)
  if (!error && data) {
    // Dedup against rows that may have arrived via realtime INSERT while this
    // page request was in flight (otherwise the same id lands twice → dup Vue
    // keys + double unread count).
    const present = new Set(notifications.value.map((n) => n.id))
    const fresh = (data as Notification[]).filter((r) => !present.has(r.id))
    notifications.value.push(...fresh)
    currentOffset += data.length
    hasMore.value = data.length === PAGE_SIZE
  } else if (error) {
    console.warn('[notifications] fetchPage:', error.message)
  }
  loading.value = false
}

async function markRead(id: string) {
  const n = notifications.value.find((x) => x.id === id)
  if (!n || n.is_read) return
  n.is_read = true
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)
  if (error) {
    n.is_read = false
    console.warn('[notifications] markRead:', error.message)
  }
}

async function markAllRead(userId: string) {
  for (const n of notifications.value) n.is_read = true
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false)
  if (error) console.warn('[notifications] markAllRead:', error.message)
}

function applyRealtime(payload: any) {
  const ev = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
  if (ev === 'INSERT') {
    const row = payload.new as Notification
    if (!notifications.value.some((n) => n.id === row.id)) {
      notifications.value.unshift(row)
      for (const cb of newListeners) cb(row)
    }
  } else if (ev === 'UPDATE') {
    const row = payload.new as Notification
    const idx = notifications.value.findIndex((n) => n.id === row.id)
    if (idx !== -1) notifications.value[idx] = row
  } else if (ev === 'DELETE') {
    const row = payload.old as Notification
    notifications.value = notifications.value.filter((n) => n.id !== row.id)
  }
}

function startRealtime(userId: string) {
  if (channel) return
  channel = supabase
    .channel(`bb-notifications-${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'buzzybee',
        table: 'notifications',
        filter: `user_id=eq.${userId}`
      },
      applyRealtime
    )
    .subscribe()
}

async function stopRealtime() {
  if (channel) {
    try {
      await supabase.removeChannel(channel)
    } catch {
      /* ignore */
    }
    channel = null
  }
}

/** Initialize for a user. Idempotent — calling more than once for the same
 *  user is a no-op. Switching users resets state. */
async function init(userId: string) {
  if (initializedFor === userId) return
  if (initializedFor) {
    await stopRealtime()
    notifications.value = []
    currentOffset = 0
    hasMore.value = true
  }
  initializedFor = userId
  await fetchPage(userId, true)
  startRealtime(userId)
}

async function reset() {
  await stopRealtime()
  initializedFor = null
  notifications.value = []
  currentOffset = 0
  hasMore.value = true
}

export function useNotifications() {
  const auth = useAuthStore()
  const router = useRouter()
  const tasks = useTasksStore()
  const clients = useClientsStore()
  const projects = useProjectsStore()

  // Auto-initialize on first call when authenticated.
  if (auth.user?.id && initializedFor !== auth.user.id) {
    void init(auth.user.id)
  }

  // Mark read + navigate to the notification's subject. Shared by the inbox
  // row and the toast so the open behavior never drifts between them.
  async function openNotification(n: Notification) {
    await markRead(n.id)
    if (n.source_type === 'task' && n.source_id) {
      const task = tasks.tasks.find((t) => t.id === n.source_id)
      if (task) {
        if (task.client_id !== clients.currentClientId) clients.setCurrentClient(task.client_id)
        if (task.project_id && task.project_id !== projects.currentProjectId) {
          projects.setCurrentProject(task.project_id)
        }
      }
      await router.push({ name: 'workstation-tasks' })
      tasks.selectTask(n.source_id)
    } else if (n.source_type === 'project' && n.source_id) {
      const project = projects.projects.find((p) => p.id === n.source_id)
      if (project) {
        if (project.client_id !== clients.currentClientId) clients.setCurrentClient(project.client_id)
        projects.setCurrentProject(project.id)
      }
      await router.push({ name: 'workstation-tasks' })
    } else if (n.link) {
      await router.push(n.link)
    }
  }

  return {
    notifications,
    unreadCount,
    loading,
    hasMore,
    fetchPage,
    markRead,
    markAllRead,
    init,
    reset,
    onNewNotification,
    openNotification
  }
}
