<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  UsersRound,
  Briefcase,
  ListTodo,
  AlertTriangle,
  Clock,
  CheckCircle2,
  ArrowRight,
  CircleDashed,
  Pause,
  Archive,
  Crown,
  Sparkles
} from 'lucide-vue-next'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'
import { useTasksStore } from '@/stores/tasks'
import { useTeamStore } from '@/stores/team'

const auth = useAuthStore()
const clients = useClientsStore()
const tasks = useTasksStore()
const team = useTeamStore()
const router = useRouter()

// -----------------------------------------------------------------------------
// Greeting
// -----------------------------------------------------------------------------
const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 5) return 'Working late'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
})
const todayLabel = computed(() =>
  new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  })
)

// -----------------------------------------------------------------------------
// Date boundaries
// -----------------------------------------------------------------------------
function startOfDay(d = new Date()) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
function startOfWeek(d = new Date()) {
  const x = startOfDay(d)
  x.setDate(x.getDate() - x.getDay())
  return x
}

// -----------------------------------------------------------------------------
// Hours (today + this week, per-VA)
// -----------------------------------------------------------------------------
const hoursTodayByVa = ref<Record<string, number>>({})
const hoursWeekByVa = ref<Record<string, number>>({})
const hoursLoading = ref(false)

async function loadHours() {
  hoursLoading.value = true
  try {
    const week = startOfWeek().toISOString()
    const today = startOfDay().getTime()
    const { data, error } = await supabase
      .from('time_entries')
      .select('va_id, started_at, ended_at')
      .gte('started_at', week)
    if (error) throw error
    const wmap: Record<string, number> = {}
    const tmap: Record<string, number> = {}
    for (const e of (data ?? []) as any[]) {
      if (!e.va_id) continue
      const start = new Date(e.started_at).getTime()
      const end = e.ended_at ? new Date(e.ended_at).getTime() : Date.now()
      const seconds = Math.max(0, Math.floor((end - start) / 1000))
      wmap[e.va_id] = (wmap[e.va_id] ?? 0) + seconds
      if (start >= today) tmap[e.va_id] = (tmap[e.va_id] ?? 0) + seconds
    }
    hoursWeekByVa.value = wmap
    hoursTodayByVa.value = tmap
  } catch (e) {
    console.warn('[pm-home] hours:', (e as Error).message)
  } finally {
    hoursLoading.value = false
  }
}
watch(
  () => auth.isAuthenticated,
  (is) => is && void loadHours(),
  { immediate: true }
)

function formatHours(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${String(m).padStart(2, '0')}m`
}

// -----------------------------------------------------------------------------
// Stats (top row)
// -----------------------------------------------------------------------------
const activeClients = computed(() =>
  clients.clients.filter((c) => c.status === 'active')
)
const allOpenTasks = computed(() =>
  tasks.tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled')
)
const overdueTasks = computed(() => {
  const today = startOfDay().getTime()
  return allOpenTasks.value.filter(
    (t) => t.due_on && new Date(t.due_on).getTime() < today
  )
})
const completedThisWeek = computed(() => {
  const wk = startOfWeek().getTime()
  return tasks.tasks.filter((t) => {
    if (t.status !== 'done' || !t.completed_at) return false
    return new Date(t.completed_at).getTime() >= wk
  }).length
})
const totalHoursWeek = computed(() =>
  Object.values(hoursWeekByVa.value).reduce((a, b) => a + b, 0)
)

// -----------------------------------------------------------------------------
// HiveMindAI brief — synthesized from real data (no LLM yet, but the shape
// is ready for one). One headline sentence + 2–3 suggestion cards.
// -----------------------------------------------------------------------------
const hivemindHeadline = computed(() => {
  const od = overdueTasks.value.length
  const open = allOpenTasks.value.length
  if (od > 0) {
    const worst = [...overdueTasks.value].sort((a, b) =>
      (a.due_on ?? '').localeCompare(b.due_on ?? '')
    )[0]
    return {
      lead: `${od} task${od === 1 ? ' is' : 's are'} overdue`,
      tail: worst
        ? ` — ${worst.title} on ${worst.client_name ?? 'a client'} is the oldest.`
        : '.'
    }
  }
  if (open === 0) {
    return { lead: 'Inbox zero across the team', tail: ' — a rare and quiet day.' }
  }
  return {
    lead: `${open} open task${open === 1 ? '' : 's'} in flight`,
    tail: ` — ${completedThisWeek.value} closed this week.`
  }
})

interface HiveMindSuggestion {
  title: string
  detail: string
  onClick?: () => void
}
const hivemindSuggestions = computed<HiveMindSuggestion[]>(() => {
  const out: HiveMindSuggestion[] = []

  // Top idle VA — has bandwidth
  const sortedByLoad = [...team.myTeam]
    .map((m) => ({
      m,
      open: tasks.tasks.filter(
        (t) =>
          t.assignee_id === m.id &&
          t.status !== 'done' &&
          t.status !== 'cancelled'
      ).length
    }))
    .sort((a, b) => a.open - b.open)
  const idle = sortedByLoad[0]
  const busy = sortedByLoad[sortedByLoad.length - 1]
  if (idle && busy && idle.m.id !== busy.m.id && busy.open - idle.open >= 2) {
    out.push({
      title: `Rebalance: ${busy.m.full_name?.split(' ')[0] ?? 'busiest VA'} → ${idle.m.full_name?.split(' ')[0] ?? 'idle VA'}`,
      detail: `${busy.open} open vs ${idle.open}. Move 1–2 tasks to even out.`,
      onClick: () => router.push({ name: 'workstation-team', params: { vaId: busy.m.id } })
    })
  }

  // Orphan client (no primary PM)
  const orphan = clients.clients.find((c) => {
    if (c.status !== 'active') return false
    const pms = clients.pmsByClient[c.id] ?? []
    return !pms.some((p) => p.is_primary)
  })
  if (orphan) {
    out.push({
      title: `Set a primary PM for ${orphan.name}`,
      detail: 'No one is on point. Pick a primary so escalations land somewhere.',
      onClick: () => clients.setCurrentClient(orphan.id)
    })
  }

  // Block calendar for design QA — placeholder smart suggestion
  if (overdueTasks.value.length === 0 && allOpenTasks.value.length > 5) {
    out.push({
      title: 'Block tomorrow for review',
      detail: `${allOpenTasks.value.length} tasks in flight — set aside time to unblock the team.`
    })
  }

  return out.slice(0, 3)
})

// Sparkline path generator — fits 7 random-ish values into 200x32
function sparklineFor(seed: string, baseline = 16) {
  // Deterministic pseudo-random per seed string so it's stable across renders.
  let h = 0
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const pts: number[] = []
  for (let i = 0; i < 9; i++) {
    h = (h * 1103515245 + 12345) & 0x7fffffff
    pts.push(((h % 100) / 100) * 18 + baseline - 9)
  }
  return pts
    .map((y, i) => `${i === 0 ? 'M' : 'L'} ${(i * 200) / 8} ${Math.max(2, Math.min(30, y))}`)
    .join(' ')
}

// -----------------------------------------------------------------------------
// Alerts (Needs attention)
// -----------------------------------------------------------------------------
interface Alert {
  kind: 'overdue' | 'unassigned' | 'orphan-client' | 'paused-client'
  label: string
  detail?: string
  href?: { name: string; params?: Record<string, string> }
  onClick?: () => void
}
const alerts = computed<Alert[]>(() => {
  const out: Alert[] = []

  // Top 3 overdue tasks
  const od = [...overdueTasks.value]
    .sort((a, b) => (a.due_on ?? '').localeCompare(b.due_on ?? ''))
    .slice(0, 3)
  for (const t of od) {
    out.push({
      kind: 'overdue',
      label: t.title,
      detail: `${t.assignee_name || 'unassigned'} · ${t.client_name || ''}`,
      onClick: () => openTask(t.id, t.client_id, t.project_id)
    })
  }

  // Unassigned open tasks (only show if any exist, max 2)
  const unassigned = allOpenTasks.value.filter((t) => !t.assignee_id).slice(0, 2)
  for (const t of unassigned) {
    out.push({
      kind: 'unassigned',
      label: t.title,
      detail: t.client_name ?? '',
      onClick: () => openTask(t.id, t.client_id, t.project_id)
    })
  }

  // Clients without a primary PM (orphans)
  for (const c of clients.clients) {
    if (c.status === 'archived') continue
    const pms = clients.pmsByClient[c.id] ?? []
    if (!pms.some((p) => p.is_primary)) {
      out.push({
        kind: 'orphan-client',
        label: c.name,
        detail: 'No primary PM',
        onClick: () => clients.setCurrentClient(c.id)
      })
    }
  }

  // Paused clients (gentle reminder, not red)
  for (const c of clients.clients) {
    if (c.status === 'paused') {
      out.push({
        kind: 'paused-client',
        label: c.name,
        detail: 'Paused — review status',
        onClick: () => clients.setCurrentClient(c.id)
      })
    }
  }

  return out
})

const alertMeta: Record<Alert['kind'], { icon: any; class: string; label: string }> = {
  overdue: { icon: AlertTriangle, class: 'text-error bg-error/10', label: 'Overdue' },
  unassigned: { icon: ListTodo, class: 'text-warning bg-warning/10', label: 'Unassigned' },
  'orphan-client': { icon: Crown, class: 'text-warning bg-warning/10', label: 'No primary PM' },
  'paused-client': { icon: Pause, class: 'text-base-content/60 bg-base-200', label: 'Paused' }
}

async function openTask(taskId: string, clientId: string, projectId: string | null) {
  if (clients.currentClientId !== clientId) clients.setCurrentClient(clientId)
  if (projectId) {
    const projects = await import('@/stores/projects').then((m) => m.useProjectsStore())
    if (projects.currentProjectId !== projectId) projects.setCurrentProject(projectId)
  }
  await router.push({ name: 'workstation-tasks' })
  tasks.selectTask(taskId)
}

// -----------------------------------------------------------------------------
// VA roster (top 6, sorted by hours today desc)
// -----------------------------------------------------------------------------
interface VaCard {
  id: string
  name: string
  email: string | null
  avatar_url: string | null
  hours_today: number
  hours_week: number
  open_tasks: number
}
const vaCards = computed<VaCard[]>(() => {
  const out: VaCard[] = team.myTeam.map((m) => ({
    id: m.id,
    name: m.full_name || m.email?.split('@')[0] || 'VA',
    email: m.email,
    avatar_url: m.avatar_url,
    hours_today: hoursTodayByVa.value[m.id] ?? 0,
    hours_week: hoursWeekByVa.value[m.id] ?? 0,
    open_tasks: tasks.tasks.filter(
      (t) =>
        t.assignee_id === m.id &&
        t.status !== 'done' &&
        t.status !== 'cancelled'
    ).length
  }))
  out.sort((a, b) => b.hours_today - a.hours_today || b.open_tasks - a.open_tasks)
  return out.slice(0, 6)
})

// -----------------------------------------------------------------------------
// Client roster (active first, then paused, archived hidden)
// -----------------------------------------------------------------------------
interface ClientRow {
  id: string
  name: string
  status: string
  primary_pm: string
  open_tasks: number
}
const clientRows = computed<ClientRow[]>(() => {
  const rows: ClientRow[] = clients.clients
    .filter((c) => c.status !== 'archived')
    .map((c) => {
      const pms = clients.pmsByClient[c.id] ?? []
      const primary = pms.find((p) => p.is_primary)
      const pmProfile = primary ? team.profiles[primary.pm_id] : null
      const openCount = tasks.tasks.filter(
        (t) =>
          t.client_id === c.id &&
          t.status !== 'done' &&
          t.status !== 'cancelled'
      ).length
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        primary_pm:
          pmProfile?.full_name ||
          pmProfile?.email?.split('@')[0] ||
          (primary ? '…' : '—'),
        open_tasks: openCount
      }
    })
  // active first, then paused
  rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1
    return b.open_tasks - a.open_tasks
  })
  return rows
})

const statusDot: Record<string, string> = {
  active: 'bg-success',
  paused: 'bg-warning',
  archived: 'bg-base-content/30'
}

function initials(name: string, email: string | null) {
  const src = name || email || '?'
  return (
    src
      .split(/\s|@/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('') || 'BB'
  )
}

function goVa(id: string) {
  router.push({ name: 'workstation-team', params: { vaId: id } })
}
function goClient(id: string) {
  clients.setCurrentClient(id)
  router.push({ name: 'workstation-tasks' })
}
</script>

<template>
  <div class="space-y-6 max-w-6xl">
    <!-- Hero — warm gradient card with serif greeting and italic AI tail -->
    <header
      class="rounded-2xl border px-6 py-5 sm:px-7 sm:py-6 flex items-center gap-5 shadow-hc-1"
      style="
        background: linear-gradient(135deg, var(--hc-accent-bg) 0%, var(--hc-surface-warm) 100%);
        border-color: var(--hc-accent-soft);
      "
    >
      <div class="flex-1 min-w-0">
        <p class="text-[0.7rem] uppercase tracking-[0.08em] text-base-content/60 font-medium mb-1.5">
          {{ todayLabel }}
        </p>
        <h1 class="font-display text-2xl sm:text-[1.8rem] font-medium leading-tight">
          {{ greeting }}, <span style="color: var(--hc-accent)">{{ auth.firstName || 'there' }}</span>.
          <span class="italic font-normal text-base-content/50">
            {{
              overdueTasks.length > 0
                ? `${overdueTasks.length} ${overdueTasks.length === 1 ? 'task is' : 'things are'} overdue.`
                : alerts.length > 0
                  ? `${alerts.length} ${alerts.length === 1 ? 'thing needs' : 'things need'} you this week.`
                  : 'Nothing urgent — a good day to plan.'
            }}
          </span>
        </h1>
      </div>
      <button
        type="button"
        class="hidden sm:inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium shrink-0 transition-transform hover:scale-[1.02] active:scale-95"
        style="background: var(--hc-ink); color: var(--hc-paper);"
      >
        <Sparkles class="w-3.5 h-3.5" :stroke-width="1.5" />
        Plan my week
      </button>
    </header>

    <!-- Today's pulse — 4 stat cards with serif numbers + sparklines -->
    <section class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <button
        type="button"
        class="text-left bg-white border border-base-300 rounded-2xl p-4 shadow-hc-1 hover:shadow-hc-2 hover:border-base-content/15 transition-all"
        @click="router.push({ name: 'workstation-team' })"
      >
        <div class="text-[0.7rem] text-base-content/50 font-medium flex items-center gap-1.5">
          <UsersRound class="w-3 h-3" :stroke-width="1.75" />
          VAs on team
        </div>
        <div class="font-display text-3xl font-medium leading-none mt-1.5 tabular-nums">{{ team.myTeam.length }}</div>
        <div class="text-[0.7rem] text-base-content/50 mt-1">{{ allOpenTasks.length }} open · {{ completedThisWeek }} done</div>
        <svg class="w-full mt-2" height="28" viewBox="0 0 200 32" preserveAspectRatio="none">
          <path :d="sparklineFor('vas')" fill="none" stroke="var(--hc-accent)" stroke-width="1.5" stroke-linecap="round"/>
          <path :d="sparklineFor('vas') + ' L 200 32 L 0 32 Z'" fill="var(--hc-accent-bg)" opacity="0.7"/>
        </svg>
      </button>

      <button
        type="button"
        class="text-left bg-white border border-base-300 rounded-2xl p-4 shadow-hc-1 hover:shadow-hc-2 hover:border-base-content/15 transition-all"
        @click="router.push({ name: 'workstation-clients' })"
      >
        <div class="text-[0.7rem] text-base-content/50 font-medium flex items-center gap-1.5">
          <Briefcase class="w-3 h-3" :stroke-width="1.75" />
          Active clients
        </div>
        <div class="font-display text-3xl font-medium leading-none mt-1.5 tabular-nums">{{ activeClients.length }}</div>
        <div class="text-[0.7rem] text-base-content/50 mt-1">across {{ clients.clients.length }} total</div>
        <svg class="w-full mt-2" height="28" viewBox="0 0 200 32" preserveAspectRatio="none">
          <path :d="sparklineFor('clients')" fill="none" stroke="var(--hc-accent)" stroke-width="1.5" stroke-linecap="round"/>
          <path :d="sparklineFor('clients') + ' L 200 32 L 0 32 Z'" fill="var(--hc-accent-bg)" opacity="0.7"/>
        </svg>
      </button>

      <div class="bg-white border border-base-300 rounded-2xl p-4 shadow-hc-1">
        <div class="text-[0.7rem] text-base-content/50 font-medium flex items-center gap-1.5">
          <Clock class="w-3 h-3" :stroke-width="1.75" />
          Hours this week
        </div>
        <div class="font-display text-3xl font-medium leading-none mt-1.5 tabular-nums">{{ formatHours(totalHoursWeek) }}</div>
        <div class="text-[0.7rem] text-base-content/50 mt-1">team total</div>
        <svg class="w-full mt-2" height="28" viewBox="0 0 200 32" preserveAspectRatio="none">
          <path :d="sparklineFor('hours')" fill="none" stroke="var(--hc-accent)" stroke-width="1.5" stroke-linecap="round"/>
          <path :d="sparklineFor('hours') + ' L 200 32 L 0 32 Z'" fill="var(--hc-accent-bg)" opacity="0.7"/>
        </svg>
      </div>

      <div
        class="bg-white border rounded-2xl p-4 shadow-hc-1"
        :class="overdueTasks.length > 0 ? 'border-error/30' : 'border-base-300'"
        :style="overdueTasks.length > 0 ? 'background: color-mix(in oklch, var(--color-error) 4%, white)' : ''"
      >
        <div
          class="text-[0.7rem] font-medium flex items-center gap-1.5"
          :class="overdueTasks.length > 0 ? 'text-error' : 'text-base-content/50'"
        >
          <AlertTriangle class="w-3 h-3" :stroke-width="1.75" />
          Overdue
        </div>
        <div
          class="font-display text-3xl font-medium leading-none mt-1.5 tabular-nums"
          :class="overdueTasks.length > 0 ? 'text-error' : ''"
        >
          {{ overdueTasks.length }}
        </div>
        <div class="text-[0.7rem] text-base-content/50 mt-1">
          {{ overdueTasks.length === 0 ? 'all clear' : 'past due — needs attention' }}
        </div>
      </div>
    </section>

    <!-- HiveMindAI brief -->
    <section
      class="rounded-2xl p-5 sm:p-6 shadow-hc-1 border"
      style="
        background: var(--hc-surface);
        border-color: var(--hc-divider);
      "
    >
      <div class="flex items-center gap-2 mb-3">
        <Sparkles class="w-3.5 h-3.5" :stroke-width="1.5" style="color: var(--hc-accent)" />
        <span
          class="text-[0.7rem] uppercase tracking-[0.08em] font-semibold"
          style="color: var(--hc-accent)"
        >
          HiveMindAI · this week's brief
        </span>
        <div class="flex-1" />
        <span class="text-[0.65rem] text-base-content/40">Generated from live data</span>
      </div>

      <p class="font-display text-[1.05rem] sm:text-base leading-relaxed text-base-content/85 font-normal">
        <strong class="font-medium text-base-content">{{ hivemindHeadline.lead }}</strong
        ><span class="italic text-base-content/60">{{ hivemindHeadline.tail }}</span>
      </p>

      <div
        v-if="hivemindSuggestions.length"
        class="mt-4 grid sm:grid-cols-3 gap-2"
      >
        <button
          v-for="(s, i) in hivemindSuggestions"
          :key="i"
          type="button"
          class="text-left flex items-start gap-2.5 p-3 rounded-xl border transition-all hover:shadow-hc-1"
          :style="`background: var(--hc-surface-warm); border-color: var(--hc-divider);`"
          @click="s.onClick?.()"
        >
          <div
            class="w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5"
            :style="`background: var(--hc-accent-bg); color: var(--hc-accent);`"
          >
            <Sparkles class="w-3 h-3" :stroke-width="1.5" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium leading-snug">{{ s.title }}</div>
            <div class="text-[0.7rem] text-base-content/55 mt-0.5 leading-snug">{{ s.detail }}</div>
          </div>
        </button>
      </div>
    </section>

    <!-- Two-column on lg: Alerts + This week -->
    <section class="grid lg:grid-cols-3 gap-4">
      <!-- Needs attention (2/3) -->
      <div class="lg:col-span-2 bg-white border border-base-300 rounded-2xl p-4 shadow-hc-1">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle class="w-4 h-4 text-base-content/60" :stroke-width="1.75" />
            Needs attention
          </h2>
          <span class="text-[0.65rem] uppercase tracking-wider text-base-content/40 font-semibold">
            {{ alerts.length }} item{{ alerts.length === 1 ? '' : 's' }}
          </span>
        </div>
        <ul v-if="alerts.length" class="divide-y divide-base-200">
          <li
            v-for="(a, i) in alerts"
            :key="i"
            class="py-2 flex items-center gap-3 hover:bg-base-200/40 -mx-2 px-2 rounded-md cursor-pointer transition-colors"
            @click="a.onClick?.()"
          >
            <div
              class="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
              :class="alertMeta[a.kind].class"
            >
              <component
                :is="alertMeta[a.kind].icon"
                class="w-3.5 h-3.5"
                :stroke-width="1.75"
              />
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium truncate">{{ a.label }}</div>
              <div class="text-[0.7rem] text-base-content/50 truncate">
                {{ alertMeta[a.kind].label }}<span v-if="a.detail"> · {{ a.detail }}</span>
              </div>
            </div>
            <ArrowRight class="w-3.5 h-3.5 text-base-content/30 shrink-0" :stroke-width="1.75" />
          </li>
        </ul>
        <div v-else class="py-6 text-center text-xs text-base-content/50">
          <CheckCircle2 class="w-6 h-6 mx-auto text-success/60" :stroke-width="1.5" />
          <p class="mt-2">Nothing on fire. Nice.</p>
        </div>
      </div>

      <!-- This week stats (1/3) -->
      <div class="bg-white border border-base-300 rounded-2xl p-4 shadow-hc-1">
        <h2 class="text-sm font-semibold flex items-center gap-2 mb-3">
          <Sparkles class="w-4 h-4 text-base-content/60" :stroke-width="1.75" />
          This week
        </h2>
        <dl class="space-y-3">
          <div>
            <dt class="text-[0.65rem] uppercase tracking-wider text-base-content/50 font-semibold flex items-center gap-1">
              <Clock class="w-3 h-3" :stroke-width="1.75" /> Hours logged
            </dt>
            <dd class="text-xl font-mono tabular-nums mt-0.5">{{ formatHours(totalHoursWeek) }}</dd>
          </div>
          <div>
            <dt class="text-[0.65rem] uppercase tracking-wider text-base-content/50 font-semibold flex items-center gap-1">
              <CheckCircle2 class="w-3 h-3" :stroke-width="1.75" /> Tasks completed
            </dt>
            <dd class="text-xl font-mono tabular-nums mt-0.5">{{ completedThisWeek }}</dd>
          </div>
          <div>
            <dt class="text-[0.65rem] uppercase tracking-wider text-base-content/50 font-semibold flex items-center gap-1">
              <ListTodo class="w-3 h-3" :stroke-width="1.75" /> Still in flight
            </dt>
            <dd class="text-xl font-mono tabular-nums mt-0.5">{{ allOpenTasks.length }}</dd>
          </div>
        </dl>
      </div>
    </section>

    <!-- VA roster -->
    <section class="bg-white border border-base-300 rounded-2xl p-4 shadow-hc-1">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-semibold flex items-center gap-2">
          <UsersRound class="w-4 h-4 text-base-content/60" :stroke-width="1.75" />
          Your team
        </h2>
        <button
          type="button"
          class="text-[0.65rem] uppercase tracking-wider font-semibold text-primary hover:underline flex items-center gap-1"
          @click="router.push({ name: 'workstation-team' })"
        >
          See all
          <ArrowRight class="w-3 h-3" :stroke-width="1.75" />
        </button>
      </div>

      <div v-if="vaCards.length" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <button
          v-for="v in vaCards"
          :key="v.id"
          type="button"
          class="flex items-center gap-3 p-2.5 rounded-lg border border-base-200 hover:border-base-content/20 hover:bg-base-200/40 transition-all text-left"
          @click="goVa(v.id)"
        >
          <div
            class="w-9 h-9 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center shrink-0 overflow-hidden"
          >
            <img
              v-if="v.avatar_url"
              :src="v.avatar_url"
              :alt="v.name"
              class="w-full h-full object-cover"
            />
            <span v-else>{{ initials(v.name, v.email) }}</span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium truncate">{{ v.name }}</div>
            <div class="text-[0.65rem] text-base-content/60 flex items-center gap-1.5 mt-0.5 tabular-nums">
              <Clock class="w-2.5 h-2.5" :stroke-width="1.75" />
              {{ formatHours(v.hours_today) }} today
              <span class="text-base-content/30">·</span>
              <ListTodo class="w-2.5 h-2.5" :stroke-width="1.75" />
              {{ v.open_tasks }}
            </div>
          </div>
        </button>
      </div>
      <p v-else class="text-xs italic text-base-content/40 px-1 py-2">
        No VAs on your team yet.
      </p>
    </section>

    <!-- Clients roster -->
    <section class="bg-white border border-base-300 rounded-2xl p-4 shadow-hc-1">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-semibold flex items-center gap-2">
          <Briefcase class="w-4 h-4 text-base-content/60" :stroke-width="1.75" />
          Clients
        </h2>
        <button
          type="button"
          class="text-[0.65rem] uppercase tracking-wider font-semibold text-primary hover:underline flex items-center gap-1"
          @click="router.push({ name: 'workstation-clients' })"
        >
          Manage
          <ArrowRight class="w-3 h-3" :stroke-width="1.75" />
        </button>
      </div>

      <div v-if="clientRows.length" class="overflow-x-auto -mx-1">
        <table class="w-full text-sm">
          <thead class="text-[0.65rem] uppercase tracking-wider text-base-content/50 font-semibold">
            <tr>
              <th class="text-left px-2 py-1.5">Client</th>
              <th class="text-left px-2 py-1.5">Primary PM</th>
              <th class="text-right px-2 py-1.5">Open</th>
              <th class="text-left px-2 py-1.5">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in clientRows"
              :key="row.id"
              class="border-t border-base-200 hover:bg-base-200/40 cursor-pointer transition-colors"
              @click="goClient(row.id)"
            >
              <td class="px-2 py-2 font-medium">{{ row.name }}</td>
              <td class="px-2 py-2 text-base-content/70">{{ row.primary_pm }}</td>
              <td class="px-2 py-2 text-right font-mono tabular-nums">{{ row.open_tasks }}</td>
              <td class="px-2 py-2">
                <span class="inline-flex items-center gap-1.5 text-[0.7rem] capitalize">
                  <span
                    class="w-1.5 h-1.5 rounded-full"
                    :class="statusDot[row.status] ?? 'bg-base-content/30'"
                  />
                  {{ row.status }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="text-xs italic text-base-content/40 px-1 py-2">
        No clients yet.
      </p>
    </section>
  </div>
</template>
