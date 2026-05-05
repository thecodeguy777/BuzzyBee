<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  Mail,
  Clock,
  ListTodo,
  CheckCircle2,
  Calendar,
  ChevronLeft,
  Activity as ActivityIcon
} from 'lucide-vue-next'
import { supabase } from '@/lib/supabase'
import { useClientsStore } from '@/stores/clients'
import { useTasksStore, type Task, type TaskActivityEvent } from '@/stores/tasks'
import { useTeamStore, type MemberProfile } from '@/stores/team'

const props = defineProps<{ vaId: string }>()
const emit = defineEmits<{ (e: 'back'): void }>()

const clients = useClientsStore()
const tasks = useTasksStore()
const team = useTeamStore()

const va = computed<MemberProfile | null>(() => team.profiles[props.vaId] ?? null)

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

function initials(p: MemberProfile | null) {
  if (!p) return '?'
  const src = p.full_name || p.email || '?'
  return (
    src
      .split(/\s|@/)
      .filter(Boolean)
      .slice(0, 2)
      .map((x) => x.charAt(0).toUpperCase())
      .join('') || 'BB'
  )
}

const statusMeta: Record<string, { label: string; class: string }> = {
  active: { label: 'Active', class: 'bg-success/10 text-success' },
  paused: { label: 'Paused', class: 'bg-warning/10 text-warning' },
  ended: { label: 'Ended', class: 'bg-base-200 text-base-content/60' }
}
</script>

<template>
  <div class="h-full flex flex-col bg-base-100 min-w-0">
    <!-- Header -->
    <header class="px-5 sm:px-6 py-4 border-b border-base-300 shrink-0 flex items-center gap-3">
      <button
        type="button"
        class="lg:hidden w-8 h-8 rounded-md flex items-center justify-center hover:bg-base-200 -ml-1 text-base-content/70"
        aria-label="Back to roster"
        @click="emit('back')"
      >
        <ChevronLeft class="w-5 h-5" :stroke-width="1.75" />
      </button>
      <div
        class="w-12 h-12 rounded-full bg-primary/15 text-primary text-base font-semibold flex items-center justify-center shrink-0 overflow-hidden"
      >
        <img
          v-if="va?.avatar_url"
          :src="va.avatar_url"
          :alt="va.full_name ?? ''"
          class="w-full h-full object-cover"
        />
        <span v-else>{{ initials(va) }}</span>
      </div>
      <div class="flex-1 min-w-0">
        <h2 class="font-display text-lg font-semibold truncate">
          {{ va?.full_name || va?.email || 'Loading…' }}
        </h2>
        <div class="text-xs text-base-content/60 flex items-center gap-2 flex-wrap">
          <span class="inline-flex items-center gap-1">
            <Mail class="w-3 h-3" :stroke-width="1.75" />
            {{ va?.email ?? '—' }}
          </span>
          <span v-if="va?.timezone" class="text-base-content/40">·</span>
          <span v-if="va?.timezone">{{ va.timezone }}</span>
          <span v-if="va?.role" class="text-base-content/40">·</span>
          <span
            v-if="va?.role"
            class="px-1.5 py-0.5 rounded-full text-[0.6rem] uppercase tracking-wider bg-base-200 text-base-content/70 font-semibold"
          >
            {{ va.role }}
          </span>
        </div>
      </div>
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
