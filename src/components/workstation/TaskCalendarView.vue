<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Sortable from 'sortablejs'
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Pencil,
  Plus,
  AlertCircle
} from 'lucide-vue-next'
import { useTasksStore, type Task } from '@/stores/tasks'
import { useClientsStore } from '@/stores/clients'
import { useStatusesStore } from '@/stores/statuses'
import { statusClasses } from '@/lib/statusColors'

const tasks = useTasksStore()
const clients = useClientsStore()
const statusesStore = useStatusesStore()

// ── Month state ───────────────────────────────────────────────────────────
const cursor = ref(startOfMonth(new Date()))

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}
function ymd(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function sameYmd(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

const monthLabel = computed(() =>
  cursor.value.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
)

// 42-cell grid (6 weeks × 7 days), starting Sunday.
const cells = computed(() => {
  const first = cursor.value
  const offset = first.getDay() // 0=Sun…6=Sat
  const start = new Date(first)
  start.setDate(first.getDate() - offset)
  const today = new Date()
  const month = first.getMonth()

  const out: { date: Date; key: string; inMonth: boolean; isToday: boolean }[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    out.push({
      date: d,
      key: ymd(d),
      inMonth: d.getMonth() === month,
      isToday: sameYmd(d, today)
    })
  }
  return out
})

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ── Tasks bucketed by due date ─────────────────────────────────────────────
const tasksByDate = computed(() => {
  const map: Record<string, Task[]> = {}
  for (const t of tasks.tasksForCurrentClient) {
    if (!t.due_on) continue
    if (!map[t.due_on]) map[t.due_on] = []
    map[t.due_on].push(t)
  }
  for (const k of Object.keys(map)) {
    map[k].sort((a, b) => a.priority - b.priority || a.created_at.localeCompare(b.created_at))
  }
  return map
})

const undatedTasks = computed(() =>
  tasks.tasksForCurrentClient
    .filter((t) => !t.due_on && statusesStore.isOpen(t.project_id, t.status))
    .sort((a, b) => a.priority_order - b.priority_order || a.created_at.localeCompare(b.created_at))
)

// ── SortableJS: drop on a day → set due_on ────────────────────────────────
const dayRefs = ref<Map<string, HTMLElement>>(new Map())
const undatedRef = ref<HTMLElement | null>(null)
const sortables: Sortable[] = []

function setDayRef(key: string, el: Element | any) {
  if (el) dayRefs.value.set(key, el as HTMLElement)
  else dayRefs.value.delete(key)
}

async function onSortEnd(evt: Sortable.SortableEvent) {
  const taskId = evt.item.getAttribute('data-task-id') ?? ''
  const target = (evt.to as HTMLElement)
  const newDue = target.getAttribute('data-day') ?? null
  if (!taskId) return

  const t = tasks.tasks.find((x) => x.id === taskId)
  if (!t) return
  // No-op when source and target are the same and date didn't change.
  if ((t.due_on ?? null) === newDue) return

  try {
    await tasks.updateTask(taskId, { due_on: newDue })
  } catch (e) {
    console.warn('[calendar] drop failed:', (e as Error).message)
  }
}

function destroySortables() {
  while (sortables.length) sortables.pop()?.destroy()
}

function buildSortables() {
  destroySortables()
  for (const el of dayRefs.value.values()) {
    sortables.push(
      Sortable.create(el, {
        group: 'bb-tasks-cal',
        animation: 150,
        ghostClass: 'bb-sort-ghost',
        chosenClass: 'bb-sort-chosen',
        dragClass: 'bb-sort-drag',
        filter: '[data-no-drag]',
        preventOnFilter: false,
        onEnd: onSortEnd
      })
    )
  }
  if (undatedRef.value) {
    sortables.push(
      Sortable.create(undatedRef.value, {
        group: 'bb-tasks-cal',
        animation: 150,
        ghostClass: 'bb-sort-ghost',
        chosenClass: 'bb-sort-chosen',
        dragClass: 'bb-sort-drag',
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

// Re-build when month changes (refs swap as cells re-render).
watch(cursor, async () => {
  await nextTick()
  buildSortables()
})
watch(
  () => tasks.tasksForCurrentClient.length,
  async () => {
    await nextTick()
    buildSortables()
  }
)

// ── Nav ───────────────────────────────────────────────────────────────────
function prev() {
  cursor.value = addMonths(cursor.value, -1)
}
function next() {
  cursor.value = addMonths(cursor.value, 1)
}
function today() {
  cursor.value = startOfMonth(new Date())
}

// ── Card visuals ──────────────────────────────────────────────────────────
function priorityClass(p: number) {
  return p === 1 ? 'bg-error' : p === 2 ? 'bg-warning' : p === 4 ? 'bg-base-content/40' : 'bg-info'
}

function openDrawer(t: Task, e: Event) {
  e.stopPropagation()
  tasks.selectTask(t.id)
}

// ── Quick-add on day click ────────────────────────────────────────────────
const MAX_VISIBLE_PER_DAY = 3
const expandedDays = ref<Set<string>>(new Set())
const quickAddDay = ref<string | null>(null)
const quickAddTitle = ref('')
const quickAddInput = ref<HTMLInputElement | null>(null)
function setQuickAddInput(el: Element | any) {
  quickAddInput.value = (el as HTMLInputElement | null) ?? null
}

function isVisibleSlice(key: string, all: Task[]): Task[] {
  if (expandedDays.value.has(key) || all.length <= MAX_VISIBLE_PER_DAY) return all
  return all.slice(0, MAX_VISIBLE_PER_DAY)
}

function hiddenCount(key: string, all: Task[]): number {
  if (expandedDays.value.has(key)) return 0
  return Math.max(0, all.length - MAX_VISIBLE_PER_DAY)
}

function toggleExpand(key: string, e: Event) {
  e.stopPropagation()
  const next = new Set(expandedDays.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedDays.value = next
}

async function startQuickAdd(key: string) {
  if (!clients.currentClientId) return
  quickAddDay.value = key
  quickAddTitle.value = ''
  await nextTick()
  quickAddInput.value?.focus()
}

function cancelQuickAdd() {
  quickAddDay.value = null
  quickAddTitle.value = ''
}

async function submitQuickAdd(key: string) {
  const title = quickAddTitle.value.trim()
  if (!title) {
    cancelQuickAdd()
    return
  }
  cancelQuickAdd()
  try {
    const created = await tasks.createTask({ title, due_on: key })
    if (!created.due_on) await tasks.updateTask(created.id, { due_on: key })
  } catch (e) {
    console.warn('[calendar] quick-add failed:', (e as Error).message)
  }
}

// Click on the empty area of a day cell starts quick-add for that day.
// Ignore clicks that originated on a task chip, "+N more" button, or input.
function onCellClick(e: MouseEvent, key: string) {
  const target = e.target as HTMLElement
  if (target.closest('[data-task-id]')) return
  if (target.closest('[data-no-cell-click]')) return
  if (quickAddDay.value === key) return
  void startQuickAdd(key)
}

// ── Overdue + today helpers ───────────────────────────────────────────────
const todayKey = computed(() => ymd(new Date()))

const overdueCount = computed(() => {
  const t = todayKey.value
  return tasks.tasksForCurrentClient.filter(
    (x) => x.due_on && x.due_on < t && statusesStore.isOpen(x.project_id, x.status)
  ).length
})

function jumpToToday() {
  cursor.value = startOfMonth(new Date())
}

// ── Status indicator on chips ─────────────────────────────────────────────
// Dot color comes from the task's own project status column (calendar can show
// tasks from across the client's projects), falling back to neutral.
function statusDotClass(t: Task) {
  const def = statusesStore.get(t.project_id, t.status)
  return statusClasses(def?.color).dot
}
function statusLabel(t: Task) {
  return statusesStore.get(t.project_id, t.status)?.label ?? t.status
}
</script>

<template>
  <div class="flex gap-4 -mx-4 px-4">
    <!-- Calendar grid -->
    <div class="flex-1 min-w-0 bg-base-100 rounded-xl border border-base-300 shadow-md overflow-hidden">
      <!-- overdue banner -->
      <div
        v-if="overdueCount > 0"
        class="flex items-center justify-between gap-3 px-4 py-2 bg-error/10 border-b border-error/20 text-sm text-error"
      >
        <div class="flex items-center gap-2">
          <AlertCircle class="w-4 h-4 shrink-0" :stroke-width="2" />
          <span>
            <span class="font-semibold">{{ overdueCount }}</span>
            task{{ overdueCount === 1 ? '' : 's' }} overdue
          </span>
        </div>
        <button
          type="button"
          class="text-xs font-medium underline-offset-2 hover:underline"
          @click="jumpToToday"
        >
          Jump to today
        </button>
      </div>

      <header class="flex items-center justify-between px-4 py-3 border-b border-base-300">
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="btn btn-ghost btn-sm btn-circle"
            aria-label="Previous month"
            @click="prev"
          >
            <ChevronLeft class="w-4 h-4" :stroke-width="1.75" />
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-sm btn-circle"
            aria-label="Next month"
            @click="next"
          >
            <ChevronRight class="w-4 h-4" :stroke-width="1.75" />
          </button>
          <h2 class="font-display text-lg font-semibold ml-2">{{ monthLabel }}</h2>
        </div>
        <button type="button" class="btn btn-ghost btn-sm gap-1.5" @click="today">
          <CalendarDays class="w-3.5 h-3.5" :stroke-width="1.75" />
          Today
        </button>
      </header>

      <div class="grid grid-cols-7 border-b border-base-300/60 bg-base-100/40">
        <div
          v-for="d in weekdays"
          :key="d"
          class="px-2 py-1.5 text-[0.65rem] uppercase tracking-wider text-base-content/60 font-semibold border-r last:border-r-0 border-base-300/60"
        >
          {{ d }}
        </div>
      </div>

      <div class="grid grid-cols-7 grid-rows-6">
        <div
          v-for="cell in cells"
          :key="cell.key"
          :class="[
            'group relative border-r border-b last:border-r-0 border-base-300/60 min-h-[7rem] p-1.5 flex flex-col cursor-pointer',
            !cell.inMonth && 'bg-base-100/40 text-base-content/40',
            cell.isToday && 'bg-primary/5'
          ]"
          @click="onCellClick($event, cell.key)"
        >
          <div class="flex items-center justify-between mb-1">
            <span
              :class="[
                'text-xs font-medium tabular-nums w-6 h-6 inline-flex items-center justify-center rounded-full',
                cell.isToday && 'bg-primary text-primary-content'
              ]"
            >
              {{ cell.date.getDate() }}
            </span>
            <button
              v-if="cell.inMonth && quickAddDay !== cell.key"
              type="button"
              data-no-cell-click
              class="opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 rounded-md flex items-center justify-center text-base-content/40 hover:text-primary hover:bg-primary/10"
              aria-label="Add task"
              title="Add task on this day"
              @click.stop="startQuickAdd(cell.key)"
            >
              <Plus class="w-3 h-3" :stroke-width="2" />
            </button>
          </div>
          <div
            :ref="(el) => setDayRef(cell.key, el)"
            :data-day="cell.key"
            class="flex-1 space-y-1 min-h-[2rem]"
          >
            <article
              v-for="t in isVisibleSlice(cell.key, tasksByDate[cell.key] ?? [])"
              :key="t.id"
              :data-task-id="t.id"
              class="group/card relative rounded-md border border-base-300 bg-base-100 hover:border-base-content/20 hover:shadow-sm transition-shadow cursor-grab active:cursor-grabbing select-text overflow-hidden"
            >
              <div class="flex items-stretch">
                <span
                  class="w-1 shrink-0"
                  :class="priorityClass(t.priority)"
                />
                <div class="flex-1 min-w-0 px-1.5 py-1 flex items-center gap-1.5">
                  <span
                    class="w-1.5 h-1.5 rounded-full shrink-0"
                    :class="statusDotClass(t)"
                    :title="statusLabel(t)"
                  />
                  <div
                    class="text-[0.7rem] leading-tight font-medium truncate"
                    :class="statusesStore.isDone(t.project_id, t.status) && 'line-through text-base-content/50'"
                    :title="t.title"
                  >
                    {{ t.title }}
                  </div>
                </div>
                <button
                  type="button"
                  data-no-drag
                  class="opacity-0 group-hover/card:opacity-100 transition-opacity px-1 text-base-content/50 hover:text-primary"
                  aria-label="Open task"
                  title="Open task"
                  @click="openDrawer(t, $event)"
                  @mousedown.stop
                >
                  <Pencil class="w-3 h-3" :stroke-width="1.75" />
                </button>
              </div>
            </article>

            <!-- +N more / show less toggle -->
            <button
              v-if="hiddenCount(cell.key, tasksByDate[cell.key] ?? []) > 0"
              type="button"
              data-no-cell-click
              class="text-[0.7rem] text-base-content/60 hover:text-primary px-1.5 py-0.5 font-medium"
              @click="toggleExpand(cell.key, $event)"
            >
              + {{ hiddenCount(cell.key, tasksByDate[cell.key] ?? []) }} more
            </button>
            <button
              v-else-if="
                expandedDays.has(cell.key) &&
                (tasksByDate[cell.key]?.length ?? 0) > MAX_VISIBLE_PER_DAY
              "
              type="button"
              data-no-cell-click
              class="text-[0.7rem] text-base-content/60 hover:text-primary px-1.5 py-0.5"
              @click="toggleExpand(cell.key, $event)"
            >
              Show less
            </button>

            <!-- inline quick-add input -->
            <input
              v-if="quickAddDay === cell.key"
              :ref="setQuickAddInput"
              v-model="quickAddTitle"
              data-no-cell-click
              type="text"
              placeholder="New task…"
              class="w-full text-[0.7rem] px-1.5 py-1 rounded-md border border-primary/40 bg-base-100 outline-none focus:ring-1 focus:ring-primary"
              @keydown.enter.prevent="submitQuickAdd(cell.key)"
              @keydown.escape.prevent="cancelQuickAdd"
              @blur="submitQuickAdd(cell.key)"
              @click.stop
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Undated tasks rail -->
    <aside class="hidden lg:flex w-64 shrink-0 flex-col bg-base-100 rounded-xl border border-base-300 shadow-md max-h-[calc(100vh-12rem)]">
      <header class="px-4 py-3 border-b border-base-300">
        <h3 class="text-xs uppercase tracking-wider font-semibold text-base-content/70">
          Unscheduled
        </h3>
        <p class="text-[0.7rem] text-base-content/50 mt-0.5">
          Drag onto a day to set its due date.
        </p>
      </header>
      <div
        ref="undatedRef"
        :data-day="''"
        class="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-[4rem]"
      >
        <article
          v-for="t in undatedTasks"
          :key="t.id"
          :data-task-id="t.id"
          class="group/card relative rounded-md border border-base-300 bg-base-100 hover:border-base-content/20 hover:shadow-sm transition-shadow cursor-grab active:cursor-grabbing select-text overflow-hidden"
        >
          <div class="flex items-stretch">
            <span class="w-1 shrink-0" :class="priorityClass(t.priority)" />
            <div class="flex-1 min-w-0 px-2 py-1.5">
              <div class="text-xs font-medium truncate" :title="t.title">
                {{ t.title }}
              </div>
              <div class="text-[0.65rem] font-mono text-base-content/40 mt-0.5">
                {{ t.reference_number }}
              </div>
            </div>
            <button
              type="button"
              data-no-drag
              class="opacity-0 group-hover/card:opacity-100 transition-opacity px-1.5 text-base-content/50 hover:text-primary"
              aria-label="Open task"
              title="Open task"
              @click="openDrawer(t, $event)"
              @mousedown.stop
            >
              <Pencil class="w-3 h-3" :stroke-width="1.75" />
            </button>
          </div>
        </article>
        <div v-if="undatedTasks.length === 0" class="text-xs text-base-content/40 italic px-2 py-3 text-center">
          Nothing without a due date.
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
:deep(.bb-sort-ghost) {
  opacity: 0.4;
}
:deep(.bb-sort-drag) {
  opacity: 0.95;
  transform: rotate(1deg);
}
</style>
