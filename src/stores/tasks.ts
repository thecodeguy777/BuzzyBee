import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'
import { useProjectsStore } from '@/stores/projects'
import { useStatusesStore } from '@/stores/statuses'
import {
  uploadTaskAttachment,
  deleteTaskAttachment,
  type TaskAttachmentMeta
} from '@/lib/taskAttachments'

// Status is now a dynamic, per-project column key (see the statuses store),
// not a fixed enum. Kept as a named alias for readability across the app.
export type TaskStatus = string

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
  /** Denormalized "primary" assignee — first row added to task_assignees. Kept for back-compat. */
  assignee_id: string | null
  assignee_name: string | null
  created_by: string | null
  attachments: TaskAttachment[]
  activity_log: TaskActivityEvent[]
  /** Custom-field values keyed by field key (Stage, Links, etc). */
  custom_fields: Record<string, unknown> | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

/** A row in buzzybee.task_assignees — one per (task, user). */
export interface TaskAssignee {
  task_id: string
  user_id: string
  /** ISO timestamp when this person marked their part done; null = still in progress. */
  completed_at: string | null
  added_at: string
  added_by: string | null
}

/** A row in buzzybee.task_subtasks — a checklist item under a task. */
export interface Subtask {
  id: string
  task_id: string
  title: string
  done: boolean
  position: number
  assignee_id: string | null
  due_on: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// Translate PostgREST's opaque "0 rows" error (PGRST116) — what an RLS-blocked
// UPDATE produces via .select().single() — into something a person can act on.
function taskWriteError(e: unknown): Error {
  const err = e as { code?: string; message?: string }
  if (err?.code === 'PGRST116' || /multiple \(or no\) rows/i.test(err?.message ?? '')) {
    return new Error("You can only change a task you're assigned to or created.")
  }
  return e instanceof Error ? e : new Error(err?.message ?? 'Could not save the task.')
}

export const useTasksStore = defineStore('tasks', () => {
  const auth = useAuthStore()
  const clients = useClientsStore()
  const projects = useProjectsStore()
  const statuses = useStatusesStore()

  const tasks = ref<Task[]>([])
  /** Multi-assignee rows keyed by task_id. Loaded in fetchAll, updated via realtime. */
  const assigneesByTask = ref<Record<string, TaskAssignee[]>>({})
  /** Subtask (checklist) rows keyed by task_id, pre-sorted by position. */
  const subtasksByTask = ref<Record<string, Subtask[]>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)
  const selectedTaskId = ref<string | null>(null)

  // Focus mode (per-browser): hide tasks not related to me across the task
  // views. "Mine" = I'm the primary assignee, the creator, or a multi-assignee.
  // Views render the FULL list and v-show non-mine cards rather than filtering
  // the list — filtering would corrupt the board/table fractional priority_order
  // (it's computed against visible neighbors and would silently reorder across
  // hidden cards).
  const FOCUS_KEY = 'buzzybee.workstation.tasks-focus-mine'
  const focusMine = ref(
    typeof window !== 'undefined' && window.localStorage.getItem(FOCUS_KEY) === '1'
  )
  watch(focusMine, (v) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(FOCUS_KEY, v ? '1' : '0')
    }
  })
  function isMine(t: Task): boolean {
    const uid = auth.user?.id
    if (!uid) return false
    return (
      t.assignee_id === uid ||
      t.created_by === uid ||
      (assigneesByTask.value[t.id] ?? []).some((a) => a.user_id === uid)
    )
  }

  let channel: RealtimeChannel | null = null
  let assigneesChannel: RealtimeChannel | null = null
  let subtasksChannel: RealtimeChannel | null = null

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

  // Grouped by the current project's columns (dynamic). A bucket exists for
  // every defined status; an unexpected/legacy status key still gets its own
  // bucket so no task ever silently disappears.
  const tasksByStatus = computed(() => {
    const map: Record<string, Task[]> = {}
    for (const c of statuses.forProject(projects.currentProjectId)) map[c.key] = []
    for (const t of tasksForCurrentProject.value) {
      ;(map[t.status] ??= []).push(t)
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => a.priority_order - b.priority_order || a.created_at.localeCompare(b.created_at))
    }
    return map
  })

  const selectedTask = computed(() =>
    tasks.value.find((t) => t.id === selectedTaskId.value) ?? null
  )

  // Monotonic request ids so a slow, stale response can't overwrite the
  // result of a newer fetch (or newer optimistic/realtime state).
  let fetchSeq = 0
  let assigneesSeq = 0
  let subtasksSeq = 0

  async function fetchAll() {
    if (!auth.isAuthenticated) return
    const seq = ++fetchSeq
    loading.value = true
    error.value = null
    try {
      // Safety ceiling: bound a runaway account so login can't pull an
      // unbounded result set in one query. Far above realistic per-account
      // volume today; if it's ever hit we warn (true per-client scoping +
      // virtualization is the proper fix — deferred, see notes). Cross-client
      // views (My Tasks etc.) still read this list, so it stays unscoped.
      const FETCH_CAP = 1500
      const { data, error: err } = await supabase
        .from('tasks')
        .select('*')
        .order('priority_order', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(FETCH_CAP)
      if (err) throw err
      if (seq === fetchSeq) {
        tasks.value = (data ?? []) as Task[]
        if ((data?.length ?? 0) >= FETCH_CAP) {
          console.warn(`[tasks] fetch hit the ${FETCH_CAP}-row cap — needs per-client scoping + virtualization.`)
        }
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load tasks.'
      console.warn('[tasks] fetchAll:', error.value)
    } finally {
      if (seq === fetchSeq) loading.value = false
    }
    // Pull task_assignees + task_subtasks in parallel — separate queries
    // because RLS lives on their own tables.
    void fetchAssignees()
    void fetchSubtasks()
  }

  async function fetchAssignees() {
    const seq = ++assigneesSeq
    const { data, error: err } = await supabase
      .from('task_assignees')
      .select('*')
    if (err) {
      console.warn('[tasks] fetchAssignees:', err.message)
      return
    }
    if (seq !== assigneesSeq) return
    const grouped: Record<string, TaskAssignee[]> = {}
    for (const r of (data ?? []) as TaskAssignee[]) {
      if (!grouped[r.task_id]) grouped[r.task_id] = []
      grouped[r.task_id].push(r)
    }
    assigneesByTask.value = grouped
  }

  /** Resolve assignees for a single task; returns [] if none loaded. */
  function getAssignees(taskId: string): TaskAssignee[] {
    return assigneesByTask.value[taskId] ?? []
  }

  /** % of assignees who have completed_at, for the table's progress bar fill. */
  function assigneeProgress(taskId: string): { total: number; done: number; pct: number } {
    const list = getAssignees(taskId)
    const total = list.length
    if (total === 0) return { total: 0, done: 0, pct: 0 }
    const done = list.filter((a) => a.completed_at !== null).length
    return { total, done, pct: Math.round((done / total) * 100) }
  }

  // ── Multi-assignee operations ────────────────────────────────────────────
  async function addAssignee(taskId: string, userId: string) {
    if (!auth.user) throw new Error('Not authenticated')
    const { data, error: err } = await supabase
      .from('task_assignees')
      .insert({ task_id: taskId, user_id: userId, added_by: auth.user.id })
      .select('*')
      .single()
    if (err) throw err
    const row = data as TaskAssignee
    // Optimistic local insert (realtime will dedupe).
    const list = assigneesByTask.value[taskId] ? [...assigneesByTask.value[taskId]] : []
    if (!list.some((a) => a.user_id === row.user_id)) list.push(row)
    assigneesByTask.value = { ...assigneesByTask.value, [taskId]: list }
  }

  async function removeAssignee(taskId: string, userId: string) {
    const { error: err } = await supabase
      .from('task_assignees')
      .delete()
      .eq('task_id', taskId)
      .eq('user_id', userId)
    if (err) throw err
    const list = (assigneesByTask.value[taskId] ?? []).filter((a) => a.user_id !== userId)
    assigneesByTask.value = { ...assigneesByTask.value, [taskId]: list }
  }

  async function setAssigneeCompleted(taskId: string, userId: string, done: boolean) {
    const completed_at = done ? new Date().toISOString() : null
    const { error: err } = await supabase
      .from('task_assignees')
      .update({ completed_at })
      .eq('task_id', taskId)
      .eq('user_id', userId)
    if (err) throw err
    const list = (assigneesByTask.value[taskId] ?? []).map((a) =>
      a.user_id === userId ? { ...a, completed_at } : a
    )
    assigneesByTask.value = { ...assigneesByTask.value, [taskId]: list }
  }

  function applyAssigneeRealtime(payload: any) {
    const ev = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
    const row = (ev === 'DELETE' ? payload.old : payload.new) as TaskAssignee
    const list = assigneesByTask.value[row.task_id]
      ? [...assigneesByTask.value[row.task_id]]
      : []
    if (ev === 'INSERT') {
      if (!list.some((a) => a.user_id === row.user_id)) list.push(row)
    } else if (ev === 'UPDATE') {
      const idx = list.findIndex((a) => a.user_id === row.user_id)
      if (idx !== -1) list[idx] = row
      else list.push(row)
    } else if (ev === 'DELETE') {
      const idx = list.findIndex((a) => a.user_id === row.user_id)
      if (idx !== -1) list.splice(idx, 1)
    }
    assigneesByTask.value = { ...assigneesByTask.value, [row.task_id]: list }
  }

  // ── Subtask (checklist) operations ───────────────────────────────────────
  function getSubtasks(taskId: string): Subtask[] {
    return subtasksByTask.value[taskId] ?? []
  }
  /** done/total for the drawer progress bar + the board/table/calendar chips. */
  function subtaskProgress(taskId: string): { total: number; done: number; pct: number } {
    const list = getSubtasks(taskId)
    const total = list.length
    if (total === 0) return { total: 0, done: 0, pct: 0 }
    const done = list.filter((s) => s.done).length
    return { total, done, pct: Math.round((done / total) * 100) }
  }
  // Which task owns this subtask id (the map has no reverse index).
  function findSubtaskTaskId(id: string): string | null {
    for (const [tid, list] of Object.entries(subtasksByTask.value)) {
      if (list.some((s) => s.id === id)) return tid
    }
    return null
  }

  async function fetchSubtasks() {
    const seq = ++subtasksSeq
    const { data, error: err } = await supabase
      .from('task_subtasks')
      .select('*')
      .order('position', { ascending: true })
    if (err) {
      console.warn('[tasks] fetchSubtasks:', err.message)
      return
    }
    if (seq !== subtasksSeq) return
    const grouped: Record<string, Subtask[]> = {}
    for (const r of (data ?? []) as Subtask[]) {
      if (!grouped[r.task_id]) grouped[r.task_id] = []
      grouped[r.task_id].push(r)
    }
    subtasksByTask.value = grouped
  }

  async function addSubtask(taskId: string, title: string) {
    if (!auth.user) throw new Error('Not authenticated')
    const trimmed = title.trim()
    if (!trimmed) return
    const existing = subtasksByTask.value[taskId] ?? []
    const maxPos = existing.length ? Math.max(...existing.map((s) => s.position)) : 0
    const { data, error: err } = await supabase
      .from('task_subtasks')
      .insert({ task_id: taskId, title: trimmed, position: maxPos + 10, created_by: auth.user.id })
      .select('*')
      .single()
    if (err) throw err
    const row = data as Subtask
    const list = [...existing]
    if (!list.some((s) => s.id === row.id)) list.push(row) // realtime echo will dedupe
    list.sort((a, b) => a.position - b.position)
    subtasksByTask.value = { ...subtasksByTask.value, [taskId]: list }
  }

  async function updateSubtask(
    id: string,
    patch: Partial<Pick<Subtask, 'title' | 'assignee_id' | 'due_on' | 'position'>>
  ) {
    const taskId = findSubtaskTaskId(id)
    if (!taskId) return
    const prev = (subtasksByTask.value[taskId] ?? []).find((s) => s.id === id)
    let list = (subtasksByTask.value[taskId] ?? []).map((s) => (s.id === id ? { ...s, ...patch } : s))
    if ('position' in patch) list = [...list].sort((a, b) => a.position - b.position)
    subtasksByTask.value = { ...subtasksByTask.value, [taskId]: list }
    const { error: err } = await supabase.from('task_subtasks').update(patch).eq('id', id)
    if (err) {
      if (prev) {
        const rb = (subtasksByTask.value[taskId] ?? [])
          .map((s) => (s.id === id ? prev : s))
          .sort((a, b) => a.position - b.position)
        subtasksByTask.value = { ...subtasksByTask.value, [taskId]: rb }
      }
      throw err
    }
  }

  async function toggleSubtaskDone(id: string, done: boolean) {
    const taskId = findSubtaskTaskId(id)
    if (!taskId) return
    const list = (subtasksByTask.value[taskId] ?? []).map((s) => (s.id === id ? { ...s, done } : s))
    subtasksByTask.value = { ...subtasksByTask.value, [taskId]: list }
    const { error: err } = await supabase.from('task_subtasks').update({ done }).eq('id', id)
    if (err) {
      const rb = (subtasksByTask.value[taskId] ?? []).map((s) => (s.id === id ? { ...s, done: !done } : s))
      subtasksByTask.value = { ...subtasksByTask.value, [taskId]: rb }
      throw err
    }
  }

  async function removeSubtask(id: string) {
    const taskId = findSubtaskTaskId(id)
    if (!taskId) return
    const prev = subtasksByTask.value[taskId] ?? []
    subtasksByTask.value = { ...subtasksByTask.value, [taskId]: prev.filter((s) => s.id !== id) }
    const { error: err } = await supabase.from('task_subtasks').delete().eq('id', id)
    if (err) {
      subtasksByTask.value = { ...subtasksByTask.value, [taskId]: prev }
      throw err
    }
  }

  /** Persist a new order. orderedIds top→bottom; positions become idx*10. */
  async function reorderSubtasks(taskId: string, orderedIds: string[]) {
    const cur = subtasksByTask.value[taskId] ?? []
    const byId = new Map(cur.map((s) => [s.id, s]))
    const next = orderedIds
      .map((id, idx) => {
        const s = byId.get(id)
        return s ? { ...s, position: idx * 10 } : null
      })
      .filter((s): s is Subtask => s !== null)
    subtasksByTask.value = { ...subtasksByTask.value, [taskId]: next }
    const updates = next
      .filter((s) => byId.get(s.id)!.position !== s.position)
      .map((s) => supabase.from('task_subtasks').update({ position: s.position }).eq('id', s.id))
    const results = await Promise.all(updates)
    if (results.some((r) => r.error)) {
      console.warn('[tasks] reorderSubtasks: partial failure, resyncing')
      void fetchSubtasks()
    }
  }

  function applySubtaskRealtime(payload: any) {
    const ev = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
    const row = (ev === 'DELETE' ? payload.old : payload.new) as Subtask
    if (!row?.task_id) return // replica identity full gives task_id on DELETE
    let list = subtasksByTask.value[row.task_id] ? [...subtasksByTask.value[row.task_id]] : []
    if (ev === 'INSERT') {
      if (!list.some((s) => s.id === row.id)) list.push(row)
    } else if (ev === 'UPDATE') {
      const idx = list.findIndex((s) => s.id === row.id)
      if (idx !== -1) list[idx] = row
      else list.push(row)
    } else if (ev === 'DELETE') {
      const idx = list.findIndex((s) => s.id === row.id)
      if (idx !== -1) list.splice(idx, 1)
    }
    list = list.sort((a, b) => a.position - b.position)
    subtasksByTask.value = { ...subtasksByTask.value, [row.task_id]: list }
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

    // Separate channels so a slow event on one doesn't back-pressure the others.
    // Guard each independently — an early `return` here would block any channel
    // declared after it.
    if (!assigneesChannel) {
      assigneesChannel = supabase
        .channel('bb-task-assignees')
        .on(
          'postgres_changes',
          { event: '*', schema: 'buzzybee', table: 'task_assignees' },
          applyAssigneeRealtime
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('[task-assignees realtime]', status)
          }
        })
    }

    if (!subtasksChannel) {
      subtasksChannel = supabase
        .channel('bb-task-subtasks')
        .on(
          'postgres_changes',
          { event: '*', schema: 'buzzybee', table: 'task_subtasks' },
          applySubtaskRealtime
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('[task-subtasks realtime]', status)
          }
        })
    }
  }

  async function stopRealtime() {
    if (channel) {
      try { await supabase.removeChannel(channel) } catch { /* ignore */ }
      channel = null
    }
    if (assigneesChannel) {
      try { await supabase.removeChannel(assigneesChannel) } catch { /* ignore */ }
      assigneesChannel = null
    }
    if (subtasksChannel) {
      try { await supabase.removeChannel(subtasksChannel) } catch { /* ignore */ }
      subtasksChannel = null
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
    status?: TaskStatus
  }) {
    if (!auth.user) throw new Error('Not authenticated')
    const pid = input.project_id ?? projects.currentProjectId
    if (!pid) throw new Error('No project selected')
    const project = projects.projects.find((p) => p.id === pid)
    const cid = input.client_id ?? project?.client_id ?? clients.currentClientId
    if (!cid) throw new Error('No client selected')
    const client = clients.clients.find((c) => c.id === cid)

    // New tasks land at the top of the target column — the caller's status if
    // given (e.g. a board column's quick-add), else the project's first
    // column. Status keys are per-project — 'todo' only exists where a
    // project kept the default set, and the target project isn't necessarily
    // the current one (e.g. tasks created from a CRM deal).
    const statusKey = input.status ?? statuses.defaultKey(pid) ?? 'todo'
    const minOrder = Math.min(
      0,
      ...tasks.value
        .filter((t) => t.project_id === pid && t.status === statusKey)
        .map((t) => t.priority_order)
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
      status: statusKey
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
      // Re-find by id — the array may have shifted (realtime insert/delete)
      // while the request was in flight, so the captured index can point at
      // a different task.
      const j = tasks.value.findIndex((t) => t.id === id)
      if (j !== -1 && prev) tasks.value[j] = prev
      throw taskWriteError(e)
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
        assigneesByTask.value = {}
        subtasksByTask.value = {}
        selectedTaskId.value = null
        void stopRealtime()
      }
    },
    { immediate: true }
  )

  return {
    tasks,
    assigneesByTask,
    tasksForCurrentClient,
    tasksForCurrentProject,
    tasksByStatus,
    focusMine,
    isMine,
    selectedTask,
    selectedTaskId,
    loading,
    error,
    fetchAll,
    fetchAssignees,
    getAssignees,
    assigneeProgress,
    addAssignee,
    removeAssignee,
    setAssigneeCompleted,
    subtasksByTask,
    fetchSubtasks,
    getSubtasks,
    subtaskProgress,
    addSubtask,
    updateSubtask,
    toggleSubtaskDone,
    removeSubtask,
    reorderSubtasks,
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
