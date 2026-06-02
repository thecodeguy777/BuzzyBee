<script setup lang="ts">
import { computed, provide, defineAsyncComponent } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'
import { useProjectsStore } from '@/stores/projects'
import { useChannelsStore } from '@/stores/channels'
import { useChannelStream } from '@/composables/useChannelStream'
import { COMMS_STREAM } from '@/composables/commsStream'
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
const clients = useClientsStore()
const projects = useProjectsStore()
const channels = useChannelsStore()

// The comms/huddle stream lives here (the shell stays mounted across all
// workstation routes), so a call keeps running as you move between pages.
const commsStream = useChannelStream(computed(() => channels.currentChannelId))
provide(COMMS_STREAM, commsStream)

// Prime the stores the sidebar/topbar depend on once the user is authenticated.
if (auth.isAuthenticated && !clients.loaded) {
  void clients.fetchMine()
}
if (auth.isAuthenticated && !projects.loaded) {
  void projects.fetchAll()
}
</script>

<template>
  <div class="h-screen overflow-hidden flex bg-base-200 text-base-content gap-2 p-2">
    <WorkstationSidebar />

    <div class="flex-1 flex flex-col min-w-0 gap-2">
      <WorkstationTopbar />

      <main class="flex-1 min-h-0 overflow-y-auto px-6 py-6">
        <slot />
      </main>
    </div>

    <ActivityRail />

    <SwitchClientModal />
    <ReportButton />
    <CommsDock />
    <TaskDrawer />
  </div>
</template>
