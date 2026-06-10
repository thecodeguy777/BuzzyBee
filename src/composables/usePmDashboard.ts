import { computed, type FunctionalComponent, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { AlertTriangle, ListTodo, Crown, Pause } from 'lucide-vue-next'
import { useClientsStore, type Client } from '@/stores/clients'
import { useTasksStore } from '@/stores/tasks'
import { useStatusesStore } from '@/stores/statuses'
import { useTeamStore } from '@/stores/team'
import { useProjectsStore } from '@/stores/projects'
import { displayName, firstName } from '@/lib/format'

export type AlertKind = 'overdue' | 'unassigned' | 'orphan-client' | 'paused-client'
export interface Alert {
  kind: AlertKind
  label: string
  detail?: string
  onClick: () => void
}
export const alertMeta: Record<AlertKind, { icon: FunctionalComponent; class: string; label: string }> = {
  overdue: { icon: AlertTriangle, class: 'text-error bg-error/10', label: 'Overdue' },
  unassigned: { icon: ListTodo, class: 'text-warning bg-warning/10', label: 'Unassigned' },
  'orphan-client': { icon: Crown, class: 'text-warning bg-warning/10', label: 'No primary PM' },
  'paused-client': { icon: Pause, class: 'text-base-content/60 bg-base-200', label: 'Paused' }
}

export interface Suggestion {
  title: string
  detail: string
  onClick?: () => void
}

export interface VaCard {
  id: string
  name: string
  email: string | null
  avatar_url: string | null
  hours_today: number
  hours_week: number
  open_tasks: number
  overdue_tasks: number
}

export interface ClientRow {
  id: string
  name: string
  status: string
  primary_pm: string
  has_primary: boolean
  open_tasks: number
  overdue_tasks: number
}

interface CalendarLike {
  weekStart: Ref<number>
  isOverdue: (dueOn: string | null | undefined) => boolean
}
interface HoursLike {
  hoursTodayByVa: Ref<Record<string, number>>
  hoursWeekByVa: Ref<Record<string, number>>
}

/** A non-archived client with no primary PM — escalations have nowhere to land. */
function isOrphan(c: Client, pmsByClient: Record<string, { is_primary: boolean }[]>): boolean {
  if (c.status === 'archived') return false
  return !(pmsByClient[c.id] ?? []).some((p) => p.is_primary)
}

export function usePmDashboard(cal: CalendarLike, hours: HoursLike) {
  const clients = useClientsStore()
  const tasks = useTasksStore()
  const statuses = useStatusesStore()
  const team = useTeamStore()
  const projects = useProjectsStore()
  const router = useRouter()

  // True until the data the dashboard derives from has actually loaded, so the
  // template can show skeletons instead of a confident (and wrong) "all clear".
  const loading = computed(
    () => tasks.loading || statuses.loading || !clients.loaded
  )
  const errorMsg = computed(() => tasks.error || clients.error || team.error || null)

  // ── Core derived sets ──────────────────────────────────────────────────────
  const allOpenTasks = computed(() =>
    tasks.tasks.filter((t) => statuses.isOpen(t.project_id, t.status))
  )
  const overdueTasks = computed(() =>
    allOpenTasks.value.filter((t) => cal.isOverdue(t.due_on))
  )
  const completedThisWeek = computed(() => {
    const wk = cal.weekStart.value
    return tasks.tasks.filter(
      (t) =>
        statuses.isDone(t.project_id, t.status) &&
        t.completed_at &&
        new Date(t.completed_at).getTime() >= wk
    ).length
  })

  // ── Single-pass indexes (O(n) instead of O(n·members·clients·statuses)) ─────
  const indexes = computed(() => {
    const openByAssignee: Record<string, number> = {}
    const openByClient: Record<string, number> = {}
    const overdueByClient: Record<string, number> = {}
    for (const t of allOpenTasks.value) {
      if (t.assignee_id) openByAssignee[t.assignee_id] = (openByAssignee[t.assignee_id] ?? 0) + 1
      openByClient[t.client_id] = (openByClient[t.client_id] ?? 0) + 1
      if (cal.isOverdue(t.due_on)) overdueByClient[t.client_id] = (overdueByClient[t.client_id] ?? 0) + 1
    }
    return { openByAssignee, openByClient, overdueByClient }
  })
  const overdueByAssignee = computed(() => {
    const m: Record<string, number> = {}
    for (const t of overdueTasks.value) {
      if (t.assignee_id) m[t.assignee_id] = (m[t.assignee_id] ?? 0) + 1
    }
    return m
  })

  const activeClients = computed(() => clients.clients.filter((c) => c.status === 'active'))

  // ── Headline ────────────────────────────────────────────────────────────────
  const headline = computed(() => {
    const od = overdueTasks.value.length
    const open = allOpenTasks.value.length
    if (od > 0) {
      const worst = [...overdueTasks.value].sort((a, b) =>
        (a.due_on ?? '').localeCompare(b.due_on ?? '')
      )[0]
      return {
        lead: `${od} task${od === 1 ? ' is' : 's are'} overdue`,
        tail: worst ? ` — ${worst.title} on ${worst.client_name ?? 'a client'} is the oldest.` : '.'
      }
    }
    if (open === 0) {
      return { lead: 'Inbox zero across the team', tail: ' — a rare and quiet day.' }
    }
    return {
      lead: `${open} open task${open === 1 ? '' : 's'} in flight`,
      tail: ` — ${completedThisWeek.value} closed this week.`
    }
  })

  // ── Suggestions (only actionable ones; capped at 3) ──────────────────────────
  const suggestions = computed<Suggestion[]>(() => {
    const out: Suggestion[] = []
    const { openByAssignee, overdueByClient } = indexes.value

    // Rebalance load between the busiest and idlest VA.
    const byLoad = team.myTeam
      .map((m) => ({ m, open: openByAssignee[m.id] ?? 0 }))
      .sort((a, b) => a.open - b.open)
    const idle = byLoad[0]
    const busy = byLoad[byLoad.length - 1]
    if (idle && busy && idle.m.id !== busy.m.id && busy.open - idle.open >= 2) {
      out.push({
        title: `Rebalance: ${firstName(displayName(busy.m), 'busiest VA')} → ${firstName(displayName(idle.m), 'idle VA')}`,
        detail: `${busy.open} open vs ${idle.open}. Move 1–2 tasks to even out.`,
        onClick: () => router.push({ name: 'workstation-team', params: { vaId: busy.m.id } })
      })
    }

    // Orphan client — no primary PM.
    const orphan = clients.clients.find((c) => c.status === 'active' && isOrphan(c, clients.pmsByClient))
    if (orphan) {
      out.push({
        title: `Set a primary PM for ${orphan.name}`,
        detail: 'No one is on point. Pick a primary so escalations land somewhere.',
        onClick: () => goClient(orphan.id)
      })
    }

    // At-risk client — most overdue tasks (distinct from the orphan above).
    const atRisk = activeClients.value
      .filter((c) => c.id !== orphan?.id && (overdueByClient[c.id] ?? 0) > 0)
      .sort((a, b) => (overdueByClient[b.id] ?? 0) - (overdueByClient[a.id] ?? 0))[0]
    if (atRisk) {
      const n = overdueByClient[atRisk.id]
      out.push({
        title: `${atRisk.name} is slipping`,
        detail: `${n} overdue task${n === 1 ? '' : 's'}. Open the board and triage.`,
        onClick: () => goClient(atRisk.id)
      })
    }

    return out.slice(0, 3)
  })

  // ── Alerts (capped per category so the list stays scannable) ──────────────────
  const alerts = computed<Alert[]>(() => {
    const out: Alert[] = []

    for (const t of [...overdueTasks.value]
      .sort((a, b) => (a.due_on ?? '').localeCompare(b.due_on ?? ''))
      .slice(0, 3)) {
      out.push({
        kind: 'overdue',
        label: t.title,
        detail: `${t.assignee_name || 'unassigned'} · ${t.client_name || ''}`,
        onClick: () => openTask(t.id, t.client_id, t.project_id)
      })
    }

    for (const t of allOpenTasks.value.filter((t) => !t.assignee_id).slice(0, 2)) {
      out.push({
        kind: 'unassigned',
        label: t.title,
        detail: t.client_name ?? '',
        onClick: () => openTask(t.id, t.client_id, t.project_id)
      })
    }

    for (const c of clients.clients.filter((c) => isOrphan(c, clients.pmsByClient)).slice(0, 3)) {
      out.push({
        kind: 'orphan-client',
        label: c.name,
        detail: 'No primary PM',
        onClick: () => goClient(c.id)
      })
    }

    for (const c of clients.clients.filter((c) => c.status === 'paused').slice(0, 3)) {
      out.push({
        kind: 'paused-client',
        label: c.name,
        detail: 'Paused — review status',
        onClick: () => goClient(c.id)
      })
    }

    return out
  })

  // ── VA roster — sorted by load (who's underwater), then overdue, then hours ───
  const vaCards = computed<VaCard[]>(() => {
    const { openByAssignee } = indexes.value
    const od = overdueByAssignee.value
    const out: VaCard[] = team.myTeam.map((m) => ({
      id: m.id,
      name: displayName(m, 'VA'),
      email: m.email,
      avatar_url: m.avatar_url,
      hours_today: hours.hoursTodayByVa.value[m.id] ?? 0,
      hours_week: hours.hoursWeekByVa.value[m.id] ?? 0,
      open_tasks: openByAssignee[m.id] ?? 0,
      overdue_tasks: od[m.id] ?? 0
    }))
    out.sort(
      (a, b) =>
        b.overdue_tasks - a.overdue_tasks ||
        b.open_tasks - a.open_tasks ||
        b.hours_today - a.hours_today
    )
    return out.slice(0, 6)
  })

  // ── Client roster — active first, at-risk surfaced via overdue count ──────────
  const clientRows = computed<ClientRow[]>(() => {
    const { openByClient, overdueByClient } = indexes.value
    const rows: ClientRow[] = clients.clients
      .filter((c) => c.status !== 'archived')
      .map((c) => {
        const primary = (clients.pmsByClient[c.id] ?? []).find((p) => p.is_primary)
        const pmProfile = primary ? team.profiles[primary.pm_id] : null
        return {
          id: c.id,
          name: c.name,
          status: c.status,
          primary_pm: primary ? displayName(pmProfile, '…') : '—',
          has_primary: !!primary,
          open_tasks: openByClient[c.id] ?? 0,
          overdue_tasks: overdueByClient[c.id] ?? 0
        }
      })
    rows.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1
      return b.overdue_tasks - a.overdue_tasks || b.open_tasks - a.open_tasks
    })
    return rows
  })

  // ── Navigation ────────────────────────────────────────────────────────────────
  async function openTask(taskId: string, clientId: string, projectId: string | null) {
    if (clients.currentClientId !== clientId) clients.setCurrentClient(clientId)
    if (projectId && projects.currentProjectId !== projectId) projects.setCurrentProject(projectId)
    await router.push({ name: 'workstation-tasks' })
    tasks.selectTask(taskId)
  }
  function goVa(id: string) {
    router.push({ name: 'workstation-team', params: { vaId: id } })
  }
  function goClient(id: string) {
    clients.setCurrentClient(id)
    router.push({ name: 'workstation-tasks' })
  }

  return {
    loading,
    errorMsg,
    // metrics
    allOpenTasks,
    overdueTasks,
    completedThisWeek,
    activeClients,
    // sections
    headline,
    suggestions,
    alerts,
    vaCards,
    clientRows,
    // nav
    goVa,
    goClient
  }
}
