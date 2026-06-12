<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useTasksStore, type Task } from '@/stores/tasks'
import { useClientsStore } from '@/stores/clients'
import { useStatusesStore } from '@/stores/statuses'
import { useProjectsStore } from '@/stores/projects'
import {
  Plus,
  Calendar as CalendarIcon,
  Flag,
  Table,
  LayoutGrid,
  Paperclip,
  LayoutDashboard
} from 'lucide-vue-next'
import TaskTableView from '@/components/workstation/TaskTableView.vue'
import TaskBoardView from '@/components/workstation/TaskBoardView.vue'
import TaskCalendarView from '@/components/workstation/TaskCalendarView.vue'
import TaskFilesView from '@/components/workstation/TaskFilesView.vue'
import TaskOverview from '@/components/workstation/TaskOverview.vue'
import AddColumnModal from '@/components/workstation/AddColumnModal.vue'

const tasks = useTasksStore()
const clients = useClientsStore()
const statusesStore = useStatusesStore()
const projects = useProjectsStore()

const newTitle = ref('')
const creating = ref(false)
const newError = ref<string | null>(null)
// Brief success-ring pulse on the quick-add card after a task is created.
const justAdded = ref(false)
let justAddedTimer: ReturnType<typeof setTimeout> | null = null
onBeforeUnmount(() => {
  if (justAddedTimer) clearTimeout(justAddedTimer)
})

const VIEW_KEY = 'buzzybee.workstation.tasks-view'
type ViewMode = 'overview' | 'table' | 'board' | 'calendar' | 'files'
const VIEW_MODES: ViewMode[] = ['overview', 'table', 'board', 'calendar', 'files']
const stored = typeof window === 'undefined' ? null : window.localStorage.getItem(VIEW_KEY)
// Validate the persisted value — a stale/corrupt entry (or the retired 'list'
// mode) would otherwise land in a view with no tab highlighted.
const view = ref<ViewMode>(
  VIEW_MODES.includes(stored as ViewMode) ? (stored as ViewMode) : 'overview'
)
watch(view, (v) => {
  if (typeof window !== 'undefined') window.localStorage.setItem(VIEW_KEY, v)
})

const tabs: { value: ViewMode; label: string; icon: any; disabled?: boolean }[] = [
  { value: 'overview', label: 'Overview', icon: LayoutDashboard },
  { value: 'table', label: 'Table', icon: Table },
  { value: 'board', label: 'Board', icon: LayoutGrid },
  { value: 'calendar', label: 'Calendar', icon: CalendarIcon },
  { value: 'files', label: 'Files', icon: Paperclip }
]

const showAddColumn = ref(false)

// Legacy list view groups, derived from the current project's status columns.
const groups = computed(() =>
  statusesStore
    .forProject(projects.currentProjectId)
    .map((col) => ({ key: col.key, label: col.label }))
)

const hasClient = computed(() => !!clients.currentClient)

async function quickAdd() {
  if (!newTitle.value.trim() || !hasClient.value) return
  creating.value = true
  newError.value = null
  try {
    await tasks.createTask({ title: newTitle.value })
    newTitle.value = ''
    // Flash the success ring (toggle off → nextTick → on so it retriggers on rapid adds).
    justAdded.value = false
    if (justAddedTimer) clearTimeout(justAddedTimer)
    await nextTick()
    justAdded.value = true
    justAddedTimer = setTimeout(() => { justAdded.value = false }, 550)
  } catch (e) {
    newError.value = e instanceof Error ? e.message : 'Could not create task.'
  } finally {
    creating.value = false
  }
}

async function toggleDone(t: Task) {
  const pid = projects.currentProjectId
  const next = statusesStore.isDone(pid, t.status)
    ? statusesStore.defaultKey(pid)
    : statusesStore.firstDoneKey(pid)
  // No suitable target column (e.g. project has no done/first column) — leave as-is.
  await tasks.setStatus(t.id, next ?? t.status)
}

function priorityLabel(p: number) {
  return p === 1 ? 'Urgent' : p === 2 ? 'High' : p === 3 ? 'Normal' : 'Low'
}
function priorityClass(p: number) {
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
  if (diff < 7) return `In ${diff}d`
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
</script>

<template>
  <div class="space-y-5">
    <nav
      class="flex items-center gap-1 border-b border-base-300 -mx-2 px-2"
      aria-label="Task views"
    >
      <button
        v-for="tab in tabs"
        :key="tab.value"
        type="button"
        class="relative px-3 py-2 text-sm font-medium transition-colors flex items-center gap-1.5"
        :class="[
          view === tab.value
            ? 'text-base-content'
            : tab.disabled
              ? 'text-base-content/30 cursor-not-allowed'
              : 'text-base-content/60 hover:text-base-content'
        ]"
        :disabled="tab.disabled"
        :title="tab.disabled ? 'Coming soon' : undefined"
        @click="!tab.disabled && (view = tab.value)"
      >
        <component :is="tab.icon" class="w-4 h-4" :stroke-width="1.75" />
        {{ tab.label }}
        <span
          v-if="view === tab.value"
          class="absolute left-0 right-0 -bottom-px h-0.5 bg-primary rounded-t"
        />
      </button>
    </nav>

    <!-- Quick add -->
    <form
      class="card bg-base-100 border border-base-300 shadow-sm"
      :class="{ 'bb-pulse-success': justAdded }"
      @submit.prevent="quickAdd"
    >
      <div class="card-body p-3 flex-row items-center gap-3">
        <Plus class="w-4 h-4 text-base-content/50 ml-1 shrink-0" :stroke-width="1.75" />
        <input
          v-model="newTitle"
          type="text"
          class="input input-ghost input-sm flex-1 focus:outline-none"
          :placeholder="hasClient ? 'Add a task and press Enter…' : 'Select a client first'"
          :disabled="!hasClient || creating"
        />
        <button
          type="submit"
          class="btn btn-primary btn-sm"
          :disabled="!newTitle.trim() || !hasClient || creating"
        >
          {{ creating ? 'Adding…' : 'Add' }}
        </button>
      </div>
      <p v-if="newError" class="text-error text-xs px-4 pb-3">{{ newError }}</p>
    </form>

    <!-- Empty -->
    <div
      v-if="!hasClient"
      class="card bg-base-100 border border-base-300 shadow-sm"
    >
      <div class="card-body p-8 text-center text-sm text-base-content/60">
        Pick a client from the top bar to view their task list.
      </div>
    </div>

    <!-- Table view -->
    <TaskTableView
      v-else-if="view === 'table'"
      @add-column="showAddColumn = true"
    />

    <!-- Board view -->
    <TaskBoardView v-else-if="view === 'board'" />

    <!-- Calendar view -->
    <TaskCalendarView v-else-if="view === 'calendar'" />

    <!-- Files view -->
    <TaskFilesView v-else-if="view === 'files'" />

    <!-- Overview (formerly List): project name editor + stats -->
    <TaskOverview v-else-if="view === 'overview'" />

    <!-- Legacy list view (kept as a fallback if anyone navigates manually) -->
    <section v-else class="space-y-5">
      <div
        v-for="g in groups"
        :key="g.key"
        class="space-y-2"
      >
        <div class="flex items-center gap-2 text-xs uppercase tracking-wide text-base-content/60">
          <span>{{ g.label }}</span>
          <span class="text-base-content/40">·</span>
          <span>{{ tasks.tasksByStatus[g.key].length }}</span>
        </div>

        <ul v-if="tasks.tasksByStatus[g.key].length" class="space-y-1.5">
          <li
            v-for="t in tasks.tasksByStatus[g.key]"
            :key="t.id"
            class="card bg-base-100 border border-base-300 shadow-sm hover:border-base-content/20 transition-colors"
          >
            <div class="card-body p-3 flex-row items-center gap-3">
              <input
                type="checkbox"
                class="checkbox checkbox-sm shrink-0"
                :checked="statusesStore.isDone(projects.currentProjectId, t.status)"
                @change="toggleDone(t)"
                @click.stop
              />
              <button
                type="button"
                class="flex-1 text-left min-w-0"
                @click="tasks.selectTask(t.id)"
              >
                <div
                  class="text-sm truncate"
                  :class="statusesStore.isDone(projects.currentProjectId, t.status) && 'line-through text-base-content/50'"
                >
                  {{ t.title }}
                </div>
                <div class="flex items-center gap-2 text-xs text-base-content/60 mt-0.5">
                  <span class="font-mono text-[0.7rem]">{{ t.reference_number }}</span>
                  <span v-if="t.due_on" class="flex items-center gap-1" :class="dueClass(t.due_on)">
                    <CalendarIcon class="w-3 h-3" :stroke-width="1.75" />
                    {{ dueLabel(t.due_on) }}
                  </span>
                  <span class="flex items-center gap-1" :class="priorityClass(t.priority)">
                    <Flag class="w-3 h-3" :stroke-width="1.75" />
                    {{ priorityLabel(t.priority) }}
                  </span>
                </div>
              </button>
            </div>
          </li>
        </ul>
        <p v-else class="text-xs text-base-content/40 px-1">—</p>
      </div>
    </section>

    <AddColumnModal :open="showAddColumn" @close="showAddColumn = false" />
  </div>
</template>
