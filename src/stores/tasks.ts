import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'
import { useProjectsStore } from '@/stores/projects'
import {
  uploadTaskAttachment,
  deleteTaskAttachment,
  type TaskAttachmentMeta
} from '@/lib/taskAttachments'

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled'

export interface TaskAttachment {
  url?: string
  name: string
  path?: string
  size?: number
  mime_type?: string
  uploaded_at?: string
  uploaded_by?: string
}

export type ActivityKind =
  | 'created'
  | 'status'
  | 'priority'
  | 'due'
  | 'assignee'
  | 'title'
  | 'description'
  | 'attachment_added'
  | 'attachment_removed'
  | 'custom_field'

export interface TaskActivityEvent {
  kind: ActivityKind
  from?: unknown
  to?: unknown
  from_name?: string | null
  to_name?: string | null
  name?: string         // for attachment_added / attachment_removed
  key?: string          // for custom_field
  user_id: string | null
  timestamp: string
  notes?: string
}

export interface Task {
  id: string
  reference_number: string
  client_id: string
  client_name: string | null
  project_id: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: 1 | 2 | 3 | 4
  priority_order: number
  due_on: string | null
  assignee_id: string | null
  assignee_name: string | null
  created_by: string | null
  attachments: TaskAttachment[]
  activity_log: TaskActivityEvent[]
  completed_at: string | null
  created_at: string
  updated_at: string
}

export const useTasksStore = defineStore('tasks', () => {
  const auth = useAuthStore()
  const clients = useClientsStore()
  const projects = useProjectsStore()

  const tasks = ref<Task[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const selectedTaskId = ref<string | null>(null)

  let channel: RealtimeChannel | null = null

  // Tasks for the currently-selected client (used by global search etc.).
  const tasksForCurrentClient = computed(() =>
    tasks.value.filter((t) => t.client_id === clients.currentClientId)
  )

  // Tasks for the currently-selected project — what views render.
  const tasksForCurrentProject = computed(() => {
    const pid = projects.currentProjectId
    if (!pid) return []
    return tasks.value.filter((t) => t.project_id === pid)
  })

  const tasksByStatus = computed(() => {
    const map: Record<TaskStatus, Task[]> = {
      todo: [],
      in_progress: [],
      blocked: [],
      done: [],
      cancelled: []
    }
    for (const t of tasksForCurrentProject.value) map[t.status].push(t)
    for (const k of Object.keys(map) as TaskStatus[]) {
      map[k].sort((a, b) => a.priority_order - b.priority_order || a.created_at.localeCompare(b.created_at))
    }
    return map
  })

  const selectedTask = computed(() =>
    tasks.value.find((t) => t.id === selectedTaskId.value) ?? null
  )

  async function fetchAll() {
    if (!auth.isAuthenticated) return
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('tasks')
        .select('*')
        .order('priority_order', { ascending: true })
        .order('created_at', { ascending: false })
      if (err) throw err
      tasks.value = (data ?? []) as Task[]
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load tasks.'
      console.warn('[tasks] fetchAll:', error.value)
    } finally {
      loading.value = false
    }
  }

  function applyRealtimeChange(payload: any) {
    const event = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
    if (event === 'INSERT') {
      const row = payload.new as Task
      if (!tasks.value.some((t) => t.id === row.id)) tasks.value.push(row)
    } else if (event === 'UPDATE') {
      const row = payload.new as Task
      const idx = tasks.value.findIndex((t) => t.id === row.id)
      if (idx !== -1) tasks.value[idx] = row
      else tasks.value.push(row)
    } else if (event === 'DELETE') {
      const old = payload.old as Task
      tasks.value = tasks.value.filter((t) => t.id !== old.id)
    }
  }

  function startRealtime() {
    if (channel) return
    channel = supabase
      .channel('bb-tasks')
      .on(
        'postgres_changes',
        { event: '*', schema: 'buzzybee', table: 'tasks' },
        applyRealtimeChange
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[tasks realtime]', status)
        }
      })
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

  async function createTask(input: {
    title: string
    client_id?: string
    project_id?: string
    description?: string
    priority?: 1 | 2 | 3 | 4
    due_on?: string | null
    assignee_id?: string | null
  }) {
    if (!auth.user) throw new Error('Not authenticated')
    const pid = input.project_id ?? projects.currentProjectId
    if (!pid) throw new Error('No project selected')
    const project = projects.projects.find((p) => p.id === pid)
    const cid = input.client_id ?? project?.client_id ?? clients.currentClientId
    if (!cid) throw new Error('No client selected')
    const client = clients.clients.find((c) => c.id === cid)

    // New tasks go to the top of the todo column.
    const minOrder = Math.min(
      0,
      ...tasksByStatus.value.todo.map((t) => t.priority_order)
    )
    const priority_order = minOrder - 10

    const payload: Record<string, unknown> = {
      title: input.title.trim(),
      description: input.description?.trim() || null,
      client_id: cid,
      client_name: client?.name ?? null,
      project_id: pid,
      priority: input.priority ?? 3,
      priority_order,
      due_on: input.due_on ?? null,
      assignee_id: input.assignee_id ?? auth.user.id,
      assignee_name: input.assignee_id
        ? null // backend can fill via trigger later; for now leave null when assigning to someone else
        : auth.fullName,
      created_by: auth.user.id,
      status: 'todo'
    }

    const { data, error: err } = await supabase
      .from('tasks')
      .insert(payload)
      .select('*')
      .single()
    if (err) throw err
    const row = data as Task
    // Optimistic local insert. Realtime broadcasts will dedupe via id check.
    if (!tasks.value.some((t) => t.id === row.id)) tasks.value.push(row)
    return row
  }

  async function updateTask(id: string, patch: Partial<Task>) {
    // Optimistic local patch (rollback on error).
    const idx = tasks.value.findIndex((t) => t.id === id)
    const prev = idx !== -1 ? { ...tasks.value[idx] } : null
    if (idx !== -1) tasks.value[idx] = { ...tasks.value[idx], ...(patch as Partial<Task>) }
    try {
      const { data, error: err } = await supabase
        .from('tasks')
        .update(patch as Record<string, unknown>)
        .eq('id', id)
        .select('*')
        .single()
      if (err) throw err
      const row = data as Task
      const i = tasks.value.findIndex((t) => t.id === row.id)
      if (i !== -1) tasks.value[i] = row
      return row
    } catch (e) {
      if (idx !== -1 && prev) tasks.value[idx] = prev
      throw e
    }
  }

  async function setStatus(id: string, status: TaskStatus) {
    return updateTask(id, { status })
  }

  async function deleteTask(id: string) {
    // Optimistic local delete (rollback on error).
    const idx = tasks.value.findIndex((t) => t.id === id)
    const prev = idx !== -1 ? tasks.value[idx] : null
    if (idx !== -1) tasks.value.splice(idx, 1)
    if (selectedTaskId.value === id) selectedTaskId.value = null
    try {
      const { error: err } = await supabase.from('tasks').delete().eq('id', id)
      if (err) throw err
    } catch (e) {
      if (prev) tasks.value.push(prev)
      throw e
    }
  }

  function selectTask(id: string | null) {
    selectedTaskId.value = id
  }

  async function addAttachment(taskId: string, file: File): Promise<TaskAttachmentMeta> {
    const t = tasks.value.find((x) => x.id === taskId)
    if (!t) throw new Error('Task not found')
    if (!auth.user) throw new Error('Not authenticated')

    const meta = await uploadTaskAttachment({
      clientId: t.client_id,
      taskId: t.id,
      file,
      uploadedBy: auth.user.id
    })

    const next = [...((t.attachments as TaskAttachmentMeta[]) ?? []), meta]
    await updateTask(taskId, { attachments: next as any })
    return meta
  }

  async function removeAttachment(taskId: string, attachmentId: string) {
    const t = tasks.value.find((x) => x.id === taskId)
    if (!t) throw new Error('Task not found')
    const list = ((t.attachments as TaskAttachmentMeta[]) ?? []).slice()
    const idx = list.findIndex((a) => a.id === attachmentId)
    if (idx === -1) return
    const target = list[idx]

    // Optimistic remove from the row.
    list.splice(idx, 1)
    await updateTask(taskId, { attachments: list as any })

    // Best-effort storage cleanup. If this fails, the metadata is already
    // gone; a later sweep can prune orphan blobs.
    try {
      await deleteTaskAttachment(target.path)
    } catch (e) {
      console.warn('[tasks] storage delete failed:', (e as Error).message)
    }
  }

  watch(
    () => auth.isAuthenticated,
    (isAuthed) => {
      if (isAuthed) {
        void fetchAll()
        startRealtime()
      } else {
        tasks.value = []
        selectedTaskId.value = null
        void stopRealtime()
      }
    },
    { immediate: true }
  )

  return {
    tasks,
    tasksForCurrentClient,
    tasksForCurrentProject,
    tasksByStatus,
    selectedTask,
    selectedTaskId,
    loading,
    error,
    fetchAll,
    createTask,
    updateTask,
    setStatus,
    deleteTask,
    selectTask,
    addAttachment,
    removeAttachment,
    startRealtime,
    stopRealtime
  }
})
