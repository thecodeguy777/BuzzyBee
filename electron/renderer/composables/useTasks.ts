import { ref, computed, watch } from 'vue'
import { getSupabase, supabaseSession } from '../lib/supabase-client'

export type TaskStatus = 'open' | 'in_progress' | 'done' | 'snoozed' | 'cancelled'

export type TaskType =
  | 'follow_up_email'
  | 'send_proposal'
  | 'schedule_discovery'
  | 'follow_up_proposal'
  | 'callback'
  | 'sms_voicemail_followup'
  | 'send_calendar_invite'
  | 'onboarding_kickoff'
  | 'audit_dnc'
  | 'audit_wrong_number'
  | 'review_not_interested'
  | 'manual'

export interface DialerTask {
  id: string
  leadId: string | null
  callId: string | null
  parentEventId: string | null
  title: string
  description: string | null
  taskType: TaskType
  status: TaskStatus
  assignedToUserId: string | null
  createdByUserId: string | null
  completedByUserId: string | null
  dueAt: string | null
  slaHours: number | null
  completedAt: string | null
  snoozeUntil: string | null
  /** Lower = higher priority. The topmost open task IS the lead's "next action". */
  position: number
  metadata: Record<string, any>
  createdAt: string
  updatedAt: string
}

// ── Singleton state ─────────────────────────────────────────────
const tasks = ref<DialerTask[]>([])
const isLoading = ref(false)

function rowToTask(r: any): DialerTask {
  return {
    id: r.id,
    leadId: r.lead_id ?? null,
    callId: r.call_id ?? null,
    parentEventId: r.parent_event_id ?? null,
    title: r.title,
    description: r.description ?? null,
    taskType: r.task_type,
    status: r.status,
    assignedToUserId: r.assigned_to_user_id ?? null,
    createdByUserId: r.created_by_user_id ?? null,
    completedByUserId: r.completed_by_user_id ?? null,
    dueAt: r.due_at ?? null,
    slaHours: r.sla_hours ?? null,
    completedAt: r.completed_at ?? null,
    snoozeUntil: r.snooze_until ?? null,
    position: typeof r.position === 'number' ? r.position : 1000,
    metadata: r.metadata ?? {},
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

let initialized = false
async function initTasks() {
  if (initialized) return
  initialized = true

  const client = await getSupabase()
  if (!client) return

  isLoading.value = true
  try {
    const { data, error } = await client
      .from('dialer_tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(2000)
    if (error) console.error('[useTasks] Initial fetch failed:', error)
    else tasks.value = (data ?? []).map(rowToTask)
  } finally {
    isLoading.value = false
  }

  client
    .channel('dialer_tasks_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'buzzybee', table: 'dialer_tasks' },
      (payload: any) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const t = rowToTask(payload.new)
          const idx = tasks.value.findIndex(x => x.id === t.id)
          if (idx === -1) tasks.value = [t, ...tasks.value]
          else tasks.value = tasks.value.map(x => x.id === t.id ? t : x)
        } else if (payload.eventType === 'DELETE') {
          tasks.value = tasks.value.filter(x => x.id !== payload.old?.id)
        }
      },
    )
    .subscribe()
}

watch(supabaseSession, (s) => {
  if (s && !initialized) initTasks()
}, { immediate: true })

// ── Helpers ─────────────────────────────────────────────────────
function nowMs() { return Date.now() }
function dueMs(t: DialerTask): number {
  // Snoozed tasks use snoozeUntil as their effective due time;
  // otherwise dueAt; otherwise +Infinity (treated as "no due").
  if (t.status === 'snoozed' && t.snoozeUntil) return new Date(t.snoozeUntil).getTime()
  if (t.dueAt) return new Date(t.dueAt).getTime()
  return Infinity
}
function startOfTodayMs() {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  return d.getTime()
}
function endOfTodayMs() {
  const d = new Date(); d.setHours(23, 59, 59, 999)
  return d.getTime()
}
function endOfWeekMs() {
  const d = new Date(); d.setHours(23, 59, 59, 999)
  d.setDate(d.getDate() + (6 - d.getDay()))
  return d.getTime()
}

export function useTasks() {
  function currentActorId(): string | null {
    return supabaseSession.value?.userId ?? null
  }

  const openTasks = computed(() => tasks.value.filter(t => t.status === 'open' || t.status === 'in_progress'))

  const overdue = computed(() => {
    const now = nowMs()
    return openTasks.value
      .filter(t => t.dueAt && new Date(t.dueAt).getTime() < now)
      .sort((a, b) => dueMs(a) - dueMs(b))
  })

  const dueToday = computed(() => {
    const start = startOfTodayMs()
    const end = endOfTodayMs()
    const now = nowMs()
    return openTasks.value
      .filter(t => {
        if (!t.dueAt) return false
        const due = new Date(t.dueAt).getTime()
        return due >= Math.max(now, start) && due <= end
      })
      .sort((a, b) => dueMs(a) - dueMs(b))
  })

  const dueThisWeek = computed(() => {
    const todayEnd = endOfTodayMs()
    const weekEnd = endOfWeekMs()
    return openTasks.value
      .filter(t => {
        if (!t.dueAt) return false
        const due = new Date(t.dueAt).getTime()
        return due > todayEnd && due <= weekEnd
      })
      .sort((a, b) => dueMs(a) - dueMs(b))
  })

  const upcoming = computed(() => {
    const weekEnd = endOfWeekMs()
    return openTasks.value
      .filter(t => {
        if (!t.dueAt) return true   // tasks with no due go here
        return new Date(t.dueAt).getTime() > weekEnd
      })
      .sort((a, b) => dueMs(a) - dueMs(b))
  })

  const snoozed = computed(() =>
    tasks.value
      .filter(t => t.status === 'snoozed')
      .sort((a, b) => dueMs(a) - dueMs(b)),
  )

  const completedToday = computed(() => {
    const start = startOfTodayMs()
    return tasks.value
      .filter(t => t.status === 'done' && t.completedAt && new Date(t.completedAt).getTime() >= start)
      .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())
  })

  const stats = computed(() => ({
    open: openTasks.value.length,
    overdue: overdue.value.length,
    dueToday: dueToday.value.length,
    snoozed: snoozed.value.length,
    completedToday: completedToday.value.length,
  }))

  function forLead(leadId: string): DialerTask[] {
    return tasks.value
      .filter(t => t.leadId === leadId)
      .sort((a, b) => {
        // Open before done — drag-reorder is meaningless on done tasks.
        if (a.status !== b.status) {
          if (a.status === 'done' || a.status === 'cancelled') return 1
          if (b.status === 'done' || b.status === 'cancelled') return -1
        }
        // Among same status: explicit position wins, due date is tie-breaker.
        if (a.position !== b.position) return a.position - b.position
        return dueMs(a) - dueMs(b)
      })
  }

  // Batch-update positions after a drag-reorder. Renumbers in steps of 10 so
  // the next reorder has room to insert between existing values without
  // touching every row again.
  async function setPositions(ids: string[]): Promise<void> {
    const client = await getSupabase()
    if (!client || ids.length === 0) return
    const updates = ids.map((id, idx) => ({ id, position: (idx + 1) * 10 }))
    // Optimistic local update first so the UI doesn't flicker.
    tasks.value = tasks.value.map(t => {
      const u = updates.find(x => x.id === t.id)
      return u ? { ...t, position: u.position } : t
    })
    // Persist. We do this serially — the list is short (a single lead's tasks),
    // so this is fine and avoids a more complex bulk-update RPC.
    for (const u of updates) {
      const { error } = await client
        .from('dialer_tasks')
        .update({ position: u.position })
        .eq('id', u.id)
      if (error) console.error('[useTasks] setPositions failed for', u.id, error)
    }
  }

  async function markDone(id: string) {
    const client = await getSupabase()
    if (!client) return
    const actorId = currentActorId()
    // Optimistic
    tasks.value = tasks.value.map(t =>
      t.id === id ? { ...t, status: 'done', completedAt: new Date().toISOString(), completedByUserId: actorId } : t,
    )
    const { error } = await client.from('dialer_tasks').update({
      status: 'done',
      completed_at: new Date().toISOString(),
      completed_by_user_id: actorId,
    }).eq('id', id)
    if (error) console.error('[useTasks] markDone failed:', error)
  }

  async function snooze(id: string, until: Date) {
    const client = await getSupabase()
    if (!client) return
    tasks.value = tasks.value.map(t =>
      t.id === id ? { ...t, status: 'snoozed', snoozeUntil: until.toISOString() } : t,
    )
    const { error } = await client.from('dialer_tasks').update({
      status: 'snoozed',
      snooze_until: until.toISOString(),
    }).eq('id', id)
    if (error) console.error('[useTasks] snooze failed:', error)
  }

  async function unsnooze(id: string) {
    const client = await getSupabase()
    if (!client) return
    tasks.value = tasks.value.map(t =>
      t.id === id ? { ...t, status: 'open', snoozeUntil: null } : t,
    )
    const { error } = await client.from('dialer_tasks').update({
      status: 'open',
      snooze_until: null,
    }).eq('id', id)
    if (error) console.error('[useTasks] unsnooze failed:', error)
  }

  async function assign(id: string, userId: string | null) {
    const client = await getSupabase()
    if (!client) return
    tasks.value = tasks.value.map(t =>
      t.id === id ? { ...t, assignedToUserId: userId } : t,
    )
    const { error } = await client.from('dialer_tasks').update({
      assigned_to_user_id: userId,
    }).eq('id', id)
    if (error) console.error('[useTasks] assign failed:', error)
  }

  async function cancel(id: string) {
    const client = await getSupabase()
    if (!client) return
    tasks.value = tasks.value.map(t =>
      t.id === id ? { ...t, status: 'cancelled' } : t,
    )
    const { error } = await client.from('dialer_tasks').update({ status: 'cancelled' }).eq('id', id)
    if (error) console.error('[useTasks] cancel failed:', error)
  }

  async function updateTask(id: string, patch: Partial<{
    title: string
    description: string | null
    taskType: TaskType
    status: TaskStatus
    dueAt: string | null
    slaHours: number | null
    assignedToUserId: string | null
    snoozeUntil: string | null
  }>) {
    const client = await getSupabase()
    if (!client) return
    // Optimistic
    tasks.value = tasks.value.map(t =>
      t.id === id ? { ...t, ...patch } as DialerTask : t,
    )
    const row: Record<string, any> = {}
    if (patch.title !== undefined) row.title = patch.title
    if (patch.description !== undefined) row.description = patch.description
    if (patch.taskType !== undefined) row.task_type = patch.taskType
    if (patch.status !== undefined) row.status = patch.status
    if (patch.dueAt !== undefined) row.due_at = patch.dueAt
    if (patch.slaHours !== undefined) row.sla_hours = patch.slaHours
    if (patch.assignedToUserId !== undefined) row.assigned_to_user_id = patch.assignedToUserId
    if (patch.snoozeUntil !== undefined) row.snooze_until = patch.snoozeUntil
    const { error } = await client.from('dialer_tasks').update(row).eq('id', id)
    if (error) console.error('[useTasks] updateTask failed:', error)
  }

  async function deleteTask(id: string) {
    const client = await getSupabase()
    if (!client) return
    const before = tasks.value
    tasks.value = tasks.value.filter(t => t.id !== id)
    const { error } = await client.from('dialer_tasks').delete().eq('id', id)
    if (error) {
      console.error('[useTasks] deleteTask failed:', error)
      tasks.value = before
    }
  }

  async function createManual(input: {
    leadId?: string | null
    title: string
    description?: string
    dueAt?: Date | null
    slaHours?: number | null
    assignedToUserId?: string | null
  }): Promise<DialerTask | null> {
    const client = await getSupabase()
    if (!client) return null
    const actorId = currentActorId()
    const { data, error } = await client.from('dialer_tasks').insert({
      lead_id: input.leadId ?? null,
      title: input.title,
      description: input.description ?? null,
      task_type: 'manual',
      status: 'open',
      created_by_user_id: actorId,
      assigned_to_user_id: input.assignedToUserId ?? null,
      due_at: input.dueAt?.toISOString() ?? null,
      sla_hours: input.slaHours ?? null,
      metadata: { source: 'manual' },
    }).select().single()
    if (error) {
      console.error('[useTasks] createManual failed:', error)
      return null
    }
    return rowToTask(data)
  }

  return {
    tasks,
    isLoading,
    openTasks,
    overdue,
    dueToday,
    dueThisWeek,
    upcoming,
    snoozed,
    completedToday,
    stats,
    forLead,
    markDone,
    snooze,
    unsnooze,
    assign,
    cancel,
    createManual,
    updateTask,
    deleteTask,
    setPositions,
  }
}
