<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  Building2,
  Plus,
  X,
  Search,
  Sparkles,
  ListTodo,
  Banknote,
  Settings2,
  Hash,
  ArrowDownWideNarrow
} from 'lucide-vue-next'
import HexAvatar from '@/components/shared/HexAvatar.vue'
import ClientDrawer from '@/components/workstation/ClientDrawer.vue'
import { useClientsStore, type Client, type ClientStatus } from '@/stores/clients'
import { localTimeIn } from '@/lib/timezones'
import { useAuthStore } from '@/stores/auth'
import { useTimeStore } from '@/stores/time'
import { useTeamStore } from '@/stores/team'
import { useTasksStore } from '@/stores/tasks'
import { useStatusesStore } from '@/stores/statuses'
import { useChannelsStore } from '@/stores/channels'

const clients = useClientsStore()
const auth = useAuthStore()
const time = useTimeStore()
const team = useTeamStore()
const tasks = useTasksStore()
const statusesStore = useStatusesStore()
const channels = useChannelsStore()

// Creating / archiving / editing client *records* is an admin-only action —
// PMs run accounts assigned to them by an admin, but they don't onboard
// new accounts. PMs still edit per-client details inside ClientDrawer.
const canManage = computed(() => auth.isAdmin)

const editingClientId = ref<string | null>(null)

// ── Tier / status / health chrome ─────────────────────────────────────────────
const TIER_META: Record<string, { label: string; color: string }> = {
  starter: { label: 'Starter', color: '#0d9488' },
  professional: { label: 'Professional', color: '#2f6fed' },
  specialist: { label: 'Specialist', color: '#7b2d86' },
  enterprise: { label: 'Enterprise', color: '#c2700c' },
}
const STATUS_META: Record<ClientStatus, { label: string; fg: string; bg: string }> = {
  active: { label: 'Active', fg: 'var(--st-done-fg)', bg: 'var(--st-done-bg)' },
  paused: { label: 'Paused', fg: 'var(--st-prog-fg)', bg: 'var(--st-prog-bg)' },
  archived: { label: 'Archived', fg: 'var(--st-todo-fg)', bg: 'var(--st-todo-bg)' },
}

// ── Per-client tallies from real stores ───────────────────────────────────────
const tallies = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const open: Record<string, number> = {}
  const overdue: Record<string, number> = {}
  for (const t of tasks.tasks) {
    if (!t.client_id) continue
    if (!statusesStore.isOpen(t.project_id, t.status)) continue
    open[t.client_id] = (open[t.client_id] ?? 0) + 1
    if (t.due_on && new Date(t.due_on + 'T00:00:00').getTime() < today.getTime()) {
      overdue[t.client_id] = (overdue[t.client_id] ?? 0) + 1
    }
  }
  return { open, overdue }
})

const vasByClient = computed<Record<string, string[]>>(() => {
  const m: Record<string, string[]> = {}
  for (const a of team.assignments) {
    if (a.status === 'ended') continue
    if (!m[a.client_id]) m[a.client_id] = []
    if (!m[a.client_id].includes(a.va_id)) m[a.client_id].push(a.va_id)
  }
  return m
})

/** Derived health — paused beats overdue beats empty-roster beats healthy. */
function healthOf(c: Client): { label: string; color: string } {
  if (c.status === 'paused') return { label: 'Paused', color: '#9a98a3' }
  if ((tallies.value.overdue[c.id] ?? 0) > 0) return { label: 'Watch', color: '#c2700c' }
  const noTeam = !(vasByClient.value[c.id]?.length)
  if (noTeam && (tallies.value.open[c.id] ?? 0) === 0) return { label: 'Onboarding', color: '#2f6fed' }
  return { label: 'Healthy', color: '#15803d' }
}

function channelOf(c: Client): string | null {
  // Channels load per-workspace, so this is best-effort — blank until known.
  return channels.channels.find((ch) => ch.client_id === c.id && !ch.is_dm)?.name ?? null
}

function sinceOf(c: Client) {
  return new Date(c.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function rate(amount: number | null) {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
}

const teamOf = computed(() => (c: Client) => {
  const pms = (clients.pmsByClient[c.id] ?? []).map((p) => p.pm_id)
  const vas = vasByClient.value[c.id] ?? []
  const name = (id: string) => team.profiles[id]?.full_name || team.profiles[id]?.email || '…'
  const avatar = (id: string) => team.profiles[id]?.avatar_url ?? null
  return {
    pms: pms.map((id) => ({ id, name: name(id), avatarUrl: avatar(id) })),
    vas: vas.map((id) => ({ id, name: name(id), avatarUrl: avatar(id) })),
  }
})

// PM/VA profiles referenced by the stacks may not be cached yet (the team
// store fills profiles from assignments lazily) — fetch the gaps as they appear.
watch(
  () => {
    const ids = new Set<string>()
    for (const c of clients.clients) {
      for (const p of clients.pmsByClient[c.id] ?? []) ids.add(p.pm_id)
      for (const id of vasByClient.value[c.id] ?? []) ids.add(id)
    }
    return [...ids]
  },
  (ids) => {
    const missing = ids.filter((id) => !team.profiles[id])
    if (missing.length) void team.fetchProfiles(missing)
  },
  { immediate: true }
)

// ── KPIs ──────────────────────────────────────────────────────────────────────
const kpis = computed(() => {
  const list = clients.clients
  const active = list.filter((c) => c.status === 'active')
  return {
    total: list.length,
    active: active.length,
    paused: list.filter((c) => c.status === 'paused').length,
    mrr: active.reduce((s, c) => s + (c.monthly_rate ?? 0), 0),
    ai: list.filter((c) => c.hivemind_enabled).length,
    open: Object.values(tallies.value.open).reduce((s, n) => s + n, 0),
  }
})

// ── Search / status filter / sort ─────────────────────────────────────────────
const search = ref('')
const statusFilter = ref<'all' | ClientStatus>('all')
const sort = ref<'name' | 'mrr' | 'open'>('name')

const statusCounts = computed(() => {
  const m: Record<string, number> = { all: clients.clients.length, active: 0, paused: 0, archived: 0 }
  for (const c of clients.clients) m[c.status] = (m[c.status] ?? 0) + 1
  return m
})
const STATUS_TABS: { value: 'all' | ClientStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'archived', label: 'Archived' },
]
const SORTS: Record<typeof sort.value, string> = { name: 'Name', mrr: 'Monthly rate', open: 'Open work' }

const shown = computed(() => {
  let list = clients.clients.filter((c) => {
    if (statusFilter.value !== 'all' && c.status !== statusFilter.value) return false
    if (search.value.trim() && !c.name.toLowerCase().includes(search.value.trim().toLowerCase())) return false
    return true
  })
  const cmp: Record<typeof sort.value, (a: Client, b: Client) => number> = {
    name: (a, b) => a.name.localeCompare(b.name),
    mrr: (a, b) => (b.monthly_rate ?? 0) - (a.monthly_rate ?? 0),
    open: (a, b) => (tallies.value.open[b.id] ?? 0) - (tallies.value.open[a.id] ?? 0),
  }
  return [...list].sort(cmp[sort.value])
})

// ── New-client modal ──────────────────────────────────────────────────────────
const creating = ref(false)
const newClientName = ref('')
const submitting = ref(false)
const createError = ref<string | null>(null)
const newNameInput = ref<HTMLInputElement | null>(null)

async function startCreate() {
  creating.value = true
  newClientName.value = ''
  createError.value = null
  await nextTick()
  newNameInput.value?.focus()
}
function cancelCreate() {
  creating.value = false
  newClientName.value = ''
  createError.value = null
}
async function submitCreate() {
  const name = newClientName.value.trim()
  if (!name || submitting.value) return
  submitting.value = true
  createError.value = null
  try {
    const row = await clients.createClient({ name })
    creating.value = false
    newClientName.value = ''
    // Open the drawer so the user can fill in the rest right away
    editingClientId.value = row.id
  } catch (e) {
    createError.value = e instanceof Error ? e.message : 'Could not create.'
  } finally {
    submitting.value = false
  }
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && creating.value) cancelCreate()
}
document.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))

// Ticking clock for each client's local time in the roster.
const now = ref(Date.now())
const clockTick = window.setInterval(() => (now.value = Date.now()), 30_000)
onBeforeUnmount(() => window.clearInterval(clockTick))

const GRID = 'minmax(230px,1.5fr) 130px 130px minmax(150px,1fr) 110px 170px'
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <header class="flex items-end gap-4 flex-wrap">
      <div class="flex items-center gap-3">
        <span class="w-10 h-10 rounded-xl grid place-items-center text-primary shrink-0" style="background: var(--accent-soft)">
          <Building2 class="w-5 h-5" :stroke-width="1.9" />
        </span>
        <div>
          <h1 class="font-display text-xl font-bold leading-tight">Clients</h1>
          <p class="text-xs text-base-content/60 mt-0.5">
            {{ canManage ? 'Manage clients, plans & assignments.' : 'Clients you are assigned to.' }}
          </p>
        </div>
      </div>
      <div class="flex-1" />
      <button
        v-if="canManage"
        type="button"
        class="btn btn-primary btn-sm gap-1.5"
        @click="startCreate"
      >
        <Plus class="w-4 h-4" :stroke-width="2" />
        New client
      </button>
    </header>

    <!-- KPI strip -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div class="cl-kpi">
        <div class="cl-kpi-label"><Building2 class="w-3.5 h-3.5" :stroke-width="1.75" /> Clients</div>
        <div class="cl-kpi-value">{{ kpis.total }}</div>
        <div class="cl-kpi-sub">{{ kpis.active }} active · {{ kpis.paused }} paused</div>
      </div>
      <div class="cl-kpi">
        <div class="cl-kpi-label"><Banknote class="w-3.5 h-3.5" :stroke-width="1.75" /> Monthly recurring</div>
        <div class="cl-kpi-value" style="color: var(--st-done-fg)">{{ rate(kpis.mrr) }}</div>
        <div class="cl-kpi-sub">from active clients</div>
      </div>
      <div class="cl-kpi">
        <div class="cl-kpi-label"><Sparkles class="w-3.5 h-3.5" :stroke-width="1.75" /> BuzzyHive AI</div>
        <div class="cl-kpi-value text-primary">{{ kpis.ai }}</div>
        <div class="cl-kpi-sub">clients with AI on</div>
      </div>
      <div class="cl-kpi">
        <div class="cl-kpi-label"><ListTodo class="w-3.5 h-3.5" :stroke-width="1.75" /> Open work</div>
        <div class="cl-kpi-value" style="color: var(--st-rev-fg)">{{ kpis.open }}</div>
        <div class="cl-kpi-sub">tasks across clients</div>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="flex items-center gap-2.5 flex-wrap">
      <label class="flex items-center gap-2 w-60 px-3 h-9 rounded-lg border border-base-300 bg-base-100 focus-within:border-primary">
        <Search class="w-4 h-4 text-base-content/50 shrink-0" :stroke-width="1.75" />
        <input
          v-model="search"
          type="text"
          placeholder="Search clients"
          class="flex-1 bg-transparent outline-none text-sm placeholder:text-base-content/40 min-w-0"
        />
      </label>

      <div class="flex gap-0.5 bg-base-200 p-[3px] rounded-lg">
        <button
          v-for="t in STATUS_TABS"
          :key="t.value"
          type="button"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all"
          :class="statusFilter === t.value ? 'bg-base-100 shadow-sm text-base-content' : 'text-base-content/60'"
          @click="statusFilter = t.value"
        >
          {{ t.label }}
          <span class="text-[0.68rem] opacity-60">{{ statusCounts[t.value] }}</span>
        </button>
      </div>

      <div class="flex-1" />

      <label class="flex items-center gap-1.5">
        <ArrowDownWideNarrow class="w-3.5 h-3.5 text-base-content/50" :stroke-width="1.75" />
        <select v-model="sort" class="select select-bordered select-sm w-36">
          <option v-for="(label, k) in SORTS" :key="k" :value="k">{{ label }}</option>
        </select>
      </label>
    </div>

    <div v-if="clients.loading && !clients.loaded" class="text-base-content/60 text-sm">Loading…</div>

    <!-- Empty -->
    <div
      v-else-if="!clients.hasClients"
      class="py-14 text-center text-base-content/50"
    >
      <Building2 class="w-8 h-8 mx-auto text-base-content/30" :stroke-width="1.5" />
      <p class="mt-3 text-sm font-medium">No clients yet</p>
      <p class="text-xs mt-1">
        {{ canManage
          ? 'Create your first client and assign a VA to get started.'
          : 'You have no active assignments. Reach out to your PM to get set up.' }}
      </p>
    </div>

    <!-- Roster -->
    <div v-else class="border border-base-300 rounded-[13px] overflow-x-auto bg-base-100 shadow-[var(--sh-card)]">
      <div class="min-w-[920px]">
        <div
          class="grid items-center gap-4 px-4 h-[42px] border-b border-base-300 bg-base-200/60"
          :style="{ gridTemplateColumns: GRID }"
        >
          <span class="cl-head">Client</span>
          <span class="cl-head">Status</span>
          <span class="cl-head">Plan</span>
          <span class="cl-head">Team</span>
          <span class="cl-head">Open</span>
          <span class="cl-head text-right">Actions</span>
        </div>

        <div
          v-for="c in shown"
          :key="c.id"
          class="grid items-center gap-4 px-4 h-[68px] border-b border-base-200 last:border-b-0 hover:bg-base-200/40 transition-colors cursor-pointer"
          :style="{ gridTemplateColumns: GRID }"
          @click="editingClientId = c.id"
        >
          <!-- client -->
          <div class="flex items-center gap-3 min-w-0">
            <HexAvatar :name="c.name" :size="40" tint="primary" />
            <div class="min-w-0">
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-sm font-bold truncate">{{ c.name }}</span>
                <span
                  v-if="c.hivemind_enabled"
                  class="inline-flex items-center gap-1 px-1.5 py-px rounded-md bg-primary text-primary-content text-[0.62rem] font-bold shrink-0"
                  title="BuzzyHive AI enabled"
                >
                  <Sparkles class="w-2.5 h-2.5" :stroke-width="2" /> AI
                </span>
              </div>
              <div class="flex items-center gap-1.5 text-[0.72rem] text-base-content/50 mt-0.5 min-w-0">
                <span v-if="channelOf(c)" class="inline-flex items-center gap-0.5 truncate">
                  <Hash class="w-2.5 h-2.5 shrink-0" :stroke-width="2.25" />{{ channelOf(c) }}
                </span>
                <span v-else>no channel</span>
                <span class="w-[3px] h-[3px] rounded-full bg-base-content/30 shrink-0" />
                <span class="whitespace-nowrap">since {{ sinceOf(c) }}</span>
                <template v-if="c.timezone && localTimeIn(c.timezone, now)">
                  <span class="w-[3px] h-[3px] rounded-full bg-base-content/30 shrink-0" />
                  <span class="whitespace-nowrap tabular-nums">{{ localTimeIn(c.timezone, now) }} local</span>
                </template>
              </div>
            </div>
          </div>

          <!-- status + health -->
          <div class="flex flex-col items-start gap-1">
            <span
              class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[0.72rem] font-semibold"
              :style="{ background: STATUS_META[c.status].bg, color: STATUS_META[c.status].fg }"
            >
              <span class="w-[5px] h-[5px] rounded-full bg-current" />{{ STATUS_META[c.status].label }}
            </span>
            <span class="inline-flex items-center gap-1.5 pl-0.5 text-[0.7rem] font-semibold" :style="{ color: healthOf(c).color }">
              <span class="w-1.5 h-1.5 rounded-full" :style="{ background: healthOf(c).color }" />{{ healthOf(c).label }}
            </span>
          </div>

          <!-- plan -->
          <div>
            <span
              v-if="c.tier && TIER_META[c.tier]"
              class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[7px] text-xs font-semibold whitespace-nowrap"
              :style="{
                background: `color-mix(in oklab, ${TIER_META[c.tier].color} 11%, var(--color-base-100))`,
                color: TIER_META[c.tier].color,
              }"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-current" />{{ TIER_META[c.tier].label }}
            </span>
            <span
              v-else
              class="inline-flex items-center px-2.5 py-0.5 rounded-[7px] text-[0.72rem] font-semibold whitespace-nowrap"
              style="background: var(--st-prog-bg); color: var(--st-prog-fg)"
            >Set up plan</span>
            <div class="text-[0.8rem] font-bold tabular-nums mt-1.5" :class="!c.monthly_rate && 'text-base-content/40'">
              {{ c.monthly_rate ? rate(c.monthly_rate) + '/mo' : '—' }}
            </div>
          </div>

          <!-- team -->
          <div class="flex items-center gap-3.5">
            <div v-for="group in (['pms', 'vas'] as const)" :key="group" class="flex flex-col gap-[3px]">
              <span class="text-[0.6rem] font-bold tracking-wide text-base-content/40">{{ group === 'pms' ? 'PM' : 'VAs' }}</span>
              <span v-if="teamOf(c)[group].length === 0" class="text-xs text-base-content/40">—</span>
              <div v-else class="flex items-center">
                <span
                  v-for="(p, i) in teamOf(c)[group].slice(0, 3)"
                  :key="p.id"
                  class="rounded-lg ring-2 ring-base-100"
                  :class="i > 0 && '-ml-1.5'"
                  :title="p.name"
                >
                  <HexAvatar :name="p.name" :avatar-url="p.avatarUrl" :size="24" />
                </span>
                <span
                  v-if="teamOf(c)[group].length > 3"
                  class="-ml-1.5 w-6 h-6 rounded-lg ring-2 ring-base-100 bg-base-200 text-base-content/70 text-[0.65rem] font-bold grid place-items-center"
                >+{{ teamOf(c)[group].length - 3 }}</span>
              </div>
            </div>
          </div>

          <!-- open -->
          <div class="flex items-center gap-1.5">
            <span
              class="inline-flex items-center justify-center min-w-[26px] h-6 px-2 rounded-lg text-[0.8rem] font-bold tabular-nums"
              :style="(tallies.open[c.id] ?? 0)
                ? 'background: var(--st-rev-bg); color: var(--st-rev-fg)'
                : 'background: var(--color-base-200); color: var(--color-base-content); opacity: .5'"
            >{{ tallies.open[c.id] ?? 0 }}</span>
            <span class="text-xs text-base-content/50">open</span>
          </div>

          <!-- actions -->
          <div class="flex items-center justify-end gap-2" @click.stop>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-base-300 text-xs font-semibold text-base-content/70 hover:border-primary/40 hover:text-base-content transition-colors"
              @click="editingClientId = c.id"
            >
              <Settings2 class="w-3.5 h-3.5" :stroke-width="1.75" /> Edit
            </button>
            <span v-if="c.id === clients.currentClientId" class="text-xs font-semibold text-base-content/40 px-2">Selected</span>
            <button
              v-else
              type="button"
              class="h-8 px-3 rounded-lg text-xs font-bold text-primary transition-opacity hover:opacity-80"
              style="background: var(--accent-soft)"
              @click="time.requestSwitch(c.id)"
            >
              Switch to
            </button>
          </div>
        </div>

        <div v-if="shown.length === 0" class="py-12 text-center text-base-content/50">
          <Building2 class="w-7 h-7 mx-auto text-base-content/30" :stroke-width="1.5" />
          <p class="mt-2.5 text-sm">No clients match.</p>
        </div>
      </div>
    </div>

    <!-- New-client modal -->
    <Teleport to="body">
      <Transition name="cl-fade">
        <div v-if="creating" class="fixed inset-0 z-50 bg-black/40" @click="cancelCreate" />
      </Transition>
      <Transition name="cl-pop">
        <div v-if="creating" class="fixed inset-0 z-[51] grid place-items-center p-4 pointer-events-none">
          <form
            class="pointer-events-auto w-[460px] max-w-full bg-base-100 rounded-2xl border border-base-300 shadow-2xl overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-label="New client"
            @submit.prevent="submitCreate"
          >
            <div class="flex items-center gap-2.5 px-4 py-3.5 border-b border-base-300">
              <span class="w-8 h-8 rounded-lg grid place-items-center text-primary" style="background: var(--accent-soft)">
                <Building2 class="w-4 h-4" :stroke-width="2" />
              </span>
              <div class="flex-1">
                <div class="text-[0.95rem] font-bold leading-tight">New client</div>
                <div class="text-[0.72rem] text-base-content/50">You'll be set as the primary PM.</div>
              </div>
              <button type="button" class="btn btn-ghost btn-sm btn-circle" aria-label="Close" @click="cancelCreate">
                <X class="w-4 h-4" :stroke-width="2" />
              </button>
            </div>
            <div class="p-4">
              <div class="text-[0.65rem] font-bold uppercase tracking-wider text-base-content/40 mb-1.5">Client name</div>
              <input
                ref="newNameInput"
                v-model="newClientName"
                type="text"
                placeholder="e.g. Acme Co"
                class="w-full h-11 px-3 rounded-lg border border-base-300 bg-base-200/40 text-[0.95rem] font-semibold outline-none focus:border-primary"
              />
              <p class="text-xs text-base-content/50 mt-2 leading-relaxed">Edit tier, rate, team and notes in the next step.</p>
              <p v-if="createError" class="text-xs text-error mt-2">{{ createError }}</p>
            </div>
            <div class="px-4 pb-4 flex justify-end gap-2">
              <button type="button" class="btn btn-ghost btn-sm" :disabled="submitting" @click="cancelCreate">Cancel</button>
              <button type="submit" class="btn btn-primary btn-sm gap-1.5" :disabled="!newClientName.trim() || submitting">
                <Plus class="w-3.5 h-3.5" :stroke-width="2" />
                {{ submitting ? 'Creating…' : 'Create & edit' }}
              </button>
            </div>
          </form>
        </div>
      </Transition>
    </Teleport>

    <ClientDrawer :client-id="editingClientId" @close="editingClientId = null" />
  </div>
</template>

<style scoped>
.cl-kpi {
  padding: 13px 16px;
  border-radius: 13px;
  border: 1px solid var(--color-base-300);
  background: var(--color-base-100);
  box-shadow: var(--sh-card);
  min-width: 0;
}
.cl-kpi-label {
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
.cl-kpi-value {
  font-size: 1.4rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.cl-kpi-sub {
  font-size: 0.7rem;
  color: var(--color-base-content);
  opacity: 0.45;
  margin-top: 5px;
  white-space: nowrap;
}
.cl-head {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-base-content);
  opacity: 0.45;
  white-space: nowrap;
}

.cl-fade-enter-active,
.cl-fade-leave-active { transition: opacity 0.18s ease; }
.cl-fade-enter-from,
.cl-fade-leave-to { opacity: 0; }

.cl-pop-enter-active { transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.2, 0.9, 0.3, 1.15); }
.cl-pop-leave-active { transition: opacity 0.14s ease-in, transform 0.14s ease-in; }
.cl-pop-enter-from,
.cl-pop-leave-to { opacity: 0; transform: scale(0.96) translateY(8px); }
</style>
