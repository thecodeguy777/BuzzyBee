<script setup lang="ts">
import { computed, ref, nextTick, onBeforeUnmount } from 'vue'
import { Check, Clock, ChevronRight, ArrowRight, Pencil } from 'lucide-vue-next'
import { useTasks, type DialerTask } from '../../composables/useTasks'
import { useLeads } from '../../composables/useLeads'
import TaskTypeIcon from './TaskTypeIcon.vue'

const props = defineProps<{
  task: DialerTask
  showLead?: boolean
}>()

const emit = defineEmits<{
  (e: 'lead-click', leadId: string): void
  (e: 'edit', task: DialerTask): void
}>()

const taskStore = useTasks()
const leads = useLeads()

const lead = computed(() =>
  props.task.leadId ? leads.leads.value.find(l => l.id === props.task.leadId) ?? null : null,
)

const dueAtMs = computed(() => {
  if (props.task.status === 'snoozed' && props.task.snoozeUntil) return new Date(props.task.snoozeUntil).getTime()
  if (props.task.dueAt) return new Date(props.task.dueAt).getTime()
  return null
})

const dueLabel = computed(() => {
  const due = dueAtMs.value
  if (due == null) return null
  const diff = due - Date.now()
  const overdue = diff < 0
  const abs = Math.abs(diff)
  const m = Math.round(abs / 60_000)
  if (m < 60) return overdue ? `${m}m overdue` : `in ${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return overdue ? `${h}h overdue` : `in ${h}h`
  const d = Math.round(h / 24)
  return overdue ? `${d}d overdue` : `in ${d}d`
})

const dueState = computed<'overdue' | 'soon' | 'future' | 'snoozed' | 'none'>(() => {
  if (props.task.status === 'snoozed') return 'snoozed'
  const due = dueAtMs.value
  if (due == null) return 'none'
  const diff = due - Date.now()
  if (diff < 0) return 'overdue'
  if (diff < 4 * 60 * 60 * 1000) return 'soon'
  return 'future'
})

const dueColor = computed(() => ({
  overdue: 'text-red-500',
  soon:    'text-amber-600 dark:text-amber-400',
  future:  'text-base-content/50',
  snoozed: 'text-purple-500',
  none:    'text-base-content/30',
}[dueState.value]))

const showSnoozeMenu = ref(false)
const snoozeBtnRef = ref<HTMLElement | null>(null)
const snoozeMenuStyle = ref<Record<string, string>>({})

async function toggleSnoozeMenu() {
  if (showSnoozeMenu.value) {
    showSnoozeMenu.value = false
    return
  }
  showSnoozeMenu.value = true
  await nextTick()
  const btn = snoozeBtnRef.value
  if (!btn) return
  const rect = btn.getBoundingClientRect()
  const menuWidth = 128  // matches w-32
  // Default: dropdown below + right-aligned. Flip up if no room below.
  const spaceBelow = window.innerHeight - rect.bottom
  const placeBelow = spaceBelow >= 180 || spaceBelow >= rect.top
  snoozeMenuStyle.value = {
    position: 'fixed',
    [placeBelow ? 'top' : 'bottom']:
      placeBelow ? `${rect.bottom + 4}px` : `${window.innerHeight - rect.top + 4}px`,
    left: `${Math.max(4, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 4))}px`,
    width: `${menuWidth}px`,
    zIndex: '200',
  }
}

function closeSnoozeMenu() {
  showSnoozeMenu.value = false
}

async function onMarkDone(e: Event) {
  e.stopPropagation()
  await taskStore.markDone(props.task.id)
}

async function onSnooze(hours: number, e: Event) {
  e.stopPropagation()
  showSnoozeMenu.value = false
  const until = new Date(Date.now() + hours * 60 * 60 * 1000)
  await taskStore.snooze(props.task.id, until)
}

// Close on scroll/resize so the menu doesn't float disconnected from its anchor.
function onWindowMove() {
  if (showSnoozeMenu.value) showSnoozeMenu.value = false
}
window.addEventListener('scroll', onWindowMove, true)
window.addEventListener('resize', onWindowMove)
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onWindowMove, true)
  window.removeEventListener('resize', onWindowMove)
})

async function onUnsnooze(e: Event) {
  e.stopPropagation()
  await taskStore.unsnooze(props.task.id)
}

function onLeadClick(e: Event) {
  e.stopPropagation()
  if (lead.value) emit('lead-click', lead.value.id)
}
</script>

<template>
  <div
    class="flex items-center gap-2.5 px-3 py-2.5 hover:bg-base-200/50 transition-colors group"
    :class="task.status === 'done' ? 'opacity-50' : ''"
  >
    <!-- Done checkbox -->
    <button
      class="shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors"
      :class="task.status === 'done'
        ? 'bg-emerald-500 border-emerald-500'
        : 'border-base-300 hover:border-emerald-500 hover:bg-emerald-500/10'"
      :title="task.status === 'done' ? 'Completed' : 'Mark done'"
      @click="onMarkDone"
    >
      <Check v-if="task.status === 'done'" class="w-3 h-3 text-white" />
    </button>

    <!-- Type icon -->
    <TaskTypeIcon :task-type="task.taskType" :size="14" />

    <!-- Body -->
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-1.5 flex-wrap">
        <span class="text-xs font-medium text-base-content" :class="task.status === 'done' ? 'line-through text-base-content/50' : ''">
          {{ task.title }}
        </span>
        <button
          v-if="showLead && lead"
          class="px-1.5 py-0.5 rounded bg-base-200 text-[10px] font-medium text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors max-w-[140px] truncate"
          :title="`Open ${lead.fullName}`"
          @click="onLeadClick"
        >
          {{ lead.fullName }}
        </button>
      </div>
      <div v-if="dueLabel" class="flex items-center gap-1 text-[10px] mt-0.5" :class="dueColor">
        <Clock class="w-2.5 h-2.5" />
        <span>{{ dueLabel }}</span>
        <span v-if="task.status === 'snoozed'" class="text-base-content/40">· snoozed</span>
      </div>
    </div>

    <!-- Actions -->
    <div class="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      <!-- Edit -->
      <button
        class="text-[10px] text-base-content/40 hover:text-primary px-1.5 py-0.5 rounded hover:bg-primary/10 transition-colors flex items-center gap-0.5"
        title="Edit task"
        @click.stop="emit('edit', task)"
      >
        <Pencil class="w-2.5 h-2.5" />
      </button>

      <!-- Snooze (open/in_progress only) -->
      <button
        v-if="task.status === 'open' || task.status === 'in_progress'"
        ref="snoozeBtnRef"
        class="text-[10px] text-base-content/40 hover:text-purple-500 px-1.5 py-0.5 rounded hover:bg-purple-500/10 transition-colors"
        title="Snooze"
        @click.stop="toggleSnoozeMenu"
      >
        Snooze
      </button>

      <button
        v-if="task.status === 'snoozed'"
        class="text-[10px] text-purple-500 hover:underline px-1.5 py-0.5"
        @click.stop="onUnsnooze"
      >
        Unsnooze
      </button>
    </div>
  </div>

  <!-- Snooze dropdown — teleported to body so parent overflow can't clip it -->
  <Teleport to="body">
    <div
      v-if="showSnoozeMenu"
      :style="snoozeMenuStyle"
      class="bg-base-100 border border-base-300 rounded shadow-lg py-1"
      @click.stop
    >
      <button
        v-for="opt in [{ label: '1h', hours: 1 }, { label: '4h', hours: 4 }, { label: 'Tomorrow', hours: 24 }, { label: 'Next week', hours: 168 }]"
        :key="opt.hours"
        class="w-full text-left text-[11px] px-2.5 py-1 hover:bg-base-200 transition-colors"
        @click="(e) => onSnooze(opt.hours, e)"
      >
        {{ opt.label }}
      </button>
    </div>
    <!-- Click-outside backdrop -->
    <div
      v-if="showSnoozeMenu"
      class="fixed inset-0 z-[199]"
      @click="closeSnoozeMenu"
    ></div>
  </Teleport>
</template>
