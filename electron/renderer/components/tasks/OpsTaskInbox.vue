<script setup lang="ts">
import { ref, computed } from 'vue'
import { ListChecks, AlertCircle, Clock, Calendar, MoonStar, CheckCircle2 } from 'lucide-vue-next'
import { useTasks, type DialerTask } from '../../composables/useTasks'
import TaskRow from './TaskRow.vue'
import TaskEditDialog from './TaskEditDialog.vue'

const emit = defineEmits<{
  (e: 'lead-click', leadId: string): void
}>()

const taskStore = useTasks()
const editingTask = ref<DialerTask | null>(null)

function onEdit(task: DialerTask) {
  editingTask.value = task
}

const buckets = computed(() => {
  const out: { key: string; label: string; icon: any; color: string; tasks: typeof taskStore.tasks.value }[] = []
  if (taskStore.overdue.value.length)
    out.push({ key: 'overdue', label: 'Overdue', icon: AlertCircle, color: 'text-red-500 bg-red-500/5 border-red-500/20', tasks: taskStore.overdue.value })
  if (taskStore.dueToday.value.length)
    out.push({ key: 'today', label: 'Due today', icon: Clock, color: 'text-amber-600 bg-amber-500/5 border-amber-500/20', tasks: taskStore.dueToday.value })
  if (taskStore.dueThisWeek.value.length)
    out.push({ key: 'week', label: 'Due this week', icon: Calendar, color: 'text-primary bg-primary/5 border-primary/20', tasks: taskStore.dueThisWeek.value })
  if (taskStore.upcoming.value.length)
    out.push({ key: 'upcoming', label: 'Upcoming', icon: Calendar, color: 'text-base-content/60 bg-base-200/40 border-base-300', tasks: taskStore.upcoming.value })
  if (taskStore.snoozed.value.length)
    out.push({ key: 'snoozed', label: 'Snoozed', icon: MoonStar, color: 'text-purple-500 bg-purple-500/5 border-purple-500/20', tasks: taskStore.snoozed.value })
  if (taskStore.completedToday.value.length)
    out.push({ key: 'done', label: 'Completed today', icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-500/5 border-emerald-500/20', tasks: taskStore.completedToday.value })
  return out
})

const totalOpen = computed(() => taskStore.stats.value.open)

function onLeadClick(leadId: string) {
  emit('lead-click', leadId)
}
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Header / KPIs -->
    <div class="border-b border-base-300 bg-base-100">
      <div class="px-5 py-3 flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/10 to-purple-500/10 border border-primary/15 flex items-center justify-center">
          <ListChecks class="w-4 h-4 text-primary" />
        </div>
        <div class="flex-1">
          <h3 class="text-sm font-semibold text-base-content">Task inbox</h3>
          <div class="text-[10px] text-base-content/50">
            Tasks auto-spawn from dispositions + stage changes
          </div>
        </div>
        <div class="flex items-center gap-4 text-xs">
          <div>
            <div class="text-[9px] uppercase tracking-wider text-base-content/40">Open</div>
            <div class="text-sm font-semibold text-base-content">{{ taskStore.stats.value.open }}</div>
          </div>
          <div>
            <div class="text-[9px] uppercase tracking-wider text-base-content/40">Overdue</div>
            <div class="text-sm font-semibold" :class="taskStore.stats.value.overdue > 0 ? 'text-red-500' : 'text-base-content'">
              {{ taskStore.stats.value.overdue }}
            </div>
          </div>
          <div>
            <div class="text-[9px] uppercase tracking-wider text-base-content/40">Today</div>
            <div class="text-sm font-semibold" :class="taskStore.stats.value.dueToday > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-base-content'">
              {{ taskStore.stats.value.dueToday }}
            </div>
          </div>
          <div>
            <div class="text-[9px] uppercase tracking-wider text-base-content/40">Done today</div>
            <div class="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              {{ taskStore.stats.value.completedToday }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Buckets -->
    <div class="flex-1 overflow-y-auto">
      <div v-if="buckets.length === 0" class="p-12 text-center">
        <ListChecks class="w-8 h-8 mx-auto mb-2 text-base-content/20" />
        <p class="text-xs text-base-content/50">
          {{ totalOpen === 0 ? 'No tasks yet — dispositions and stage changes will auto-create them.' : 'No tasks match these filters.' }}
        </p>
      </div>

      <div v-for="bucket in buckets" :key="bucket.key" class="border-b border-base-300 last:border-b-0">
        <div
          class="px-5 py-1.5 text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5 border-y border-current/10 sticky top-0 z-10"
          :class="bucket.color"
        >
          <component :is="bucket.icon" class="w-2.5 h-2.5" />
          {{ bucket.label }}
          <span class="font-normal opacity-60 normal-case tracking-normal">· {{ bucket.tasks.length }}</span>
        </div>
        <div class="divide-y divide-base-300">
          <TaskRow
            v-for="task in bucket.tasks"
            :key="task.id"
            :task="task"
            :show-lead="true"
            @lead-click="onLeadClick"
            @edit="onEdit"
          />
        </div>
      </div>
    </div>

    <TaskEditDialog :task="editingTask" @close="editingTask = null" />
  </div>
</template>
