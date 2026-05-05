/**
 * useNotifications — singleton store for buzzybee.notifications.
 *
 * Module-level state (one list, one unread count) is shared across the bell
 * dropdown and the /inbox page. Realtime subscription is owned by this module
 * so we get one channel for the whole app.
 *
 * Mirrors the MikeSteelv2 pattern.
 */

import { computed, ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

export interface Notification {
  id: string
  user_id: string
  type:
    | 'task_assigned'
    | 'task_unassigned'
    | 'task_status_changed'
    | 'task_completed'
    | 'task_due_soon'
    | 'project_added'
    | 'comment'
    | 'mention'
  source_type: 'task' | 'project' | 'comment'
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
    notifications.value.push(...(data as Notification[]))
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

  // Auto-initialize on first call when authenticated.
  if (auth.user?.id && initializedFor !== auth.user.id) {
    void init(auth.user.id)
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
    reset
  }
}
