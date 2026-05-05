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
  Pencil
} from 'lucide-vue-next'
import { useTasksStore, type Task, type TaskStatus } from '@/stores/tasks'
import { useClientsStore } from '@/stores/clients'

const tasks = useTasksStore()
const clients = useClientsStore()

const columns: {
  status: TaskStatus
  label: string
  icon: any
  accent: string
  dot: string
}[] = [
  { status: 'todo', label: 'Todo', icon: CircleDashed, accent: 'border-base-content/20', dot: 'bg-base-content/40' },
  { status: 'in_progress', label: 'In progress', icon: Loader2, accent: 'border-info/40', dot: 'bg-info' },
  { status: 'blocked', label: 'Blocked', icon: CircleAlert, accent: 'border-error/40', dot: 'bg-error' },
  { status: 'done', label: 'Done', icon: CheckCircle2, accent: 'border-success/40', dot: 'bg-success' },
  { status: 'cancelled', label: 'Cancelled', icon: CircleSlash, accent: 'border-base-content/10', dot: 'bg-base-content/30' }
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
  <div class="-mx-4 px-4">
    <div class="flex items-start gap-3 overflow-x-auto pb-4">
      <section
        v-for="col in columns"
        :key="col.status"
        class="shrink-0 w-72 rounded-xl bg-base-200/50 border border-base-300 flex flex-col max-h-[calc(100vh-12rem)]"
        :data-status="col.status"
      >
        <header class="flex items-center justify-between px-3 py-2.5 border-b border-base-300/60">
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-1.5 h-1.5 rounded-full" :class="col.dot" />
            <span class="text-xs font-semibold uppercase tracking-wider text-base-content/70 truncate">
              {{ col.label }}
            </span>
            <span class="text-xs text-base-content/40">
              {{ cardsByStatus[col.status].length }}
            </span>
          </div>
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

            <div class="p-3 space-y-2">
              <div
                class="text-sm font-medium leading-snug pr-6"
                :class="t.status === 'done' && 'text-base-content/50 line-through'"
              >
                {{ t.title }}
              </div>
              <div class="flex items-center justify-between gap-2 text-xs">
                <div class="flex items-center gap-2 text-base-content/50">
                  <span class="font-mono text-[0.65rem]">{{ t.reference_number }}</span>
                  <span
                    v-if="(t.attachments?.length ?? 0) > 0"
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
