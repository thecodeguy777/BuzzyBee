<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import ClientSwitcher from '@/components/workstation/ClientSwitcher.vue'
import GlobalSearch from '@/components/workstation/GlobalSearch.vue'
import RefreshButton from '@/components/workstation/RefreshButton.vue'
import NotificationBell from '@/components/workstation/NotificationBell.vue'
import TimerChip from '@/components/workstation/TimerChip.vue'

const auth = useAuthStore()
</script>

<template>
  <header
    class="h-14 shrink-0 bg-base-100 border border-base-300 rounded-xl shadow-sm flex items-center px-3 sm:px-5 gap-3"
  >
    <ClientSwitcher />

    <div class="flex-1 flex justify-center min-w-0 px-2">
      <GlobalSearch />
    </div>
    <div class="flex items-center gap-2 shrink-0">
      <RefreshButton />
      <NotificationBell />
      <TimerChip v-if="auth.role === 'va'" />
    </div>
  </header>
</template>
