<script setup lang="ts">
import { computed } from 'vue'
import { Calendar, Search, Building2, Phone, Loader2 } from 'lucide-vue-next'
import { useLeads, type Lead, type LeadStage } from '../../composables/useLeads'
import { useTasks, type DialerTask } from '../../composables/useTasks'
import CrmStageBadge from './CrmStageBadge.vue'

const props = defineProps<{
  leads: Lead[]
  selectedId: string | null
  callingLeadId?: string | null
  search: string
  stageFilter: LeadStage | 'all'
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'update:search', v: string): void
}>()

const taskStore = useTasks()
const leadStore = useLeads()

// Infinite scroll: when the user nears the bottom of the loaded list,
// pull the next page. Keeps the per-request cap intact (we page around it).
function onScroll(e: Event) {
  const el = e.target as HTMLElement
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 240) {
    leadStore.loadMore()
  }
}

// Total for whatever stage is currently filtered (true DB count), so the
// footer says "All 3 loaded" on the Won filter, not "All 6,330".
const displayTotal = computed(() => {
  const sf = leadStore.stageFilter.value
  return sf === 'all'
    ? leadStore.leadStats.value.total
    : (leadStore.leadStats.value.byStage[sf] ?? 0)
})

// Build a map: leadId → top-priority open task. Top = lowest position
// among open/in_progress tasks (matches LeadTasksSection's ordering).
// Computed once per leads-or-tasks change so the sort + per-row lookup
// don't each rescan the tasks list.
const topTaskByLeadId = computed<Record<string, DialerTask>>(() => {
  const map: Record<string, DialerTask> = {}
  for (const t of taskStore.tasks.value) {
    if (!t.leadId) continue
    if (t.status !== 'open' && t.status !== 'in_progress') continue
    const existing = map[t.leadId]
    if (!existing || t.position < existing.position) {
      map[t.leadId] = t
    }
  }
  return map
})

const filtered = computed(() => {
  let scope = props.leads
  if (props.stageFilter !== 'all') {
    scope = scope.filter(l => l.stage === props.stageFilter)
  }
  const q = props.search.trim().toLowerCase()
  if (q) {
    scope = scope.filter(l =>
      l.fullName.toLowerCase().includes(q)
      || l.phoneE164.includes(q)
      || (l.company?.toLowerCase().includes(q) ?? false)
      || (l.email?.toLowerCase().includes(q) ?? false),
    )
  }
  // Sort: top-task overdue → top-task soonest → most recently updated.
  // Leads with no top task (or whose top task has no due date) fall to the
  // bottom of the time-based sort and rank by updatedAt.
  const now = Date.now()
  const tops = topTaskByLeadId.value
  return [...scope].sort((a, b) => {
    const aTop = tops[a.id]
    const bTop = tops[b.id]
    const aNext = aTop?.dueAt ? new Date(aTop.dueAt).getTime() : Infinity
    const bNext = bTop?.dueAt ? new Date(bTop.dueAt).getTime() : Infinity
    const aDue = aNext <= now
    const bDue = bNext <= now
    if (aDue !== bDue) return aDue ? -1 : 1
    if (aDue && bDue) return aNext - bNext
    if (aNext !== bNext) return aNext - bNext
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
})

function fmtDealValue(cents?: number, currency = 'USD'): string {
  if (!cents) return ''
  const dollars = cents / 100
  if (dollars >= 1000) return `${currency} ${(dollars / 1000).toFixed(1)}k`
  return `${currency} ${dollars.toFixed(0)}`
}

function fmtDueAt(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  const diffH = Math.round(diffMs / (1000 * 60 * 60))
  if (diffH < 0) return `${Math.abs(diffH)}h overdue`
  if (diffH < 24) return `in ${diffH}h`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function isOverdue(iso?: string | null): boolean {
  if (!iso) return false
  return new Date(iso).getTime() < Date.now()
}
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Search -->
    <div class="px-3 py-2 border-b border-base-300">
      <div class="relative">
        <Search class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/30" />
        <input
          :value="search"
          @input="emit('update:search', ($event.target as HTMLInputElement).value)"
          type="text"
          placeholder="Search name, phone, company, email"
          class="w-full text-xs pl-7 pr-2 py-1.5 rounded border border-base-300 bg-base-100 focus:border-primary focus:outline-none"
        />
      </div>
      <div class="text-[10px] text-base-content/40 mt-1.5">
        <template v-if="search.trim() === '' && stageFilter === 'all'">
          {{ leadStore.leadStats.value.total.toLocaleString() }} leads
        </template>
        <template v-else>
          {{ filtered.length.toLocaleString() }} matching
        </template>
      </div>
    </div>

    <!-- List -->
    <div class="flex-1 overflow-y-auto" @scroll="onScroll">
      <div v-if="filtered.length === 0" class="p-6 text-center text-xs text-base-content/40">
        No leads match.
      </div>

      <button
        v-for="lead in filtered"
        :key="lead.id"
        class="w-full text-left px-3 py-2.5 border-b border-base-300 hover:bg-base-200/60 transition-colors relative"
        :class="[
          selectedId === lead.id ? 'bg-primary/5 border-l-2 border-l-primary' : '',
          callingLeadId === lead.id ? 'bg-green-500/5' : '',
        ]"
        @click="emit('select', lead.id)"
      >
        <!-- Pulsing 'on call' indicator -->
        <span
          v-if="callingLeadId === lead.id"
          class="absolute right-3 top-3 flex items-center gap-1 text-[9px] uppercase tracking-wider text-green-600 dark:text-green-400 font-semibold"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          On call
        </span>

        <div class="flex items-center gap-2">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <Phone v-if="callingLeadId === lead.id" class="w-3 h-3 text-green-500 shrink-0" />
              <span class="text-sm font-medium text-base-content truncate">{{ lead.fullName }}</span>
              <CrmStageBadge :stage="lead.stage" size="xs" />
            </div>
            <div class="flex items-center gap-1.5 mt-0.5 text-[10px] text-base-content/50">
              <Building2 v-if="lead.company" class="w-2.5 h-2.5 shrink-0" />
              <span v-if="lead.company" class="truncate">{{ lead.company }}</span>
              <span v-else class="font-mono">{{ lead.phoneE164 }}</span>
              <span v-if="lead.dealValueCents" class="text-emerald-600 dark:text-emerald-400 font-medium">
                · {{ fmtDealValue(lead.dealValueCents, lead.dealCurrency) }}
              </span>
            </div>
            <div
              v-if="topTaskByLeadId[lead.id]"
              class="flex items-center gap-1 mt-1 text-[10px]"
              :class="isOverdue(topTaskByLeadId[lead.id]?.dueAt) ? 'text-red-500' : 'text-amber-600 dark:text-amber-400'"
            >
              <Calendar class="w-2.5 h-2.5 shrink-0" />
              <span v-if="topTaskByLeadId[lead.id]?.dueAt" class="font-medium">
                {{ fmtDueAt(topTaskByLeadId[lead.id]?.dueAt) }}
              </span>
              <span v-else class="font-medium text-primary">Next</span>
              <span class="text-base-content/60 truncate">— {{ topTaskByLeadId[lead.id]?.title }}</span>
            </div>
          </div>
        </div>
      </button>

      <!-- Pagination footer -->
      <div
        v-if="filtered.length > 0"
        class="px-3 py-3 text-center text-[10px] text-base-content/40 border-t border-base-300"
      >
        <span v-if="leadStore.isLoadingMore.value" class="flex items-center justify-center gap-1.5">
          <Loader2 class="w-3 h-3 animate-spin" />
          Loading more leads…
        </span>
        <span v-else-if="leadStore.hasMore.value">
          Showing
          <span class="font-semibold text-base-content/60">{{ leadStore.leads.value.length.toLocaleString() }}</span>
          of
          <span class="font-semibold text-base-content/60">{{ displayTotal.toLocaleString() }}</span>
          · scroll for more
        </span>
        <span v-else>
          All <span class="font-semibold text-base-content/60">{{ displayTotal.toLocaleString() }}</span> leads loaded
        </span>
      </div>
    </div>
  </div>
</template>
