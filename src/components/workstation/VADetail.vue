<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  Mail,
  Clock,
  ListTodo,
  CheckCircle2,
  Calendar,
  MessageSquare,
  X,
  IdCard,
  Zap,
  Activity as ActivityIcon
} from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useBuzz, type BuzzResult } from '@/composables/useBuzz'
import { AVAILABILITY, availabilityOf } from '@/lib/availability'
import { useClientsStore } from '@/stores/clients'
import { useChannelsStore } from '@/stores/channels'
import { useTasksStore, type Task, type TaskActivityEvent } from '@/stores/tasks'
import { useTeamStore, type MemberProfile } from '@/stores/team'
import HexAvatar from '@/components/shared/HexAvatar.vue'
import RoleChip from '@/components/workstation/team/RoleChip.vue'
import CapacityRing from '@/components/workstation/team/CapacityRing.vue'

const props = defineProps<{ vaId: string }>()
const emit = defineEmits<{ (e: 'back'): void }>()

const clients = useClientsStore()
const channels = useChannelsStore()
const tasks = useTasksStore()
const team = useTeamStore()
const router = useRouter()

async function messageVa() {
  try {
    const id = await channels.openDm(props.vaId)
    if (id) {
      channels.select(id)
      await router.push({ path: '/app/comms' })
    }
  } catch (e) {
    console.warn('[va detail] dm:', (e as Error).message)
  }
}

// Buzz — ring their screen; feedback lands in the action-bar spacer.
const { buzz } = useBuzz()
const buzzNote = ref('')
const BUZZ_NOTES: Record<BuzzResult, string> = {
  sent: 'Buzzing their screen now',
  away: 'Away — left a note in your DM',
  cooldown: 'Buzzed just now — give it a minute',
  failed: 'Could not buzz right now'
}
let buzzNoteTimer: ReturnType<typeof setTimeout> | undefined
async function buzzVa() {
  buzzNote.value = BUZZ_NOTES[await buzz(props.vaId)]
  clearTimeout(buzzNoteTimer)
  buzzNoteTimer = setTimeout(() => (buzzNote.value = ''), 4000)
}

const va = computed<MemberProfile | null>(() => team.profiles[props.vaId] ?? null)
// Person-set availability — only shown when it actually says something.
const avail = computed(() => {
  const a = availabilityOf(va.value?.availability)
  return a === 'active' ? null : AVAILABILITY[a]
})

// Load profile if missing (e.g. landed via deep link).
watch(
  () => props.vaId,
  (id) => {
    if (id && !team.profiles[id]) void team.fetchProfiles([id])
  },
  { immediate: true }
)

// -----------------------------------------------------------------------------
// Hours this week
// -----------------------------------------------------------------------------
const hoursThisWeek = ref(0)
const hoursToday = ref(0)
const hoursLoading = ref(false)

async function loadHours() {
  if (!props.vaId) return
  hoursLoading.value = true
  try {
    const monday = new Date()
    monday.setHours(0, 0, 0, 0)
    monday.setDate(monday.getDate() - monday.getDay())
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const { data, error } = await supabase
      .from('time_entries')
      .select('started_at, ended_at')
      .eq('va_id', props.vaId)
      .gte('started_at', monday.toISOString())
    if (error) throw error
    let total = 0
    let today = 0
    for (const e of (data ?? []) as any[]) {
      const start = new Date(e.started_at).getTime()
      const end = e.ended_at ? new Date(e.ended_at).getTime() : Date.now()
      const seconds = Math.max(0, Math.floor((end - start) / 1000))
      total += seconds
      if (start >= todayStart.getTime()) today += seconds
    }
    hoursThisWeek.value = total
    hoursToday.value = today
  } catch (e) {
    console.warn('[va detail] hours:', (e as Error).message)
  } finally {
    hoursLoading.value = false
  }
}
watch(() => props.vaId, () => void loadHours(), { immediate: true })

function formatHours(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${String(m).padStart(2, '0')}m`
}

// -----------------------------------------------------------------------------
// Tasks for this VA
// -----------------------------------------------------------------------------
const myTasks = computed(() =>
  tasks.tasks.filter((t) => t.assignee_id === props.vaId)
)
const openTasks = computed(() =>
  myTasks.value.filter((t) => t.status !== 'done' && t.status !== 'cancelled')
)
const completedThisWeek = computed(() => {
  const monday = new Date()
  monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() - monday.getDay())
  return myTasks.value.filter((t) => {
    if (t.status !== 'done') return false
    if (!t.completed_at) return false
    return new Date(t.completed_at).getTime() >= monday.getTime()
  }).length
})
const overdueCount = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return openTasks.value.filter(
    (t) => t.due_on && new Date(t.due_on).getTime() < today.getTime()
  ).length
})

// -----------------------------------------------------------------------------
// Assignments matrix — one row per active assignment
// -----------------------------------------------------------------------------
interface AssignmentRow {
  id: string
  client_id: string
  client_name: string
  pm_id: string | null
  pm_name: string
  status: 'active' | 'paused' | 'ended'
  started_at: string
  open_tasks: number
}
const assignments = computed<AssignmentRow[]>(() => {
  const rows = team.assignments.filter((a) => a.va_id === props.vaId && a.status !== 'ended')
  return rows.map((a) => {
    const client = clients.clients.find((c) => c.id === a.client_id)
    const pm = a.pm_id ? team.profiles[a.pm_id] : null
    const clientOpen = openTasks.value.filter((t) => t.client_id === a.client_id).length
    return {
      id: a.id,
      client_id: a.client_id,
      client_name: client?.name ?? '(client)',
      pm_id: a.pm_id,
      pm_name: pm?.full_name || pm?.email?.split('@')[0] || (a.pm_id ? '…' : '—'),
      status: a.status,
      started_at: a.started_at,
      open_tasks: clientOpen
    }
  })
})

// Make sure PM profiles for these assignments are loaded.
watch(
  assignments,
  (rows) => {
    const missing = new Set<string>()
    for (const r of rows) if (r.pm_id && !team.profiles[r.pm_id]) missing.add(r.pm_id)
    if (missing.size) void team.fetchProfiles([...missing])
  },
  { immediate: true }
)

// -----------------------------------------------------------------------------
// Recent activity by this VA (their authored events across visible tasks)
// -----------------------------------------------------------------------------
interface FeedItem {
  task: Task
  ev: TaskActivityEvent
  ts: number
}
const recentActivity = computed<FeedItem[]>(() => {
  const out: FeedItem[] = []
  for (const t of tasks.tasks) {
    for (const ev of t.activity_log ?? []) {
      if (ev.user_id !== props.vaId) continue
      const ts = Date.parse(ev.timestamp)
      if (!Number.isFinite(ts)) continue
      out.push({ task: t, ev, ts })
    }
  }
  out.sort((a, b) => b.ts - a.ts)
  return out.slice(0, 12)
})

function describe(ev: TaskActivityEvent): string {
  switch (ev.kind) {
    case 'created':
      return 'created'
    case 'status':
      return ev.to === 'done' ? 'completed' : `moved to ${String(ev.to).replace('_', ' ')}`
    case 'priority':
      return 'changed priority'
    case 'due':
      return ev.to ? 'set due date' : 'cleared due date'
    case 'assignee':
      return ev.to ? 'assigned task' : 'unassigned'
    case 'title':
      return 'renamed'
    case 'description':
      return 'edited description'
    case 'attachment_added':
      return `attached ${ev.name || 'a file'}`
    case 'attachment_removed':
      return `removed ${ev.name || 'a file'}`
    default:
      return 'updated'
  }
}
function relTime(ts: number) {
  const diff = Date.now() - ts
  const s = Math.max(0, Math.round(diff / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const statusMeta: Record<string, { label: string; class: string }> = {
  active: { label: 'Active', class: 'bg-success/10 text-success' },
  paused: { label: 'Paused', class: 'bg-warning/10 text-warning' },
  ended: { label: 'Ended', class: 'bg-base-200 text-base-content/60' }
}
</script>

<template>
  <div class="h-full flex flex-col bg-base-100 min-w-0">
    <!-- Action bar -->
    <div class="px-4 py-2.5 border-b border-base-300 shrink-0 flex items-center gap-2">
      <RoleChip :role="va?.role" />
      <div class="flex-1 min-w-0 text-right text-[0.68rem] text-base-content/50 truncate">{{ buzzNote }}</div>
      <button
        type="button"
        class="h-8 px-3 rounded-lg inline-flex items-center gap-1.5 text-xs font-semibold text-base-content/60 hover:bg-base-200 hover:text-base-content"
        title="Open full profile — the shareable résumé"
        @click="router.push({ name: 'workstation-va-profile', params: { userId: props.vaId } })"
      >
        <IdCard class="w-4 h-4" :stroke-width="1.75" /> Profile
      </button>
      <button
        type="button"
        class="w-8 h-8 rounded-lg grid place-items-center text-base-content/60 hover:bg-base-200 hover:text-base-content"
        title="Message"
        @click="messageVa"
      >
        <MessageSquare class="w-4 h-4" :stroke-width="1.9" />
      </button>
      <button
        type="button"
        class="w-8 h-8 rounded-lg grid place-items-center text-base-content/60 hover:bg-base-200 hover:text-warning"
        title="Buzz — ring their screen"
        @click="buzzVa"
      >
        <Zap class="w-4 h-4" :stroke-width="1.9" />
      </button>
      <button
        type="button"
        class="w-8 h-8 rounded-lg grid place-items-center text-base-content/60 hover:bg-base-200 hover:text-base-content"
        aria-label="Close"
        @click="emit('back')"
      >
        <X class="w-[18px] h-[18px]" :stroke-width="2" />
      </button>
    </div>

    <!-- Identity -->
    <header class="px-5 py-5 border-b border-base-300 shrink-0 flex items-center gap-4">
      <HexAvatar
        :avatar-url="va?.avatar_url"
        :name="va?.full_name"
        :email="va?.email"
        :size="56"
        tint="primary"
      />
      <div class="flex-1 min-w-0">
        <h2 class="font-display text-lg font-bold truncate">
          {{ va?.full_name || va?.email || 'Loading…' }}
        </h2>
        <div class="text-xs text-base-content/60 flex items-center gap-1.5 mt-0.5">
          <Mail class="w-3 h-3 shrink-0" :stroke-width="1.75" />
          <span class="truncate">{{ va?.email ?? '—' }}</span>
        </div>
        <div v-if="va?.timezone" class="text-xs text-base-content/50 mt-0.5">{{ va.timezone }}</div>
        <div v-if="avail" class="flex items-center gap-1.5 text-xs mt-1">
          <span class="w-2 h-2 rounded-full shrink-0" :style="{ background: avail.dot }" />
          <span class="font-semibold">{{ avail.label }}</span>
          <span v-if="va?.status_note" class="text-base-content/55 truncate">— {{ va.status_note }}</span>
        </div>
      </div>
      <CapacityRing :seconds="hoursThisWeek" :size="92" />
    </header>

    <!-- Body -->
    <div class="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-6">
      <!-- This week stats -->
      <section>
        <h3 class="text-[0.65rem] uppercase tracking-wider text-base-content/50 font-semibold mb-2">
          This week
        </h3>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <div class="bg-base-100 border border-base-300 rounded-lg p-3">
            <div class="text-[0.65rem] uppercase tracking-wider text-base-content/50 font-semibold flex items-center gap-1">
              <Clock class="w-3 h-3" :stroke-width="1.75" /> Hours
            </div>
            <div class="text-lg font-mono tabular-nums mt-0.5">{{ formatHours(hoursThisWeek) }}</div>
            <div class="text-[0.65rem] text-base-content/50 mt-0.5">
              {{ formatHours(hoursToday) }} today
            </div>
          </div>
          <div class="bg-base-100 border border-base-300 rounded-lg p-3">
            <div class="text-[0.65rem] uppercase tracking-wider text-base-content/50 font-semibold flex items-center gap-1">
              <CheckCircle2 class="w-3 h-3" :stroke-width="1.75" /> Completed
            </div>
            <div class="text-lg font-mono tabular-nums mt-0.5">{{ completedThisWeek }}</div>
            <div class="text-[0.65rem] text-base-content/50 mt-0.5">tasks done</div>
          </div>
          <div class="bg-base-100 border border-base-300 rounded-lg p-3">
            <div class="text-[0.65rem] uppercase tracking-wider text-base-content/50 font-semibold flex items-center gap-1">
              <ListTodo class="w-3 h-3" :stroke-width="1.75" /> Open
            </div>
            <div class="text-lg font-mono tabular-nums mt-0.5">{{ openTasks.length }}</div>
            <div class="text-[0.65rem] text-base-content/50 mt-0.5">in flight</div>
          </div>
          <div class="bg-base-100 border border-base-300 rounded-lg p-3">
            <div class="text-[0.65rem] uppercase tracking-wider text-base-content/50 font-semibold flex items-center gap-1">
              <Calendar class="w-3 h-3" :stroke-width="1.75" /> Overdue
            </div>
            <div
              class="text-lg font-mono tabular-nums mt-0.5"
              :class="overdueCount > 0 ? 'text-error' : ''"
            >
              {{ overdueCount }}
            </div>
            <div class="text-[0.65rem] text-base-content/50 mt-0.5">past due</div>
          </div>
        </div>
      </section>

      <!-- Assignments -->
      <section>
        <h3 class="text-[0.65rem] uppercase tracking-wider text-base-content/50 font-semibold mb-2">
          Assignments
        </h3>
        <div
          v-if="assignments.length === 0"
          class="bg-base-100 border border-dashed border-base-300 rounded-lg px-4 py-8 text-center text-sm text-base-content/50"
        >
          No active assignments.
        </div>
        <div v-else class="bg-base-100 border border-base-300 rounded-lg overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-base-200/50 text-[0.65rem] uppercase tracking-wider text-base-content/60 font-semibold">
              <tr>
                <th class="text-left px-3 py-2">Client</th>
                <th class="text-left px-3 py-2">PM</th>
                <th class="text-left px-3 py-2">Open</th>
                <th class="text-left px-3 py-2">Status</th>
                <th class="text-left px-3 py-2">Since</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in assignments"
                :key="row.id"
                class="border-t border-base-200 hover:bg-base-200/40 transition-colors"
              >
                <td class="px-3 py-2 font-medium">{{ row.client_name }}</td>
                <td class="px-3 py-2 text-base-content/70">{{ row.pm_name }}</td>
                <td class="px-3 py-2 font-mono tabular-nums text-xs">{{ row.open_tasks }}</td>
                <td class="px-3 py-2">
                  <span
                    class="px-1.5 py-0.5 rounded-full text-[0.65rem] uppercase tracking-wider font-semibold"
                    :class="statusMeta[row.status]?.class ?? 'bg-base-200 text-base-content/60'"
                  >
                    {{ statusMeta[row.status]?.label ?? row.status }}
                  </span>
                </td>
                <td class="px-3 py-2 text-xs text-base-content/60">
                  {{ new Date(row.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Recent activity -->
      <section>
        <h3 class="text-[0.65rem] uppercase tracking-wider text-base-content/50 font-semibold mb-2 flex items-center gap-1.5">
          <ActivityIcon class="w-3 h-3" :stroke-width="1.75" />
          Recent activity
        </h3>
        <div
          v-if="recentActivity.length === 0"
          class="text-xs text-base-content/50 italic px-1"
        >
          No recent activity from this VA.
        </div>
        <ul v-else class="space-y-1.5">
          <li
            v-for="it in recentActivity"
            :key="`${it.task.id}-${it.ts}-${it.ev.kind}`"
            class="flex items-start gap-2 text-xs leading-snug"
          >
            <span class="text-base-content/40 tabular-nums whitespace-nowrap shrink-0 w-16">
              {{ relTime(it.ts) }}
            </span>
            <span class="text-base-content/80">
              {{ describe(it.ev) }}{{ ' ' }}
              <span class="font-medium text-base-content">{{ it.task.title }}</span>
              <span v-if="it.task.client_name" class="text-base-content/50">
                {{ ' in ' }}{{ it.task.client_name }}
              </span>
            </span>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
