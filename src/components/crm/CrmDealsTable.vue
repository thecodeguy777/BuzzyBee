<script setup lang="ts">
// Dense, segmented, sortable, searchable, paginated TABLE view of the pipeline.
// The kanban board collapses past ~50 cards; this is the high-volume surface —
// triage thousands of deals with segments, search, sort, bulk actions, then open
// any row in the existing CrmDealDetail panel (same path the board uses).
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { Component } from 'vue'
import {
  Plus, Search, Filter, Check, X, ChevronDown, ChevronUp, ChevronsUpDown, ChevronLeft, ChevronRight,
  Users, UserPlus, UserCheck, Flame, Sparkles, Trophy, XCircle, Clock, Flag, ArrowUpRight, Trash2, Loader2,
} from 'lucide-vue-next'
import CrmAvatar from './CrmAvatar.vue'
import { useCrmStore } from '@/stores/crm'
import { useTeamStore, type MemberProfile } from '@/stores/team'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'
import { STAGES, LOST, SOURCES, HEALTH, fmtMoney, relTime, type Deal, type StageId } from '@/lib/crmData'

const props = defineProps<{ deals: Deal[] }>()
const emit = defineEmits<{
  (e: 'open', deal: Deal): void
  (e: 'move', id: string, stage: StageId): void
  (e: 'new-deal', stage: StageId): void
  (e: 'toast', title: string, sub?: string): void
}>()

const crm = useCrmStore()
const team = useTeamStore()
const auth = useAuthStore()
const clients = useClientsStore()

// Writes are RLS-scoped to pm/admin/superadmin (is_ops); only show the
// destructive Delete to those roles so VAs don't hit a permission error.
const canManage = computed(() => auth.isAdmin || auth.role === 'pm')

const ALL_STAGES = [...STAGES, LOST]
const PAGE_SIZE = 50
// select | Deal | Company | Stage | Source | Value | Owner | Touched
const COLS = '40px minmax(200px,1.6fr) minmax(150px,1.2fr) 132px 120px 110px 132px 92px'

type SortKey = 'title' | 'company' | 'stage' | 'source' | 'value' | 'owner' | 'touched'
const STAGE_ORDER = Object.fromEntries(ALL_STAGES.map((s, i) => [s.id, i])) as Record<StageId, number>

// ── view / query state ──────────────────────────────────────────────────────
const segment = ref('all')
const search = ref('')
const stageFilter = ref<StageId | 'all'>('all')
const sourceFilter = ref<string | 'all'>('all')
const sort = ref<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'value', dir: 'desc' })
const page = ref(0)
const selected = ref<Set<string>>(new Set())

// ── dropdown open state (one anchor ref + open flag per menu) ────────────────
const sourceOpen = ref(false); const sourceRoot = ref<HTMLElement | null>(null)
const stageMenuOpen = ref(false); const stageMenuRoot = ref<HTMLElement | null>(null)
const assignOpen = ref(false); const assignRoot = ref<HTMLElement | null>(null)

// ── resolvers (join via the stores) ─────────────────────────────────────────
const companyName = (d: Deal) => crm.company(d.companyId)?.name ?? '—'
const companyIndustry = (d: Deal) => crm.company(d.companyId)?.industry ?? ''
const ownerName = (id: string | null) =>
  id ? (team.profiles[id]?.full_name ?? team.profiles[id]?.email ?? 'Unknown') : ''
const ownerFirst = (id: string | null) => ownerName(id).split(' ')[0]
const ownerAvatarUrl = (id: string | null) => (id ? team.profiles[id]?.avatar_url ?? null : null)
const stageOf = (id: StageId) => ALL_STAGES.find((s) => s.id === id) ?? STAGES[0]
// Per-deal recency isn't loaded today, so we use the deal's company last-activity
// as the proxy (deals on the same company share a value — surfaced in the header
// tooltip). Swap this one line to d.updatedAt if that ever lands on the Deal type.
const recencyOf = (d: Deal): string | null => crm.company(d.companyId)?.lastActivityAt ?? null

// Stage chip foreground to pair with each STAGE tint.
const STAGE_FG: Record<StageId, string> = {
  lead: 'var(--st-todo-fg)', contacted: 'var(--st-rev-fg)', proposal: 'var(--st-prog-fg)',
  negotiation: 'var(--accent-fg)', won: 'var(--st-done-fg)', lost: 'var(--st-block-fg)',
}

// ── segments (saved filters over the full deal list) ────────────────────────
const me = () => auth.user?.id ?? null
const STALE_MS = 14 * 86_400_000
const SEGMENTS: { id: string; label: string; icon: Component; predicate: (d: Deal) => boolean }[] = [
  { id: 'all', label: 'All deals', icon: Users, predicate: () => true },
  { id: 'mine', label: 'Assigned to me', icon: UserCheck, predicate: (d) => !!me() && d.ownerId === me() },
  { id: 'unassigned', label: 'Unassigned', icon: UserPlus, predicate: (d) => !d.ownerId },
  { id: 'hot', label: 'Hot', icon: Flame, predicate: (d) => d.health === 'hot' },
  { id: 'open', label: 'Open pipeline', icon: Sparkles, predicate: (d) => d.stage !== 'won' && d.stage !== 'lost' },
  { id: 'won', label: 'Won', icon: Trophy, predicate: (d) => d.stage === 'won' },
  { id: 'lost', label: 'Lost', icon: XCircle, predicate: (d) => d.stage === 'lost' },
  {
    id: 'stale', label: 'Stale / follow up', icon: Clock,
    predicate: (d) => {
      if (d.stage === 'won' || d.stage === 'lost') return false
      const r = recencyOf(d)
      if (!r) return true
      return Date.now() - new Date(r).getTime() > STALE_MS
    },
  },
]
const activeSegment = computed(() => SEGMENTS.find((s) => s.id === segment.value) ?? SEGMENTS[0])

const stagePills = computed(() => [
  { id: 'all' as const, label: 'All' },
  ...ALL_STAGES.map((s) => ({ id: s.id, label: s.label })),
])
const HEADS: { key: SortKey; label: string; center?: boolean; tip?: string }[] = [
  { key: 'title', label: 'Deal' },
  { key: 'company', label: 'Company' },
  { key: 'stage', label: 'Stage' },
  { key: 'source', label: 'Source' },
  { key: 'value', label: 'Value', center: true },
  { key: 'owner', label: 'Owner' },
  { key: 'touched', label: 'Touched', center: true, tip: 'Last activity on the deal’s company (per-company recency)' },
]

// ── derived lists: segment → filters → sort → page ──────────────────────────
const segmented = computed(() => props.deals.filter(activeSegment.value.predicate))
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return segmented.value.filter((d) => {
    if (stageFilter.value !== 'all' && d.stage !== stageFilter.value) return false
    if (sourceFilter.value !== 'all' && d.source !== sourceFilter.value) return false
    if (q) {
      const hay = (d.title + ' ' + companyName(d) + ' ' + d.source + ' ' + ownerName(d.ownerId)).toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
})

function cmp(a: Deal, b: Deal, key: SortKey): number {
  switch (key) {
    case 'title': return a.title.localeCompare(b.title)
    case 'company': return companyName(a).localeCompare(companyName(b))
    case 'stage': return STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage]
    case 'source': return (a.source || '').localeCompare(b.source || '')
    case 'value': return a.value - b.value
    case 'owner': return (ownerName(a.ownerId) || '~').localeCompare(ownerName(b.ownerId) || '~')
    case 'touched': {
      const ta = recencyOf(a) ? new Date(recencyOf(a)!).getTime() : -Infinity
      const tb = recencyOf(b) ? new Date(recencyOf(b)!).getTime() : -Infinity
      return ta - tb
    }
  }
}
const sorted = computed(() => {
  const arr = [...filtered.value]
  const { key, dir } = sort.value
  const mul = dir === 'asc' ? 1 : -1
  arr.sort((a, b) => cmp(a, b, key) * mul || a.sort - b.sort)
  return arr
})

const pageCount = computed(() => Math.max(1, Math.ceil(sorted.value.length / PAGE_SIZE)))
// Clamped page for rendering — avoids a one-frame nonsense range when the list
// shrinks before the page ref is normalized.
const pageSafe = computed(() => Math.min(Math.max(0, page.value), pageCount.value - 1))
const paged = computed(() => sorted.value.slice(pageSafe.value * PAGE_SIZE, pageSafe.value * PAGE_SIZE + PAGE_SIZE))

const counts = computed(() =>
  Object.fromEntries(SEGMENTS.map((s) => [s.id, props.deals.filter(s.predicate).length])) as Record<string, number>)

const statCards = computed(() => [
  { label: 'Total deals', val: props.deals.length.toLocaleString(), color: '', sub: 'in this pipeline' },
  { label: 'Hot', val: props.deals.filter((d) => d.health === 'hot').length.toLocaleString(), color: HEALTH.hot.color, sub: 'ready to work' },
  { label: 'Unassigned', val: props.deals.filter((d) => !d.ownerId).length.toLocaleString(), color: '#c2700c', sub: 'need an owner' },
  { label: 'In view', val: filtered.value.length.toLocaleString(), color: 'var(--accent-fg)', sub: activeSegment.value.label },
])

// ── selection (a Set keyed by deal id; persists across pages) ────────────────
const pageIds = computed(() => paged.value.map((d) => d.id))
const allOnPage = computed(() => pageIds.value.length > 0 && pageIds.value.every((id) => selected.value.has(id)))
const selectedDeals = computed(() => props.deals.filter((d) => selected.value.has(d.id)))

// Assignable owners: the VA roster, plus anyone already owning a deal, plus me.
const assignableOwners = computed<MemberProfile[]>(() => {
  const map = new Map<string, MemberProfile>()
  for (const m of team.myTeam) map.set(m.id, m)
  for (const d of props.deals) {
    if (d.ownerId && team.profiles[d.ownerId]) map.set(d.ownerId, team.profiles[d.ownerId])
  }
  const myId = auth.user?.id
  if (myId && !map.has(myId)) {
    map.set(myId, team.profiles[myId] ?? {
      id: myId, full_name: auth.fullName || null, email: auth.user?.email ?? null,
      role: auth.role, timezone: null, avatar_url: auth.profile?.avatar_url ?? null,
    })
  }
  return [...map.values()]
})

// ── behaviour ───────────────────────────────────────────────────────────────
function setSort(key: SortKey) {
  if (sort.value.key === key) sort.value = { key, dir: sort.value.dir === 'asc' ? 'desc' : 'asc' }
  else sort.value = { key, dir: key === 'title' || key === 'company' ? 'asc' : 'desc' }
}
function selectSegment(id: string) { segment.value = id; page.value = 0 }
function toggleRow(id: string) {
  const next = new Set(selected.value)
  next.has(id) ? next.delete(id) : next.add(id)
  selected.value = next
}
function togglePage() {
  const next = new Set(selected.value)
  if (allOnPage.value) pageIds.value.forEach((id) => next.delete(id))
  else pageIds.value.forEach((id) => next.add(id))
  selected.value = next
}
function clearSelection() { selected.value = new Set() }
function setPage(p: number) { page.value = Math.min(Math.max(0, p), pageCount.value - 1) }

// Any filter change → back to page 1. Shrinking list → normalize the page ref.
watch([search, stageFilter, sourceFilter], () => { page.value = 0 })
watch(pageCount, () => { if (page.value > pageCount.value - 1) page.value = pageCount.value - 1 })
// Reset only when the client workspace actually changes — NOT on every optimistic
// or realtime write (those reassign crm.deals, which must not wipe a selection).
watch(() => clients.currentClientId, () => { clearSelection(); page.value = 0; void team.fetchAssignments() })
// Prune ids that no longer exist (deleted deal, client switch) so counts can't lie.
watch(() => props.deals, (ds) => {
  const live = new Set(ds.map((d) => d.id))
  const next = new Set([...selected.value].filter((id) => live.has(id)))
  if (next.size !== selected.value.size) selected.value = next
})

// Bulk actions loop the existing single-id store actions (no batch API exists).
// Optimistic; failures surface through CrmView's crm.error watcher → error toast.
async function bulkStage(stage: StageId) {
  const ids = [...selected.value]; stageMenuOpen.value = false
  await Promise.all(ids.map((id) => crm.move(id, stage)))
  // move() reverts failed deals to their prior stage — count what actually landed.
  const ok = ids.filter((id) => props.deals.find((d) => d.id === id)?.stage === stage).length
  if (ok) emit('toast', `${ok} ${ok === 1 ? 'deal' : 'deals'} → ${stageOf(stage).label}`, 'Stage updated')
  clearSelection()
}
async function bulkAssign(ownerId: string) {
  const ids = [...selected.value]; assignOpen.value = false
  const ok = (await Promise.all(ids.map((id) => crm.updateDeal(id, { ownerId })))).filter(Boolean).length
  if (ok) emit('toast', `${ok} assigned to ${ownerFirst(ownerId)}`, 'Owner updated')
  clearSelection()
}
async function bulkConvert() {
  stageMenuOpen.value = false; assignOpen.value = false
  // One company can back several selected deals — convert each company once, and
  // skip those already promoted. crm.error owns any failure toast.
  const seen = new Set<string>()
  const targets = selectedDeals.value.filter((d) => {
    const co = crm.company(d.companyId)
    if (!co || co.isClient || seen.has(d.companyId)) return false
    seen.add(d.companyId)
    return true
  })
  let ok = 0
  for (const d of targets) if (await crm.convert(d)) ok++ // sequential keeps optimistic reverts coherent
  if (ok) emit('toast', `${ok} ${ok === 1 ? 'company' : 'companies'} converted`, 'Client records created — set up each workspace in Comms.')
  clearSelection()
}

async function bulkDelete() {
  if (!canManage.value) return
  const ids = [...selected.value]
  if (!ids.length) return
  if (!window.confirm(`Delete ${ids.length} deal${ids.length === 1 ? '' : 's'}? This can't be undone.`)) return
  const ok = (await Promise.all(ids.map((id) => crm.deleteDeal(id)))).filter(Boolean).length
  if (ok) emit('toast', `${ok} deal${ok === 1 ? '' : 's'} deleted`)
  clearSelection()
}

// ── dropdown click-outside / Esc ────────────────────────────────────────────
function onDocClick(e: MouseEvent) {
  const t = e.target as Node
  if (sourceRoot.value && !sourceRoot.value.contains(t)) sourceOpen.value = false
  if (stageMenuRoot.value && !stageMenuRoot.value.contains(t)) stageMenuOpen.value = false
  if (assignRoot.value && !assignRoot.value.contains(t)) assignOpen.value = false
}
function onEsc(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  sourceOpen.value = stageMenuOpen.value = assignOpen.value = false
}
onMounted(() => {
  void team.fetchAssignments()
  const ownerIds = props.deals.map((d) => d.ownerId).filter(Boolean) as string[]
  if (ownerIds.length) void team.fetchProfiles([...new Set(ownerIds)])
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onEsc)
})
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onEsc)
})
</script>

<template>
  <div class="flex-1 flex min-h-0">
    <!-- segments rail -->
    <aside class="w-[212px] flex-none border-r border-base-300 bg-base-200/40 overflow-y-auto py-3.5 px-2.5">
      <div class="text-[11px] font-bold tracking-wider uppercase text-base-content/40 px-2 pb-2">Segments</div>
      <button
        v-for="s in SEGMENTS"
        :key="s.id"
        type="button"
        class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg mb-0.5 transition-colors"
        :class="segment === s.id ? '' : 'text-base-content/60 hover:bg-base-200'"
        :style="segment === s.id ? { background: 'var(--accent-soft)', color: 'var(--accent-fg)' } : {}"
        @click="selectSegment(s.id)"
      >
        <component :is="s.icon" :size="16" class="flex-none" />
        <span class="flex-1 text-left text-[13px] font-semibold truncate">{{ s.label }}</span>
        <span
          class="text-[11px] font-bold tabular-nums"
          :class="segment === s.id ? '' : 'text-base-content/40'"
        >{{ counts[s.id] > 999 ? (counts[s.id] / 1000).toFixed(1) + 'k' : counts[s.id] }}</span>
      </button>
    </aside>

    <!-- main column -->
    <div class="flex-1 flex flex-col min-w-0">
      <!-- stat strip -->
      <div class="flex gap-2.5 px-5 pt-3.5 pb-1.5">
        <div
          v-for="c in statCards"
          :key="c.label"
          class="flex-1 min-w-0 px-[15px] py-3 rounded-xl border border-base-300 bg-base-100"
        >
          <div class="text-[11px] font-bold tracking-wider uppercase text-base-content/40 mb-1.5">{{ c.label }}</div>
          <div
            class="text-[22px] font-extrabold tracking-tight leading-none tabular-nums"
            :style="{ color: c.color || 'var(--color-base-content)' }"
          >{{ c.val }}</div>
          <div class="text-[11px] text-base-content/40 mt-1 truncate">{{ c.sub }}</div>
        </div>
      </div>

      <!-- toolbar -->
      <div class="flex items-center gap-2.5 px-5 py-2.5 flex-wrap">
        <div class="relative w-60">
          <Search :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40 pointer-events-none" />
          <input v-model="search" class="crm-in w-full !h-9 !pl-9" placeholder="Search deals…" />
        </div>

        <div class="flex gap-0.5 bg-base-200 p-[3px] rounded-[9px] overflow-x-auto max-w-full">
          <button
            v-for="opt in stagePills"
            :key="opt.id"
            type="button"
            class="px-2.5 py-1.5 rounded-md text-[12.5px] font-semibold whitespace-nowrap transition-colors"
            :class="stageFilter === opt.id ? 'bg-base-100 shadow-sm text-base-content' : 'text-base-content/50 hover:text-base-content'"
            @click="stageFilter = opt.id"
          >{{ opt.label }}</button>
        </div>

        <div ref="sourceRoot" class="relative">
          <button
            type="button"
            class="flex items-center gap-1.5 h-[34px] px-3 rounded-[9px] border border-base-300 bg-base-100 text-[13px] font-semibold text-base-content/70 hover:text-base-content"
            :aria-expanded="sourceOpen"
            aria-haspopup="menu"
            @click="sourceOpen = !sourceOpen"
          >
            <Filter :size="15" />
            {{ sourceFilter === 'all' ? 'All sources' : sourceFilter }}
            <ChevronDown :size="14" class="opacity-60" />
          </button>
          <transition name="dropdown">
            <div
              v-if="sourceOpen"
              role="menu"
              class="absolute z-40 mt-1 w-48 rounded-lg border border-base-300 bg-base-100 shadow-lg overflow-hidden p-1 max-h-[280px] overflow-y-auto"
            >
              <button
                v-for="opt in ['all', ...SOURCES]"
                :key="opt"
                type="button"
                role="menuitem"
                class="w-full flex items-center gap-2 px-2.5 py-[7px] rounded-md text-left text-[13px] text-base-content hover:bg-base-200"
                @click="sourceFilter = opt; sourceOpen = false"
              >
                <span class="flex-1 truncate">{{ opt === 'all' ? 'All sources' : opt }}</span>
                <Check v-if="sourceFilter === opt" :size="14" :style="{ color: 'var(--accent-fg)' }" />
              </button>
            </div>
          </transition>
        </div>

        <div class="flex-1" />
        <span class="flex items-center gap-1.5 text-[12.5px] font-semibold text-base-content/40 whitespace-nowrap">
          <Loader2 v-if="crm.loading" :size="13" class="animate-spin" />{{ filtered.length.toLocaleString() }} deals
        </span>
      </div>

      <!-- table -->
      <div class="flex-1 overflow-auto px-5 pb-3">
        <div class="border border-base-300 rounded-xl overflow-hidden bg-base-100 min-w-[1000px]">
          <!-- sticky header -->
          <div
            class="grid items-center gap-3 px-4 h-[42px] border-b border-base-300 bg-base-200 sticky top-0 z-[2]"
            :style="{ gridTemplateColumns: COLS }"
          >
            <button
              type="button"
              class="w-[17px] h-[17px] rounded-[5px] border grid place-items-center transition-colors"
              :class="allOnPage ? 'border-transparent text-white' : 'border-base-content/30 hover:border-[var(--accent)]'"
              :style="allOnPage ? { background: 'var(--accent)' } : {}"
              role="checkbox"
              :aria-checked="allOnPage ? 'true' : (pageIds.some((id) => selected.has(id)) ? 'mixed' : 'false')"
              aria-label="Select all on page"
              @click="togglePage"
            >
              <Check v-if="allOnPage" :size="11" :stroke-width="3" />
            </button>
            <button
              v-for="h in HEADS"
              :key="h.key"
              type="button"
              class="flex items-center gap-1 text-[11px] font-bold tracking-wider uppercase"
              :class="[h.center ? 'justify-center w-full' : '', sort.key === h.key ? '' : 'text-base-content/40']"
              :style="sort.key === h.key ? { color: 'var(--accent-fg)' } : {}"
              :title="h.tip"
              :aria-sort="sort.key === h.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'"
              @click="setSort(h.key)"
            >
              {{ h.label }}
              <component
                :is="sort.key === h.key ? (sort.dir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown"
                :size="12"
                :class="sort.key === h.key ? '' : 'opacity-40'"
              />
            </button>
          </div>

          <!-- empty / loading state -->
          <div v-if="!paged.length" class="px-4 py-12 text-center">
            <div v-if="crm.loading && !props.deals.length" class="inline-flex items-center gap-2 text-[13px] text-base-content/40">
              <Loader2 :size="15" class="animate-spin" /> Loading deals…
            </div>
            <template v-else>
              <div class="text-[13px] text-base-content/40">
                {{ props.deals.length ? 'No deals match your filters.' : 'No deals yet.' }}
              </div>
              <button
                v-if="!props.deals.length"
                type="button"
                class="mt-3 inline-flex items-center gap-[7px] h-[32px] px-3 rounded-[9px] text-[13px] font-bold text-white"
                :style="{ background: 'var(--accent)' }"
                @click="emit('new-deal', 'lead')"
              >
                <Plus :size="15" /> New deal
              </button>
            </template>
          </div>

          <!-- rows (only the 50/page slice) -->
          <div
            v-for="d in paged"
            :key="d.id"
            class="crm-row grid items-center gap-3 px-4 h-[50px] cursor-pointer border-b border-base-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-inset"
            :style="[{ gridTemplateColumns: COLS }, selected.has(d.id) ? { background: 'var(--accent-soft)' } : {}]"
            role="button"
            tabindex="0"
            @click="emit('open', d)"
            @keydown.enter.prevent="emit('open', d)"
          >
            <div @click.stop>
              <button
                type="button"
                class="w-[17px] h-[17px] rounded-[5px] border grid place-items-center transition-colors"
                :class="selected.has(d.id) ? 'border-transparent text-white' : 'border-base-content/30 hover:border-[var(--accent)]'"
                :style="selected.has(d.id) ? { background: 'var(--accent)' } : {}"
                role="checkbox"
                :aria-checked="selected.has(d.id)"
                aria-label="Select deal"
                @click="toggleRow(d.id)"
                @keydown.enter.stop
              >
                <Check v-if="selected.has(d.id)" :size="11" :stroke-width="3" />
              </button>
            </div>

            <!-- deal -->
            <div class="flex items-center gap-2.5 min-w-0">
              <CrmAvatar
                :name="d.title"
                :initials="crm.company(d.companyId)?.initials ?? d.title.slice(0, 2)"
                :color="crm.company(d.companyId)?.color ?? '#7b2d86'"
                :size="28"
                :radius="8"
              />
              <div class="min-w-0">
                <div class="text-[13.5px] font-semibold text-base-content truncate">{{ d.title }}</div>
                <div class="text-[11.5px] text-base-content/40 truncate">{{ fmtMoney(d.value) }} · {{ d.priority }}</div>
              </div>
            </div>

            <!-- company -->
            <div class="min-w-0">
              <div class="text-[13px] font-medium text-base-content truncate">{{ companyName(d) }}</div>
              <div class="text-[11.5px] text-base-content/40 truncate">{{ companyIndustry(d) || '—' }}</div>
            </div>

            <!-- stage -->
            <div>
              <span
                class="inline-flex items-center gap-1.5 px-[9px] py-0.5 rounded-full text-[11.5px] font-semibold whitespace-nowrap"
                :style="{ background: stageOf(d.stage).tint, color: STAGE_FG[d.stage] }"
              >
                <span class="w-1.5 h-1.5 rounded-full" :style="{ background: stageOf(d.stage).dot }" />{{ stageOf(d.stage).label }}
              </span>
            </div>

            <!-- source -->
            <div class="text-[12.5px] text-base-content/60 truncate">{{ d.source || '—' }}</div>

            <!-- value -->
            <div class="text-[13px] font-bold text-base-content tabular-nums text-center">
              {{ d.value > 0 ? fmtMoney(d.value) : '—' }}
            </div>

            <!-- owner -->
            <div class="min-w-0">
              <div v-if="d.ownerId" class="flex items-center gap-1.5 min-w-0">
                <CrmAvatar
                  :name="ownerName(d.ownerId)"
                  :avatar-url="ownerAvatarUrl(d.ownerId)"
                  color="#475569"
                  :size="22"
                  :radius="6"
                />
                <span class="text-[12.5px] text-base-content/60 truncate">{{ ownerFirst(d.ownerId) }}</span>
              </div>
              <span v-else class="text-[12px] font-semibold" :style="{ color: '#c2700c' }">Unassigned</span>
            </div>

            <!-- touched -->
            <div class="text-[12px] text-base-content/40 text-center">
              {{ recencyOf(d) ? relTime(recencyOf(d)!) : '—' }}
            </div>
          </div>
        </div>
      </div>

      <!-- pagination (extra bottom space while the floating bulk bar is shown) -->
      <div class="flex items-center gap-3 px-5 py-2.5" :class="{ 'pb-16': selected.size > 0 }">
        <span class="text-[12.5px] text-base-content/40">
          Showing
          <strong class="text-base-content">{{ sorted.length ? pageSafe * PAGE_SIZE + 1 : 0 }}–{{ Math.min((pageSafe + 1) * PAGE_SIZE, sorted.length) }}</strong>
          of {{ sorted.length.toLocaleString() }}
        </span>
        <div class="flex-1" />
        <button
          type="button"
          class="flex items-center gap-1.5 h-[34px] px-3 rounded-[9px] border border-base-300 bg-base-100 text-[13px] font-semibold disabled:opacity-40"
          :disabled="pageSafe === 0"
          @click="setPage(pageSafe - 1)"
        ><ChevronLeft :size="15" /> Prev</button>
        <span class="text-[12.5px] font-semibold text-base-content/60">Page {{ pageSafe + 1 }} / {{ pageCount }}</span>
        <button
          type="button"
          class="flex items-center gap-1.5 h-[34px] px-3 rounded-[9px] border border-base-300 bg-base-100 text-[13px] font-semibold disabled:opacity-40"
          :disabled="pageSafe >= pageCount - 1"
          @click="setPage(pageSafe + 1)"
        >Next <ChevronRight :size="15" /></button>
      </div>
    </div>

    <!-- floating bulk bar -->
    <transition name="dropdown">
      <div
        v-if="selected.size > 0"
        class="fixed bottom-5 left-1/2 -translate-x-1/2 z-[125] flex items-center gap-2 pl-4 pr-2.5 py-2.5 rounded-2xl text-white shadow-2xl"
        style="background:#211c24"
      >
        <span class="text-[13.5px] font-bold">{{ selected.size }} selected</span>
        <span class="w-px h-[22px] mx-1" style="background:rgba(255,255,255,.18)" />

        <!-- set stage -->
        <div ref="stageMenuRoot" class="relative">
          <button
            type="button"
            class="flex items-center gap-1.5 h-[34px] px-3 rounded-[9px] text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            style="background:rgba(255,255,255,.1)"
            :aria-expanded="stageMenuOpen"
            aria-haspopup="menu"
            @click="stageMenuOpen = !stageMenuOpen"
          ><Flag :size="15" /> Set stage</button>
          <transition name="dropdown">
            <div
              v-if="stageMenuOpen"
              role="menu"
              class="absolute bottom-full left-0 mb-2 w-44 rounded-lg border border-base-300 bg-base-100 shadow-lg overflow-hidden p-1"
            >
              <button
                v-for="s in ALL_STAGES"
                :key="s.id"
                type="button"
                role="menuitem"
                class="w-full flex items-center gap-2 px-2.5 py-[7px] rounded-md text-left text-[13px] text-base-content hover:bg-base-200"
                @click="bulkStage(s.id)"
              ><span class="w-2 h-2 rounded-full" :style="{ background: s.dot }" />{{ s.label }}</button>
            </div>
          </transition>
        </div>

        <!-- assign -->
        <div ref="assignRoot" class="relative">
          <button
            type="button"
            class="flex items-center gap-1.5 h-[34px] px-3 rounded-[9px] text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            style="background:rgba(255,255,255,.1)"
            :aria-expanded="assignOpen"
            aria-haspopup="menu"
            @click="assignOpen = !assignOpen"
          ><Users :size="15" /> Assign</button>
          <transition name="dropdown">
            <div
              v-if="assignOpen"
              role="menu"
              class="absolute bottom-full left-0 mb-2 w-52 rounded-lg border border-base-300 bg-base-100 shadow-lg overflow-hidden p-1 max-h-[300px] overflow-y-auto"
            >
              <div v-if="!assignableOwners.length" class="px-2.5 py-2 text-[12.5px] text-base-content/40">No teammates found.</div>
              <button
                v-for="m in assignableOwners"
                :key="m.id"
                type="button"
                role="menuitem"
                class="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-left text-[13px] text-base-content hover:bg-base-200"
                @click="bulkAssign(m.id)"
              >
                <CrmAvatar :name="m.full_name || m.email || '?'" :avatar-url="m.avatar_url" color="#475569" :size="22" :radius="6" />
                <span class="truncate">{{ m.full_name || m.email }}</span>
              </button>
            </div>
          </transition>
        </div>

        <!-- convert -->
        <button
          type="button"
          class="flex items-center gap-1.5 h-[34px] px-3.5 rounded-[9px] text-[13px] font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          :style="{ background: 'var(--accent)' }"
          @click="bulkConvert"
        ><ArrowUpRight :size="15" /> Convert to client</button>

        <!-- delete (ops only) -->
        <button
          v-if="canManage"
          type="button"
          class="flex items-center gap-1.5 h-[34px] px-3 rounded-[9px] text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          style="background:rgba(255,255,255,.1);color:#ff8a98"
          @click="bulkDelete"
        ><Trash2 :size="15" /> Delete</button>

        <!-- clear -->
        <button
          type="button"
          class="w-[34px] h-[34px] grid place-items-center rounded-[9px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          style="color:rgba(255,255,255,.7)"
          title="Clear selection"
          @click="clearSelection"
        ><X :size="17" /></button>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.crm-row:hover {
  background: var(--color-base-200);
}
.crm-in {
  height: 30px;
  background: var(--color-base-200);
  border-radius: 8px;
  padding: 0 10px;
  font-size: 12.5px;
  color: var(--color-base-content);
  outline: none;
}
.crm-in:focus {
  box-shadow: 0 0 0 1px color-mix(in oklab, var(--accent) 40%, transparent);
}
</style>
