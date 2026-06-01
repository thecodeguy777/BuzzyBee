<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Briefcase, Inbox, Phone, UserPlus } from 'lucide-vue-next'
import { useLeads, STAGE_ORDER, STAGE_LABEL, type LeadStage } from '../../composables/useLeads'
import { useToast } from '../../composables/useToast'
import { useDialog } from '../../composables/useDialog'
import { useBroadcast } from '../../composables/useBroadcast'
import { useAddLead } from '../../composables/useAddLead'
import CrmLeadList from './CrmLeadList.vue'
import CrmLeadDetail from './CrmLeadDetail.vue'

const props = defineProps<{
  focusLeadId?: string | null
}>()

const leads = useLeads()
const toast = useToast()
const dialog = useDialog()
const broadcast = useBroadcast()
const addLead = useAddLead()

const stageFilter = ref<LeadStage | 'all'>('all')
const search = ref('')
const selectedId = ref<string | null>(null)
const callingLeadId = ref<string | null>(null)

// External focus (from active-call banner "Open in CRM" button)
watch(() => props.focusLeadId, (id) => {
  if (id) {
    selectedId.value = id
    stageFilter.value = 'all'
  }
}, { immediate: true })

// When the dialer starts calling a lead, auto-select that lead so the agent
// sees its full context while the call is happening.
broadcast.on('call:start', (ev) => {
  if (!ev.leadId) return
  callingLeadId.value = ev.leadId
  selectedId.value = ev.leadId
  stageFilter.value = 'all'
  toast.info('Now on call', ev.leadName ?? 'Unknown lead')
})

broadcast.on('call:end', () => {
  callingLeadId.value = null
})

broadcast.on('call:dispositioned', (ev) => {
  if (!ev.leadId) return
  const lead = leads.leads.value.find(l => l.id === ev.leadId)
  toast.success(`Call dispositioned: ${ev.outcome}`, lead?.fullName)
})

// Default-select the first lead in the current filter when none chosen
const filteredLeads = computed(() => leads.leads.value)

// True DB-wide counts (from the dialer_lead_stats RPC), NOT derived from
// the paginated rows — so chips/KPIs don't grow as you scroll.
const stageCounts = computed(() => {
  const byStage = leads.leadStats.value.byStage
  const counts: Record<string, number> = { all: leads.leadStats.value.total }
  for (const stage of STAGE_ORDER) {
    counts[stage] = byStage[stage] ?? 0
  }
  return counts
})

const pipelineValue = computed(() => ({
  total: leads.leadStats.value.pipelineTotalCents / 100,
  weighted: leads.leadStats.value.pipelineWeightedCents / 100,
  won: leads.leadStats.value.wonCents / 100,
}))

const selectedLead = computed(() =>
  selectedId.value ? leads.leads.value.find(l => l.id === selectedId.value) ?? null : null,
)

function selectLead(id: string) {
  selectedId.value = id
}

// Stage filtering is server-side: switching the chip refetches that stage
// from the DB so stages whose rows aren't paginated in yet still show.
function selectStage(s: LeadStage | 'all') {
  stageFilter.value = s
  leads.applyStageFilter(s)
}

async function deleteLead(id: string) {
  const lead = leads.leads.value.find(l => l.id === id)
  const ok = await dialog.confirm({
    title: 'Delete this lead?',
    message: `${lead?.fullName ?? 'This lead'} will be removed from the CRM. Call history is preserved.`,
    destructive: true,
    confirmLabel: 'Delete lead',
  })
  if (!ok) return
  leads.removeLead(id)
  if (selectedId.value === id) selectedId.value = null
  toast.info('Lead deleted', lead?.fullName)
}

function fmtMoney(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`
  return `$${value.toFixed(0)}`
}
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Top KPI strip + stage filter -->
    <div class="border-b border-base-300 bg-base-100">
      <!-- KPIs -->
      <div class="px-5 py-3 flex items-center gap-6">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/10 to-purple-500/10 border border-primary/15 flex items-center justify-center">
            <Briefcase class="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 class="text-sm font-semibold text-base-content">Sales pipeline</h3>
            <div class="text-[10px] text-base-content/50">
              <span class="font-semibold text-base-content/70">{{ leads.leadStats.value.total.toLocaleString() }}</span>
              leads in pipeline
            </div>
          </div>
        </div>

        <div class="flex-1"></div>

        <div class="flex items-center gap-5 text-xs">
          <div>
            <div class="text-[9px] uppercase tracking-wider text-base-content/40">Open pipeline</div>
            <div class="text-sm font-semibold text-base-content">{{ fmtMoney(pipelineValue.total) }}</div>
          </div>
          <div>
            <div class="text-[9px] uppercase tracking-wider text-base-content/40">Weighted</div>
            <div class="text-sm font-semibold text-primary">{{ fmtMoney(pipelineValue.weighted) }}</div>
          </div>
          <div>
            <div class="text-[9px] uppercase tracking-wider text-base-content/40">Won (all-time)</div>
            <div class="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{{ fmtMoney(pipelineValue.won) }}</div>
          </div>
          <button
            class="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded bg-primary text-white hover:bg-primary/90 transition-colors shadow-sm"
            @click="addLead.open({ source: 'crm' })"
          >
            <UserPlus class="w-3 h-3" />
            New lead
          </button>
        </div>
      </div>

      <!-- Stage filter chips -->
      <div class="px-5 pb-3 flex items-center gap-1 overflow-x-auto">
        <button
          class="text-[11px] px-2.5 py-1 rounded transition-colors whitespace-nowrap"
          :class="stageFilter === 'all'
            ? 'bg-primary/10 text-primary font-semibold'
            : 'text-base-content/50 hover:text-base-content hover:bg-base-200'"
          @click="selectStage('all')"
        >
          All <span class="text-[9px] ml-0.5 opacity-60">{{ stageCounts.all }}</span>
        </button>
        <button
          v-for="stage in STAGE_ORDER"
          :key="stage"
          class="text-[11px] px-2.5 py-1 rounded transition-colors whitespace-nowrap"
          :class="stageFilter === stage
            ? 'bg-primary/10 text-primary font-semibold'
            : 'text-base-content/50 hover:text-base-content hover:bg-base-200'"
          @click="selectStage(stage)"
        >
          {{ STAGE_LABEL[stage] }} <span class="text-[9px] ml-0.5 opacity-60">{{ stageCounts[stage] }}</span>
        </button>
      </div>
    </div>

    <!-- Master/detail — two floating panes on a soft canvas -->
    <div class="flex-1 flex overflow-hidden gap-2 p-2 bg-base-200/40">
      <div class="w-[320px] shrink-0 rounded-xl border border-base-300 bg-base-100 overflow-hidden">
        <CrmLeadList
          :leads="filteredLeads"
          :selected-id="selectedId"
          :calling-lead-id="callingLeadId"
          :search="search"
          :stage-filter="stageFilter"
          @select="selectLead"
          @update:search="(v) => search = v"
        />
      </div>

      <div class="flex-1 overflow-hidden rounded-xl border border-base-300 bg-base-100">
        <CrmLeadDetail
          v-if="selectedLead"
          :key="selectedLead.id"
          :lead="selectedLead"
          @delete="deleteLead"
        />
        <div v-else class="h-full flex flex-col items-center justify-center text-center px-6">
          <Inbox class="w-10 h-10 text-base-content/20 mb-3" />
          <p class="text-sm text-base-content/50">Select a lead to view details</p>
          <p class="text-[11px] text-base-content/40 mt-1">
            Add a lead with the "New lead" button, or import a CSV from the floating dialer.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
