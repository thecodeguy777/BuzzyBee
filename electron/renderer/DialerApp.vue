<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Phone, Users, BarChart3, Calendar, Minus, X, Pin, PinOff, FlaskConical, Play, Pause, Square, SkipForward, Target, Sun, Moon } from 'lucide-vue-next'
import { useTheme } from './composables/useTheme'
import DialerPanel from './components/dialer/DialerPanel.vue'
import LeadsPanel from './components/dialer/LeadsPanel.vue'
import ActivityPanel from './components/dialer/ActivityPanel.vue'
import SchedulePanel from './components/dialer/SchedulePanel.vue'
import ToastContainer from './components/ToastContainer.vue'
import DialogContainer from './components/DialogContainer.vue'
import GlobalSearchModal from './components/GlobalSearchModal.vue'
import HexClipDef from './components/HexClipDef.vue'
import { useAutoDialer } from './composables/useAutoDialer'
import { useBroadcast } from './composables/useBroadcast'
import { useToast } from './composables/useToast'
import { registerGlobalSearchHotkey } from './composables/useGlobalSearch'

registerGlobalSearchHotkey()

type Tab = 'schedule' | 'leads' | 'dialer' | 'activity'

// Schedule is the home tab — agents start the day with "what's on my calendar"
// not "who's in my queue". Leads is a reference list, not the work surface.
const activeTab = ref<Tab>('schedule')
const alwaysOnTop = ref(true)
const auto = useAutoDialer()
const broadcast = useBroadcast()
const toast = useToast()
const { isDark, toggle: toggleTheme } = useTheme()

function onGlobalSearchSelect(leadId: string) {
  const lead = auto.leads.leads.value.find(l => l.id === leadId)
  if (!lead) return
  broadcast.send({ type: 'lead:select', leadId })
  const inScope = auto.leadsInScope.value.some(l => l.id === leadId)
  if (!inScope) auto.dialScope.value = 'pipeline'
  activeTab.value = 'leads'
  toast.info(`Found ${lead.fullName}`, 'Open the main window to edit full details')
}

// Auto-jump to the dialer tab when a call is in progress or dispositioning
watch(() => auto.state.value, (s) => {
  if (s === 'previewing' || s === 'dialing' || s === 'in-call' || s === 'awaiting-disposition') {
    activeTab.value = 'dialer'
  }
})

// Also jump when the underlying dialer is active even outside a campaign
watch(() => auto.dialer.isActive.value, (active) => {
  if (active) activeTab.value = 'dialer'
})

const tabs: { key: Tab; label: string; icon: any }[] = [
  { key: 'schedule', label: 'Schedule', icon: Calendar },
  { key: 'leads', label: 'Leads', icon: Users },
  { key: 'dialer', label: 'Dialer', icon: Phone },
  { key: 'activity', label: 'Activity', icon: BarChart3 },
]

const dialableCount = computed(() => auto.leads.stats.value.dialable)
const todayCallCount = computed(() => auto.callLog.todayStats.value.total)
const callbackCount = computed(() =>
  auto.leads.leads.value.filter(l => l.nextCallbackAt
    && l.stage !== 'closed-won'
    && l.stage !== 'closed-lost').length,
)

const campaignStateLabel = computed(() => {
  switch (auto.state.value) {
    case 'previewing':           return `preview · ${auto.previewSecondsLeft.value}s`
    case 'dialing':              return 'dialing…'
    case 'in-call':              return 'in call'
    case 'awaiting-disposition': return 'disposition'
    case 'paused':               return 'paused'
    default:                     return ''
  }
})
const overdueCallbackCount = computed(() => {
  const nowMs = Date.now()
  return auto.leads.leads.value.filter(l =>
    l.nextCallbackAt
    && new Date(l.nextCallbackAt).getTime() < nowMs
    && l.stage !== 'closed-won'
    && l.stage !== 'closed-lost'
  ).length
})

function hide() {
  ;(window as any).dialerAPI?.window?.hide?.()
}

function minimize() {
  ;(window as any).dialerAPI?.window?.minimize?.()
}

function togglePin() {
  alwaysOnTop.value = !alwaysOnTop.value
  ;(window as any).dialerAPI?.window?.setAlwaysOnTop?.(alwaysOnTop.value)
}
</script>

<template>
  <div
    class="w-screen h-screen flex flex-col gap-2 p-2 rounded-xl overflow-hidden bg-base-200 text-base-content"
    style="border: 1px solid rgba(99, 102, 241, 0.25); box-shadow: 0 20px 40px -12px rgba(0,0,0,0.35);"
  >
    <HexClipDef />
    <!-- Draggable header — floating card -->
    <div
      class="flex items-center gap-2 px-3 py-2 select-none rounded-lg border border-base-300 shrink-0"
      style="-webkit-app-region: drag; background: linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(168, 85, 247, 0.08));"
    >
      <div class="w-5 h-5 hc-hex bg-hivemind flex items-center justify-center shrink-0">
        <Phone class="w-3 h-3 text-white" />
      </div>
      <span class="text-[11px] font-semibold tracking-wide text-base-content">BuzzyHive Dialer</span>

      <span
        class="text-[8px] font-medium uppercase tracking-wider px-1 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center gap-1"
        title="Carrier SDK not yet wired — calls are simulated"
      >
        <FlaskConical class="w-2 h-2" />
        Mock
      </span>

      <div class="flex-1"></div>

      <div class="flex items-center gap-0.5" style="-webkit-app-region: no-drag;">
        <button
          class="p-1 rounded hover:bg-base-200 text-base-content/50 hover:text-base-content transition-colors"
          :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          @click="toggleTheme()"
        >
          <component :is="isDark ? Sun : Moon" class="w-3 h-3" />
        </button>
        <button
          class="p-1 rounded hover:bg-base-200 text-base-content/50 hover:text-base-content transition-colors"
          :title="alwaysOnTop ? 'Unpin (allow other windows on top)' : 'Pin (always on top)'"
          @click="togglePin"
        >
          <component :is="alwaysOnTop ? Pin : PinOff" class="w-3 h-3" />
        </button>
        <button
          class="p-1 rounded hover:bg-base-200 text-base-content/50 hover:text-base-content transition-colors"
          title="Minimize"
          @click="minimize"
        >
          <Minus class="w-3 h-3" />
        </button>
        <button
          class="p-1 rounded hover:bg-red-500/10 hover:text-red-500 text-base-content/50 transition-colors"
          title="Hide (Ctrl+Shift+D to bring back)"
          @click="hide"
        >
          <X class="w-3 h-3" />
        </button>
      </div>
    </div>

    <!-- Campaign control bar — always visible during a campaign, any tab -->
    <transition name="campaign-bar">
      <div
        v-if="auto.isCampaignActive.value"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-base-300 shrink-0"
        :class="auto.state.value === 'paused'
          ? 'bg-amber-500/10'
          : 'bg-gradient-to-r from-primary/10 via-purple-500/10 to-primary/10'"
      >
        <component
          :is="auto.pacingMode.value === 'preview' ? Target : Play"
          class="w-3 h-3 shrink-0"
          :class="auto.state.value === 'paused' ? 'text-amber-600 dark:text-amber-400' : 'text-primary'"
          :fill="auto.pacingMode.value === 'power' ? 'currentColor' : 'none'"
        />
        <span class="text-[10px] font-semibold uppercase tracking-wider"
          :class="auto.state.value === 'paused' ? 'text-amber-700 dark:text-amber-400' : 'text-primary'"
        >
          {{ auto.pacingMode.value }} dial
        </span>
        <span class="text-[10px] text-base-content/50">·</span>
        <span class="text-[10px] text-base-content/60 truncate flex-1">
          {{ campaignStateLabel }}<span v-if="auto.currentLead.value"> · {{ auto.currentLead.value.fullName }}</span>
        </span>

        <!-- Skip (preview-only) -->
        <button
          v-if="auto.state.value === 'previewing'"
          class="p-1 rounded text-blue-600 hover:bg-blue-500/10 transition-colors"
          title="Dial now (skip countdown)"
          @click="auto.skipPreview()"
        >
          <SkipForward class="w-3 h-3" />
        </button>

        <!-- Pause / Resume -->
        <button
          v-if="auto.state.value !== 'paused'"
          class="p-1 rounded text-amber-600 hover:bg-amber-500/10 transition-colors"
          title="Pause campaign"
          @click="auto.pauseCampaign()"
        >
          <Pause class="w-3 h-3" />
        </button>
        <button
          v-else
          class="p-1 rounded text-green-600 hover:bg-green-500/10 transition-colors"
          title="Resume campaign"
          @click="auto.resumeCampaign()"
        >
          <Play class="w-3 h-3" fill="currentColor" />
        </button>

        <!-- Stop -->
        <button
          class="p-1 rounded text-red-500 hover:bg-red-500/10 transition-colors"
          title="Stop campaign"
          @click="auto.stopCampaign()"
        >
          <Square class="w-3 h-3" fill="currentColor" />
        </button>
      </div>
    </transition>

    <!-- Body — floating card -->
    <div class="flex-1 overflow-hidden rounded-lg border border-base-300 bg-base-100">
      <LeadsPanel v-show="activeTab === 'leads'" />
      <SchedulePanel v-show="activeTab === 'schedule'" />
      <DialerPanel v-show="activeTab === 'dialer'" />
      <ActivityPanel v-show="activeTab === 'activity'" />
    </div>

    <!-- Bottom nav — floating card -->
    <div class="rounded-lg border border-base-300 bg-base-100 flex overflow-hidden shrink-0">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors relative"
        :class="activeTab === tab.key
          ? 'text-primary'
          : 'text-base-content/40 hover:text-base-content/70'"
        @click="activeTab = tab.key"
      >
        <component :is="tab.icon" class="w-4 h-4" />
        <span class="text-[10px] font-medium">{{ tab.label }}</span>
        <span
          v-if="tab.key === 'leads' && dialableCount > 0"
          class="absolute top-1 right-1/4 text-[8px] font-semibold px-1 py-px rounded bg-primary/15 text-primary"
        >{{ dialableCount }}</span>
        <span
          v-if="tab.key === 'schedule' && callbackCount > 0"
          class="absolute top-1 right-1/4 text-[8px] font-semibold px-1 py-px rounded"
          :class="overdueCallbackCount > 0
            ? 'bg-red-500/15 text-red-600 dark:text-red-400'
            : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'"
        >{{ overdueCallbackCount > 0 ? `${overdueCallbackCount}!` : callbackCount }}</span>
        <span
          v-if="tab.key === 'activity' && todayCallCount > 0"
          class="absolute top-1 right-1/4 text-[8px] font-semibold px-1 py-px rounded bg-green-500/15 text-green-600 dark:text-green-400"
        >{{ todayCallCount }}</span>
        <span
          v-if="activeTab === tab.key"
          class="absolute top-0 left-0 right-0 h-0.5 bg-primary"
        />
      </button>
    </div>

    <ToastContainer />
    <DialogContainer />
    <GlobalSearchModal @select="onGlobalSearchSelect" />
  </div>
</template>

<style scoped>
.campaign-bar-enter-active,
.campaign-bar-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}
.campaign-bar-enter-from,
.campaign-bar-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}
.campaign-bar-enter-to,
.campaign-bar-leave-from {
  max-height: 36px;
}
</style>
