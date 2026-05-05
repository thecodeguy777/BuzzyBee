<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Sortable from 'sortablejs'
import {
  Plus,
  CalendarDays,
  Flag,
  CircleDashed,
  Loader2,
  CircleAlert,
  CheckCircle2,
  CircleSlash,
  Paperclip,
  Pencil,
  ZoomOut,
  Check
} from 'lucide-vue-next'
import { useTasksStore, type Task, type TaskStatus } from '@/stores/tasks'
import { useClientsStore } from '@/stores/clients'

const tasks = useTasksStore()
const clients = useClientsStore()

// TKT-0007 (board): the column header is filled with the status color and
// shows a white-on-color label + count. No progress bar, no dot — the header
// itself is the status indicator.
const columns: {
  status: TaskStatus
  label: string
  icon: any
  headerBgClass: string
  countBgClass: string
}[] = [
  { status: 'todo',        label: 'Todo',        icon: CircleDashed, headerBgClass: 'bg-base-content/55', countBgClass: 'bg-white/20' },
  { status: 'in_progress', label: 'In progress', icon: Loader2,      headerBgClass: 'bg-primary',         countBgClass: 'bg-white/20' },
  { status: 'blocked',     label: 'Blocked',     icon: CircleAlert,  headerBgClass: 'bg-error',           countBgClass: 'bg-white/20' },
  { status: 'done',        label: 'Done',        icon: CheckCircle2, headerBgClass: 'bg-success',         countBgClass: 'bg-white/20' },
  { status: 'cancelled',   label: 'Cancelled',   icon: CircleSlash,  headerBgClass: 'bg-base-content/30', countBgClass: 'bg-white/20' }
]

const cardsByStatus = computed(() => tasks.tasksByStatus)

// ── SortableJS wiring ──────────────────────────────────────────────────────
// One Sortable instance per column body. group:'bb-tasks' lets cards move
// between columns. onEnd reads the dropped element's data-task-id and the
// new column's data-status, then updates priority_order + status.

const columnBodies = ref<Record<TaskStatus, HTMLElement | null>>({
  todo: null,
  in_progress: null,
  blocked: null,
  done: null,
  cancelled: null
})
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
  for (const col of columns) {
    const el = columnBodies.value[col.status]
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
const newTitleByCol = ref<Record<TaskStatus, string>>({
  todo: '',
  in_progress: '',
  blocked: '',
  done: '',
  cancelled: ''
})

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

    <div class="flex items-start gap-3 overflow-x-auto pb-4">
      <section
        v-for="col in columns"
        :key="col.status"
        class="shrink-0 rounded-xl bg-base-200/50 border border-base-300 flex flex-col max-h-[calc(100vh-12rem)] transition-[width] duration-200"
        :class="colWidthClass"
        :data-status="col.status"
      >
        <header
          class="flex items-center gap-2 px-3 py-2 rounded-t-xl text-white"
          :class="col.headerBgClass"
        >
          <span class="text-xs font-semibold uppercase tracking-wider truncate flex-1">
            {{ col.label }}
          </span>
          <span
            class="text-[0.7rem] font-semibold tabular-nums px-1.5 py-0.5 rounded-full leading-none shrink-0"
            :class="col.countBgClass"
          >
            {{ cardsByStatus[col.status].length }}
          </span>
        </header>

        <div
          :ref="(el) => setColumnRef(col.status, el)"
          class="flex-1 overflow-y-auto p-2 space-y-2 min-h-[3rem]"
          :data-status="col.status"
        >
          <article
            v-for="t in cardsByStatus[col.status]"
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
                  t.status === 'done' && 'text-base-content/50 line-through'
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
            v-if="cardsByStatus[col.status].length === 0"
            class="text-xs text-base-content/40 italic px-2 py-3 text-center"
          >
            Drop tasks here.
          </div>
        </div>

        <form
          v-if="col.status !== 'cancelled'"
          class="border-t border-base-300/60 p-2"
          @submit.prevent="quickAdd(col.status)"
        >
          <label class="flex items-center gap-2 px-1 py-1 rounded-md hover:bg-base-100/60 transition-colors group/add">
            <Plus class="w-3.5 h-3.5 text-base-content/40 group-focus-within/add:text-primary" :stroke-width="1.75" />
            <input
              v-model="newTitleByCol[col.status]"
              type="text"
              class="flex-1 bg-transparent outline-none text-sm placeholder:text-base-content/40"
              :placeholder="`Add to ${col.label.toLowerCase()}`"
              :disabled="!clients.currentClientId"
            />
          </label>
        </form>
      </section>
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
