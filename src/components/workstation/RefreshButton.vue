<script setup lang="ts">
import { ref, computed } from 'vue'
import { RefreshCw, Check } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'
import { useProjectsStore } from '@/stores/projects'
import { useProjectMembersStore } from '@/stores/projectMembers'
import { useTasksStore } from '@/stores/tasks'
import { useTaskFieldsStore } from '@/stores/taskFields'
import { useTeamStore } from '@/stores/team'
import { useTicketsStore } from '@/stores/tickets'

const auth = useAuthStore()
const clients = useClientsStore()
const projects = useProjectsStore()
const members = useProjectMembersStore()
const tasks = useTasksStore()
const taskFields = useTaskFieldsStore()
const team = useTeamStore()
const tickets = useTicketsStore()

const state = ref<'idle' | 'refreshing' | 'done'>('idle')
let doneTimer: ReturnType<typeof setTimeout> | undefined

const tooltip = computed(() => {
  if (state.value === 'refreshing') return 'Refreshing…'
  if (state.value === 'done') return 'Refreshed'
  return 'Refresh data'
})

async function refreshAll() {
  if (state.value === 'refreshing') return
  state.value = 'refreshing'

  // Run independent fetches in parallel; tickets only when the user is admin.
  const jobs: Promise<unknown>[] = [
    clients.fetchMine(),
    projects.fetchAll(),
    members.fetchAll(),
    tasks.fetchAll(),
    taskFields.fetchAll(),
    team.fetchAssignments()
  ]
  if (auth.isAdmin) jobs.push(tickets.fetchAll())

  // Settle all — one failure shouldn't kill the others.
  await Promise.allSettled(jobs)

  state.value = 'done'
  if (doneTimer) clearTimeout(doneTimer)
  doneTimer = setTimeout(() => {
    if (state.value === 'done') state.value = 'idle'
  }, 1200)
}
</script>

<template>
  <button
    type="button"
    class="w-9 h-9 rounded-full flex items-center justify-center hover:bg-base-200 transition-colors text-base-content/60 hover:text-base-content"
    :disabled="state === 'refreshing'"
    :title="tooltip"
    :aria-label="tooltip"
    @click="refreshAll"
  >
    <Check
      v-if="state === 'done'"
      class="w-4 h-4 text-success"
      :stroke-width="2"
    />
    <RefreshCw
      v-else
      class="w-4 h-4"
      :class="state === 'refreshing' && 'animate-spin'"
      :stroke-width="1.75"
    />
  </button>
</template>
