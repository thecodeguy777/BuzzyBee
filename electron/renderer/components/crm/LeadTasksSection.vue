<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { ListChecks, Plus, X, GripVertical } from 'lucide-vue-next'
import Sortable from 'sortablejs'
import { useTasks, type DialerTask } from '../../composables/useTasks'
import TaskRow from '../tasks/TaskRow.vue'
import TaskEditDialog from '../tasks/TaskEditDialog.vue'

const props = defineProps<{
  leadId: string
}>()

const taskStore = useTasks()

const showDone = ref(false)
const showAdd = ref(false)
const newTitle = ref('')
const newDueDate = ref('')
const editingTask = ref<DialerTask | null>(null)
const listEl = ref<HTMLElement | null>(null)
let sortable: Sortable | null = null

function onEdit(task: DialerTask) {
  editingTask.value = task
}

const allForLead = computed(() => taskStore.forLead(props.leadId))
// Tasks visible in the reorderable list (excludes done/cancelled — those
// live in their own collapsed section so they don't muddy priority order).
const activeTasks = computed(() =>
  allForLead.value.filter(t => t.status !== 'done' && t.status !== 'cancelled'),
)
const doneTasks = computed(() =>
  allForLead.value.filter(t => t.status === 'done' || t.status === 'cancelled'),
)

const openCount = computed(() => allForLead.value.filter(t => t.status === 'open' || t.status === 'in_progress').length)
const doneCount = computed(() => doneTasks.value.length)

const topTaskId = computed(() => activeTasks.value[0]?.id ?? null)

async function addTask() {
  if (!newTitle.value.trim()) return
  await taskStore.createManual({
    leadId: props.leadId,
    title: newTitle.value.trim(),
    dueAt: newDueDate.value ? new Date(newDueDate.value) : null,
  })
  newTitle.value = ''
  newDueDate.value = ''
  showAdd.value = false
}

function mountSortable() {
  if (sortable) {
    sortable.destroy()
    sortable = null
  }
  if (!listEl.value) return
  sortable = Sortable.create(listEl.value, {
    handle: '.task-drag-handle',
    animation: 160,
    ghostClass: 'task-row-ghost',
    chosenClass: 'task-row-chosen',
    dragClass: 'task-row-drag',
    onEnd: () => {
      if (!listEl.value) return
      const orderedIds = Array.from(listEl.value.querySelectorAll<HTMLElement>('[data-task-id]'))
        .map(el => el.dataset.taskId!)
        .filter(Boolean)
      taskStore.setPositions(orderedIds)
    },
  })
}

onMounted(() => {
  nextTick(mountSortable)
})

// Re-mount Sortable whenever the active task list changes structurally
// (rows added/removed). Vue may swap DOM nodes which invalidates handles.
watch(activeTasks, () => {
  nextTick(mountSortable)
}, { flush: 'post' })

onBeforeUnmount(() => {
  sortable?.destroy()
  sortable = null
})
</script>

<template>
  <section>
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-[10px] font-semibold uppercase tracking-wider text-base-content/50 flex items-center gap-1">
        <ListChecks class="w-3 h-3" />
        Tasks
        <span class="font-normal opacity-60">· {{ openCount }} open</span>
        <button
          v-if="doneCount > 0"
          class="font-normal opacity-50 hover:opacity-100 ml-1 hover:text-primary"
          @click="showDone = !showDone"
        >
          ({{ showDone ? 'hide' : 'show' }} {{ doneCount }} done)
        </button>
      </h3>
      <button
        class="text-[10px] text-primary hover:underline flex items-center gap-0.5"
        @click="showAdd = !showAdd"
      >
        <component :is="showAdd ? X : Plus" class="w-2.5 h-2.5" />
        {{ showAdd ? 'Cancel' : 'Add' }}
      </button>
    </div>

    <!-- Add form -->
    <div v-if="showAdd" class="border border-primary/30 bg-primary/5 rounded-lg p-2.5 mb-2 space-y-2">
      <input
        v-model="newTitle"
        type="text"
        placeholder="What needs doing?"
        class="w-full text-xs px-2 py-1.5 rounded border border-base-300 bg-base-100 focus:border-primary focus:outline-none"
        @keydown.enter="addTask"
      />
      <div class="flex items-center gap-2">
        <input
          v-model="newDueDate"
          type="datetime-local"
          class="flex-1 text-[11px] px-2 py-1 rounded border border-base-300 bg-base-100 focus:border-primary focus:outline-none"
        />
        <button
          class="text-[11px] px-2.5 py-1 rounded bg-primary text-white hover:bg-primary/90 transition-colors"
          :disabled="!newTitle.trim()"
          :class="!newTitle.trim() ? 'opacity-50 cursor-not-allowed' : ''"
          @click="addTask"
        >
          Add
        </button>
      </div>
    </div>

    <div v-if="activeTasks.length === 0" class="text-[11px] text-base-content/40 italic px-2 py-3 border border-dashed border-base-300 rounded-lg text-center">
      No tasks for this lead yet. The top task becomes the next action.
    </div>

    <div v-else>
      <!-- Active, drag-reorderable list. Top item is the "next action". -->
      <div
        ref="listEl"
        class="border border-base-300 rounded-lg overflow-hidden divide-y divide-base-300"
      >
        <div
          v-for="task in activeTasks"
          :key="task.id"
          :data-task-id="task.id"
          class="task-row flex items-stretch group bg-base-100"
          :class="task.id === topTaskId ? 'border-l-2 border-l-primary' : ''"
        >
          <!-- Drag handle column -->
          <button
            class="task-drag-handle shrink-0 px-1 flex items-center justify-center text-base-content/20 hover:text-base-content/60 cursor-grab active:cursor-grabbing transition-colors"
            title="Drag to reorder"
          >
            <GripVertical class="w-3 h-3" />
          </button>

          <!-- Next badge for the top item -->
          <div v-if="task.id === topTaskId" class="shrink-0 flex items-center pl-0.5 pr-2">
            <span class="text-[9px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded">
              Next
            </span>
          </div>

          <!-- Task row content -->
          <div class="flex-1 min-w-0">
            <TaskRow
              :task="task"
              :show-lead="false"
              @edit="onEdit"
            />
          </div>
        </div>
      </div>

      <!-- Done / cancelled (read-only, not reorderable) -->
      <div
        v-if="showDone && doneTasks.length > 0"
        class="mt-2 border border-base-300 rounded-lg overflow-hidden divide-y divide-base-300 opacity-70"
      >
        <TaskRow
          v-for="task in doneTasks"
          :key="task.id"
          :task="task"
          :show-lead="false"
          @edit="onEdit"
        />
      </div>
    </div>

    <TaskEditDialog :task="editingTask" @close="editingTask = null" />
  </section>
</template>

<style scoped>
.task-row-ghost {
  opacity: 0.35;
  background: color-mix(in srgb, var(--color-primary, #3b82f6) 8%, transparent);
}
.task-row-chosen {
  background: color-mix(in srgb, var(--color-base-200, #e5e7eb) 100%, transparent);
}
.task-row-drag {
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
}
</style>
