<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  UsersRound,
  Search,
  Clock,
  ListTodo,
  Gauge,
  Flag,
  UserPlus,
  Send,
  RotateCw,
  X,
  AlertTriangle,
  Rows3,
  LayoutGrid
} from 'lucide-vue-next'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'
import { useTasksStore } from '@/stores/tasks'
import { useStatusesStore } from '@/stores/statuses'
import { useTeamStore, type MemberProfile } from '@/stores/team'
import { useInvitesStore, type InviteRole } from '@/stores/invites'
import { useOnlinePresence } from '@/composables/useOnlinePresence'
import VADetail from '@/components/workstation/VADetail.vue'
import TeamRosterTable from '@/components/workstation/team/TeamRosterTable.vue'
import TeamRosterCards from '@/components/workstation/team/TeamRosterCards.vue'
import { utilOf, utilColor, formatHours, type TeamMemberRow } from '@/components/workstation/team/capacity'

const props = defineProps<{ vaId?: string }>()

const auth = useAuthStore()
const clients = useClientsStore()
const tasks = useTasksStore()
const statusesStore = useStatusesStore()
const team = useTeamStore()
const invites = useInvitesStore()
const { online } = useOnlinePresence()
const router = useRouter()

// ── Invitations + deactivation (admin only) ──────────────────────────────────
const toast = ref<{ msg: string; error?: boolean } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | undefined
function fireToast(msg: string, error = false) {
  toast.value = { msg, error }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = null), 4200)
}
watch(() => invites.error, (msg) => {
  if (!msg) return
  fireToast(msg, true)
  invites.error = null
})

const inviteOpen = ref(false)
const inviteSending = ref(false)
const inviteForm = ref({ email: '', fullName: '', role: 'va' as InviteRole, clientId: '' })
const inviteEmailEl = ref<HTMLInputElement | null>(null)

function openInvite() {
  inviteOpen.value = true
  void nextTick(() => inviteEmailEl.value?.focus())
}
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (inviteOpen.value) inviteOpen.value = false
  else if (selectedId.value) clearSelection()
}
document.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))

const roleOptions = computed<{ value: InviteRole; label: string }[]>(() => {
  const base: { value: InviteRole; label: string }[] = [
    { value: 'va', label: 'VA' },
    { value: 'pm', label: 'Project manager' },
    { value: 'sales', label: 'Sales' },
    { value: 'client', label: 'Client user' },
  ]
  if (auth.isSuperadmin) base.push({ value: 'admin', label: 'Admin' })
  return base
})

const pendingInvites = computed(() => invites.invites.filter((i) => i.status === 'sent'))

async function submitInvite() {
  const f = inviteForm.value
  if (!f.email.trim() || inviteSending.value) return
  if (f.role === 'client' && !f.clientId) return
  inviteSending.value = true
  try {
    const ok = await invites.invite({
      email: f.email,
      role: f.role,
      clientId: f.role === 'client' ? f.clientId : null,
      fullName: f.fullName,
    })
    if (ok) {
      fireToast('Invitation sent to ' + f.email.trim())
      inviteOpen.value = false
      inviteForm.value = { email: '', fullName: '', role: 'va', clientId: '' }
    }
  } finally {
    inviteSending.value = false
  }
}
async function revokeInvite(id: string, email: string) {
  if (!window.confirm('Revoke the invitation to ' + email + '?')) return
  if (await invites.revoke(id)) fireToast('Invitation revoked')
}
async function resendInvite(id: string, email: string) {
  if (await invites.resend(id)) fireToast('Invitation re-sent to ' + email)
}

async function toggleActive(id: string) {
  const m = team.profiles[id] ?? team.myTeam.find((x) => x.id === id)
  if (!m) return
  const next = m.is_active === false
  const verb = next ? 'Reactivate' : 'Deactivate'
  if (!window.confirm(verb + ' ' + (m.full_name || m.email || 'this person') + '?'
      + (next ? '' : ' They lose all access immediately; history is kept.'))) return
  if (await invites.setActive(m.id, next)) {
    // fetchProfiles caches by id — patch the roster entry directly.
    team.profiles[m.id] = { ...(m as MemberProfile), is_active: next }
    fireToast((m.full_name || m.email || 'Account') + (next ? ' reactivated' : ' deactivated'))
  }
}

watch(
  () => auth.isAdmin,
  (is) => { if (is) void invites.load() },
  { immediate: true }
)

// ── Hours this week per member ────────────────────────────────────────────────
const hoursByVa = ref<Record<string, number>>({})

async function loadHoursThisWeek() {
  try {
    const monday = new Date()
    monday.setHours(0, 0, 0, 0)
    monday.setDate(monday.getDate() - monday.getDay())
    const { data, error } = await supabase
      .from('time_entries')
      .select('va_id, started_at, ended_at')
      .gte('started_at', monday.toISOString())
    if (error) throw error
    const map: Record<string, number> = {}
    for (const e of (data ?? []) as any[]) {
      if (!e.va_id) continue
      const start = new Date(e.started_at).getTime()
      const end = e.ended_at ? new Date(e.ended_at).getTime() : Date.now()
      map[e.va_id] = (map[e.va_id] ?? 0) + Math.max(0, Math.floor((end - start) / 1000))
    }
    hoursByVa.value = map
  } catch (e) {
    console.warn('[team] hours:', (e as Error).message)
  }
}

watch(
  () => auth.isAuthenticated,
  (is) => { if (is) void loadHoursThisWeek() },
  { immediate: true }
)

// ── Per-member task tallies (open / overdue / done this week) ─────────────────
const taskTallies = computed(() => {
  const monday = new Date()
  monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() - monday.getDay())
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const open: Record<string, number> = {}
  const overdue: Record<string, number> = {}
  const done: Record<string, number> = {}
  for (const t of tasks.tasks) {
    if (!t.assignee_id) continue
    if (statusesStore.isOpen(t.project_id, t.status)) {
      open[t.assignee_id] = (open[t.assignee_id] ?? 0) + 1
      if (t.due_on && new Date(t.due_on + 'T00:00:00').getTime() < today.getTime()) {
        overdue[t.assignee_id] = (overdue[t.assignee_id] ?? 0) + 1
      }
    } else if (
      statusesStore.isDone(t.project_id, t.status) &&
      t.completed_at &&
      new Date(t.completed_at).getTime() >= monday.getTime()
    ) {
      done[t.assignee_id] = (done[t.assignee_id] ?? 0) + 1
    }
  }
  return { open, overdue, done }
})

// ── Filters / sort / view ─────────────────────────────────────────────────────
const search = ref('')
const roleFilter = ref<'all' | 'va' | 'pm' | 'admin'>('all')
const clientFilter = ref<'all' | string>('all')
const sort = ref<'workload' | 'name' | 'open' | 'overdue' | 'hours'>('workload')
const view = ref<'table' | 'cards'>('table')

const ROLE_TABS: { value: typeof roleFilter.value; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'va', label: 'VAs' },
  { value: 'pm', label: 'PMs' },
  { value: 'admin', label: 'Admins' },
]
const SORTS: Record<typeof sort.value, string> = {
  workload: 'Workload',
  name: 'Name',
  open: 'Open tasks',
  overdue: 'Overdue',
  hours: 'Hours',
}

function rowOf(m: MemberProfile): TeamMemberRow {
  const seconds = hoursByVa.value[m.id] ?? 0
  const assignments = (team.assignmentsByVa[m.id] ?? []).filter((a) => a.status !== 'ended')
  return {
    id: m.id,
    name: m.full_name || m.email || 'Unknown',
    email: m.email ?? '—',
    avatarUrl: m.avatar_url,
    role: m.role,
    timezone: m.timezone,
    inactive: m.is_active === false,
    online: !!online.value[m.id],
    seconds,
    util: utilOf(seconds),
    open: taskTallies.value.open[m.id] ?? 0,
    overdue: taskTallies.value.overdue[m.id] ?? 0,
    done: taskTallies.value.done[m.id] ?? 0,
    clients: assignments
      .map((a) => clients.clients.find((c) => c.id === a.client_id))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => ({ id: c.id, name: c.name })),
  }
}

const allRows = computed(() => team.myTeam.map(rowOf))

const rows = computed(() => {
  let list = allRows.value.filter((r) => {
    if (roleFilter.value !== 'all') {
      const match = roleFilter.value === 'admin'
        ? r.role === 'admin' || r.role === 'superadmin'
        : r.role === roleFilter.value
      if (!match) return false
    }
    if (clientFilter.value !== 'all' && !r.clients.some((c) => c.id === clientFilter.value)) return false
    if (search.value.trim()) {
      const q = search.value.trim().toLowerCase()
      if (!`${r.name} ${r.email}`.toLowerCase().includes(q)) return false
    }
    return true
  })
  const cmp: Record<typeof sort.value, (a: TeamMemberRow, b: TeamMemberRow) => number> = {
    workload: (a, b) => b.util - a.util,
    name: (a, b) => a.name.localeCompare(b.name),
    open: (a, b) => b.open - a.open,
    overdue: (a, b) => b.overdue - a.overdue,
    hours: (a, b) => b.seconds - a.seconds,
  }
  return [...list].sort(cmp[sort.value])
})

// ── KPIs (whole team, unfiltered) ─────────────────────────────────────────────
const kpis = computed(() => {
  const all = allRows.value
  const totalSeconds = all.reduce((s, r) => s + r.seconds, 0)
  const avgUtil = all.length ? all.reduce((s, r) => s + r.util, 0) / all.length : 0
  return {
    members: all.length,
    vas: all.filter((r) => r.role === 'va').length,
    onlineNow: all.filter((r) => r.online).length,
    hours: formatHours(totalSeconds),
    avgUtil,
    avgUtilColor: utilColor(avgUtil),
    open: all.reduce((s, r) => s + r.open, 0),
    overdue: all.reduce((s, r) => s + r.overdue, 0),
  }
})

// ── Selection — synced to /app/team/:vaId, shown as a slide-out ───────────────
const selectedId = computed(() => props.vaId ?? null)
const selectedVa = computed(() =>
  selectedId.value ? team.profiles[selectedId.value] ?? team.myTeam.find((x) => x.id === selectedId.value) ?? null : null
)

function selectVa(id: string) {
  router.push({ name: 'workstation-team', params: { vaId: id } })
}
function clearSelection() {
  router.push({ name: 'workstation-team', params: {} })
}
</script>

<template>
  <div class="space-y-4">
    <!-- Page header -->
    <header class="flex items-end gap-4 flex-wrap">
      <div class="flex items-center gap-3">
        <span class="w-10 h-10 rounded-xl grid place-items-center text-primary shrink-0" style="background: var(--accent-soft)">
          <UsersRound class="w-5 h-5" :stroke-width="1.9" />
        </span>
        <div>
          <h1 class="font-display text-xl font-bold leading-tight">Team</h1>
          <p class="text-xs text-base-content/60 mt-0.5">
            Everyone across the agency — capacity, workload &amp; assignments.
          </p>
        </div>
      </div>
      <div class="flex-1" />
      <button
        v-if="auth.isAdmin"
        type="button"
        class="btn btn-primary btn-sm gap-1.5"
        @click="openInvite"
      >
        <UserPlus class="w-4 h-4" :stroke-width="2" />
        Invite member
      </button>
    </header>

    <!-- KPI strip -->
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <div class="team-kpi">
        <div class="team-kpi-label"><UsersRound class="w-3.5 h-3.5" :stroke-width="1.75" /> Members</div>
        <div class="team-kpi-value">{{ kpis.members }}</div>
        <div class="team-kpi-sub">{{ kpis.vas }} VAs · {{ kpis.onlineNow }} online now</div>
      </div>
      <div class="team-kpi">
        <div class="team-kpi-label"><Clock class="w-3.5 h-3.5" :stroke-width="1.75" /> Hours this week</div>
        <div class="team-kpi-value">{{ kpis.hours }}</div>
        <div class="team-kpi-sub">across {{ kpis.members }} members</div>
      </div>
      <div class="team-kpi">
        <div class="team-kpi-label"><Gauge class="w-3.5 h-3.5" :stroke-width="1.75" /> Avg utilization</div>
        <div class="team-kpi-value" :style="{ color: kpis.avgUtilColor }">{{ Math.round(kpis.avgUtil * 100) }}%</div>
        <div class="h-[5px] rounded-full bg-base-200 overflow-hidden mt-2">
          <div class="h-full rounded-full" :style="{ width: Math.min(kpis.avgUtil * 100, 100) + '%', background: kpis.avgUtilColor }" />
        </div>
      </div>
      <div class="team-kpi">
        <div class="team-kpi-label"><ListTodo class="w-3.5 h-3.5" :stroke-width="1.75" /> Open tasks</div>
        <div class="team-kpi-value" style="color: var(--st-rev-fg)">{{ kpis.open }}</div>
        <div class="team-kpi-sub">in flight team-wide</div>
      </div>
      <div class="team-kpi">
        <div class="team-kpi-label"><Flag class="w-3.5 h-3.5" :stroke-width="1.75" /> Overdue</div>
        <div class="team-kpi-value" :style="kpis.overdue > 0 ? 'color: var(--st-block-fg)' : ''">{{ kpis.overdue }}</div>
        <div class="team-kpi-sub">{{ kpis.overdue > 0 ? 'needs attention' : 'all on time' }}</div>
      </div>
    </div>

    <!-- Pending invitations (admin) -->
    <div
      v-if="auth.isAdmin && pendingInvites.length"
      class="rounded-xl border border-base-300 bg-base-200/40 px-3 py-2 flex items-center gap-2 flex-wrap"
    >
      <span class="text-[0.65rem] uppercase tracking-wider font-semibold text-base-content/50">
        Pending invites
      </span>
      <span
        v-for="i in pendingInvites"
        :key="i.id"
        class="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full border border-base-300 bg-base-100 text-xs"
      >
        <Send class="w-3 h-3 text-base-content/40" :stroke-width="1.75" />
        <span class="font-medium">{{ i.email }}</span>
        <span class="text-base-content/40 uppercase text-[0.6rem] font-semibold">{{ i.role }}</span>
        <button
          type="button"
          class="w-5 h-5 rounded-full grid place-items-center text-base-content/40 hover:text-base-content hover:bg-base-200"
          title="Resend invitation"
          @click="resendInvite(i.id, i.email)"
        >
          <RotateCw class="w-3 h-3" :stroke-width="2" />
        </button>
        <button
          type="button"
          class="w-5 h-5 rounded-full grid place-items-center text-base-content/40 hover:text-error hover:bg-base-200"
          title="Revoke invitation"
          @click="revokeInvite(i.id, i.email)"
        >
          <X class="w-3 h-3" :stroke-width="2" />
        </button>
      </span>
    </div>

    <!-- Toolbar -->
    <div class="flex items-center gap-2.5 flex-wrap">
      <label
        class="flex items-center gap-2 w-60 px-3 h-9 rounded-lg border border-base-300 bg-base-100 focus-within:border-primary"
      >
        <Search class="w-4 h-4 text-base-content/50 shrink-0" :stroke-width="1.75" />
        <input
          v-model="search"
          type="text"
          placeholder="Search name or email"
          class="flex-1 bg-transparent outline-none text-sm placeholder:text-base-content/40 min-w-0"
        />
      </label>

      <!-- role segmented -->
      <div class="flex gap-0.5 bg-base-200 p-[3px] rounded-lg">
        <button
          v-for="t in ROLE_TABS"
          :key="t.value"
          type="button"
          class="px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all"
          :class="roleFilter === t.value ? 'bg-base-100 shadow-sm text-base-content' : 'text-base-content/60'"
          @click="roleFilter = t.value"
        >{{ t.label }}</button>
      </div>

      <select v-model="clientFilter" class="select select-bordered select-sm w-40">
        <option value="all">All clients</option>
        <option v-for="c in clients.clients" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>

      <div class="flex-1" />

      <select v-model="sort" class="select select-bordered select-sm w-36">
        <option v-for="(label, k) in SORTS" :key="k" :value="k">{{ label }}</option>
      </select>

      <!-- view toggle -->
      <div class="flex gap-0.5 bg-base-200 p-[3px] rounded-lg">
        <button
          v-for="[k, icon, label] in ([['table', Rows3, 'Roster'], ['cards', LayoutGrid, 'Cards']] as const)"
          :key="k"
          type="button"
          class="w-9 h-8 rounded-md grid place-items-center transition-all"
          :class="view === k ? 'bg-base-100 shadow-sm text-base-content' : 'text-base-content/50'"
          :title="label"
          @click="view = k"
        >
          <component :is="icon" class="w-4 h-4" :stroke-width="1.9" />
        </button>
      </div>
    </div>

    <!-- Roster -->
    <div
      v-if="rows.length === 0"
      class="py-14 text-center text-base-content/50"
    >
      <UsersRound class="w-8 h-8 mx-auto text-base-content/30" :stroke-width="1.5" />
      <p class="mt-3 text-sm font-medium">
        {{ team.myTeam.length === 0
          ? (auth.isAdmin ? 'No members in the system yet.' : 'No VAs assigned to you yet.')
          : 'No members match your filters.' }}
      </p>
    </div>
    <TeamRosterTable
      v-else-if="view === 'table'"
      :rows="rows"
      :admin="auth.isAdmin"
      @open="selectVa"
      @toggle-active="toggleActive"
    />
    <TeamRosterCards v-else :rows="rows" @open="selectVa" />

    <!-- Member detail slide-out -->
    <Teleport to="body">
      <Transition name="tv-fade">
        <div
          v-if="selectedVa"
          class="fixed inset-0 z-[70] bg-black/30"
          @click="clearSelection"
        />
      </Transition>
      <Transition name="tv-slide">
        <div
          v-if="selectedVa"
          class="fixed top-0 right-0 bottom-0 z-[71] w-[500px] max-w-[95vw] bg-base-100 border-l border-base-300 shadow-2xl"
        >
          <VADetail :key="selectedId ?? 'none'" :va-id="selectedId!" @back="clearSelection" />
        </div>
      </Transition>
    </Teleport>

    <!-- Invite modal -->
    <Teleport to="body">
      <Transition name="tv-fade">
        <div v-if="inviteOpen" class="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]" @click="inviteOpen = false" />
      </Transition>
      <Transition name="tv-pop">
        <div v-if="inviteOpen" class="fixed inset-0 z-[51] grid place-items-center p-4 pointer-events-none">
          <div
            class="pointer-events-auto w-[26rem] max-w-full max-h-[90vh] overflow-y-auto bg-base-100 rounded-2xl border border-base-300 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Invite someone"
          >
            <form class="p-5" @submit.prevent="submitInvite">
              <div class="flex items-center gap-3 mb-5">
                <span class="w-10 h-10 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                  <UserPlus class="w-5 h-5" :stroke-width="2" />
                </span>
                <div class="flex-1 min-w-0">
                  <h2 class="font-display text-base font-semibold leading-tight">Invite someone</h2>
                  <p class="text-xs text-base-content/60 mt-0.5">They get an email link to set up their account.</p>
                </div>
                <button type="button" class="btn btn-ghost btn-sm btn-circle shrink-0" aria-label="Close" @click="inviteOpen = false">
                  <X class="w-4 h-4" :stroke-width="2" />
                </button>
              </div>

              <div class="space-y-4">
                <div>
                  <label for="tv-inv-email" class="block text-xs font-medium text-base-content/70 mb-1.5">
                    Email <span class="text-error">*</span>
                  </label>
                  <input
                    id="tv-inv-email"
                    ref="inviteEmailEl"
                    v-model="inviteForm.email"
                    type="email"
                    required
                    class="input input-bordered input-sm w-full"
                    placeholder="person@example.com"
                  />
                </div>

                <div>
                  <label for="tv-inv-name" class="block text-xs font-medium text-base-content/70 mb-1.5">
                    Full name
                  </label>
                  <input
                    id="tv-inv-name"
                    v-model="inviteForm.fullName"
                    type="text"
                    class="input input-bordered input-sm w-full"
                    placeholder="Optional — they can set it later"
                  />
                </div>

                <div class="grid grid-cols-2 gap-3">
                  <div :class="inviteForm.role !== 'client' && 'col-span-2'">
                    <label for="tv-inv-role" class="block text-xs font-medium text-base-content/70 mb-1.5">
                      Role <span class="text-error">*</span>
                    </label>
                    <select id="tv-inv-role" v-model="inviteForm.role" class="select select-bordered select-sm w-full">
                      <option v-for="r in roleOptions" :key="r.value" :value="r.value">{{ r.label }}</option>
                    </select>
                  </div>
                  <div v-if="inviteForm.role === 'client'">
                    <label for="tv-inv-client" class="block text-xs font-medium text-base-content/70 mb-1.5">
                      Workspace <span class="text-error">*</span>
                    </label>
                    <select id="tv-inv-client" v-model="inviteForm.clientId" class="select select-bordered select-sm w-full">
                      <option value="" disabled>Pick a client</option>
                      <option v-for="c in clients.clients" :key="c.id" :value="c.id">{{ c.name }}</option>
                    </select>
                  </div>
                </div>

                <p v-if="inviteForm.role === 'client'" class="text-[0.7rem] text-base-content/50 leading-relaxed rounded-lg bg-base-200/60 px-3 py-2">
                  Heads up: the client portal is still in progress — client users will have very limited access until it ships.
                </p>
              </div>

              <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-base-300/60">
                <button type="button" class="btn btn-ghost btn-sm" @click="inviteOpen = false">Cancel</button>
                <button
                  type="submit"
                  class="btn btn-primary btn-sm gap-1.5"
                  :disabled="!inviteForm.email.trim() || (inviteForm.role === 'client' && !inviteForm.clientId) || inviteSending"
                >
                  <Send class="w-3.5 h-3.5" :stroke-width="2" />
                  {{ inviteSending ? 'Sending…' : 'Send invite' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Transition>

      <!-- toast -->
      <Transition
        enter-active-class="transition-all duration-200"
        enter-from-class="opacity-0 translate-y-2"
        leave-active-class="transition-opacity duration-150"
        leave-to-class="opacity-0"
      >
        <div
          v-if="toast"
          class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] flex items-center gap-2.5 px-4 py-3 rounded-xl border border-base-300 bg-base-100 shadow-2xl"
        >
          <AlertTriangle v-if="toast.error" class="w-4 h-4 text-error shrink-0" :stroke-width="2" />
          <Send v-else class="w-4 h-4 text-success shrink-0" :stroke-width="2" />
          <span class="text-sm">{{ toast.msg }}</span>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.team-kpi {
  padding: 13px 16px;
  border-radius: 13px;
  border: 1px solid var(--color-base-300);
  background: var(--color-base-100);
  box-shadow: var(--sh-card);
  min-width: 0;
}
.team-kpi-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-base-content);
  opacity: 0.45;
  margin-bottom: 9px;
  white-space: nowrap;
}
.team-kpi-value {
  font-size: 1.45rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.team-kpi-sub {
  font-size: 0.7rem;
  color: var(--color-base-content);
  opacity: 0.45;
  margin-top: 5px;
  white-space: nowrap;
}

.tv-fade-enter-active,
.tv-fade-leave-active { transition: opacity 0.18s ease; }
.tv-fade-enter-from,
.tv-fade-leave-to { opacity: 0; }

.tv-pop-enter-active { transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.2, 0.9, 0.3, 1.15); }
.tv-pop-leave-active { transition: opacity 0.14s ease-in, transform 0.14s ease-in; }
.tv-pop-enter-from,
.tv-pop-leave-to { opacity: 0; transform: scale(0.96) translateY(8px); }

.tv-slide-enter-active { transition: transform 0.22s cubic-bezier(0.2, 0.8, 0.3, 1), opacity 0.22s ease; }
.tv-slide-leave-active { transition: transform 0.16s ease-in, opacity 0.16s ease-in; }
.tv-slide-enter-from,
.tv-slide-leave-to { transform: translateX(24px); opacity: 0; }
</style>
