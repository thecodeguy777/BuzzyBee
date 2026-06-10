<script setup lang="ts">
import { computed } from 'vue'
import { CheckSquare, Calendar, ArrowUpRight } from 'lucide-vue-next'
import HexAvatar from '@/components/shared/HexAvatar.vue'
import CommsStatusBadge from '@/components/comms/CommsStatusBadge.vue'
import CommsPriorityBars from '@/components/comms/CommsPriorityBars.vue'
import { useTasksStore, type Task } from '@/stores/tasks'
import { useStatusesStore } from '@/stores/statuses'

const props = withDefaults(
  defineProps<{ task: Task; treatment?: 'card' | 'pill' | 'auto' }>(),
  { treatment: 'auto' }
)
const emit = defineEmits<{ open: [id: string] }>()

const tasksStore = useTasksStore()
const statuses = useStatusesStore()

// Always render from the canonical store task (by id), not the passed-in copy —
// so the badge stays in sync with the Activity rail (which reads the store too)
// when a status changes anywhere.
const t = computed(() => tasksStore.tasks.find((x) => x.id === props.task.id) ?? props.task)

const def = computed(() => statuses.get(t.value.project_id, t.value.status))
const statusLabel = computed(() => def.value?.label || t.value.status)
const statusColor = computed(() => def.value?.color || 'neutral')
const isResolved = computed(() => !!def.value?.is_done || !!def.value?.is_cancelled)

// Resolved tasks render as a compact pill; active work gets the full card.
const mode = computed(() => (props.treatment === 'auto' ? (isResolved.value ? 'pill' : 'card') : props.treatment))

const due = computed(() => {
  const d = t.value.due_on
  if (!d) return ''
  return new Date(`${d}T00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
})
const firstName = computed(() => t.value.assignee_name?.split(' ')[0] ?? '')
</script>

<template>
  <!-- Card -->
  <button
    v-if="mode === 'card'"
    class="mt-2 block w-full max-w-[430px] text-left rounded-[10px] border border-base-300 bg-base-100 shadow-hm-xs overflow-hidden hover:shadow-hm-sm transition-shadow"
    style="border-left: 3px solid var(--accent)"
    @click="emit('open', t.id)"
  >
    <div class="px-3 py-2.5">
      <div class="flex items-center gap-2 mb-1.5">
        <span class="w-5 h-5 rounded-md grid place-items-center text-primary shrink-0" style="background: var(--accent-soft)">
          <CheckSquare class="w-3 h-3" :stroke-width="2.2" />
        </span>
        <span class="font-mono text-[0.68rem] font-semibold text-base-content/50">{{ t.reference_number }}</span>
        <CommsStatusBadge :label="statusLabel" :color="statusColor" sm />
        <span class="ml-auto"><CommsPriorityBars :priority="t.priority" /></span>
      </div>
      <div class="text-sm font-semibold leading-snug mb-2 truncate">{{ t.title }}</div>
      <div class="flex items-center gap-3 text-[0.72rem] text-base-content/60">
        <span v-if="t.assignee_name" class="flex items-center gap-1.5 min-w-0">
          <HexAvatar :name="t.assignee_name" :avatar-url="null" :color-key="t.assignee_id ?? t.assignee_name" :size="17" />
          <span class="truncate">{{ firstName }}</span>
        </span>
        <span v-if="due" class="flex items-center gap-1"><Calendar class="w-3 h-3" :stroke-width="1.75" /> {{ due }}</span>
        <span class="ml-auto flex items-center gap-1 text-primary font-semibold">View <ArrowUpRight class="w-3 h-3" :stroke-width="2" /></span>
      </div>
    </div>
  </button>

  <!-- Pill -->
  <button
    v-else
    class="mt-1.5 inline-flex items-center gap-2 rounded-full border border-base-300 bg-base-100 shadow-hm-xs pl-1.5 pr-2.5 py-1 hover:border-primary/40 transition-colors max-w-full"
    @click="emit('open', t.id)"
  >
    <span class="w-[18px] h-[18px] rounded-md grid place-items-center text-primary shrink-0" style="background: var(--accent-soft)">
      <CheckSquare class="w-2.5 h-2.5" :stroke-width="2.2" />
    </span>
    <span class="font-mono text-[0.7rem] font-semibold text-primary">{{ t.reference_number }}</span>
    <span class="w-px h-3 bg-base-300 shrink-0" />
    <CommsStatusBadge :label="statusLabel" :color="statusColor" sm />
    <HexAvatar v-if="t.assignee_name" :name="t.assignee_name" :avatar-url="null" :color-key="t.assignee_id ?? t.assignee_name" :size="17" />
  </button>
</template>
