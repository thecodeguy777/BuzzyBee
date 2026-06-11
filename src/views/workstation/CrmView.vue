<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { Handshake, LayoutGrid, Filter, Building2, Users, Plus, Upload, AlertTriangle } from 'lucide-vue-next'
import CrmOverview from '@/components/crm/CrmOverview.vue'
import CrmPipelineBoard from '@/components/crm/CrmPipelineBoard.vue'
import CrmCompaniesTable from '@/components/crm/CrmCompaniesTable.vue'
import CrmContactsTable from '@/components/crm/CrmContactsTable.vue'
import CrmDealDetail from '@/components/crm/CrmDealDetail.vue'
import CrmCompanyDetail from '@/components/crm/CrmCompanyDetail.vue'
import CrmNewDealPanel from '@/components/crm/CrmNewDealPanel.vue'
import CrmImportPanel from '@/components/crm/CrmImportPanel.vue'
import { useCrmStore } from '@/stores/crm'
import { useClientsStore } from '@/stores/clients'
import type { Company, Deal, StageId } from '@/lib/crmData'

type ViewId = 'overview' | 'pipeline' | 'companies' | 'contacts'
const TABS: { id: ViewId; label: string; icon: unknown }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'pipeline', label: 'Pipeline', icon: Filter },
  { id: 'companies', label: 'Companies', icon: Building2 },
  { id: 'contacts', label: 'Contacts', icon: Users },
]

const crm = useCrmStore()
const clients = useClientsStore()
const view = ref<ViewId>('overview')
const activeId = ref<string | null>(null)
const activeCompanyId = ref<string | null>(null)
const importOpen = ref(false)
const newDeal = ref<{ open: boolean; stage?: StageId }>({ open: false })
const toast = ref<{ title: string; sub: string; error?: boolean } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | undefined

const active = computed(() => (activeId.value ? crm.deals.find((d) => d.id === activeId.value) ?? null : null))
const activeCompany = computed(() => (activeCompanyId.value ? crm.company(activeCompanyId.value) ?? null : null))

function fireToast(title: string, sub = '', error = false) {
  toast.value = { title, sub, error }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = null), 4200)
}
function open(deal: Deal) {
  activeId.value = deal.id
}
function openCompany(company: Company) {
  activeCompanyId.value = company.id
}
// From the company panel's deals list — swap panels.
function openDealFromCompany(deal: Deal) {
  activeCompanyId.value = null
  activeId.value = deal.id
}
function move(id: string, stage: StageId) {
  void crm.move(id, stage)
}
function convert(deal: Deal) {
  const co = crm.company(deal.companyId)
  activeId.value = null
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

// Re-scope the CRM whenever the active client workspace changes.
watch(() => clients.currentClientId, () => {
  activeId.value = null
  activeCompanyId.value = null
  newDeal.value.open = false
  importOpen.value = false
  void crm.load()
})

onMounted(() => {
  void crm.load()
  crm.subscribe()
})
onBeforeUnmount(() => void crm.unsubscribe())
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
      <CrmPipelineBoard v-else-if="view === 'pipeline'" :deals="crm.deals" @open="open" @move="move" @new-deal="openNewDeal" />
      <CrmCompaniesTable v-else-if="view === 'companies'" @open-company="openCompany" />
      <CrmContactsTable v-else />
    </div>

    <CrmDealDetail v-if="active" :key="active.id" :deal="active" @close="activeId = null" @move="move" @convert="convert" />
    <CrmCompanyDetail v-else-if="activeCompany" :key="activeCompany.id" :company="activeCompany" @close="activeCompanyId = null" @open-deal="openDealFromCompany" />
    <CrmNewDealPanel v-if="newDeal.open" @close="newDeal.open = false" @created="fireToast('Deal created', 'Added to your pipeline.')" />
    <CrmImportPanel v-if="importOpen" @close="importOpen = false" @done="(s) => fireToast('Import complete', s)" />

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
