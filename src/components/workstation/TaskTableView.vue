<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Sortable from 'sortablejs'
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
  GripVertical
} from 'lucide-vue-next'
import { useTasksStore, type Task, type TaskStatus } from '@/stores/tasks'
import { useTaskFieldsStore, type TaskFieldDef } from '@/stores/taskFields'
import { useClientsStore } from '@/stores/clients'
import { useTeamStore } from '@/stores/team'
import { useColumnWidths } from '@/composables/useColumnWidths'

const tasks = useTasksStore()
const taskFields = useTaskFieldsStore()
const clients = useClientsStore()
const team = useTeamStore()

// TKT-0004 — Excel-style resizable columns. Widths persist to localStorage
// so a user's preferred layout survives reloads.
const { width: colWidth, beginDrag } = useColumnWidths('tasks-table')

// Default widths in pixels per column key. Falls through to useColumnWidths'
// per-column persisted value if the user has dragged.
const defaultWidths: Record<string, number> = {
  name: 320,
  status: 140,
  due: 110,
  priority: 110,
  stage: 110,
  assignees: 110,
  files: 80,
  chat: 80
}
function colStyle(key: string, fallback?: number): Record<string, string> {
  const w = colWidth(key, fallback ?? defaultWidths[key] ?? 160)
  return { width: w + 'px', minWidth: w + 'px', maxWidth: w + 'px' }
}

const emit = defineEmits<{ (e: 'add-column'): void }>()

// -----------------------------------------------------------------------------
// Status / priority metadata
// -----------------------------------------------------------------------------
// Progress-bar mapping (TKT-0007). Each status has a position on the lifecycle
// (0–100) and a track color. Blocked sits at the same position as In progress
// but flagged red because it happens mid-flow.
const statuses: {
  value: TaskStatus
  label: string
  icon: any
  pillBg: string
  pillFg: string
  dotBg: string
  pct: number
  barClass: string
}[] = [
  { value: 'todo',        label: 'Todo',        icon: CircleDashed, pillBg: 'bg-base-200',   pillFg: 'text-base-content/70', dotBg: 'bg-base-content/40', pct: 8,   barClass: 'bg-base-content/40' },
  { value: 'in_progress', label: 'In progress', icon: Loader2,      pillBg: 'bg-primary/10', pillFg: 'text-primary',          dotBg: 'bg-primary',         pct: 55,  barClass: 'bg-primary' },
  { value: 'blocked',     label: 'Blocked',     icon: CircleAlert,  pillBg: 'bg-error/10',   pillFg: 'text-error',            dotBg: 'bg-error',           pct: 55,  barClass: 'bg-error' },
  { value: 'done',        label: 'Done',        icon: CheckCircle2, pillBg: 'bg-success/10', pillFg: 'text-success',          dotBg: 'bg-success',         pct: 100, barClass: 'bg-success' },
  { value: 'cancelled',   label: 'Cancelled',   icon: CircleSlash,  pillBg: 'bg-base-200',   pillFg: 'text-base-content/40', dotBg: 'bg-base-content/30', pct: 0,   barClass: 'bg-base-content/30' }
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
  for (const t of tasks.tasksForCurrentProject) map.get(t.status)?.push(t)
  for (const list of map.values()) {
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
  const inFlight = tasks.tasksForCurrentProject.filter(
    (t) => t.status === 'in_progress'
  )
  const overdue = tasks.tasksForCurrentProject.filter(
    (t) =>
      t.due_on &&
      t.status !== 'done' &&
      t.status !== 'cancelled' &&
      new Date(t.due_on + 'T00:00:00').getTime() < Date.now()
  )
  const unassigned = tasks.tasksForCurrentProject.filter(
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

// -----------------------------------------------------------------------------
// SortableJS — drag rows to reorder within a group OR across groups (which
// changes status). Same recipe as TaskBoardView: priority_order between
// neighbors, status from the target tbody's data-status attribute.
// -----------------------------------------------------------------------------
const tbodyRefs = ref<Record<TaskStatus, HTMLElement | null>>({
  todo: null,
  in_progress: null,
  blocked: null,
  done: null,
  cancelled: null
})
const sortables: Sortable[] = []

function setTbodyRef(status: TaskStatus, el: Element | any) {
  tbodyRefs.value[status] = (el as HTMLElement) ?? null
}

function readNewPriorityOrder(toEl: HTMLElement, taskId: string, status: TaskStatus): number {
  const ids = Array.from(toEl.querySelectorAll<HTMLElement>('tr[data-task-id]'))
    .map((el) => el.getAttribute('data-task-id') ?? '')
    .filter(Boolean)
  const newIndex = ids.indexOf(taskId)
  const peers = (groups.value.find((g) => g.value === status)?.tasks ?? []).filter(
    (t) => t.id !== taskId
  )
  const prev = newIndex > 0 ? peers[newIndex - 1] : null
  const next = newIndex < peers.length ? peers[newIndex] : null
  if (prev && next) return (prev.priority_order + next.priority_order) / 2
  if (next) return next.priority_order - 10
  if (prev) return prev.priority_order + 10
  return 0
}

async function onRowSortEnd(evt: Sortable.SortableEvent) {
  const taskId = evt.item.getAttribute('data-task-id') ?? ''
  const toStatus = evt.to.getAttribute('data-status') as TaskStatus | null
  if (!taskId || !toStatus) return

  const dragged = tasks.tasks.find((t) => t.id === taskId)
  if (!dragged) return

  const newPriorityOrder = readNewPriorityOrder(evt.to as HTMLElement, taskId, toStatus)
  const patch: Partial<Task> = { priority_order: newPriorityOrder }
  if (dragged.status !== toStatus) patch.status = toStatus

  try {
    await tasks.updateTask(taskId, patch)
  } catch (e) {
    console.warn('[task table] reorder failed:', (e as Error).message)
  }
}

function destroySortables() {
  while (sortables.length) sortables.pop()?.destroy()
}
function buildSortables() {
  destroySortables()
  for (const s of statuses) {
    const el = tbodyRefs.value[s.value]
    if (!el) continue
    sortables.push(
      Sortable.create(el, {
        group: 'bb-table-tasks',
        animation: 150,
        ghostClass: 'bb-row-ghost',
        chosenClass: 'bb-row-chosen',
        // Don't start a drag from inputs, selects, or buttons inside the row.
        filter: 'input, select, textarea, button, a, [data-no-drag]',
        preventOnFilter: false,
        // Use a tiny delay so a quick click-into-input doesn't start a drag.
        delay: 50,
        delayOnTouchOnly: false,
        handle: '.bb-row-grab',
        onEnd: onRowSortEnd
      })
    )
  }
}

onMounted(async () => {
  await nextTick()
  buildSortables()
})
onBeforeUnmount(() => destroySortables())

// Rebuild when the group structure changes (collapse/expand or task list churn).
watch(
  () => groups.value.map((g) => g.value + ':' + g.tasks.length).join('|'),
  async () => {
    await nextTick()
    buildSortables()
  }
)
</script>

<style>
/*
  Resizable column header recipe (TKT-0004).
  - .bb-th gives the header consistent padding + relative positioning so the
    .bb-resize handle can be absolutely positioned against the th's right edge.
  - .bb-resize is a thin column-resize cursor zone over the th's right border.
*/
.bb-th {
  position: relative;
  text-align: left;
  font-weight: 600;
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--hc-ink-3);
  padding: 0.625rem 0.75rem;
  border-right: 1px solid color-mix(in oklch, var(--hc-divider) 40%, transparent);
  display: table-cell;
  vertical-align: middle;
  white-space: nowrap;
  overflow: hidden;
}
.bb-resize {
  position: absolute;
  top: 0;
  right: -2px;
  bottom: 0;
  width: 6px;
  cursor: col-resize;
  user-select: none;
  z-index: 5;
  background: transparent;
  transition: background 0.12s;
}
.bb-resize:hover,
.bb-resize:active {
  background: var(--hc-accent);
  opacity: 0.5;
}

/* SortableJS visuals for table rows */
.bb-row-ghost { opacity: 0.35; background: var(--hc-accent-bg); }
.bb-row-chosen { cursor: grabbing !important; }
.bb-row-grab {
  cursor: grab;
  color: var(--hc-ink-4);
  opacity: 0;
  transition: opacity 0.15s;
}
tr:hover .bb-row-grab { opacity: 1; }
.bb-row-grab:active { cursor: grabbing; }

/*
  Frozen columns (Excel "Freeze Panes" — first two cells stay glued to the
  left edge while everything else scrolls horizontally). Two columns are
  pinned: the row-controls cell (grip + check) at left:0, and the Name cell
  at left:48px (= width of the row-controls cell).
  - z-index 4: above scrolling cells (default 0) but below the sticky thead
    (which uses z-10 + sticky top:0).
  - box-shadow on the rightmost frozen cell signals the divider visually.
*/
.bb-frozen-col {
  position: sticky;
  z-index: 4;
}
.bb-frozen-col-1 {
  left: 0;
}
.bb-frozen-col-2 {
  left: 48px;
  box-shadow: 6px 0 8px -6px rgba(31, 27, 22, 0.10);
}
/* Header row's frozen cells need to layer above body but below sticky thead's
   own z-index, and they pick up the warm header bg so the scroll content
   doesn't bleed through. */
thead .bb-frozen-col {
  z-index: 11; /* > thead's z-10 default, so it stays opaque on horizontal scroll */
  background: var(--hc-surface-warm);
}
/* Body rows — frozen cells take the row's bg, fall back to white. Hover bg
   is applied at the row level; we mirror it on the frozen cells so they don't
   show a different color while hovering. */
tbody .bb-frozen-col { background: white; }
tbody tr:hover .bb-frozen-col { background: color-mix(in oklch, var(--hc-paper) 50%, white); }
/* Group header rows + spacer + adder are colspanning, not affected by frozen cols. */
</style>

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
        <!--
          table-layout: fixed honors column widths set via inline style on
          <th>. border-separate (with zero spacing) keeps cell borders
          visible on sticky-positioned frozen columns — collapse mode
          drops adjacent borders when cells overlap during horizontal scroll.
        -->
        <table
          class="w-full text-sm border-separate"
          style="table-layout: fixed; border-spacing: 0"
        >
          <thead class="sticky top-0 z-10" style="background: var(--hc-surface-warm)">
            <tr class="border-b border-base-300/60">
              <th
                class="border-r border-base-300/40 px-2 py-2.5 bb-frozen-col bb-frozen-col-1"
                style="width: 48px"
              ></th>

              <th
                class="bb-th bb-frozen-col bb-frozen-col-2"
                :style="colStyle('name', 320)"
              >
                <span class="truncate">Name</span>
                <span
                  class="bb-resize"
                  @mousedown="(e) => beginDrag('name', e, { defaultWidth: 320 })"
                />
              </th>

              <th class="bb-th" :style="colStyle('status')">
                <span class="truncate">Status</span>
                <span class="bb-resize" @mousedown="(e) => beginDrag('status', e, { defaultWidth: defaultWidths.status })" />
              </th>

              <th class="bb-th" :style="colStyle('due')">
                <span class="truncate">Due</span>
                <span class="bb-resize" @mousedown="(e) => beginDrag('due', e, { defaultWidth: defaultWidths.due })" />
              </th>

              <th class="bb-th" :style="colStyle('priority')">
                <span class="truncate">Priority</span>
                <span class="bb-resize" @mousedown="(e) => beginDrag('priority', e, { defaultWidth: defaultWidths.priority })" />
              </th>

              <th class="bb-th" :style="colStyle('stage')">
                <span class="truncate">Stage</span>
                <span class="bb-resize" @mousedown="(e) => beginDrag('stage', e, { defaultWidth: defaultWidths.stage })" />
              </th>

              <th class="bb-th" :style="colStyle('assignees')">
                <span class="truncate">Assignees</span>
                <span class="bb-resize" @mousedown="(e) => beginDrag('assignees', e, { defaultWidth: defaultWidths.assignees })" />
              </th>

              <th class="bb-th" :style="colStyle('files')">
                <span class="truncate">Files</span>
                <span class="bb-resize" @mousedown="(e) => beginDrag('files', e, { defaultWidth: defaultWidths.files })" />
              </th>

              <th class="bb-th" :style="colStyle('chat')">
                <span class="truncate">Chat</span>
                <span class="bb-resize" @mousedown="(e) => beginDrag('chat', e, { defaultWidth: defaultWidths.chat })" />
              </th>

              <th
                v-for="d in customCols"
                :key="d.id"
                class="bb-th group/col"
                :style="colStyle(`custom:${d.id}`, 160)"
              >
                <div class="flex items-center justify-between gap-2 flex-1 min-w-0">
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
                <span class="bb-resize" @mousedown="(e) => beginDrag(`custom:${d.id}`, e, { defaultWidth: 160 })" />
              </th>

              <th class="px-2 py-2.5 text-center" style="width: 40px">
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

          <!-- Banner + empty state (non-draggable) -->
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
          </tbody>

          <!-- Groups (TKT-0007: cleaner separation; TKT-0004 row reorder via SortableJS) -->
          <template v-for="g in groups" :key="g.value">
            <!-- Header tbody — non-draggable: spacer + group header + adder -->
            <tbody>
              <!-- Spacer row above each group (skipped on the first group) -->
              <tr v-if="g.value !== groups[0]?.value" class="h-2">
                <td :colspan="totalCols" class="p-0" style="background: var(--hc-paper)" />
              </tr>
              <!-- Group header row -->
              <tr
                class="cursor-pointer hover:bg-base-200/40 transition-colors"
                style="
                  background: var(--hc-surface-warm);
                  box-shadow: inset 3px 0 0 0 var(--color-base-content);
                "
                @click="toggleGroup(g.value)"
              >
                <td :colspan="totalCols" class="px-3 py-2">
                  <div class="flex items-center gap-2">
                    <ChevronDown
                      v-if="!collapsed.has(g.value)"
                      class="w-3.5 h-3.5 text-base-content/55"
                      :stroke-width="2"
                    />
                    <ChevronRight
                      v-else
                      class="w-3.5 h-3.5 text-base-content/55"
                      :stroke-width="2"
                    />
                    <span class="w-2 h-2 rounded-sm" :class="g.dotBg" />
                    <span class="text-xs font-semibold uppercase tracking-wider">{{ g.label }}</span>
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
            </tbody>

            <!-- Task rows tbody — SortableJS attaches here, data-status powers the drop target -->
            <tbody
              v-if="!collapsed.has(g.value)"
              :ref="(el) => setTbodyRef(g.value, el)"
              :data-status="g.value"
            >
                <tr
                  v-for="t in g.tasks"
                  :key="t.id"
                  :data-task-id="t.id"
                  class="group border-b border-base-300/40 hover:bg-base-100/50"
                >
                  <!-- check + drag handle (frozen column 1) -->
                  <td :class="[cellBase, 'px-1 py-1.5 bb-frozen-col bb-frozen-col-1']">
                    <div class="flex items-center justify-center gap-0.5">
                      <span class="bb-row-grab" :title="'Drag to reorder'">
                        <GripVertical class="w-3.5 h-3.5" :stroke-width="1.75" />
                      </span>
                      <button
                        type="button"
                        data-no-drag
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
                    </div>
                  </td>

                  <!-- name (frozen column 2) -->
                  <td :class="[cellBase, editableCell, 'px-0 py-0 relative bb-frozen-col bb-frozen-col-2']">
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

                  <!--
                    Status: progress bar + label (TKT-0007).
                    Multi-assignee (Model C): if the task has > 1 assignees,
                    the bar's fill % comes from done_count / total. Status
                    color still reflects the task-level status. So a task
                    with Mary done + Rucela in_progress shows an amber bar
                    filled to ~50%.
                  -->
                  <td :class="[cellBase, editableCell, 'px-0 py-0 relative']">
                    <div class="flex items-center gap-2 px-3 py-1.5">
                      <span
                        class="inline-block w-10 h-1.5 rounded-full overflow-hidden shrink-0 bg-base-200"
                        :title="
                          tasks.assigneeProgress(t.id).total > 1
                            ? `${statusOf(t.status).label} · ${tasks.assigneeProgress(t.id).done}/${tasks.assigneeProgress(t.id).total} assignees done`
                            : statusOf(t.status).label
                        "
                      >
                        <span
                          class="block h-full rounded-full transition-[width,background-color] duration-300 ease-out"
                          :class="statusOf(t.status).barClass"
                          :style="{
                            width: (
                              tasks.assigneeProgress(t.id).total > 1 && t.status !== 'done' && t.status !== 'cancelled'
                                ? Math.max(8, tasks.assigneeProgress(t.id).pct)
                                : statusOf(t.status).pct
                            ) + '%'
                          }"
                        />
                      </span>
                      <span
                        class="text-xs font-medium truncate"
                        :class="statusOf(t.status).pillFg"
                      >
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

                  <!-- assignees: stacked avatars (Model C multi-assignee) -->
                  <td :class="[cellBase, 'px-3 py-1.5']">
                    <button
                      v-if="tasks.getAssignees(t.id).length > 0"
                      type="button"
                      class="inline-flex items-center hover:opacity-80 transition-opacity"
                      :title="
                        tasks.getAssignees(t.id).length === 1
                          ? (t.assignee_name ?? '—')
                          : `${tasks.getAssignees(t.id).length} assignees · click to manage`
                      "
                      @click="openDrawer(t)"
                    >
                      <div class="flex items-center -space-x-1.5">
                        <span
                          v-for="(a, i) in tasks.getAssignees(t.id).slice(0, 3)"
                          :key="a.user_id"
                          class="relative w-6 h-6 rounded-full text-[0.55rem] font-semibold text-white flex items-center justify-center ring-2 ring-white"
                          :style="`background: ${hashColor(a.user_id)}; z-index: ${10 - i}`"
                        >
                          {{ initials(team.profiles[a.user_id]?.full_name || team.profiles[a.user_id]?.email?.split('@')[0] || '?') }}
                          <span
                            v-if="a.completed_at"
                            class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success ring-1 ring-white"
                          />
                        </span>
                        <span
                          v-if="tasks.getAssignees(t.id).length > 3"
                          class="relative w-6 h-6 rounded-full text-[0.55rem] font-semibold flex items-center justify-center ring-2 ring-white bg-base-200 text-base-content/70"
                          style="z-index: 7"
                        >
                          +{{ tasks.getAssignees(t.id).length - 3 }}
                        </span>
                      </div>
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
            </tbody>
          </template>
        </table>
      </div>
    </div>
  </div>
</template>
