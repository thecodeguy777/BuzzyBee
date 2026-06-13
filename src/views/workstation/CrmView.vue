<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Handshake, LayoutGrid, Filter, Building2, Users, Plus, Upload, AlertTriangle, Mail, Palette, Columns3, Table2 } from 'lucide-vue-next'
import CrmOverview from '@/components/crm/CrmOverview.vue'
import CrmPipelineBoard from '@/components/crm/CrmPipelineBoard.vue'
import CrmDealsTable from '@/components/crm/CrmDealsTable.vue'
import CrmCompaniesTable from '@/components/crm/CrmCompaniesTable.vue'
import CrmContactsTable from '@/components/crm/CrmContactsTable.vue'
import CrmCampaigns from '@/components/crm/CrmCampaigns.vue'
import CrmCampaignPanel from '@/components/crm/CrmCampaignPanel.vue'
import CrmCampaignReport from '@/components/crm/CrmCampaignReport.vue'
import CrmDesignStudio from '@/components/crm/CrmDesignStudio.vue'
import CrmDealDetail from '@/components/crm/CrmDealDetail.vue'
import CrmCompanyDetail from '@/components/crm/CrmCompanyDetail.vue'
import CrmNewDealPanel from '@/components/crm/CrmNewDealPanel.vue'
import CrmImportPanel from '@/components/crm/CrmImportPanel.vue'
import { useCrmStore } from '@/stores/crm'
import { useCampaignsStore, type Campaign } from '@/stores/campaigns'
import { useEmailTemplatesStore, type EmailTemplate } from '@/stores/emailTemplates'
import { useClientsStore } from '@/stores/clients'
import type { Company, Deal, StageId } from '@/lib/crmData'

type ViewId = 'overview' | 'pipeline' | 'companies' | 'contacts' | 'designs' | 'campaigns'
const TABS: { id: ViewId; label: string; icon: unknown }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'pipeline', label: 'Pipeline', icon: Filter },
  { id: 'companies', label: 'Companies', icon: Building2 },
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'designs', label: 'Designs', icon: Palette },
  { id: 'campaigns', label: 'Campaigns', icon: Mail },
]

const crm = useCrmStore()
const campaignsStore = useCampaignsStore()
const clients = useClientsStore()
const route = useRoute()
const router = useRouter()
const view = ref<ViewId>('overview')
const activeId = ref<string | null>(null)
const activeCompanyId = ref<string | null>(null)
const importOpen = ref(false)
const newDeal = ref<{ open: boolean; stage?: StageId }>({ open: false })
// Pipeline tab renders as a kanban board OR a dense table (the high-volume
// surface). Remember the user's choice; default to the table since it scales.
const pipelineMode = ref<'board' | 'table'>(
  (localStorage.getItem('crm.pipelineMode') as 'board' | 'table') || 'table',
)
watch(pipelineMode, (m) => localStorage.setItem('crm.pipelineMode', m))
const campaignPanel = ref<{ open: boolean; campaign: Campaign | null; duplicate: boolean; template: EmailTemplate | null }>(
  { open: false, campaign: null, duplicate: false, template: null })
const reportCampaignId = ref<string | null>(null)
// Resolve from the store so live count updates (polling/realtime) flow into the panel.
const reportCampaign = computed(() =>
  reportCampaignId.value ? campaignsStore.campaigns.find((c) => c.id === reportCampaignId.value) ?? null : null)
const toast = ref<{ title: string; sub: string; error?: boolean } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | undefined

const active = computed(() => (activeId.value ? crm.deals.find((d) => d.id === activeId.value) ?? null : null))
const activeCompany = computed(() => (activeCompanyId.value ? crm.company(activeCompanyId.value) ?? null : null))

function fireToast(title: string, sub = '', error = false) {
  toast.value = { title, sub, error }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = null), 4200)
}
// The open deal mirrors into ?deal=<id> so deals are deep-linkable from the
// task drawer, chat, or a pasted URL.
function setDealQuery(id: string | null) {
  const q = { ...route.query }
  if (id) q.deal = id
  else delete q.deal
  void router.replace({ query: q })
}
function open(deal: Deal) {
  activeId.value = deal.id
  setDealQuery(deal.id)
}
function closeDeal() {
  activeId.value = null
  setDealQuery(null)
}
function openCompany(company: Company) {
  activeCompanyId.value = company.id
}
// From the company panel's deals list — swap panels.
function openDealFromCompany(deal: Deal) {
  activeCompanyId.value = null
  open(deal)
}

// Deep-link: open the queried deal once this client's pipeline is in. Watching
// crm.deals (not just loaded) also catches client-switch reloads.
watch(
  [() => crm.loaded, () => crm.deals, () => route.query.deal] as const,
  ([loaded, deals, q]) => {
    if (!loaded || typeof q !== 'string' || !q) return
    if (deals.some((d) => d.id === q)) activeId.value = q
  },
  { immediate: true },
)
function move(id: string, stage: StageId) {
  void crm.move(id, stage)
}
function convert(deal: Deal) {
  const co = crm.company(deal.companyId)
  closeDeal()
  void crm.convert(deal).then((ok) => {
    if (ok) fireToast((co?.name ?? 'Company') + ' is now an active client', 'Client record created — set up its workspace in Comms.')
  })
}
function openNewDeal(stage?: StageId) {
  newDeal.value = { open: true, stage }
}

// Surface store-level failures (move/convert/create) as an error toast.
watch(() => crm.error, (msg) => {
  if (!msg) return
  fireToast(msg, '', true)
  crm.error = null
})
// Campaign failures too — except while the compose panel is open, which shows
// them inline next to the send button.
watch(() => campaignsStore.error, (msg) => {
  if (!msg || campaignPanel.value.open) return
  fireToast(msg, '', true)
  campaignsStore.error = null
})

// Re-scope the CRM whenever the active client workspace changes.
watch(() => clients.currentClientId, () => {
  activeId.value = null
  activeCompanyId.value = null
  newDeal.value.open = false
  importOpen.value = false
  campaignPanel.value = { open: false, campaign: null, duplicate: false, template: null }
  reportCampaignId.value = null
  void crm.load()
  void campaignsStore.load()
})

onMounted(() => {
  void crm.load()
  crm.subscribe()
  void campaignsStore.load()
  campaignsStore.subscribe()
})
onBeforeUnmount(() => {
  void crm.unsubscribe()
  void campaignsStore.unsubscribe()
})

// Drafts open in the composer; everything else opens the report panel.
function openCampaign(campaign: Campaign | null) {
  campaignsStore.error = null
  if (campaign && campaign.status !== 'draft') {
    reportCampaignId.value = campaign.id
    // Engagement lands long after sending stops — pull fresh numbers on open.
    void campaignsStore.refreshCounts()
    return
  }
  campaignPanel.value = { open: true, campaign, duplicate: false, template: null }
}
function duplicateCampaign(campaign: Campaign) {
  campaignsStore.error = null
  reportCampaignId.value = null
  campaignPanel.value = { open: true, campaign, duplicate: true, template: null }
}
function onCampaignSent(summary: string) {
  campaignPanel.value = { open: false, campaign: null, duplicate: false, template: null }
  fireToast('Campaign sending', summary)
}
// "Use in a campaign" from the design studio.
const templatesStore = useEmailTemplatesStore()
function composeFromTemplate(template: EmailTemplate) {
  campaignsStore.error = null
  view.value = 'campaigns'
  campaignPanel.value = { open: true, campaign: null, duplicate: false, template }
  templatesStore.bumpUsage(template.id)
}
</script>

<template>
  <div class="flex flex-col h-full bg-base-100 text-base-content">
    <!-- header: identity + tabs + new deal -->
    <div class="flex items-center gap-1 px-5 pt-3">
      <div class="flex items-center gap-2.5 pr-3 mr-1">
        <span class="w-[30px] h-[30px] rounded-[9px] grid place-items-center" :style="{ background: 'var(--accent-soft)', color: 'var(--accent-fg)' }">
          <Handshake :size="17" />
        </span>
        <div class="leading-tight">
          <div class="text-[15px] font-extrabold tracking-tight">CRM</div>
        </div>
        <span class="text-[12.5px] text-base-content/40 hidden sm:inline truncate max-w-[14rem]">
          {{ clients.currentClient?.name ?? 'Sales & relationships' }}
        </span>
      </div>

      <button
        v-for="t in TABS"
        :key="t.id"
        class="crm-tab flex items-center gap-[7px] px-3 py-[7px] rounded-[9px] text-sm font-semibold transition-colors shrink-0"
        :class="view === t.id ? 'crm-tab-on' : 'text-base-content/60 hover:bg-base-200 hover:text-base-content'"
        :title="t.label"
        @click="view = t.id"
      >
        <component :is="t.icon" :size="17" /> <span class="hidden md:inline">{{ t.label }}</span>
      </button>

      <div class="flex-1" />
      <button class="flex items-center gap-[7px] h-[34px] px-3 rounded-[9px] text-[13px] font-semibold text-base-content/60 hover:bg-base-200 hover:text-base-content whitespace-nowrap" title="Import from HubSpot CSV" @click="importOpen = true">
        <Upload :size="15" /> <span class="hidden md:inline">Import</span>
      </button>
      <button class="flex items-center gap-[7px] h-[34px] px-3.5 rounded-[9px] text-[13.5px] font-bold text-white whitespace-nowrap" :style="{ background: 'var(--accent)' }" @click="openNewDeal()">
        <Plus :size="16" /> New deal
      </button>
    </div>

    <div class="h-3" />

    <!-- loading skeleton -->
    <div v-if="!crm.loaded" class="flex-1 overflow-hidden px-5 pt-1">
      <div class="flex gap-3.5">
        <div v-for="n in 4" :key="n" class="w-[286px] flex-none rounded-xl border border-base-300 bg-base-200 p-2.5 flex flex-col gap-2.5">
          <div class="h-7 rounded-md bg-base-300/60 animate-pulse" />
          <div v-for="m in 3" :key="m" class="h-24 rounded-[11px] bg-base-100 border border-base-300 animate-pulse" />
        </div>
      </div>
    </div>

    <div v-else class="flex-1 flex min-h-0">
      <CrmOverview v-if="view === 'overview'" :deals="crm.deals" @open="open" />
      <div v-else-if="view === 'pipeline'" class="flex-1 flex flex-col min-h-0">
        <!-- Board | Table toggle — the Pipeline tab keeps its name -->
        <div class="flex items-center px-5 pb-2 pt-0.5">
          <div class="flex gap-0.5 bg-base-200 p-[3px] rounded-lg">
            <button
              type="button"
              class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12.5px] font-semibold transition-colors"
              :class="pipelineMode === 'board' ? 'bg-base-100 shadow-sm text-base-content' : 'text-base-content/50 hover:text-base-content'"
              @click="pipelineMode = 'board'"
            ><Columns3 :size="15" /> Board</button>
            <button
              type="button"
              class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12.5px] font-semibold transition-colors"
              :class="pipelineMode === 'table' ? 'bg-base-100 shadow-sm text-base-content' : 'text-base-content/50 hover:text-base-content'"
              @click="pipelineMode = 'table'"
            ><Table2 :size="15" /> Table</button>
          </div>
        </div>
        <CrmPipelineBoard v-if="pipelineMode === 'board'" :deals="crm.deals" @open="open" @move="move" @new-deal="openNewDeal" />
        <CrmDealsTable v-else :deals="crm.deals" @open="open" @move="move" @new-deal="openNewDeal" @toast="(t, s) => fireToast(t, s)" />
      </div>
      <CrmCompaniesTable v-else-if="view === 'companies'" @open-company="openCompany" />
      <CrmDesignStudio v-else-if="view === 'designs'" @compose="composeFromTemplate" />
      <CrmCampaigns v-else-if="view === 'campaigns'" @new="openCampaign(null)" @open="openCampaign" @duplicate="duplicateCampaign" />
      <CrmContactsTable v-else />
    </div>

    <CrmDealDetail v-if="active" :key="active.id" :deal="active" @close="closeDeal" @move="move" @convert="convert" />
    <CrmCompanyDetail v-else-if="activeCompany" :key="activeCompany.id" :company="activeCompany" @close="activeCompanyId = null" @open-deal="openDealFromCompany" />
    <CrmNewDealPanel v-if="newDeal.open" @close="newDeal.open = false" @created="fireToast('Deal created', 'Added to your pipeline.')" />
    <CrmImportPanel v-if="importOpen" @close="importOpen = false" @done="(s) => fireToast('Import complete', s)" />
    <CrmCampaignPanel
      v-if="campaignPanel.open"
      :key="(campaignPanel.campaign?.id ?? campaignPanel.template?.id ?? 'new') + (campaignPanel.duplicate ? '-dup' : '')"
      :campaign="campaignPanel.campaign"
      :duplicate="campaignPanel.duplicate"
      :template="campaignPanel.template"
      @close="campaignPanel = { open: false, campaign: null, duplicate: false, template: null }"
      @sent="onCampaignSent"
    />
    <CrmCampaignReport
      v-if="reportCampaign"
      :key="reportCampaign.id"
      :campaign="reportCampaign"
      @close="reportCampaignId = null"
      @duplicate="duplicateCampaign"
    />

    <!-- toast -->
    <Transition name="crm-toast">
      <div
        v-if="toast"
        class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[120] flex items-center gap-3 pl-3 pr-4 py-3 rounded-xl border border-base-300 bg-base-100 shadow-2xl"
      >
        <span
          class="w-7 h-7 rounded-lg grid place-items-center shrink-0"
          :style="toast.error
            ? { background: 'color-mix(in oklab, #c2253c 14%, var(--color-base-100))', color: '#c2253c' }
            : { background: 'var(--accent-soft)', color: 'var(--accent-fg)' }"
        >
          <component :is="toast.error ? AlertTriangle : Handshake" :size="15" />
        </span>
        <div class="min-w-0">
          <div class="text-[13.5px] font-bold text-base-content">{{ toast.title }}</div>
          <div v-if="toast.sub" class="text-xs text-base-content/50">{{ toast.sub }}</div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.crm-tab-on {
  color: var(--accent-fg);
  background: var(--accent-soft);
}
.crm-toast-enter-active {
  animation: crm-toast-in 0.26s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
}
.crm-toast-leave-active {
  transition: opacity 0.2s ease;
}
.crm-toast-leave-to {
  opacity: 0;
}
@keyframes crm-toast-in {
  from { opacity: 0; transform: translate(-50%, 10px) scale(0.96); }
  to { opacity: 1; transform: translate(-50%, 0) scale(1); }
}
</style>
