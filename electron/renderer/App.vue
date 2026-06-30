<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Mic, History, Settings, Layers, LogOut, CheckCircle2, AlertCircle, Phone, Briefcase, Activity, ListChecks, Sun, Moon } from 'lucide-vue-next'
import { useTheme } from './composables/useTheme'
import MeetingControls from './components/MeetingControls.vue'
import SummaryViewer from './components/SummaryViewer.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import MeetingHistory from './components/MeetingHistory.vue'
import LoginScreen from './components/LoginScreen.vue'
import CrmView from './components/crm/CrmView.vue'
import OpsActivityPanel from './components/activity/OpsActivityPanel.vue'
import OpsTaskInbox from './components/tasks/OpsTaskInbox.vue'
import OnlineUsersIndicator from './components/presence/OnlineUsersIndicator.vue'
import HexClipDef from './components/HexClipDef.vue'
import { useTasks } from './composables/useTasks'
import ToastContainer from './components/ToastContainer.vue'
import DialogContainer from './components/DialogContainer.vue'
import AddLeadModal from './components/AddLeadModal.vue'
import ActiveCallBanner from './components/ActiveCallBanner.vue'
import GlobalSearchModal from './components/GlobalSearchModal.vue'
import { registerGlobalSearchHotkey } from './composables/useGlobalSearch'
import { useAuthStore } from './stores/auth'

registerGlobalSearchHotkey()

type Tab = 'meeting' | 'history' | 'crm' | 'tasks' | 'feed' | 'settings'
const activeTab = ref<Tab>('meeting')
const auth = useAuthStore()
const { isDark, toggle: toggleTheme } = useTheme()
const syncStatus = ref<{ status: 'syncing' | 'synced' | 'error'; error?: string } | null>(null)
const focusedLeadId = ref<string | null>(null)
const taskStore = useTasks()

function jumpToCrmLead(leadId: string) {
  focusedLeadId.value = leadId
  activeTab.value = 'crm'
}

function openDialer() {
  window.electronAPI.dialer.open()
}

const allTabs: { key: Tab; label: string; icon: any }[] = [
  { key: 'meeting', label: 'Meeting', icon: Mic },
  { key: 'history', label: 'History', icon: History },
  { key: 'crm', label: 'CRM', icon: Briefcase },
  { key: 'tasks', label: 'Tasks', icon: ListChecks },
  { key: 'feed', label: 'Feed', icon: Activity },
  { key: 'settings', label: 'Settings', icon: Settings },
]

// Salespeople get a focused outbound cockpit: no meeting intelligence,
// no meeting history, no AI/transcription settings. Every other role
// (va, pm, admin, superadmin) sees the full app.
const SALES_HIDDEN_TABS: Tab[] = ['meeting', 'history', 'settings']
const tabs = computed(() =>
  auth.session?.role === 'sales'
    ? allTabs.filter(t => !SALES_HIDDEN_TABS.includes(t.key))
    : allTabs,
)

onMounted(async () => {
  await auth.init()

  // If the signed-in role can't see the default tab (e.g. sales can't see
  // 'meeting'), fall back to the first tab they can see.
  if (!tabs.value.some(t => t.key === activeTab.value)) {
    activeTab.value = tabs.value[0]?.key ?? 'crm'
  }

  window.electronAPI.onSyncStatus((data) => {
    syncStatus.value = data
    if (data.status === 'synced') {
      setTimeout(() => { syncStatus.value = null }, 4000)
    }
  })
})
</script>

<template>
  <!-- Login screen until authenticated -->
  <LoginScreen v-if="!auth.isAuthenticated && !auth.loading" />

  <!-- Loading splash on first init -->
  <div v-else-if="auth.loading && !auth.isAuthenticated" class="h-screen flex items-center justify-center text-sm text-base-content/50">
    Loading…
  </div>

  <!-- Authenticated app -->
  <div v-else class="h-screen flex flex-col gap-3 p-3 bg-base-200 text-base-content overflow-hidden">
    <!-- Shared honeycomb-cell clip (used by .hc-hex logo marks below) -->
    <HexClipDef />

    <!-- Top bar — floating card holding brand, actions, and view tabs -->
    <div class="hc-card px-6 pt-3 flex flex-col shrink-0">
    <!-- Header -->
    <div class="px-0 py-1 flex items-center justify-between">
      <div class="flex items-center gap-2.5">
        <div class="w-7 h-7 hc-hex bg-hivemind flex items-center justify-center">
          <Layers class="w-3.5 h-3.5 text-white" />
        </div>
        <span class="text-sm font-semibold tracking-tight">BuzzyHive AI</span>
      </div>
      <div class="flex items-center gap-3">
        <button
          class="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded bg-primary text-white hover:bg-primary/90 transition-colors shadow-sm"
          title="Open the phone dialer"
          @click="openDialer()"
        >
          <Phone class="w-3 h-3" />
          Dialer
        </button>
        <OnlineUsersIndicator />
        <span class="text-[11px] text-base-content/50">{{ auth.session?.fullName || auth.session?.email }}</span>
        <button
          class="text-base-content/40 hover:text-base-content transition-colors"
          :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          @click="toggleTheme()"
        >
          <component :is="isDark ? Sun : Moon" class="w-3.5 h-3.5" />
        </button>
        <button
          class="text-base-content/40 hover:text-base-content transition-colors"
          title="Sign out"
          @click="auth.signOut()"
        >
          <LogOut class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Tab nav (second row of the floating top bar) -->
    <div class="flex gap-0">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors"
        :class="activeTab === tab.key
          ? 'border-primary text-primary'
          : 'border-transparent text-base-content/50 hover:text-base-content'"
        @click="activeTab = tab.key"
      >
        <component :is="tab.icon" class="w-3.5 h-3.5" />
        {{ tab.label }}
      </button>
    </div>
    </div>
    <!-- /Top bar card -->

    <!-- Sync status banner -->
    <div
      v-if="syncStatus"
      class="hc-card px-6 py-2 text-xs flex items-center gap-2 shrink-0"
      :class="syncStatus.status === 'synced'
        ? 'bg-green-50 border-green-200 text-green-700'
        : syncStatus.status === 'error'
          ? 'bg-red-50 border-red-200 text-red-700'
          : 'text-base-content/70'"
    >
      <component :is="syncStatus.status === 'synced' ? CheckCircle2 : AlertCircle" class="w-3.5 h-3.5" />
      <span v-if="syncStatus.status === 'synced'">Meeting synced to BuzzyHive cloud</span>
      <span v-else-if="syncStatus.status === 'error'">Sync failed: {{ syncStatus.error }}</span>
      <span v-else>Syncing…</span>
    </div>

    <!-- Active call banner — appears when dialer is on a call -->
    <ActiveCallBanner @select-lead="jumpToCrmLead" />

    <!-- Content — floating card -->
    <div class="hc-card flex-1 min-h-0 overflow-y-auto">
      <MeetingControls v-if="activeTab === 'meeting'" />
      <SummaryViewer v-if="activeTab === 'meeting'" />

      <MeetingHistory v-if="activeTab === 'history'" />

      <CrmView v-if="activeTab === 'crm'" :focus-lead-id="focusedLeadId" />

      <OpsTaskInbox v-if="activeTab === 'tasks'" @lead-click="jumpToCrmLead" />

      <OpsActivityPanel v-if="activeTab === 'feed'" @lead-click="jumpToCrmLead" />

      <SettingsPanel v-if="activeTab === 'settings'" />
    </div>

    <!-- Footer -->
    <div class="px-6 pt-0.5 text-[10px] text-base-content/30 text-center flex items-center justify-center gap-3 shrink-0">
      <span>BuzzyHive AI v1.0 — Powered by Gemini + ElevenLabs Scribe</span>
      <span class="text-base-content/20">·</span>
      <span class="flex items-center gap-1">
        <Phone class="w-2.5 h-2.5" />
        Click the <span class="font-semibold text-base-content/50">Dialer</span> button (top-right) — or press <kbd class="px-1 py-0.5 rounded bg-base-200 text-base-content/50 text-[9px] font-mono">Ctrl+Shift+D</kbd>
      </span>
    </div>

    <ToastContainer />
    <DialogContainer />
    <AddLeadModal />
    <GlobalSearchModal @select="jumpToCrmLead" />
  </div>
</template>
