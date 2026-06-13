<script setup lang="ts">
import { computed, provide, ref, onMounted, onBeforeUnmount, defineAsyncComponent } from 'vue'
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
    route.path.startsWith('/app/crm') ||
    // The form builder is a 3-pane editor that manages its own scroll.
    /^\/app\/forms\/.+/.test(route.path),
)

// Tasks keeps the padded canvas but on the white surface — its board columns
// are base-200 tints (CRM pipeline style) and vanish on a base-200 page.
const whiteCanvas = computed(() => route.path.startsWith('/app/tasks'))

// The comms/huddle stream lives here (the shell stays mounted across all
// workstation routes), so a call keeps running as you move between pages.
const commsStream = useChannelStream(computed(() => channels.currentChannelId))
provide(COMMS_STREAM, commsStream)

// Cross-channel huddle + occupancy presence so the channel list can flag
// huddles anywhere and show who's sitting in which channel.
// "Viewing" = ANY surface actively showing the channel — the Comms page, the
// expanded dock, the Messages tab — via the stream's viewer registry, and only
// while the tab is actually visible. DM threads stay private (no one needs to
// see who's reading their DMs), so is_dm channels never broadcast a location.
const tabVisible = ref(typeof document === 'undefined' || document.visibilityState === 'visible')
const onVisibility = () => { tabVisible.value = document.visibilityState === 'visible' }
onMounted(() => document.addEventListener('visibilitychange', onVisibility))
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisibility))

const huddlePresence = useHuddlePresence({
  inHuddle: commsStream.inHuddle,
  channelId: computed(() => channels.currentChannelId),
  viewingChannelId: computed(() => {
    if (!tabVisible.value || commsStream.viewers.value <= 0) return null
    if (channels.currentChannel?.is_dm) return null
    return channels.currentChannelId
  })
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
        :class="fullBleed
          ? 'overflow-hidden bg-base-100'
          : ['overflow-y-auto px-6 py-6', whiteCanvas ? 'bg-base-100' : 'bg-base-200']"
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
