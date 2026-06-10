<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { CheckSquare, ArrowUpRight, X, Hash } from 'lucide-vue-next'
import HexAvatar from '@/components/shared/HexAvatar.vue'
import CommsStatusBadge from '@/components/comms/CommsStatusBadge.vue'
import { useTasksStore, type Task } from '@/stores/tasks'
import { useStatusesStore } from '@/stores/statuses'
import { useChannelsStore } from '@/stores/channels'
import { COMMS_STREAM } from '@/composables/commsStream'

const emit = defineEmits<{ close: []; open: [taskId: string] }>()

const tasks = useTasksStore()
const statuses = useStatusesStore()
const channels = useChannelsStore()
const stream = inject(COMMS_STREAM, null)

type Bucket = 'todo' | 'prog' | 'done'
const filter = ref<'all' | Bucket>('all')

// "Tasks created from chat" = tasks linked from any message in this channel.
const linkedTasks = computed<Task[]>(() => {
  if (!stream) return []
  const ids = new Set<string>()
  for (const m of stream.rootMessages.value) if (m.linked_task_id) ids.add(m.linked_task_id)
  for (const arr of Object.values(stream.repliesByParent.value)) {
    for (const r of arr) if (r.linked_task_id) ids.add(r.linked_task_id)
  }
  const out: Task[] = []
  for (const id of ids) {
    const t = tasks.tasks.find((x) => x.id === id)
    if (t) out.push(t)
  }
  return out.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
})

function bucketOf(t: Task): Bucket {
  if (statuses.isDone(t.project_id, t.status)) return 'done'
  const label = (statuses.get(t.project_id, t.status)?.label || t.status || '').toLowerCase()
  return /(progress|doing|review|active|wip|qa)/.test(label) ? 'prog' : 'todo'
}

const counts = computed(() => {
  const c = { all: linkedTasks.value.length, todo: 0, prog: 0, done: 0 }
  for (const t of linkedTasks.value) c[bucketOf(t)]++
  return c
})
const shown = computed(() =>
  filter.value === 'all' ? linkedTasks.value : linkedTasks.value.filter((t) => bucketOf(t) === filter.value)
)

const linkedToday = computed(() => {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const s = start.getTime()
  return linkedTasks.value.filter((t) => new Date(t.created_at).getTime() >= s).length
})

const TABS: { key: 'all' | Bucket; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'todo', label: 'To do' },
  { key: 'prog', label: 'In progress' },
  { key: 'done', label: 'Done' }
]

function statusLabel(t: Task) {
  return statuses.get(t.project_id, t.status)?.label || t.status
}
function statusColorOf(t: Task) {
  return statuses.get(t.project_id, t.status)?.color || 'neutral'
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}
function isNew(t: Task): boolean {
  return Date.now() - new Date(t.created_at).getTime() < 8000
}
</script>

<template>
  <aside
    class="hidden xl:flex w-[312px] shrink-0 flex-col border-l border-base-300 bg-base-200/30 overflow-hidden"
  >
    <!-- header -->
    <div class="h-14 shrink-0 flex items-center gap-2.5 px-3 pl-4 border-b border-base-300">
      <span class="w-7 h-7 rounded-lg grid place-items-center text-primary" style="background: var(--accent-soft)">
        <CheckSquare class="w-4 h-4" :stroke-width="2" />
      </span>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-extrabold tracking-tight leading-none">Activity</div>
        <div class="text-[0.7rem] text-base-content/50 mt-0.5">Tasks created from chat</div>
      </div>
      <button class="w-7 h-7 rounded-lg grid place-items-center text-base-content/60 hover:bg-base-200" aria-label="Hide panel" @click="emit('close')">
        <X class="w-4 h-4" :stroke-width="1.75" />
      </button>
    </div>

    <!-- stat strip -->
    <div class="flex gap-2 px-3.5 pt-3 pb-2">
      <div class="flex-1 rounded-[10px] bg-base-100 border border-base-300 px-3 py-2">
        <div class="text-[1.3rem] font-extrabold leading-none tabular-nums tracking-tight">{{ linkedToday }}</div>
        <div class="text-[0.68rem] text-base-content/50 mt-1">linked today</div>
      </div>
      <div class="flex-1 rounded-[10px] bg-base-100 border border-base-300 px-3 py-2">
        <div class="text-[1.3rem] font-extrabold leading-none tabular-nums tracking-tight text-success">{{ counts.done }}</div>
        <div class="text-[0.68rem] text-base-content/50 mt-1">done</div>
      </div>
      <div class="flex-1 rounded-[10px] bg-base-100 border border-base-300 px-3 py-2">
        <div class="text-[1.3rem] font-extrabold leading-none tabular-nums tracking-tight text-warning">{{ counts.prog }}</div>
        <div class="text-[0.68rem] text-base-content/50 mt-1">active</div>
      </div>
    </div>

    <!-- filter tabs -->
    <div class="flex gap-1.5 px-3 pb-2 overflow-x-auto">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        class="px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors"
        :class="filter === tab.key ? 'bg-primary text-primary-content' : 'bg-base-200 text-base-content/70 hover:bg-base-300'"
        @click="filter = tab.key"
      >
        {{ tab.label }} <span class="opacity-70">{{ counts[tab.key] }}</span>
      </button>
    </div>

    <!-- rows -->
    <div class="flex-1 min-h-0 overflow-y-auto px-3 pb-4 flex flex-col gap-2">
      <button
        v-for="t in shown"
        :key="t.id"
        type="button"
        class="text-left rounded-[10px] border border-base-300 bg-base-100 px-3.5 py-2.5 hover:border-primary/40 hover:-translate-y-px transition-all shadow-hm-xs"
        :class="isNew(t) ? 'bb-task-glow' : ''"
        @click="emit('open', t.id)"
      >
        <div class="flex items-center gap-2 mb-1.5">
          <span class="font-mono text-[0.68rem] font-semibold text-base-content/50">{{ t.reference_number }}</span>
          <CommsStatusBadge :label="statusLabel(t)" :color="statusColorOf(t)" sm />
          <span class="ml-auto text-[0.68rem] text-base-content/40 tabular-nums">{{ relTime(t.created_at) }}</span>
        </div>
        <div class="text-[0.82rem] font-semibold leading-snug mb-2 line-clamp-2">{{ t.title }}</div>
        <div class="flex items-center gap-2">
          <span v-if="t.assignee_name" class="flex items-center gap-1.5 min-w-0">
            <HexAvatar :name="t.assignee_name" :avatar-url="null" :size="18" />
            <span class="text-[0.7rem] text-base-content/60 truncate">{{ t.assignee_name.split(' ')[0] }}</span>
          </span>
          <span v-else class="text-[0.7rem] text-base-content/40">Unassigned</span>
          <span class="ml-auto flex items-center gap-1 text-[0.7rem] text-base-content/40">
            <Hash class="w-3 h-3" :stroke-width="2" />{{ channels.currentChannel?.name }}
          </span>
        </div>
      </button>

      <div v-if="shown.length === 0" class="text-center text-sm text-base-content/40 py-10">
        <span class="block">No tasks here yet.</span>
        <span class="block text-xs mt-1">Hover a message → <ArrowUpRight class="inline w-3 h-3" /> Task, react ✅, or type <span class="font-mono">/task</span>.</span>
      </div>
    </div>
  </aside>
</template>

<style scoped>
@keyframes bb-task-glow {
  0% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--accent) 45%, transparent); }
  100% { box-shadow: 0 0 0 8px transparent; }
}
.bb-task-glow { animation: bb-task-glow 1.4s ease-out; }
</style>
