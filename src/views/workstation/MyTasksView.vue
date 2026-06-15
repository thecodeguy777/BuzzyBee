<script setup lang="ts">
import { computed } from 'vue'
import {
  ListTodo,
  Calendar as CalendarIcon,
  Flag,
  CircleDashed,
  CheckCircle2,
  Circle,
  Folder
} from 'lucide-vue-next'
import { useTasksStore, type Task } from '@/stores/tasks'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'
import { useProjectsStore } from '@/stores/projects'
import { useStatusesStore } from '@/stores/statuses'

const tasks = useTasksStore()
const auth = useAuthStore()
const clients = useClientsStore()
const projects = useProjectsStore()
const statuses = useStatusesStore()

// Mine = I'm the legacy primary assignee OR a row in the multi-assignee join.
const myTasks = computed(() => {
  const uid = auth.user?.id
  if (!uid) return []
  return tasks.tasks.filter(
    (t) =>
      t.assignee_id === uid ||
      (tasks.assigneesByTask[t.id] ?? []).some((a) => a.user_id === uid)
  )
})

// Status semantics come from the task's project columns (custom per project).
// Fall back to the legacy literals for project-less or unknown-key tasks so
// nothing in a cross-project list renders blank.
function tIsDone(t: Task) {
  const def = statuses.get(t.project_id, t.status)
  return def ? def.is_done : t.status === 'done'
}
function tIsCancelled(t: Task) {
  const def = statuses.get(t.project_id, t.status)
  return def ? def.is_cancelled : t.status === 'cancelled'
}

const buckets = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tom = new Date(today)
  tom.setDate(tom.getDate() + 1)
  const week = new Date(today)
  week.setDate(week.getDate() + 7)

  const overdue: Task[] = []
  const todayTasks: Task[] = []
  const upcoming: Task[] = []
  const someday: Task[] = []
  const done: Task[] = []

  for (const t of myTasks.value) {
    if (tIsDone(t)) {
      done.push(t)
      continue
    }
    if (tIsCancelled(t)) continue
    if (!t.due_on) {
      someday.push(t)
      continue
    }
    const d = new Date(t.due_on + 'T00:00:00')
    if (d < today) overdue.push(t)
    else if (d < tom) todayTasks.push(t)
    else if (d < week) upcoming.push(t)
    else someday.push(t)
  }

  const sortFn = (a: Task, b: Task) =>
    a.priority - b.priority ||
    (a.due_on ?? '').localeCompare(b.due_on ?? '') ||
    a.priority_order - b.priority_order

  overdue.sort(sortFn)
  todayTasks.sort(sortFn)
  upcoming.sort(sortFn)
  someday.sort(sortFn)
  done.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))

  return { overdue, today: todayTasks, upcoming, someday, done }
})

// The toggle is a done/not-done checkbox; icon + color derive from semantics,
// not the (now arbitrary, per-project) status key.
function statusIcon(t: Task) {
  if (tIsDone(t)) return CheckCircle2
  if (tIsCancelled(t)) return CircleDashed
  return Circle
}
function statusColor(t: Task) {
  if (tIsDone(t)) return 'text-success'
  if (tIsCancelled(t)) return 'text-base-content/30'
  return 'text-base-content/40'
}

// A small colored label so non-binary states (In progress, In review, Blocked)
// stay visible. Skipped for the first column ("To do") to keep the list calm.
const COLOR_TEXT: Record<string, string> = {
  neutral: 'text-base-content/60',
  primary: 'text-primary',
  success: 'text-success',
  error: 'text-error',
  warning: 'text-warning',
  info: 'text-info',
  muted: 'text-base-content/40'
}
function statusLabel(t: Task): { label: string; cls: string } | null {
  const def = statuses.get(t.project_id, t.status)
  if (!def || def.is_done || def.is_cancelled) return null
  if (def.key === statuses.defaultKey(t.project_id)) return null
  return { label: def.label, cls: COLOR_TEXT[def.color] ?? COLOR_TEXT.neutral }
}

function priorityColor(p: number) {
  return p === 1
    ? 'text-error'
    : p === 2
      ? 'text-warning'
      : p === 4
        ? 'text-base-content/40'
        : 'text-base-content/60'
}

function dueLabel(due: string | null) {
  if (!due) return ''
  const d = new Date(due + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff < 0) return `${Math.abs(diff)}d overdue`
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: 'short' })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
function dueClass(due: string | null) {
  if (!due) return 'text-base-content/40'
  const d = new Date(due + 'T00:00:00').getTime()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = d - today.getTime()
  if (diff < 0) return 'text-error'
  if (diff < 86400000) return 'text-warning'
  return 'text-base-content/70'
}

function projectName(t: Task) {
  return projects.projects.find((p) => p.id === t.project_id)?.name ?? null
}

async function activate(t: Task) {
  if (t.client_id !== clients.currentClientId) clients.setCurrentClient(t.client_id)
  if (t.project_id && t.project_id !== projects.currentProjectId) {
    projects.setCurrentProject(t.project_id)
  }
  tasks.selectTask(t.id)
}

async function toggleDone(t: Task) {
  // Move to this project's first done column, or back to its first (default)
  // column. No usable column → nothing to toggle to.
  const target = tIsDone(t)
    ? statuses.defaultKey(t.project_id)
    : statuses.firstDoneKey(t.project_id)
  if (!target || target === t.status) return
  await tasks.setStatus(t.id, target)
}

const sections = computed(() => [
  { key: 'overdue', label: 'Overdue', items: buckets.value.overdue, accent: 'text-error' },
  { key: 'today', label: 'Today', items: buckets.value.today, accent: 'text-base-content' },
  { key: 'upcoming', label: 'This week', items: buckets.value.upcoming, accent: 'text-base-content/70' },
  { key: 'someday', label: 'No due date', items: buckets.value.someday, accent: 'text-base-content/60' },
  { key: 'done', label: 'Completed recently', items: buckets.value.done.slice(0, 10), accent: 'text-base-content/50' }
])
</script>

<template>
  <div class="space-y-6">
    <header>
      <h1 class="font-display text-xl font-semibold">My tasks</h1>
      <p class="text-xs text-base-content/60 mt-0.5">
        Every task assigned to you, across all clients and projects.
      </p>
    </header>

    <div
      v-if="myTasks.length === 0"
      class="bg-base-100 rounded-xl border border-base-300 shadow-md px-6 py-12 text-center text-sm text-base-content/60"
    >
      <ListTodo class="w-8 h-8 mx-auto text-base-content/30" :stroke-width="1.5" />
      <p class="mt-3">Nothing assigned to you yet.</p>
    </div>

    <template v-else>
      <section
        v-for="s in sections"
        :key="s.key"
        v-show="s.items.length > 0"
        class="space-y-2"
      >
        <div class="flex items-center gap-2">
          <h2
            class="text-xs uppercase tracking-wider font-semibold"
            :class="s.accent"
          >
            {{ s.label }}
          </h2>
          <span class="text-xs text-base-content/40 tabular-nums">{{ s.items.length }}</span>
        </div>

        <ul class="bg-base-100 rounded-xl border border-base-300 shadow-sm overflow-hidden divide-y divide-base-300/60">
          <li v-for="t in s.items" :key="t.id">
            <div class="flex items-center gap-2.5 px-3 py-1.5 hover:bg-base-200/30 transition-colors">
              <button
                type="button"
                class="shrink-0"
                :class="statusColor(t)"
                :title="`Mark ${tIsDone(t) ? 'open' : 'done'}`"
                @click.stop="toggleDone(t)"
              >
                <component
                  :is="statusIcon(t)"
                  class="w-4 h-4"
                  :stroke-width="tIsDone(t) ? 2 : 1.75"
                />
              </button>
              <button
                type="button"
                class="flex-1 min-w-0 text-left flex items-baseline gap-2"
                @click="activate(t)"
              >
                <span
                  class="text-[13px] truncate"
                  :class="tIsDone(t) && 'line-through text-base-content/50'"
                >
                  {{ t.title }}
                </span>
                <span class="font-mono text-[0.65rem] text-base-content/50 shrink-0">{{ t.reference_number }}</span>
                <span
                  v-if="statusLabel(t)"
                  class="text-[0.65rem] font-medium uppercase tracking-wide shrink-0"
                  :class="statusLabel(t)!.cls"
                >
                  {{ statusLabel(t)!.label }}
                </span>
                <span class="flex items-center gap-1 text-xs text-base-content/55 truncate min-w-0">
                  <Folder class="w-3 h-3 shrink-0" :stroke-width="1.75" />
                  {{ t.client_name ?? '—' }}<span v-if="projectName(t)"> / {{ projectName(t) }}</span>
                </span>
                <span v-if="t.due_on" class="flex items-center gap-1 text-xs shrink-0" :class="dueClass(t.due_on)">
                  <CalendarIcon class="w-3 h-3" :stroke-width="1.75" />
                  {{ dueLabel(t.due_on) }}
                </span>
                <span
                  v-if="t.priority !== 3"
                  class="flex items-center shrink-0"
                  :class="priorityColor(t.priority)"
                >
                  <Flag class="w-3 h-3" :stroke-width="2.25" />
                </span>
              </button>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
