<script setup lang="ts">
import { computed, provide, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'
import { useProjectsStore } from '@/stores/projects'
import { useChannelsStore } from '@/stores/channels'
import { useChannelStream } from '@/composables/useChannelStream'
import { useHuddlePresence } from '@/composables/useHuddlePresence'
import { COMMS_STREAM, HUDDLE_PRESENCE } from '@/composables/commsStream'
import WorkstationSidebar from '@/components/workstation/WorkstationSidebar.vue'
import WorkstationTopbar from '@/components/workstation/WorkstationTopbar.vue'
import ActivityRail from '@/components/workstation/ActivityRail.vue'
import SwitchClientModal from '@/components/workstation/SwitchClientModal.vue'
import ReportButton from '@/components/workstation/ReportButton.vue'
import CommsDock from '@/components/comms/CommsDock.vue'
// Heavy (rich-text editor, attachments, chat) — load on demand so it doesn't
// weigh down the eager shell bundle. It self-gates on tasks.selectedTask.
const TaskDrawer = defineAsyncComponent(() => import('@/components/workstation/TaskDrawer.vue'))

const auth = useAuthStore()
const route = useRoute()
const clients = useClientsStore()
const projects = useProjectsStore()
const channels = useChannelsStore()

// Comms + Messages + CRM run edge-to-edge (own panes manage scroll); other
// pages keep the padded, scrollable content area.
const fullBleed = computed(
  () =>
    route.path.startsWith('/app/comms') ||
    route.path.startsWith('/app/messages') ||
    route.path.startsWith('/app/crm'),
)

// The comms/huddle stream lives here (the shell stays mounted across all
// workstation routes), so a call keeps running as you move between pages.
const commsStream = useChannelStream(computed(() => channels.currentChannelId))
provide(COMMS_STREAM, commsStream)

// Cross-channel huddle + occupancy presence so the channel list can flag
// huddles anywhere and show who's sitting in which channel.
const huddlePresence = useHuddlePresence({
  inHuddle: commsStream.inHuddle,
  channelId: computed(() => channels.currentChannelId),
  // "Viewing" = the selected channel while the Comms surface is on screen.
  viewingChannelId: computed(() =>
    route.path.startsWith('/app/comms') ? channels.currentChannelId : null,
  )
})
provide(HUDDLE_PRESENCE, huddlePresence)

// Prime the stores the sidebar/topbar depend on once the user is authenticated.
if (auth.isAuthenticated && !clients.loaded) {
  void clients.fetchMine()
}
if (auth.isAuthenticated && !projects.loaded) {
  void projects.fetchAll()
}
</script>

<template>
  <div class="h-screen overflow-hidden flex bg-base-100 text-base-content">
    <WorkstationSidebar />

    <div class="flex-1 flex flex-col min-w-0">
      <WorkstationTopbar />

      <main
        class="flex-1 min-h-0"
        :class="fullBleed ? 'overflow-hidden bg-base-100' : 'overflow-y-auto px-6 py-6 bg-base-200'"
      >
        <slot />
      </main>
    </div>

    <ActivityRail v-if="!fullBleed" />

    <SwitchClientModal />
    <ReportButton />
    <CommsDock />
    <TaskDrawer />
  </div>
</template>
