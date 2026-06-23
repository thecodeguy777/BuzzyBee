<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Hash, ChevronRight, HelpCircle } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useChannelsStore } from '@/stores/channels'
import { useTeamStore } from '@/stores/team'
import { useTimeStore } from '@/stores/time'
import { useOnlinePresence, reportPath } from '@/composables/useOnlinePresence'
import { displayName } from '@/lib/format'
import { useClientsStore } from '@/stores/clients'
import GlobalSearch from '@/components/workstation/GlobalSearch.vue'
import ThemeToggle from '@/components/workstation/ThemeToggle.vue'
import RefreshButton from '@/components/workstation/RefreshButton.vue'
import NotificationBell from '@/components/workstation/NotificationBell.vue'
import TimerChip from '@/components/workstation/TimerChip.vue'
import OnlineNowChip from '@/components/workstation/OnlineNowChip.vue'
import { useTour } from '@/composables/useTour'

const auth = useAuthStore()
const clients = useClientsStore()
const route = useRoute()
const channels = useChannelsStore()
const team = useTeamStore()
const time = useTimeStore()
const { startTour } = useTour()

// Join the global presence channel (everyone tracks; admins see the list) and
// keep our payload's current-page fresh as we navigate.
useOnlinePresence()
watch(() => route.path, (p) => reportPath(p), { immediate: true })

// Breadcrumb channel segment — meaningful on the comms + messages surfaces.
const showChannelCrumb = computed(
  () => (route.path.startsWith('/app/comms') || route.path.startsWith('/app/messages')) && !!channels.currentChannel,
)
const channelIsDm = computed(() => !!channels.currentChannel?.is_dm)
const channelLabel = computed(() => {
  const ch = channels.currentChannel
  if (!ch) return ''
  if (ch.is_dm) {
    if (ch.is_group && ch.name) return ch.name
    const members = channels.dmMembers[ch.id] ?? []
    if (ch.is_group) {
      return members.map((id) => team.profiles[id]?.full_name?.split(' ')[0]).filter(Boolean).join(', ') || 'Group message'
    }
    const uid = members[0]
    return displayName(uid ? team.profiles[uid] : null, 'Direct message')
  }
  return ch.name
})
</script>

<template>
  <header
    class="h-14 shrink-0 bg-base-100 border-b border-base-300 flex items-center px-2 sm:px-5 gap-1 sm:gap-2"
  >
    <!-- current client (switching now lives in the sidebar) -->
    <span class="text-sm font-semibold text-base-content truncate max-w-[8rem] sm:max-w-[12rem] shrink-0">
      {{ clients.currentClient?.name ?? 'No client selected' }}
    </span>

    <!-- breadcrumb: ▸ #channel (comms only, needs the room) -->
    <template v-if="showChannelCrumb">
      <ChevronRight class="hidden sm:block w-4 h-4 text-base-content/30 shrink-0" :stroke-width="2" />
      <span class="hidden sm:flex items-center gap-1 text-sm text-base-content/70 min-w-0 max-w-[14rem]">
        <Hash v-if="!channelIsDm" class="w-3.5 h-3.5 shrink-0" :stroke-width="2" />
        <span class="truncate font-medium">{{ channelLabel }}</span>
      </span>
    </template>

    <!-- Inline input on md+; collapses to an icon that opens a full-width
         overlay below that. -->
    <div class="flex-1 flex justify-end md:justify-center min-w-0 px-0.5 sm:px-2">
      <GlobalSearch />
    </div>
    <div class="flex items-center gap-1 sm:gap-2 shrink-0">
      <!-- Nice-to-haves give way first on phones -->
      <div class="hidden sm:flex items-center gap-2">
        <OnlineNowChip />
        <ThemeToggle />
        <RefreshButton />
        <button
          type="button"
          class="w-9 h-9 rounded-full flex items-center justify-center hover:bg-base-200 transition-colors text-base-content/70"
          title="Take the tour"
          aria-label="Take the product tour"
          @click="startTour"
        >
          <HelpCircle class="w-4 h-4" :stroke-width="1.75" />
        </button>
      </div>
      <NotificationBell />
      <!-- Always show a RUNNING timer (any role) — otherwise a non-VA with a
           live entry has no way to see or stop it. -->
      <TimerChip v-if="auth.role === 'va' || time.isRunning" />
    </div>
  </header>
</template>
