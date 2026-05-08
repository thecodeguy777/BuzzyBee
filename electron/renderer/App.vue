<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Mic, History, Settings, Layers, LogOut, CheckCircle2, AlertCircle } from 'lucide-vue-next'
import MeetingControls from './components/MeetingControls.vue'
import SummaryViewer from './components/SummaryViewer.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import MeetingHistory from './components/MeetingHistory.vue'
import LoginScreen from './components/LoginScreen.vue'
import { useAuthStore } from './stores/auth'

type Tab = 'meeting' | 'history' | 'settings'
const activeTab = ref<Tab>('meeting')
const auth = useAuthStore()
const syncStatus = ref<{ status: 'syncing' | 'synced' | 'error'; error?: string } | null>(null)

const tabs: { key: Tab; label: string; icon: any }[] = [
  { key: 'meeting', label: 'Meeting', icon: Mic },
  { key: 'history', label: 'History', icon: History },
  { key: 'settings', label: 'Settings', icon: Settings },
]

onMounted(async () => {
  await auth.init()

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
  <div v-else class="h-screen flex flex-col bg-base-100 text-base-content">
    <!-- Header -->
    <div class="border-b border-base-300 px-6 py-3 flex items-center justify-between bg-base-100">
      <div class="flex items-center gap-2.5">
        <div class="w-7 h-7 rounded-md bg-hivemind flex items-center justify-center">
          <Layers class="w-3.5 h-3.5 text-white" />
        </div>
        <span class="text-sm font-semibold tracking-tight">HiveMind AI</span>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-[11px] text-base-content/50">{{ auth.session?.fullName || auth.session?.email }}</span>
        <button
          class="text-base-content/40 hover:text-base-content transition-colors"
          title="Sign out"
          @click="auth.signOut()"
        >
          <LogOut class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Tab nav -->
    <div class="border-b border-base-300 px-6 flex gap-0">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px"
        :class="activeTab === tab.key
          ? 'border-primary text-primary'
          : 'border-transparent text-base-content/50 hover:text-base-content'"
        @click="activeTab = tab.key"
      >
        <component :is="tab.icon" class="w-3.5 h-3.5" />
        {{ tab.label }}
      </button>
    </div>

    <!-- Sync status banner -->
    <div
      v-if="syncStatus"
      class="px-6 py-2 text-xs flex items-center gap-2 border-b"
      :class="syncStatus.status === 'synced'
        ? 'bg-green-50 border-green-200 text-green-700'
        : syncStatus.status === 'error'
          ? 'bg-red-50 border-red-200 text-red-700'
          : 'bg-base-200 border-base-300 text-base-content/70'"
    >
      <component :is="syncStatus.status === 'synced' ? CheckCircle2 : AlertCircle" class="w-3.5 h-3.5" />
      <span v-if="syncStatus.status === 'synced'">Meeting synced to HiveMind cloud</span>
      <span v-else-if="syncStatus.status === 'error'">Sync failed: {{ syncStatus.error }}</span>
      <span v-else>Syncing…</span>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto">
      <MeetingControls v-if="activeTab === 'meeting'" />
      <SummaryViewer v-if="activeTab === 'meeting'" />

      <MeetingHistory v-if="activeTab === 'history'" />

      <SettingsPanel v-if="activeTab === 'settings'" />
    </div>

    <!-- Footer -->
    <div class="border-t border-base-300 px-6 py-2 text-[10px] text-base-content/30 text-center">
      HiveMind AI v1.0 — Powered by Gemini + ElevenLabs Scribe
    </div>
  </div>
</template>
