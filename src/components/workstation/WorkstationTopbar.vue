<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Hash, ChevronRight } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useChannelsStore } from '@/stores/channels'
import { useTeamStore } from '@/stores/team'
import { displayName } from '@/lib/format'
import ClientSwitcher from '@/components/workstation/ClientSwitcher.vue'
import GlobalSearch from '@/components/workstation/GlobalSearch.vue'
import RefreshButton from '@/components/workstation/RefreshButton.vue'
import NotificationBell from '@/components/workstation/NotificationBell.vue'
import TimerChip from '@/components/workstation/TimerChip.vue'

const auth = useAuthStore()
const route = useRoute()
const channels = useChannelsStore()
const team = useTeamStore()

// Breadcrumb channel segment — only meaningful on the comms surface.
const showChannelCrumb = computed(() => route.path.startsWith('/app/comms') && !!channels.currentChannel)
const channelIsDm = computed(() => !!channels.currentChannel?.is_dm)
const channelLabel = computed(() => {
  const ch = channels.currentChannel
  if (!ch) return ''
  if (ch.is_dm) {
    const uid = channels.dmOther[ch.id]
    return displayName(uid ? team.profiles[uid] : null, 'Direct message')
  }
  return ch.name
})
</script>

<template>
  <header
    class="h-14 shrink-0 bg-base-100 border-b border-base-300 flex items-center px-3 sm:px-5 gap-2"
  >
    <ClientSwitcher />

    <!-- breadcrumb: ▸ #channel (comms only) -->
    <template v-if="showChannelCrumb">
      <ChevronRight class="w-4 h-4 text-base-content/30 shrink-0" :stroke-width="2" />
      <span class="hidden sm:flex items-center gap-1 text-sm text-base-content/70 min-w-0 max-w-[14rem]">
        <Hash v-if="!channelIsDm" class="w-3.5 h-3.5 shrink-0" :stroke-width="2" />
        <span class="truncate font-medium">{{ channelLabel }}</span>
      </span>
    </template>

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
