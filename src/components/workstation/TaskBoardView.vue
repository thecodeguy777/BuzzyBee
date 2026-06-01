<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Sortable from 'sortablejs'
import {
  Plus,
  CalendarDays,
  Flag,
  Paperclip,
  Pencil,
  ZoomOut,
  Check,
  ChevronDown,
  MoreVertical,
  Trash2,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleSlash
} from 'lucide-vue-next'
import { useTasksStore, type Task, type TaskStatus } from '@/stores/tasks'
import { useClientsStore } from '@/stores/clients'
import { useProjectsStore } from '@/stores/projects'
import { useAuthStore } from '@/stores/auth'
import { useStatusesStore, type TaskStatusDef } from '@/stores/statuses'
import { statusClasses, STATUS_COLOR_OPTIONS } from '@/lib/statusColors'

const tasks = useTasksStore()
const clients = useClientsStore()
const projects = useProjectsStore()
const auth = useAuthStore()
const statusesStore = useStatusesStore()

// Only managers edit columns (RLS enforces this server-side too).
const canManage = computed(() => auth.isAdmin || auth.role === 'pm')
const boardError = ref<string | null>(null)
// Focus helper for inline rename / add-column inputs.
const vFocus = { mounted: (el: HTMLElement) => el.focus() }

// Columns are the current project's task_statuses, in sort order. The header is
// filled with the status color (white-on-color label + count).
const columns = computed<TaskStatusDef[]>(() =>
  statusesStore.forProject(projects.currentProjectId)
)

const cardsByStatus = computed<Record<string, Task[]>>(() => tasks.tasksByStatus)

// ── SortableJS wiring ──────────────────────────────────────────────────────
// One Sortable instance per column body. group:'bb-tasks' lets cards move
// between columns. onEnd reads the dropped element's data-task-id and the
// new column's data-status, then updates priority_order + status.

const columnBodies = ref<Record<string, HTMLElement | null>>({})
const sortables: Sortable[] = []

function setColumnRef(status: TaskStatus, el: Element | any) {
  columnBodies.value[status] = (el as HTMLElement) ?? null
}

function readNewPriorityOrder(toEl: HTMLElement, taskId: string, status: TaskStatus): number {
  const ids: string[] = Array.from(toEl.querySelectorAll<HTMLElement>('[data-task-id]'))
    .map((el) => el.getAttribute('data-task-id') ?? '')
    .filter(Boolean)
  const newIndex = ids.indexOf(taskId)

  // Look up siblings in the *current* store state (excluding the moved task)
  // to compute a sensible priority_order between neighbors.
  const peers = cardsByStatus.value[status].filter((t) => t.id !== taskId)
  const prev = newIndex > 0 ? peers[newIndex - 1] : null
  const next = newIndex < peers.length ? peers[newIndex] : null

  if (prev && next) return (prev.priority_order + next.priority_order) / 2
  if (next) return next.priority_order - 10
  if (prev) return prev.priority_order + 10
  return 0
}

async function onSortEnd(evt: Sortable.SortableEvent) {
  const taskId = evt.item.getAttribute('data-task-id') ?? ''
  const toStatus =
    (evt.to.getAttribute('data-status') as TaskStatus) ??
    (evt.to.parentElement?.getAttribute('data-status') as TaskStatus)
  if (!taskId || !toStatus) return

  const dragged = tasks.tasks.find((t) => t.id === taskId)
  if (!dragged) return

  const newPriorityOrder = readNewPriorityOrder(evt.to as HTMLElement, taskId, toStatus)
  const patch: Partial<Task> = { priority_order: newPriorityOrder }
  if (dragged.status !== toStatus) patch.status = toStatus

  try {
    await tasks.updateTask(taskId, patch)
  } catch (e) {
    console.warn('[board] move failed:', (e as Error).message)
  }
}

function destroySortables() {
  while (sortables.length) sortables.pop()?.destroy()
}

function buildSortables() {
  destroySortables()
  for (const col of columns.value) {
    const el = columnBodies.value[col.key]
    if (!el) continue
    sortables.push(
      Sortable.create(el, {
        group: 'bb-tasks',
        animation: 150,
        ghostClass: 'bb-sort-ghost',
        chosenClass: 'bb-sort-chosen',
        dragClass: 'bb-sort-drag',
        // Don't start a drag from the pencil button or input.
        filter: '[data-no-drag]',
        preventOnFilter: false,
        onEnd: onSortEnd
      })
    )
  }
}

onMounted(async () => {
  await nextTick()
  buildSortables()
})
onBeforeUnmount(() => destroySortables())

// Rebuild when column refs change (e.g., HMR or template churn)
watch(
  () => columnBodies.value,
  () => buildSortables(),
  { deep: true, flush: 'post' }
)

function openDrawer(t: Task, e: Event) {
  e.stopPropagation()
  tasks.selectTask(t.id)
}

// ── Card meta helpers ──────────────────────────────────────────────────────
function priorityClass(p: number) {
  return p === 1 ? 'text-error' : p === 2 ? 'text-warning' : p === 4 ? 'text-base-content/40' : 'text-base-content/60'
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
  if (diff > 1 && diff < 7) return d.toLocaleDateString(undefined, { weekday: 'short' })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
function dueClass(due: string | null) {
  if (!due) return ''
  const d = new Date(due + 'T00:00:00').getTime()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = d - today.getTime()
  if (diff < 0) return 'text-error'
  if (diff < 86400000) return 'text-warning'
  return 'text-base-content/60'
}

// ── Zoom presets (TKT-0004 style density) ─────────────────────────────────
// Bundles column width + card density into a single control. SortableJS-safe:
// we only swap classes, never CSS transforms, so drag offsets stay accurate.
type ZoomLevel = 'default' | 'compact' | 'mini'
const ZOOM_KEY = 'buzzybee.workstation.board-zoom'
const zoom = ref<ZoomLevel>(
  typeof window !== 'undefined'
    ? ((window.localStorage.getItem(ZOOM_KEY) as ZoomLevel) || 'default')
    : 'default'
)
watch(zoom, (v) => {
  if (typeof window !== 'undefined') window.localStorage.setItem(ZOOM_KEY, v)
})

const zoomMenuOpen = ref(false)
const zoomWrap = ref<HTMLElement | null>(null)
function onZoomDocClick(e: MouseEvent) {
  if (!zoomWrap.value) return
  if (!zoomWrap.value.contains(e.target as Node)) zoomMenuOpen.value = false
}
onMounted(() => document.addEventListener('click', onZoomDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onZoomDocClick))

const zoomPresets: { value: ZoomLevel; label: string; sub: string }[] = [
  { value: 'default', label: 'Default', sub: 'Wide cards · full meta' },
  { value: 'compact', label: 'Compact', sub: 'Narrower · due + priority' },
  { value: 'mini',    label: 'Mini',    sub: 'Title only · max columns' }
]
const zoomLabel = computed(() =>
  zoomPresets.find((p) => p.value === zoom.value)?.label ?? 'Default'
)

// Column width per preset.
const colWidthClass = computed(() => {
  switch (zoom.value) {
    case 'mini':    return 'w-48'   // 192px
    case 'compact': return 'w-60'   // 240px
    default:        return 'w-72'   // 288px
  }
})
// Card body padding per preset.
const cardPadClass = computed(() => {
  switch (zoom.value) {
    case 'mini':    return 'p-2'
    case 'compact': return 'p-2.5 space-y-1.5'
    default:        return 'p-3 space-y-2'
  }
})
const cardTitleClass = computed(() => {
  switch (zoom.value) {
    case 'mini':    return 'text-xs font-medium leading-snug pr-5 truncate'
    case 'compact': return 'text-sm font-medium leading-snug pr-6'
    default:        return 'text-sm font-medium leading-snug pr-6'
  }
})

// ── Quick add ──────────────────────────────────────────────────────────────
const newTitleByCol = ref<Record<string, string>>({})

async function quickAdd(status: TaskStatus) {
  const title = newTitleByCol.value[status]?.trim()
  if (!title || !clients.currentClientId) return
  newTitleByCol.value[status] = ''
  try {
    const created = await tasks.createTask({ title })
    if (created.status !== status) {
      await tasks.updateTask(created.id, { status })
    }
  } catch (e) {
    console.warn('[board] quickAdd:', (e as Error).message)
  }
}

// ── Column management (managers only; RLS enforces server-side) ─────────────
const COLLAPSE_KEY = 'buzzybee.workstation.board-collapsed'
function loadCollapsed(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    return new Set(JSON.parse(window.localStorage.getItem(COLLAPSE_KEY) || '[]') as string[])
  } catch {
    return new Set()
  }
}
const collapsedKeys = ref<Set<string>>(loadCollapsed())
function isCollapsed(key: string) {
  return collapsedKeys.value.has(key)
}
function toggleCollapse(key: string) {
  const n = new Set(collapsedKeys.value)
  if (n.has(key)) n.delete(key)
  else n.add(key)
  collapsedKeys.value = n
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...n]))
  }
}

const editingColId = ref<string | null>(null)
const editLabel = ref('')
const openMenuId = ref<string | null>(null)
const colorOptions = STATUS_COLOR_OPTIONS

function startRename(col: TaskStatusDef) {
  if (!canManage.value) return
  openMenuId.value = null
  editingColId.value = col.id
  editLabel.value = col.label
}
async function commitRename(col: TaskStatusDef) {
  const v = editLabel.value.trim()
  editingColId.value = null
  if (!v || v === col.label) return
  try {
    await statusesStore.updateStatus(col.id, { label: v })
  } catch (e) {
    boardError.value = (e as Error).message
  }
}
function toggleMenu(id: string) {
  openMenuId.value = openMenuId.value === id ? null : id
}
async function recolor(col: TaskStatusDef, color: string) {
  try {
    await statusesStore.updateStatus(col.id, { color })
  } catch (e) {
    boardError.value = (e as Error).message
  }
}
async function toggleDoneFlag(col: TaskStatusDef) {
  try {
    await statusesStore.updateStatus(col.id, { is_done: !col.is_done, is_cancelled: false })
  } catch (e) {
    boardError.value = (e as Error).message
  }
}
async function toggleCancelledFlag(col: TaskStatusDef) {
  try {
    await statusesStore.updateStatus(col.id, { is_cancelled: !col.is_cancelled, is_done: false })
  } catch (e) {
    boardError.value = (e as Error).message
  }
}
async function moveCol(col: TaskStatusDef, dir: -1 | 1) {
  const ids = columns.value.map((c) => c.id)
  const i = ids.indexOf(col.id)
  const j = i + dir
  if (i === -1 || j < 0 || j >= ids.length) return
  ;[ids[i], ids[j]] = [ids[j], ids[i]]
  try {
    await statusesStore.reorder(ids)
  } catch (e) {
    boardError.value = (e as Error).message
  }
}
async function removeCol(col: TaskStatusDef) {
  openMenuId.value = null
  const n = (cardsByStatus.value[col.key] ?? []).length
  if (n > 0) {
    boardError.value = `Move the ${n} task${n === 1 ? '' : 's'} out of “${col.label}” before deleting it.`
    return
  }
  try {
    await statusesStore.deleteStatus(col.id)
  } catch (e) {
    boardError.value = (e as Error).message
  }
}

const addingCol = ref(false)
const newColLabel = ref('')
async function commitAddCol() {
  const v = newColLabel.value.trim()
  if (!v || !projects.currentProjectId) {
    addingCol.value = false
    return
  }
  newColLabel.value = ''
  addingCol.value = false
  try {
    await statusesStore.addStatus(projects.currentProjectId, { label: v })
  } catch (e) {
    boardError.value = (e as Error).message
  }
}

function closeColMenus() {
  openMenuId.value = null
}
onMounted(() => document.addEventListener('click', closeColMenus))
onBeforeUnmount(() => document.removeEventListener('click', closeColMenus))
</script>

<template>
  <div class="-mx-4 px-4 space-y-3">
    <!-- Toolbar -->
    <div class="flex items-center gap-2 flex-wrap">
      <div class="flex-1" />
      <div ref="zoomWrap" class="relative">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-base-300 bg-white text-xs font-medium hover:bg-base-200/60 transition-colors"
          :aria-expanded="zoomMenuOpen"
          aria-haspopup="true"
          @click="zoomMenuOpen = !zoomMenuOpen"
        >
          <ZoomOut class="w-3.5 h-3.5 text-base-content/60" :stroke-width="1.75" />
          Zoom: <span class="text-base-content/60">{{ zoomLabel }}</span>
        </button>

        <Transition
          enter-active-class="transition-all duration-150 ease-out"
          enter-from-class="opacity-0 -translate-y-1"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition-all duration-100 ease-in"
          leave-from-class="opacity-100"
          leave-to-class="opacity-0"
        >
          <div
            v-if="zoomMenuOpen"
            class="absolute right-0 top-full mt-1 z-30 w-56 rounded-xl bg-white border border-base-300 shadow-hc-2 overflow-hidden"
          >
            <ul class="py-1">
              <li v-for="p in zoomPresets" :key="p.value">
                <button
                  type="button"
                  class="w-full text-left px-3 py-2 hover:bg-base-200/60 transition-colors flex items-start gap-2"
                  @click="zoom = p.value; zoomMenuOpen = false"
                >
                  <Check
                    class="w-3.5 h-3.5 mt-1 shrink-0"
                    :class="zoom === p.value ? 'text-primary' : 'text-transparent'"
                    :stroke-width="2"
                  />
                  <span class="flex-1 min-w-0">
                    <span class="block text-sm font-medium" :class="zoom === p.value && 'text-primary'">{{ p.label }}</span>
                    <span class="block text-[0.7rem] text-base-content/55 leading-snug">{{ p.sub }}</span>
                  </span>
                </button>
              </li>
            </ul>
          </div>
        </Transition>
      </div>
    </div>

    <p v-if="boardError" class="text-error text-xs flex items-center gap-2">
      {{ boardError }}
      <button type="button" class="underline hover:no-underline" @click="boardError = null">dismiss</button>
    </p>

    <div class="flex items-start gap-3 overflow-x-auto pb-4">
      <template v-for="col in columns" :key="col.key">
        <!-- Collapsed column → narrow rail -->
        <section
          v-if="isCollapsed(col.key)"
          class="shrink-0 w-11 rounded-xl bg-base-100 border border-base-300 shadow-sm overflow-hidden"
          :data-status="col.key"
        >
          <button
            type="button"
            class="w-full min-h-[9rem] flex flex-col items-center gap-2 py-2 text-white"
            :class="statusClasses(col.color).headerBg"
            :title="`Expand ${col.label}`"
            @click="toggleCollapse(col.key)"
          >
            <ChevronDown class="w-3.5 h-3.5 -rotate-90 shrink-0" :stroke-width="2" />
            <span class="text-[0.7rem] font-semibold tabular-nums px-1.5 rounded-full bg-white/20 shrink-0">
              {{ (cardsByStatus[col.key] ?? []).length }}
            </span>
            <span class="text-xs font-semibold uppercase tracking-wider [writing-mode:vertical-rl] rotate-180">
              {{ col.label }}
            </span>
          </button>
        </section>

        <!-- Expanded column -->
        <section
          v-else
          class="shrink-0 rounded-xl bg-base-100 border border-base-300 shadow-sm flex flex-col max-h-[calc(100vh-12rem)] transition-[width] duration-200"
          :class="colWidthClass"
          :data-status="col.key"
        >
          <header
            class="flex items-center gap-1.5 px-2.5 py-2 rounded-t-xl text-white"
            :class="statusClasses(col.color).headerBg"
          >
            <button
              type="button"
              data-no-drag
              class="opacity-80 hover:opacity-100 shrink-0"
              title="Collapse column"
              @click.stop="toggleCollapse(col.key)"
            >
              <ChevronDown class="w-3.5 h-3.5" :stroke-width="2" />
            </button>
            <input
              v-if="editingColId === col.id"
              v-model="editLabel"
              v-focus
              data-no-drag
              class="flex-1 min-w-0 bg-white/25 rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wider outline-none text-white placeholder-white/60"
              @blur="commitRename(col)"
              @keydown.enter.prevent="commitRename(col)"
              @keydown.esc="editingColId = null"
            />
            <span
              v-else
              class="text-xs font-semibold uppercase tracking-wider truncate flex-1"
              :class="canManage && 'cursor-text'"
              :title="canManage ? 'Double-click to rename' : ''"
              @dblclick="startRename(col)"
            >
              {{ col.label }}
            </span>
            <span
              class="text-[0.7rem] font-semibold tabular-nums px-1.5 py-0.5 rounded-full leading-none shrink-0 bg-white/20"
            >
              {{ (cardsByStatus[col.key] ?? []).length }}
            </span>
            <div v-if="canManage" class="relative shrink-0">
              <button
                type="button"
                data-no-drag
                class="opacity-80 hover:opacity-100 flex items-center"
                title="Column options"
                @click.stop="toggleMenu(col.id)"
              >
                <MoreVertical class="w-3.5 h-3.5" :stroke-width="2" />
              </button>
              <div
                v-if="openMenuId === col.id"
                data-no-drag
                class="absolute right-0 top-full mt-1 z-30 w-52 rounded-xl bg-white border border-base-300 shadow-hc-2 overflow-hidden text-base-content p-2 space-y-1"
                @click.stop
              >
                <button type="button" class="w-full text-left text-sm px-2 py-1.5 rounded-md hover:bg-base-200/60 flex items-center gap-2" @click="startRename(col)">
                  <Pencil class="w-3.5 h-3.5" :stroke-width="1.75" /> Rename
                </button>
                <div class="flex items-center gap-1.5 px-2 py-1.5">
                  <button
                    v-for="c in colorOptions"
                    :key="c.value"
                    type="button"
                    :title="c.label"
                    class="w-5 h-5 rounded-full ring-2 ring-offset-1 transition-transform hover:scale-110"
                    :class="[c.swatch, col.color === c.value ? 'ring-base-content/50' : 'ring-transparent']"
                    @click="recolor(col, c.value)"
                  />
                </div>
                <button type="button" class="w-full text-left text-sm px-2 py-1.5 rounded-md hover:bg-base-200/60 flex items-center gap-2" @click="toggleDoneFlag(col)">
                  <CheckCircle2 class="w-3.5 h-3.5" :class="col.is_done ? 'text-success' : 'text-base-content/40'" :stroke-width="1.75" /> Counts as done
                </button>
                <button type="button" class="w-full text-left text-sm px-2 py-1.5 rounded-md hover:bg-base-200/60 flex items-center gap-2" @click="toggleCancelledFlag(col)">
                  <CircleSlash class="w-3.5 h-3.5" :class="col.is_cancelled ? 'text-base-content/70' : 'text-base-content/40'" :stroke-width="1.75" /> Counts as cancelled
                </button>
                <div class="flex gap-1">
                  <button type="button" class="flex-1 px-2 py-1.5 rounded-md hover:bg-base-200/60 flex items-center justify-center" title="Move left" @click="moveCol(col, -1)">
                    <ArrowLeft class="w-3.5 h-3.5" :stroke-width="1.75" />
                  </button>
                  <button type="button" class="flex-1 px-2 py-1.5 rounded-md hover:bg-base-200/60 flex items-center justify-center" title="Move right" @click="moveCol(col, 1)">
                    <ArrowRight class="w-3.5 h-3.5" :stroke-width="1.75" />
                  </button>
                </div>
                <button type="button" class="w-full text-left text-sm px-2 py-1.5 rounded-md hover:bg-error/10 text-error flex items-center gap-2" @click="removeCol(col)">
                  <Trash2 class="w-3.5 h-3.5" :stroke-width="1.75" /> Delete column
                </button>
              </div>
            </div>
          </header>

          <div
          :ref="(el) => setColumnRef(col.key, el)"
          class="flex-1 overflow-y-auto p-2 space-y-2 min-h-[3rem] bg-base-200/40"
          :data-status="col.key"
        >
          <article
            v-for="t in (cardsByStatus[col.key] ?? [])"
            :key="t.id"
            :data-task-id="t.id"
            class="group relative rounded-lg bg-white border border-base-300 shadow-sm hover:shadow-md hover:border-base-content/20 transition-shadow cursor-grab active:cursor-grabbing select-text"
          >
            <button
              type="button"
              data-no-drag
              class="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-md flex items-center justify-center bg-white border border-base-300 hover:border-primary hover:text-primary text-base-content/60 cursor-pointer z-10"
              aria-label="Open task"
              title="Open task"
              @click="openDrawer(t, $event)"
              @mousedown.stop
            >
              <Pencil class="w-3 h-3" :stroke-width="1.75" />
            </button>

            <div :class="cardPadClass">
              <div
                :class="[
                  cardTitleClass,
                  statusesStore.isDone(projects.currentProjectId, t.status) && 'text-base-content/50 line-through'
                ]"
              >
                {{ t.title }}
              </div>
              <!-- Mini mode: just title; show priority+due as compact icons inline if present -->
              <div
                v-if="zoom === 'mini'"
                class="flex items-center gap-1.5 text-[0.65rem] text-base-content/50 mt-1"
              >
                <span
                  v-if="t.due_on"
                  class="flex items-center gap-0.5"
                  :class="dueClass(t.due_on)"
                >
                  <CalendarDays class="w-2.5 h-2.5" :stroke-width="1.75" />
                  {{ dueLabel(t.due_on) }}
                </span>
                <span
                  v-if="t.priority !== 3"
                  class="flex items-center"
                  :class="priorityClass(t.priority)"
                >
                  <Flag class="w-2.5 h-2.5" :stroke-width="2.25" />
                </span>
              </div>
              <!-- Compact + Default: full meta row, but ref number & attachments hidden in compact -->
              <div
                v-else
                class="flex items-center justify-between gap-2 text-xs"
              >
                <div class="flex items-center gap-2 text-base-content/50">
                  <span v-if="zoom === 'default'" class="font-mono text-[0.65rem]">{{ t.reference_number }}</span>
                  <span
                    v-if="zoom === 'default' && (t.attachments?.length ?? 0) > 0"
                    class="flex items-center gap-0.5"
                  >
                    <Paperclip class="w-3 h-3" :stroke-width="1.75" />
                    {{ t.attachments.length }}
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  <span
                    v-if="t.due_on"
                    class="flex items-center gap-1"
                    :class="dueClass(t.due_on)"
                  >
                    <CalendarDays class="w-3 h-3" :stroke-width="1.75" />
                    {{ dueLabel(t.due_on) }}
                  </span>
                  <span
                    v-if="t.priority !== 3"
                    class="flex items-center gap-0.5"
                    :class="priorityClass(t.priority)"
                  >
                    <Flag class="w-3 h-3" :stroke-width="2.25" />
                  </span>
                </div>
              </div>
            </div>
          </article>

          <div
            v-if="(cardsByStatus[col.key] ?? []).length === 0"
            class="text-xs text-base-content/40 italic px-2 py-3 text-center"
          >
            Drop tasks here.
          </div>
        </div>

        <form
          v-if="!col.is_cancelled"
          class="border-t border-base-300/60 p-2"
          @submit.prevent="quickAdd(col.key)"
        >
          <label class="flex items-center gap-2 px-1 py-1 rounded-md hover:bg-base-100/60 transition-colors group/add">
            <Plus class="w-3.5 h-3.5 text-base-content/40 group-focus-within/add:text-primary" :stroke-width="1.75" />
            <input
              v-model="newTitleByCol[col.key]"
              type="text"
              class="flex-1 bg-transparent outline-none text-sm placeholder:text-base-content/40"
              :placeholder="`Add to ${col.label.toLowerCase()}`"
              :disabled="!clients.currentClientId"
            />
          </label>
        </form>
        </section>
      </template>

      <!-- Add column -->
      <div v-if="canManage" class="shrink-0 w-60 pt-0.5">
        <form v-if="addingCol" @submit.prevent="commitAddCol">
          <input
            v-model="newColLabel"
            v-focus
            class="w-full rounded-xl border border-base-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            placeholder="Column name — Enter to add"
            @blur="commitAddCol"
            @keydown.esc="addingCol = false; newColLabel = ''"
          />
        </form>
        <button
          v-else
          type="button"
          class="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-base-300 bg-base-100/60 px-3 py-2 text-sm text-base-content/60 hover:text-primary hover:border-primary/40 transition-colors"
          @click="addingCol = true"
        >
          <Plus class="w-4 h-4" :stroke-width="1.75" /> Add column
        </button>
      </div>
    </div>
  </div>
</template>

<style>
.bb-sort-ghost {
  opacity: 0.4;
  background: rgb(var(--bb-primary-rgb, 250 200 80) / 0.1);
}
.bb-sort-chosen {
  cursor: grabbing !important;
}
.bb-sort-drag {
  opacity: 0.95;
  transform: rotate(1.5deg);
}
</style>
