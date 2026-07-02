import { computed, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'
import { useProjectsStore } from '@/stores/projects'
import { useStatusesStore } from '@/stores/statuses'
import { useTasksStore } from '@/stores/tasks'
import { useTeamStore } from '@/stores/team'
import { useTimeStore } from '@/stores/time'
import type { Alert } from '@/composables/usePmDashboard'

export interface VaClientRow {
  id: string
  name: string
  status: string
  timezone: string | null
  open_tasks: number
  overdue_tasks: number
  is_current: boolean
}

interface CalendarLike {
  todayStart: Ref<number>
  weekStart: Ref<number>
  todayStr: Ref<string>
  isOverdue: (dueOn: string | null | undefined) => boolean
}

/** The VA's day at a glance — my tasks, my hours, my clients. The managerial
 *  twin is usePmDashboard; alerts share its Alert shape so NeedsAttention
 *  renders both. */
export function useVaDashboard(cal: CalendarLike) {
  const auth = useAuthStore()
  const clients = useClientsStore()
  const projects = useProjectsStore()
  const statuses = useStatusesStore()
  const tasks = useTasksStore()
  const team = useTeamStore()
  const time = useTimeStore()
  const router = useRouter()

  const loading = computed(() => tasks.loading || statuses.loading || !clients.loaded)
  const errorMsg = computed(() => tasks.error || clients.error || time.error || null)

  // Mine = legacy primary assignee OR a row in the multi-assignee join
  // (same rule as MyTasksView).
  const myTasks = computed(() => {
    const uid = auth.user?.id
    if (!uid) return []
    return tasks.tasks.filter(
      (t) =>
        t.assignee_id === uid ||
        (tasks.assigneesByTask[t.id] ?? []).some((a) => a.user_id === uid)
    )
  })

  const myOpenTasks = computed(() =>
    myTasks.value.filter((t) => statuses.isOpen(t.project_id, t.status))
  )
  const overdueTasks = computed(() =>
    myOpenTasks.value.filter((t) => cal.isOverdue(t.due_on))
  )
  const dueTodayTasks = computed(() =>
    myOpenTasks.value.filter((t) => t.due_on === cal.todayStr.value)
  )
  const completedThisWeek = computed(() => {
    const wk = cal.weekStart.value
    return myTasks.value.filter(
      (t) =>
        statuses.isDone(t.project_id, t.status) &&
        t.completed_at &&
        new Date(t.completed_at).getTime() >= wk
    ).length
  })

  // Hours today — closed entries that started today plus the live timer.
  // recentEntries spans 7 days so "today" is a plain filter; the running
  // entry's active_seconds is stale by design, elapsedSeconds is the truth.
  const hoursTodaySeconds = computed(() => {
    let s = 0
    for (const e of time.recentEntries) {
      if (e.status !== 'closed') continue
      if (new Date(e.started_at).getTime() < cal.todayStart.value) continue
      s += e.active_seconds
    }
    if (time.isRunning) s += time.elapsedSeconds
    return s
  })

  // My clients — active assignments to me, with my open/overdue per client.
  const myClientRows = computed<VaClientRow[]>(() => {
    const uid = auth.user?.id
    if (!uid) return []
    const assigned = new Set<string>()
    for (const a of team.assignments) {
      if (a.va_id === uid && a.status === 'active') assigned.add(a.client_id)
    }
    const open: Record<string, number> = {}
    const od: Record<string, number> = {}
    for (const t of myOpenTasks.value) {
      open[t.client_id] = (open[t.client_id] ?? 0) + 1
      if (cal.isOverdue(t.due_on)) od[t.client_id] = (od[t.client_id] ?? 0) + 1
    }
    return clients.clients
      .filter((c) => assigned.has(c.id) && c.status !== 'archived')
      .map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        timezone: c.timezone,
        open_tasks: open[c.id] ?? 0,
        overdue_tasks: od[c.id] ?? 0,
        is_current: c.id === clients.currentClientId
      }))
      .sort(
        (a, b) =>
          b.overdue_tasks - a.overdue_tasks ||
          b.open_tasks - a.open_tasks ||
          a.name.localeCompare(b.name)
      )
  })

  // Alerts — my overdue first, then today's dues (capped so the list stays scannable).
  const alerts = computed<Alert[]>(() => {
    const out: Alert[] = []
    for (const t of [...overdueTasks.value]
      .sort((a, b) => (a.due_on ?? '').localeCompare(b.due_on ?? ''))
      .slice(0, 4)) {
      out.push({
        kind: 'overdue',
        label: t.title,
        detail: t.client_name ?? '',
        onClick: () => openTask(t.id, t.client_id, t.project_id)
      })
    }
    for (const t of [...dueTodayTasks.value]
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 4)) {
      out.push({
        kind: 'due-today',
        label: t.title,
        detail: t.client_name ?? '',
        onClick: () => openTask(t.id, t.client_id, t.project_id)
      })
    }
    return out
  })

  async function openTask(taskId: string, clientId: string, projectId: string | null) {
    if (clients.currentClientId !== clientId) clients.setCurrentClient(clientId)
    if (projectId && projects.currentProjectId !== projectId) projects.setCurrentProject(projectId)
    await router.push({ name: 'workstation-tasks' })
    tasks.selectTask(taskId)
  }

  function goClient(id: string) {
    // Timer-aware: if a timer runs on another client this pops the global
    // SwitchClientModal instead of silently switching — stay on home in
    // that case so the confirm resolves in place.
    time.requestSwitch(id)
    if (!time.pendingSwitchClientId) void router.push({ name: 'workstation-tasks' })
  }

  return {
    loading,
    errorMsg,
    myOpenTasks,
    overdueTasks,
    dueTodayTasks,
    completedThisWeek,
    hoursTodaySeconds,
    myClientRows,
    alerts,
    openTask,
    goClient
  }
}
