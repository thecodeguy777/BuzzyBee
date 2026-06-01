import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

// Per-project task columns (statuses). The board/table/calendar/drawer all
// derive their columns, labels, colors, order, and done/cancelled semantics
// from here instead of hardcoded literals. `key` is immutable (stored in
// tasks.status); `label` is freely renameable.
export interface TaskStatusDef {
  id: string
  project_id: string
  key: string
  label: string
  color: string // semantic token: neutral | primary | success | error | warning | info | muted
  sort_order: number
  is_done: boolean
  is_cancelled: boolean
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24) || 'col'
  )
}

export const useStatusesStore = defineStore('statuses', () => {
  const auth = useAuthStore()

  const statuses = ref<TaskStatusDef[]>([])
  const loading = ref(false)
  let channel: RealtimeChannel | null = null

  const byProject = computed(() => {
    const m: Record<string, TaskStatusDef[]> = {}
    for (const s of statuses.value) (m[s.project_id] ??= []).push(s)
    for (const k of Object.keys(m)) {
      m[k].sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
    }
    return m
  })

  function forProject(pid: string | null | undefined): TaskStatusDef[] {
    if (!pid) return []
    return byProject.value[pid] ?? []
  }
  function get(pid: string | null | undefined, key: string | null | undefined) {
    if (!pid || !key) return undefined
    return (byProject.value[pid] ?? []).find((s) => s.key === key)
  }
  function isDone(pid: string | null | undefined, key: string | null | undefined) {
    return !!get(pid, key)?.is_done
  }
  function isCancelled(pid: string | null | undefined, key: string | null | undefined) {
    return !!get(pid, key)?.is_cancelled
  }
  // "Open" = a real status that's neither done nor cancelled.
  function isOpen(pid: string | null | undefined, key: string | null | undefined) {
    const s = get(pid, key)
    return s ? !s.is_done && !s.is_cancelled : false
  }
  /** First column (lowest sort_order) — where new tasks land. */
  function defaultKey(pid: string | null | undefined): string | undefined {
    return forProject(pid)[0]?.key
  }
  /** First column flagged done — target when someone checks a task off. */
  function firstDoneKey(pid: string | null | undefined): string | undefined {
    return forProject(pid).find((s) => s.is_done)?.key
  }

  function upsertLocal(row: TaskStatusDef) {
    const i = statuses.value.findIndex((s) => s.id === row.id)
    if (i === -1) statuses.value = [...statuses.value, row]
    else statuses.value[i] = row
  }
  function removeLocal(id: string) {
    statuses.value = statuses.value.filter((s) => s.id !== id)
  }

  async function fetchAll() {
    if (!auth.isAuthenticated) return
    loading.value = true
    try {
      // RLS lets any authenticated user read labels (non-sensitive); loading all
      // visible projects' statuses lets cross-project dashboards resolve is_done.
      const { data, error } = await supabase.from('task_statuses').select('*')
      if (error) throw error
      statuses.value = (data ?? []) as TaskStatusDef[]
    } catch (e) {
      console.warn('[statuses] fetchAll:', (e as Error).message)
    } finally {
      loading.value = false
    }
  }

  function applyRealtime(payload: any) {
    const ev = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
    if (ev === 'DELETE') removeLocal((payload.old as TaskStatusDef).id)
    else upsertLocal(payload.new as TaskStatusDef)
  }

  function start() {
    if (channel) return
    channel = supabase
      .channel('bb-task-statuses')
      .on(
        'postgres_changes',
        { event: '*', schema: 'buzzybee', table: 'task_statuses' },
        applyRealtime,
      )
      .subscribe()
  }
  async function stop() {
    if (channel) {
      try {
        await supabase.removeChannel(channel)
      } catch {
        /* ignore */
      }
      channel = null
    }
  }

  // ── CRUD (manager-only, enforced by RLS) ───────────────────────────────────
  async function addStatus(
    projectId: string,
    input: { label: string; color?: string },
  ): Promise<TaskStatusDef> {
    const peers = forProject(projectId)
    const sort_order = peers.length ? Math.max(...peers.map((s) => s.sort_order)) + 1 : 0
    const key = `${slug(input.label)}_${crypto.randomUUID().slice(0, 6)}`
    const { data, error } = await supabase
      .from('task_statuses')
      .insert({
        project_id: projectId,
        key,
        label: input.label.trim(),
        color: input.color ?? 'info',
        sort_order,
        is_done: false,
        is_cancelled: false,
      })
      .select('*')
      .single()
    if (error) throw error
    upsertLocal(data as TaskStatusDef)
    return data as TaskStatusDef
  }

  async function updateStatus(
    id: string,
    patch: Partial<Pick<TaskStatusDef, 'label' | 'color' | 'is_done' | 'is_cancelled' | 'sort_order'>>,
  ) {
    const i = statuses.value.findIndex((s) => s.id === id)
    const prev = i !== -1 ? { ...statuses.value[i] } : null
    if (i !== -1) statuses.value[i] = { ...statuses.value[i], ...patch }
    const { error } = await supabase.from('task_statuses').update(patch).eq('id', id)
    if (error) {
      if (prev && i !== -1) statuses.value[i] = prev
      throw error
    }
  }

  async function reorder(orderedIds: string[]) {
    orderedIds.forEach((id, idx) => {
      const i = statuses.value.findIndex((s) => s.id === id)
      if (i !== -1) statuses.value[i] = { ...statuses.value[i], sort_order: idx }
    })
    for (let idx = 0; idx < orderedIds.length; idx++) {
      const { error } = await supabase
        .from('task_statuses')
        .update({ sort_order: idx })
        .eq('id', orderedIds[idx])
      if (error) console.warn('[statuses] reorder:', error.message)
    }
  }

  /** Deletes a column. The DB FK blocks this if any task still uses it — the
   *  caller should move/relabel those tasks first and surface the error. */
  async function deleteStatus(id: string) {
    const i = statuses.value.findIndex((s) => s.id === id)
    const prev = i !== -1 ? statuses.value[i] : null
    if (i !== -1) statuses.value.splice(i, 1)
    const { error } = await supabase.from('task_statuses').delete().eq('id', id)
    if (error) {
      if (prev) statuses.value.push(prev)
      throw error
    }
  }

  watch(
    () => auth.isAuthenticated,
    (isAuthed) => {
      if (isAuthed) {
        void fetchAll()
        start()
      } else {
        statuses.value = []
        void stop()
      }
    },
    { immediate: true },
  )

  return {
    statuses,
    byProject,
    loading,
    forProject,
    get,
    isDone,
    isCancelled,
    isOpen,
    defaultKey,
    firstDoneKey,
    fetchAll,
    addStatus,
    updateStatus,
    reorder,
    deleteStatus,
    start,
    stop,
  }
})
