<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import {
  CheckSquare, ArrowUpRight, X, Hash, Sparkles, Clock, Plus, Trash2, RefreshCw, Check,
} from 'lucide-vue-next'
import HexAvatar from '@/components/shared/HexAvatar.vue'
import CommsStatusBadge from '@/components/comms/CommsStatusBadge.vue'
import { useTasksStore, type Task } from '@/stores/tasks'
import { useStatusesStore } from '@/stores/statuses'
import { useChannelsStore } from '@/stores/channels'
import { useTeamStore } from '@/stores/team'
import { COMMS_STREAM } from '@/composables/commsStream'
import type { CommsReminder } from '@/composables/useChannelStream'

const props = withDefaults(defineProps<{ tab?: 'tasks' | 'reminders' }>(), { tab: 'tasks' })
const emit = defineEmits<{
  close: []
  open: [taskId: string]
  'update:tab': [tab: 'tasks' | 'reminders']
  'new-reminder': []
  'edit-reminder': [reminder: { id: string; body: string; remind_at: string }]
}>()

const tasks = useTasksStore()
const statuses = useStatusesStore()
const channels = useChannelsStore()
const team = useTeamStore()
const stream = inject(COMMS_STREAM, null)

const SEG_TABS = [
  { key: 'tasks' as const, label: 'Tasks', icon: CheckSquare },
  { key: 'reminders' as const, label: 'Reminders', icon: Clock },
]

/* ───────────────────────── TASKS ───────────────────────── */
type Bucket = 'todo' | 'prog' | 'done'
const filter = ref<'all' | Bucket>('all')

// Open (uncrossed) action items, surfaced inline above the tasks.
const openDecisions = computed(() => (stream ? stream.decisions.value.filter((d) => !d.decision_done) : []))
async function pinAll() {
  if (!stream) return
  for (const d of openDecisions.value) {
    if (d.linked_task_id) continue
    try {
      await stream.createTaskFromMessage(d)
    } catch {
      /* e.g. no project for this client — skip */
    }
  }
}

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

/* ───────────────────────── REMINDERS ───────────────────────── */
const reminders = computed<CommsReminder[]>(() => stream?.reminders.value ?? [])
const upcomingRem = computed(() => reminders.value.filter((r) => !r.done_at))
const doneRem = computed(() => reminders.value.filter((r) => r.done_at))
const remCounts = computed(() => ({
  all: reminders.value.length,
  upcoming: upcomingRem.value.length,
  done: doneRem.value.length,
}))
const remFilter = ref<'upcoming' | 'all' | 'done'>('upcoming')
const REM_TABS: { key: 'upcoming' | 'all' | 'done'; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'all', label: 'All' },
  { key: 'done', label: 'Done' },
]
function byDue(a: CommsReminder, b: CommsReminder) {
  const ad = a.done_at ? 1 : 0
  const bd = b.done_at ? 1 : 0
  return ad - bd || new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime()
}
const shownReminders = computed(() => {
  const base = remFilter.value === 'all' ? reminders.value : remFilter.value === 'done' ? doneRem.value : upcomingRem.value
  return [...base].sort(byDue)
})
const nextUp = computed(
  () => [...upcomingRem.value].sort((a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime())[0] ?? null
)

function dueInfo(r: CommsReminder) {
  const diff = new Date(r.remind_at).getTime() - Date.now()
  const overdue = diff < 0 && !r.done_at
  const mins = Math.round(Math.abs(diff) / 60000)
  let rel: string
  if (r.done_at) rel = 'completed'
  else if (mins < 60) rel = (overdue ? '' : 'in ') + mins + 'm' + (overdue ? ' ago' : '')
  else if (mins < 1440) rel = (overdue ? '' : 'in ') + Math.round(mins / 60) + 'h' + (overdue ? ' ago' : '')
  else rel = (overdue ? '' : 'in ') + Math.round(mins / 1440) + 'd' + (overdue ? ' ago' : '')
  const fmt = new Date(r.remind_at).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
  return { fmt, rel, overdue, soon: !overdue && !r.done_at && mins <= 1440 }
}
// Left-border / clock / badge accent classes by status.
function remClasses(r: CommsReminder) {
  const { overdue, soon } = dueInfo(r)
  const a = r.done_at ? 'success' : overdue ? 'error' : soon ? 'warning' : 'primary'
  const border = { success: 'border-l-success', error: 'border-l-error', warning: 'border-l-warning', primary: 'border-l-primary' }[a]
  const text = { success: 'text-success', error: 'text-error', warning: 'text-warning', primary: 'text-primary' }[a]
  const badge = { success: 'bg-success/15', error: 'bg-error/15', warning: 'bg-warning/15', primary: 'bg-primary/10' }[a]
  return { border, text, badge }
}
function creatorOf(r: CommsReminder) {
  const p = team.profiles[r.created_by]
  return { name: p?.full_name ?? 'Someone', avatarUrl: p?.avatar_url ?? null }
}
function toggleDone(r: CommsReminder) { void stream?.toggleReminderDone(r) }
function snooze(r: CommsReminder) { void stream?.snoozeReminder(r, 60) }
function removeR(r: CommsReminder) { void stream?.deleteReminder(r.id) }
function editR(r: CommsReminder) { emit('edit-reminder', { id: r.id, body: r.body, remind_at: r.remind_at }) }
</script>

<template>
  <aside
    class="hidden xl:flex w-[312px] shrink-0 flex-col border-l border-base-300 bg-base-200/30 overflow-hidden"
  >
    <!-- header -->
    <div class="h-14 shrink-0 flex items-center gap-2.5 px-3 pl-4 border-b border-base-300">
      <span class="w-7 h-7 rounded-lg grid place-items-center text-primary" style="background: var(--accent-soft)">
        <component :is="props.tab === 'reminders' ? Clock : CheckSquare" class="w-4 h-4" :stroke-width="2" />
      </span>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-extrabold tracking-tight leading-none">{{ props.tab === 'reminders' ? 'Reminders' : 'Activity' }}</div>
        <div class="text-[0.7rem] text-base-content/50 mt-0.5 truncate">
          {{ props.tab === 'reminders' ? '#' + (channels.currentChannel?.name ?? 'general') : 'Tasks created from chat' }}
        </div>
      </div>
      <button v-if="props.tab === 'reminders'" class="w-7 h-7 rounded-lg grid place-items-center text-base-content/60 hover:bg-base-200" aria-label="New reminder" title="New reminder" @click="emit('new-reminder')">
        <Plus class="w-4 h-4" :stroke-width="1.75" />
      </button>
      <button class="w-7 h-7 rounded-lg grid place-items-center text-base-content/60 hover:bg-base-200" aria-label="Hide panel" @click="emit('close')">
        <X class="w-4 h-4" :stroke-width="1.75" />
      </button>
    </div>

    <!-- segmented tabs -->
    <div class="flex gap-1 px-3 pt-2.5 pb-2 border-b border-base-300/70">
      <button
        v-for="t in SEG_TABS"
        :key="t.key"
        class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[9px] text-[0.8rem] font-bold transition-colors"
        :class="props.tab === t.key ? 'text-primary' : 'text-base-content/60 hover:bg-base-200'"
        :style="props.tab === t.key ? 'background: var(--accent-soft)' : ''"
        @click="emit('update:tab', t.key)"
      >
        <component :is="t.icon" class="w-[15px] h-[15px]" :stroke-width="2" /> {{ t.label }}
        <span
          v-if="(t.key === 'tasks' ? counts.all : remCounts.upcoming) > 0"
          class="min-w-[17px] h-[17px] px-1 rounded-[9px] grid place-items-center text-[0.62rem] font-extrabold text-white"
          :class="props.tab === t.key ? 'bg-primary' : 'bg-base-content/40'"
        >{{ t.key === 'tasks' ? counts.all : remCounts.upcoming }}</span>
      </button>
    </div>

    <!-- ═══════════════ TASKS TAB ═══════════════ -->
    <template v-if="props.tab === 'tasks'">
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

      <!-- open action items (uncrossed) -->
      <div v-if="openDecisions.length" class="px-3.5 pt-1 pb-2">
        <div class="rounded-[10px] border border-primary/30 bg-primary/5 overflow-hidden">
          <div class="flex items-center gap-2 px-3 py-2">
            <Sparkles class="w-3.5 h-3.5 text-primary shrink-0" :stroke-width="1.75" />
            <span class="text-[0.6rem] font-bold uppercase tracking-wider text-primary">Action items</span>
            <span class="text-[0.6rem] font-bold text-base-content/40 tabular-nums">{{ openDecisions.length }}</span>
            <div class="flex-1" />
            <button class="text-[0.6rem] font-semibold text-primary hover:underline" @click="pinAll">Pin all → Tasks</button>
          </div>
          <ul class="px-2 pb-2 space-y-0.5">
            <li
              v-for="d in openDecisions"
              :key="d.id"
              class="flex items-start gap-2 px-1.5 py-1 rounded-md hover:bg-base-100/70"
            >
              <button
                class="mt-0.5 w-4 h-4 rounded-full border-2 border-base-300 hover:border-success flex items-center justify-center shrink-0 transition-colors"
                aria-label="Mark done"
                @click="stream?.toggleDecisionDone(d)"
              />
              <span class="text-[0.78rem] leading-snug text-base-content/90">{{ d.body || 'Decision' }}</span>
            </li>
          </ul>
        </div>
      </div>

      <!-- filter tabs -->
      <div class="flex gap-1.5 px-3 pb-2 overflow-x-auto">
        <button
          v-for="ftab in TABS"
          :key="ftab.key"
          class="px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors"
          :class="filter === ftab.key ? 'bg-primary text-primary-content' : 'bg-base-200 text-base-content/70 hover:bg-base-300'"
          @click="filter = ftab.key"
        >
          {{ ftab.label }} <span class="opacity-70">{{ counts[ftab.key] }}</span>
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
          <span class="block text-xs mt-1">Hover a message → <ArrowUpRight class="inline w-3 h-3" /> Task, or type <span class="font-mono">/task</span>.</span>
        </div>
      </div>
    </template>

    <!-- ═══════════════ REMINDERS TAB ═══════════════ -->
    <template v-else>
      <!-- next-up banner -->
      <div
        class="mx-3.5 mt-3 mb-1.5 rounded-xl border border-primary/30 px-3.5 py-3 flex items-center gap-3"
        style="background: linear-gradient(120deg, var(--accent-soft), transparent)"
      >
        <span class="w-[34px] h-[34px] shrink-0 rounded-[10px] bg-primary text-white grid place-items-center">
          <Clock class="w-[18px] h-[18px]" :stroke-width="2" />
        </span>
        <div v-if="nextUp" class="min-w-0">
          <div class="text-[0.62rem] font-bold uppercase tracking-wider text-primary">
            Next reminder · {{ dueInfo(nextUp).overdue ? 'overdue' : dueInfo(nextUp).rel }}
          </div>
          <div class="text-[0.82rem] font-bold truncate">{{ nextUp.body }}</div>
        </div>
        <div v-else class="min-w-0">
          <div class="text-[0.82rem] font-bold">You're all caught up</div>
          <div class="text-[0.72rem] text-base-content/60">No upcoming reminders.</div>
        </div>
      </div>

      <!-- new reminder -->
      <div class="px-3.5 pt-1 pb-2">
        <button
          class="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-[10px] border border-dashed border-primary/40 text-primary text-[0.8rem] font-semibold hover:bg-primary/5 transition-colors"
          @click="emit('new-reminder')"
        >
          <Plus class="w-4 h-4" :stroke-width="2" /> New reminder
          <span class="text-base-content/40 font-medium">· or type /remind</span>
        </button>
      </div>

      <!-- filter pills -->
      <div class="flex gap-1.5 px-3.5 pb-2">
        <button
          v-for="rt in REM_TABS"
          :key="rt.key"
          class="px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors"
          :class="remFilter === rt.key ? 'bg-primary text-primary-content' : 'bg-base-200 text-base-content/70 hover:bg-base-300'"
          @click="remFilter = rt.key"
        >
          {{ rt.label }} <span class="opacity-70">{{ remCounts[rt.key] }}</span>
        </button>
      </div>

      <!-- cards -->
      <div class="flex-1 min-h-0 overflow-y-auto px-3.5 pb-4 flex flex-col gap-2.5">
        <div
          v-for="r in shownReminders"
          :key="r.id"
          class="relative rounded-[11px] border border-base-300 border-l-[3px] bg-base-100 px-3 py-3 shadow-hm-xs"
          :class="remClasses(r).border"
        >
          <div class="flex items-start gap-2.5">
            <button
              class="w-5 h-5 shrink-0 mt-0.5 rounded-full border-2 grid place-items-center transition-colors"
              :class="r.done_at ? 'bg-success border-success text-white' : 'border-base-content/30 hover:border-success'"
              :title="r.done_at ? 'Mark active' : 'Mark done'"
              @click="toggleDone(r)"
            >
              <Check v-if="r.done_at" class="w-3 h-3" :stroke-width="3" />
            </button>
            <div class="flex-1 min-w-0">
              <button
                type="button"
                class="block text-left text-[0.84rem] font-semibold leading-snug break-words"
                :class="r.done_at ? 'text-base-content/40 line-through' : 'text-base-content/90'"
                title="Edit reminder"
                @click="editR(r)"
              >{{ r.body }}</button>
              <div class="flex items-center gap-1.5 mt-1.5">
                <span class="inline-flex items-center gap-1 text-[0.72rem] font-semibold" :class="remClasses(r).text">
                  <Clock class="w-3 h-3" :stroke-width="2" /> {{ dueInfo(r).fmt }}
                </span>
                <span
                  v-if="!r.done_at"
                  class="text-[0.62rem] font-bold px-1.5 py-px rounded-full"
                  :class="[remClasses(r).badge, remClasses(r).text]"
                >{{ dueInfo(r).overdue ? 'overdue' : dueInfo(r).rel }}</span>
              </div>
              <div class="flex items-center gap-1.5 mt-2">
                <span class="flex items-center gap-1.5 min-w-0">
                  <HexAvatar :name="creatorOf(r).name" :avatar-url="creatorOf(r).avatarUrl" :color-key="r.created_by" :size="16" />
                  <span class="text-[0.68rem] text-base-content/50 truncate">#{{ channels.currentChannel?.name }}</span>
                </span>
                <div class="flex-1" />
                <button
                  v-if="!r.done_at"
                  class="inline-flex items-center gap-1 text-[0.68rem] font-semibold text-base-content/60 hover:text-base-content px-1.5 py-0.5 rounded-md hover:bg-base-200"
                  title="Snooze 1 hour"
                  @click="snooze(r)"
                ><RefreshCw class="w-3 h-3" :stroke-width="2" /> Snooze</button>
              </div>
            </div>
            <button
              class="w-6 h-6 shrink-0 rounded-md grid place-items-center text-base-content/40 hover:text-error hover:bg-base-200"
              title="Delete"
              @click="removeR(r)"
            ><Trash2 class="w-3.5 h-3.5" :stroke-width="1.75" /></button>
          </div>
        </div>

        <div v-if="shownReminders.length === 0" class="text-center text-base-content/40 py-12">
          <Clock class="inline w-6 h-6 opacity-40" :stroke-width="1.5" />
          <div class="mt-2.5 text-[0.82rem] font-semibold text-base-content/60">{{ remFilter === 'done' ? 'No completed reminders' : 'No reminders yet' }}</div>
          <div class="text-xs mt-1">Type <span class="font-mono">/remind</span> or hit New reminder.</div>
        </div>
      </div>
    </template>
  </aside>
</template>

<style scoped>
@keyframes bb-task-glow {
  0% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--accent) 45%, transparent); }
  100% { box-shadow: 0 0 0 8px transparent; }
}
.bb-task-glow { animation: bb-task-glow 1.4s ease-out; }
</style>
