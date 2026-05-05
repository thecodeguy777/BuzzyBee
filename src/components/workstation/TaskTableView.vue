<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Plus,
  Trash2,
  Circle,
  CheckCircle2,
  CircleDashed,
  CircleAlert,
  CircleSlash,
  Loader2,
  ChevronRight,
  ChevronDown,
  Flag,
  Sparkles,
  Filter,
  ArrowUpDown,
  Group as GroupIcon,
  Paperclip,
  MessageSquare,
  Link2,
  Pencil,
  X
} from 'lucide-vue-next'
import { useTasksStore, type Task, type TaskStatus } from '@/stores/tasks'
import { useTaskFieldsStore, type TaskFieldDef } from '@/stores/taskFields'
import { useClientsStore } from '@/stores/clients'

const tasks = useTasksStore()
const taskFields = useTaskFieldsStore()
const clients = useClientsStore()

const emit = defineEmits<{ (e: 'add-column'): void }>()

// -----------------------------------------------------------------------------
// Status / priority metadata
// -----------------------------------------------------------------------------
const statuses: {
  value: TaskStatus
  label: string
  icon: any
  pillBg: string
  pillFg: string
  dotBg: string
}[] = [
  { value: 'todo',         label: 'Todo',        icon: CircleDashed, pillBg: 'bg-base-200',        pillFg: 'text-base-content/70', dotBg: 'bg-base-content/40' },
  { value: 'in_progress',  label: 'In progress', icon: Loader2,      pillBg: 'bg-primary/10',      pillFg: 'text-primary',          dotBg: 'bg-primary' },
  { value: 'blocked',      label: 'Blocked',     icon: CircleAlert,  pillBg: 'bg-error/10',        pillFg: 'text-error',            dotBg: 'bg-error' },
  { value: 'done',         label: 'Done',        icon: CheckCircle2, pillBg: 'bg-success/10',      pillFg: 'text-success',          dotBg: 'bg-success' },
  { value: 'cancelled',    label: 'Cancelled',   icon: CircleSlash,  pillBg: 'bg-base-200',        pillFg: 'text-base-content/40', dotBg: 'bg-base-content/30' }
]
function statusOf(s: TaskStatus) {
  return statuses.find((x) => x.value === s) ?? statuses[0]
}

const priorities: { value: 1 | 2 | 3 | 4; label: string; textClass: string }[] = [
  { value: 1, label: 'Urgent', textClass: 'text-error' },
  { value: 2, label: 'High',   textClass: 'text-warning' },
  { value: 3, label: 'Normal', textClass: 'text-base-content/60' },
  { value: 4, label: 'Low',    textClass: 'text-base-content/40' }
]
function priorityOf(p: number) {
  return priorities.find((x) => x.value === p) ?? priorities[2]
}

// -----------------------------------------------------------------------------
// Group-by-status (collapse persisted in localStorage)
// -----------------------------------------------------------------------------
const COLLAPSE_KEY = 'buzzybee.workstation.task-table.collapsed-groups'
function loadCollapsed(): Set<TaskStatus> {
  if (typeof window === 'undefined') return new Set(['cancelled'])
  try {
    const raw = window.localStorage.getItem(COLLAPSE_KEY)
    return new Set(raw ? (JSON.parse(raw) as TaskStatus[]) : ['cancelled'])
  } catch {
    return new Set(['cancelled'])
  }
}
const collapsed = ref<Set<TaskStatus>>(loadCollapsed())
function toggleGroup(s: TaskStatus) {
  const next = new Set(collapsed.value)
  if (next.has(s)) next.delete(s)
  else next.add(s)
  collapsed.value = next
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next]))
  }
}

const groups = computed(() => {
  const map = new Map<TaskStatus, Task[]>()
  for (const s of statuses) map.set(s.value, [])
  for (const t of tasks.tasksForCurrentClient) map.get(t.status)?.push(t)
  for (const [k, list] of map) {
    list.sort(
      (a, b) =>
        a.priority_order - b.priority_order ||
        a.created_at.localeCompare(b.created_at)
    )
  }
  return statuses
    .map((s) => ({
      ...s,
      tasks: map.get(s.value) ?? []
    }))
    .filter((g) => g.tasks.length > 0 || g.value !== 'cancelled')
})

const customCols = computed(() => taskFields.defsForCurrentClient)

// Total visible columns (used for empty state colspan + group-row colspan)
const totalCols = computed(() => 9 + customCols.value.length + 1)
//  ^ 9 = check + name + status + due + priority + stage + assignees + files + chat

// -----------------------------------------------------------------------------
// HiveMindAI suggestion banner (rule-based stub).
// One contextual suggestion based on the current state.
// -----------------------------------------------------------------------------
const suggestion = computed(() => {
  const inFlight = tasks.tasksForCurrentClient.filter(
    (t) => t.status === 'in_progress'
  )
  const overdue = tasks.tasksForCurrentClient.filter(
    (t) =>
      t.due_on &&
      t.status !== 'done' &&
      t.status !== 'cancelled' &&
      new Date(t.due_on + 'T00:00:00').getTime() < Date.now()
  )
  const unassigned = tasks.tasksForCurrentClient.filter(
    (t) =>
      !t.assignee_id &&
      t.status !== 'done' &&
      t.status !== 'cancelled'
  )
  if (overdue.length >= 2) {
    return {
      lead: `${overdue.length} overdue tasks`,
      tail: ` — review with the team or push the dates.`,
      cta: null
    }
  }
  if (unassigned.length >= 3) {
    return {
      lead: `${unassigned.length} tasks have no owner`,
      tail: ` — assign before they slip.`,
      cta: null
    }
  }
  if (inFlight.length >= 5) {
    return {
      lead: 'Add a launch retro task',
      tail: ` — ${inFlight.length} things in flight; lock in the post-mortem now.`,
      cta: 'Add task'
    }
  }
  return null
})
const suggestionDismissed = ref(false)

// -----------------------------------------------------------------------------
// Action functions (from previous version, preserved)
// -----------------------------------------------------------------------------
async function setStatus(t: Task, status: TaskStatus) {
  if (t.status === status) return
  await tasks.setStatus(t.id, status)
}
async function toggleDone(t: Task) {
  await tasks.setStatus(t.id, t.status === 'done' ? 'todo' : 'done')
}
async function setPriority(t: Task, priority: 1 | 2 | 3 | 4) {
  if (t.priority === priority) return
  await tasks.updateTask(t.id, { priority })
}
async function setDue(t: Task, due_on: string) {
  if ((t.due_on ?? '') === due_on) return
  await tasks.updateTask(t.id, { due_on: due_on || null })
}
async function setTitle(t: Task, title: string) {
  const trimmed = title.trim()
  if (!trimmed || trimmed === t.title) return
  await tasks.updateTask(t.id, { title: trimmed })
}
async function setStage(t: Task, value: string) {
  const next = { ...(t.custom_fields ?? {}), stage: value || null } as any
  if ((t.custom_fields as any)?.stage === (value || null)) return
  await tasks.updateTask(t.id, { custom_fields: next })
}
function stageOf(t: Task): string {
  return ((t.custom_fields as any)?.stage as string) ?? ''
}
async function setCustomValue(t: Task, key: string, value: unknown) {
  const next = { ...(t.custom_fields ?? {}), [key]: value }
  await tasks.updateTask(t.id, { custom_fields: next as any })
}
function customValue(t: Task, key: string) {
  return (t.custom_fields as Record<string, unknown> | null)?.[key]
}
function multiSelectIncludes(t: Task, key: string, value: string) {
  const v = customValue(t, key)
  return Array.isArray(v) && v.includes(value)
}
function toggleMulti(t: Task, key: string, value: string) {
  const current = customValue(t, key)
  const arr = Array.isArray(current) ? [...current] : []
  const idx = arr.indexOf(value)
  if (idx === -1) arr.push(value)
  else arr.splice(idx, 1)
  void setCustomValue(t, key, arr)
}
async function deleteCol(d: TaskFieldDef) {
  if (!confirm(`Delete column "${d.label}"? Existing values stay in the database but won't show.`)) return
  try {
    await taskFields.deleteField(d.id)
  } catch (e) {
    alert((e as Error).message)
  }
}

// -----------------------------------------------------------------------------
// Add task (new and per-group)
// -----------------------------------------------------------------------------
const newTitleByStatus = ref<Record<TaskStatus, string>>({
  todo: '',
  in_progress: '',
  blocked: '',
  done: '',
  cancelled: ''
})
const adderOpenFor = ref<TaskStatus | null>(null)

async function commitNew(status: TaskStatus) {
  const title = newTitleByStatus.value[status].trim()
  if (!title) {
    adderOpenFor.value = null
    return
  }
  // createTask always inserts as 'todo'. If the user added from a non-todo
  // group, we follow up with a status change so the row lands in the right group.
  const created = await tasks.createTask({ title })
  if (status !== 'todo' && created?.id) {
    await tasks.setStatus(created.id, status)
  }
  newTitleByStatus.value[status] = ''
  adderOpenFor.value = status
}

// -----------------------------------------------------------------------------
// Display helpers
// -----------------------------------------------------------------------------
function dueLabel(due: string | null) {
  if (!due) return ''
  const d = new Date(due + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 1 && diff < 7) return d.toLocaleDateString(undefined, { weekday: 'short' })
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

function openDrawer(t: Task) {
  tasks.selectTask(t.id)
}

function openDatePicker(triggerEl: HTMLElement) {
  const input = triggerEl.parentElement?.querySelector(
    'input[type=date]'
  ) as HTMLInputElement | null
  if (!input) return
  if (typeof input.showPicker === 'function') {
    try {
      input.showPicker()
      return
    } catch {
      /* fall through */
    }
  }
  input.focus()
  input.click()
}

// -----------------------------------------------------------------------------
// Avatar (assignee)
// -----------------------------------------------------------------------------
const AVATAR_PALETTE = ['#C8741A', '#A8743F', '#7A8A5C', '#8A6B9A', '#B85450', '#5C8A5A', '#C4925E']
function hashColor(seed: string) {
  let h = 0
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]
}
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('') || '?'
}

// Activity count (proxy for chat until Comms ships)
function chatCount(t: Task) {
  return (t.activity_log ?? []).length
}
function fileCount(t: Task) {
  return (t.attachments ?? []).length
}

// Link helpers — used by the URL custom-field cell to render a proper anchor.
function normalizeUrl(raw: string): string {
  const v = raw.trim()
  if (!v) return ''
  if (/^https?:\/\//i.test(v)) return v
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return v
  if (v.startsWith('//')) return 'https:' + v
  // Bare host or path — assume https.
  return 'https://' + v
}
function urlLabel(raw: string): string {
  const v = raw.trim()
  if (!v) return ''
  try {
    const u = new URL(normalizeUrl(v))
    return u.hostname.replace(/^www\./, '') + (u.pathname !== '/' ? u.pathname : '')
  } catch {
    return v
  }
}

// Per-cell edit toggles — keyed by `${task.id}:${fieldKey}`.
const urlEditing = ref<Set<string>>(new Set())
function urlEditKey(taskId: string, key: string) {
  return `${taskId}:${key}`
}
function startEditUrl(taskId: string, key: string) {
  const next = new Set(urlEditing.value)
  next.add(urlEditKey(taskId, key))
  urlEditing.value = next
}
function stopEditUrl(taskId: string, key: string) {
  const next = new Set(urlEditing.value)
  next.delete(urlEditKey(taskId, key))
  urlEditing.value = next
}
function isEditingUrl(taskId: string, key: string) {
  return urlEditing.value.has(urlEditKey(taskId, key))
}

// -----------------------------------------------------------------------------
// Cell styling
// -----------------------------------------------------------------------------
const cellBase = 'border-r border-base-300/40 align-middle'
const editableCell =
  'group/cell focus-within:bg-primary/5 focus-within:ring-1 focus-within:ring-primary/40 focus-within:relative'
</script>

<template>
  <div class="space-y-3">
    <!-- Toolbar -->
    <div class="flex items-center gap-2 flex-wrap">
      <button type="button" class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-base-300 bg-white text-xs font-medium hover:bg-base-200/60 transition-colors">
        <Filter class="w-3.5 h-3.5" :stroke-width="1.75" />
        Filter
      </button>
      <button type="button" class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-base-300 bg-white text-xs font-medium hover:bg-base-200/60 transition-colors">
        <ArrowUpDown class="w-3.5 h-3.5" :stroke-width="1.75" />
        Sort
      </button>
      <button type="button" class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-base-300 bg-white text-xs font-medium hover:bg-base-200/60 transition-colors">
        <GroupIcon class="w-3.5 h-3.5" :stroke-width="1.75" />
        Group: <span class="text-base-content/60">Status</span>
      </button>

      <div class="flex-1" />

      <button
        type="button"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-base-300 text-xs font-medium hover:bg-base-200/60 transition-colors shadow-hc-1"
      >
        <Sparkles class="w-3.5 h-3.5" :stroke-width="1.75" style="color: var(--hc-accent)" />
        Ask HiveMindAI
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-transform hover:scale-[1.02] active:scale-95 shadow-hc-1"
        style="background: var(--hc-ink); color: var(--hc-paper);"
        @click="adderOpenFor = 'todo'"
      >
        <Plus class="w-3.5 h-3.5" :stroke-width="2" />
        New task
      </button>
    </div>

    <!-- Table card -->
    <div class="bg-white rounded-2xl border border-base-300 shadow-hc-1 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm border-collapse">
          <thead class="sticky top-0 z-10" style="background: var(--hc-surface-warm)">
            <tr class="border-b border-base-300/60">
              <th class="w-8 border-r border-base-300/40 px-2 py-2.5"></th>
              <th class="text-left font-semibold text-[0.65rem] uppercase tracking-[0.08em] text-base-content/55 px-3 py-2.5 border-r border-base-300/40 min-w-[18rem]">
                Name
              </th>
              <th class="text-left font-semibold text-[0.65rem] uppercase tracking-[0.08em] text-base-content/55 px-3 py-2.5 border-r border-base-300/40 w-[9rem]">
                Status
              </th>
              <th class="text-left font-semibold text-[0.65rem] uppercase tracking-[0.08em] text-base-content/55 px-3 py-2.5 border-r border-base-300/40 w-[7rem]">
                Due
              </th>
              <th class="text-left font-semibold text-[0.65rem] uppercase tracking-[0.08em] text-base-content/55 px-3 py-2.5 border-r border-base-300/40 w-[7rem]">
                Priority
              </th>
              <th class="text-left font-semibold text-[0.65rem] uppercase tracking-[0.08em] text-base-content/55 px-3 py-2.5 border-r border-base-300/40 w-[7rem]">
                Stage
              </th>
              <th class="text-left font-semibold text-[0.65rem] uppercase tracking-[0.08em] text-base-content/55 px-3 py-2.5 border-r border-base-300/40 w-[7rem]">
                Assignees
              </th>
              <th class="text-left font-semibold text-[0.65rem] uppercase tracking-[0.08em] text-base-content/55 px-3 py-2.5 border-r border-base-300/40 w-[5rem]">
                Files
              </th>
              <th class="text-left font-semibold text-[0.65rem] uppercase tracking-[0.08em] text-base-content/55 px-3 py-2.5 border-r border-base-300/40 w-[5rem]">
                Chat
              </th>
              <th
                v-for="d in customCols"
                :key="d.id"
                class="text-left font-semibold text-[0.65rem] uppercase tracking-[0.08em] text-base-content/55 px-3 py-2.5 border-r border-base-300/40 w-[10rem] group/col"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="truncate">{{ d.label }}</span>
                  <button
                    type="button"
                    class="opacity-0 group-hover/col:opacity-100 transition-opacity text-base-content/40 hover:text-error"
                    :title="`Delete ${d.label}`"
                    @click="deleteCol(d)"
                  >
                    <Trash2 class="w-3 h-3" :stroke-width="1.75" />
                  </button>
                </div>
              </th>
              <th class="px-2 py-2.5 w-[2.5rem] text-center">
                <button
                  type="button"
                  class="text-base-content/40 hover:text-base-content"
                  title="Add column"
                  @click="emit('add-column')"
                >
                  <Plus class="w-3.5 h-3.5" :stroke-width="2" />
                </button>
              </th>
            </tr>
          </thead>

          <tbody>
            <!-- HiveMindAI suggestion banner -->
            <tr
              v-if="suggestion && !suggestionDismissed"
              class="border-b border-base-300/40"
              style="background: var(--hc-accent-bg)"
            >
              <td :colspan="totalCols" class="px-4 py-2">
                <div class="flex items-center gap-2.5 text-sm">
                  <Sparkles class="w-3.5 h-3.5 shrink-0" :stroke-width="1.75" style="color: var(--hc-accent)" />
                  <span class="font-medium" style="color: var(--hc-accent)">HiveMindAI suggests:</span>
                  <span class="text-base-content/80">
                    <strong class="font-medium">{{ suggestion.lead }}</strong>
                    <span class="text-base-content/60">{{ suggestion.tail }}</span>
                  </span>
                  <div class="flex-1" />
                  <button
                    type="button"
                    class="text-[0.7rem] uppercase tracking-wider font-medium text-base-content/50 hover:text-base-content/80 transition-colors"
                    @click="suggestionDismissed = true"
                  >
                    Dismiss
                  </button>
                  <button
                    v-if="suggestion.cta"
                    type="button"
                    class="px-2.5 py-1 rounded-md text-xs font-medium transition-transform hover:scale-[1.02] active:scale-95"
                    style="background: var(--hc-accent); color: var(--hc-paper);"
                    @click="adderOpenFor = 'todo'"
                  >
                    {{ suggestion.cta }}
                  </button>
                </div>
              </td>
            </tr>

            <!-- Empty state -->
            <tr
              v-if="groups.every((g) => g.tasks.length === 0)"
              class="border-b border-base-300/40"
            >
              <td :colspan="totalCols" class="px-3 py-12 text-center text-sm text-base-content/50">
                No tasks for {{ clients.currentClient?.name ?? 'this client' }} yet.
              </td>
            </tr>

            <!-- Groups -->
            <template v-for="g in groups" :key="g.value">
              <!-- Group header row -->
              <tr
                class="cursor-pointer hover:bg-base-200/30 transition-colors"
                style="background: var(--hc-surface-warm)"
                @click="toggleGroup(g.value)"
              >
                <td :colspan="totalCols" class="px-3 py-1.5">
                  <div class="flex items-center gap-2">
                    <ChevronDown
                      v-if="!collapsed.has(g.value)"
                      class="w-3.5 h-3.5 text-base-content/50"
                      :stroke-width="1.75"
                    />
                    <ChevronRight
                      v-else
                      class="w-3.5 h-3.5 text-base-content/50"
                      :stroke-width="1.75"
                    />
                    <span class="w-2 h-2 rounded-sm" :class="g.dotBg" />
                    <span class="text-xs font-semibold">{{ g.label }}</span>
                    <span class="text-xs text-base-content/45 tabular-nums">{{ g.tasks.length }}</span>
                    <div class="flex-1" />
                    <button
                      type="button"
                      class="text-[0.7rem] uppercase tracking-wider font-medium text-base-content/50 hover:text-primary transition-colors flex items-center gap-1"
                      @click.stop="adderOpenFor = g.value"
                    >
                      <Plus class="w-3 h-3" :stroke-width="2" />
                      Add task
                    </button>
                  </div>
                </td>
              </tr>

              <!-- Per-group inline adder -->
              <tr
                v-if="adderOpenFor === g.value"
                class="border-b border-base-300/40"
                style="background: var(--hc-accent-bg)"
              >
                <td class="border-r border-base-300/40 w-8"></td>
                <td :colspan="totalCols - 1" class="px-3 py-1.5">
                  <input
                    v-model="newTitleByStatus[g.value]"
                    autofocus
                    type="text"
                    placeholder="Task title — Enter to add, Esc to cancel"
                    class="w-full bg-transparent outline-none text-sm placeholder:text-base-content/40"
                    @keydown.enter="commitNew(g.value)"
                    @keydown.esc="adderOpenFor = null"
                    @blur="commitNew(g.value)"
                  />
                </td>
              </tr>

              <!-- Task rows -->
              <template v-if="!collapsed.has(g.value)">
                <tr
                  v-for="t in g.tasks"
                  :key="t.id"
                  class="group border-b border-base-300/40 hover:bg-base-100/50"
                >
                  <!-- check -->
                  <td :class="[cellBase, 'px-2 py-1.5 text-center']">
                    <button
                      type="button"
                      class="inline-flex items-center justify-center hover:scale-110 transition-transform"
                      :class="statusOf(t.status).pillFg"
                      @click="toggleDone(t)"
                    >
                      <CheckCircle2
                        v-if="t.status === 'done'"
                        class="w-4 h-4"
                        :stroke-width="2"
                        fill="currentColor"
                        fill-opacity="0.18"
                      />
                      <Circle v-else class="w-4 h-4" :stroke-width="1.75" />
                    </button>
                  </td>

                  <!-- name -->
                  <td :class="[cellBase, editableCell, 'px-0 py-0 relative']">
                    <div class="flex items-center pr-1">
                      <input
                        :value="t.title"
                        type="text"
                        class="flex-1 bg-transparent outline-none text-sm px-3 py-1.5 truncate"
                        :class="t.status === 'done' && 'line-through text-base-content/45'"
                        @blur="setTitle(t, ($event.target as HTMLInputElement).value)"
                        @keydown.enter="($event.target as HTMLInputElement).blur()"
                      />
                      <button
                        type="button"
                        class="opacity-0 group-hover:opacity-100 transition-opacity text-base-content/40 hover:text-base-content shrink-0 mr-1"
                        title="Open task"
                        @click="openDrawer(t)"
                      >
                        <ChevronRight class="w-4 h-4" :stroke-width="1.75" />
                      </button>
                    </div>
                  </td>

                  <!-- status pill -->
                  <td :class="[cellBase, editableCell, 'px-0 py-0 relative']">
                    <div class="flex items-center px-3 py-1.5">
                      <span
                        class="inline-flex items-center gap-1.5 pl-2 pr-2.5 py-0.5 rounded-full text-xs font-medium"
                        :class="[statusOf(t.status).pillBg, statusOf(t.status).pillFg]"
                      >
                        <span class="w-1.5 h-1.5 rounded-full" :class="statusOf(t.status).dotBg" />
                        {{ statusOf(t.status).label }}
                      </span>
                      <select
                        :value="t.status"
                        class="absolute inset-0 opacity-0 cursor-pointer"
                        @change="setStatus(t, ($event.target as HTMLSelectElement).value as TaskStatus)"
                      >
                        <option v-for="s in statuses" :key="s.value" :value="s.value">{{ s.label }}</option>
                      </select>
                    </div>
                  </td>

                  <!-- due -->
                  <td :class="[cellBase, editableCell, 'p-0 relative']">
                    <button
                      type="button"
                      class="w-full text-left text-sm px-3 py-1.5 cursor-pointer hover:bg-base-200/40"
                      :class="dueClass(t.due_on)"
                      @click="openDatePicker(($event.currentTarget as HTMLElement))"
                    >
                      {{ t.due_on ? dueLabel(t.due_on) : '—' }}
                    </button>
                    <input
                      :value="t.due_on ?? ''"
                      type="date"
                      tabindex="-1"
                      class="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
                      @change="setDue(t, ($event.target as HTMLInputElement).value)"
                    />
                  </td>

                  <!-- priority -->
                  <td :class="[cellBase, editableCell, 'px-0 py-0 relative']">
                    <div class="flex items-center gap-1.5 px-3 py-1.5" :class="priorityOf(t.priority).textClass">
                      <Flag class="w-3 h-3 shrink-0" :stroke-width="2.25" />
                      <span class="text-sm">{{ priorityOf(t.priority).label }}</span>
                      <select
                        :value="t.priority"
                        class="absolute inset-0 opacity-0 cursor-pointer"
                        @change="setPriority(t, Number(($event.target as HTMLSelectElement).value) as 1 | 2 | 3 | 4)"
                      >
                        <option v-for="p in priorities" :key="p.value" :value="p.value">{{ p.label }}</option>
                      </select>
                    </div>
                  </td>

                  <!-- stage (custom_fields.stage as freeform text) -->
                  <td :class="[cellBase, editableCell, 'px-0 py-0 relative']">
                    <input
                      :value="stageOf(t)"
                      type="text"
                      placeholder="—"
                      class="w-full bg-transparent outline-none text-sm px-3 py-1.5 placeholder:text-base-content/30"
                      @blur="setStage(t, ($event.target as HTMLInputElement).value)"
                      @keydown.enter="($event.target as HTMLInputElement).blur()"
                    />
                  </td>

                  <!-- assignees (single avatar; multi-assignee is a future schema migration) -->
                  <td :class="[cellBase, 'px-3 py-1.5']">
                    <button
                      v-if="t.assignee_id && t.assignee_name"
                      type="button"
                      class="inline-flex items-center hover:opacity-80 transition-opacity"
                      :title="t.assignee_name"
                      @click="openDrawer(t)"
                    >
                      <span
                        class="w-7 h-7 rounded-full text-[0.65rem] font-semibold text-white flex items-center justify-center"
                        :style="`background: ${hashColor(t.assignee_id)}; box-shadow: 0 0 0 2px white, 0 0 0 3px ${hashColor(t.assignee_id)};`"
                      >
                        {{ initials(t.assignee_name) }}
                      </span>
                    </button>
                    <span v-else class="text-base-content/35 text-sm">—</span>
                  </td>

                  <!-- files -->
                  <td :class="[cellBase, 'px-3 py-1.5']">
                    <button
                      v-if="fileCount(t) > 0"
                      type="button"
                      class="inline-flex items-center gap-1 text-xs text-base-content/70 hover:text-base-content transition-colors"
                      @click="openDrawer(t)"
                    >
                      <Paperclip class="w-3 h-3" :stroke-width="1.75" />
                      {{ fileCount(t) }}
                    </button>
                    <span v-else class="text-base-content/35 text-sm">—</span>
                  </td>

                  <!-- chat (activity-log proxy until Comms ships) -->
                  <td :class="[cellBase, 'px-3 py-1.5']">
                    <button
                      v-if="chatCount(t) > 0"
                      type="button"
                      class="inline-flex items-center gap-1 text-xs text-base-content/70 hover:text-base-content transition-colors"
                      @click="openDrawer(t)"
                    >
                      <MessageSquare class="w-3 h-3" :stroke-width="1.75" />
                      {{ chatCount(t) }}
                    </button>
                    <span v-else class="text-base-content/35 text-sm">—</span>
                  </td>

                  <!-- custom fields -->
                  <td
                    v-for="d in customCols"
                    :key="d.id"
                    :class="[cellBase, editableCell, 'px-0 py-0 relative']"
                  >
                    <div class="px-3 py-1.5">
                      <input
                        v-if="d.field_type === 'text'"
                        :value="(customValue(t, d.key) as string) ?? ''"
                        type="text"
                        placeholder="—"
                        class="w-full bg-transparent outline-none text-sm placeholder:text-base-content/30"
                        @blur="setCustomValue(t, d.key, ($event.target as HTMLInputElement).value || null)"
                        @keydown.enter="($event.target as HTMLInputElement).blur()"
                      />
                      <input
                        v-else-if="d.field_type === 'number'"
                        :value="(customValue(t, d.key) as number) ?? ''"
                        type="number"
                        placeholder="—"
                        class="w-full bg-transparent outline-none text-sm placeholder:text-base-content/30"
                        @blur="setCustomValue(t, d.key, ($event.target as HTMLInputElement).value === '' ? null : Number(($event.target as HTMLInputElement).value))"
                        @keydown.enter="($event.target as HTMLInputElement).blur()"
                      />
                      <div v-else-if="d.field_type === 'date'" class="relative -mx-3 -my-1.5">
                        <button
                          type="button"
                          class="w-full text-left text-sm px-3 py-1.5 cursor-pointer hover:bg-base-200/40 text-base-content/70"
                          @click="openDatePicker(($event.currentTarget as HTMLElement))"
                        >
                          {{ customValue(t, d.key) ? dueLabel(customValue(t, d.key) as string) : '—' }}
                        </button>
                        <input
                          :value="(customValue(t, d.key) as string) ?? ''"
                          type="date"
                          tabindex="-1"
                          class="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
                          @change="setCustomValue(t, d.key, ($event.target as HTMLInputElement).value || null)"
                        />
                      </div>
                      <input
                        v-else-if="d.field_type === 'checkbox'"
                        type="checkbox"
                        class="checkbox checkbox-xs"
                        :checked="!!customValue(t, d.key)"
                        @change="setCustomValue(t, d.key, ($event.target as HTMLInputElement).checked)"
                      />
                      <select
                        v-else-if="d.field_type === 'select'"
                        :value="(customValue(t, d.key) as string) ?? ''"
                        class="w-full bg-transparent outline-none text-sm appearance-none cursor-pointer"
                        :class="!customValue(t, d.key) && 'text-base-content/30'"
                        @change="setCustomValue(t, d.key, ($event.target as HTMLSelectElement).value || null)"
                      >
                        <option value="">—</option>
                        <option v-for="o in d.options" :key="o.value" :value="o.value">{{ o.label }}</option>
                      </select>
                      <div v-else-if="d.field_type === 'multi_select'" class="flex flex-wrap gap-1">
                        <button
                          v-for="o in d.options"
                          :key="o.value"
                          type="button"
                          class="text-xs px-2 py-0.5 rounded-full transition-colors"
                          :class="multiSelectIncludes(t, d.key, o.value) ? 'bg-primary text-primary-content' : 'bg-base-200 text-base-content/60 hover:bg-base-300'"
                          @click="toggleMulti(t, d.key, o.value)"
                        >
                          {{ o.label }}
                        </button>
                      </div>
                      <!-- url: clickable chip + hover-pencil to edit; click pencil → text input -->
                      <template v-else-if="d.field_type === 'url'">
                        <input
                          v-if="isEditingUrl(t.id, d.key)"
                          autofocus
                          :value="(customValue(t, d.key) as string) ?? ''"
                          type="url"
                          placeholder="https://…"
                          class="w-full bg-transparent outline-none text-sm placeholder:text-base-content/30"
                          @blur="
                            setCustomValue(t, d.key, ($event.target as HTMLInputElement).value || null);
                            stopEditUrl(t.id, d.key)
                          "
                          @keydown.enter="($event.target as HTMLInputElement).blur()"
                          @keydown.esc="stopEditUrl(t.id, d.key)"
                        />
                        <div
                          v-else-if="customValue(t, d.key)"
                          class="group/url flex items-center gap-1.5"
                        >
                          <a
                            :href="normalizeUrl(customValue(t, d.key) as string)"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="inline-flex items-center gap-1.5 max-w-full text-xs font-medium truncate transition-colors"
                            style="color: var(--hc-accent)"
                            :title="customValue(t, d.key) as string"
                          >
                            <Link2 class="w-3 h-3 shrink-0" :stroke-width="1.75" />
                            <span class="truncate underline decoration-transparent group-hover/url:decoration-current underline-offset-2 transition-colors">
                              {{ urlLabel(customValue(t, d.key) as string) }}
                            </span>
                          </a>
                          <button
                            type="button"
                            class="opacity-0 group-hover/url:opacity-100 transition-opacity text-base-content/40 hover:text-base-content shrink-0"
                            title="Edit link"
                            @click="startEditUrl(t.id, d.key)"
                          >
                            <Pencil class="w-3 h-3" :stroke-width="1.75" />
                          </button>
                        </div>
                        <button
                          v-else
                          type="button"
                          class="text-base-content/35 text-sm hover:text-base-content/70 transition-colors"
                          title="Add link"
                          @click="startEditUrl(t.id, d.key)"
                        >
                          —
                        </button>
                      </template>
                    </div>
                  </td>

                  <!-- trailing spacer -->
                  <td class="px-2 py-1.5"></td>
                </tr>
              </template>
            </template>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
