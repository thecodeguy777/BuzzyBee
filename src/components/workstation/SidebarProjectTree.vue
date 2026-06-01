<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Plus } from 'lucide-vue-next'
import { useClientsStore } from '@/stores/clients'
import { useProjectsStore } from '@/stores/projects'
import ExpandTransition from '@/components/shared/ExpandTransition.vue'

const clients = useClientsStore()
const projects = useProjectsStore()
const router = useRouter()

defineProps<{ open: boolean }>()

// Which clients are expanded in the sidebar tree.
const PROJ_OPEN_KEY = 'buzzybee.workstation.sidebar-projects-open'
function loadOpenSet(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(PROJ_OPEN_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}
const openClients = ref<Set<string>>(loadOpenSet())
function persistOpenClients() {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(PROJ_OPEN_KEY, JSON.stringify([...openClients.value]))
  }
}
function toggleClientOpen(id: string) {
  const next = new Set(openClients.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  openClients.value = next
  persistOpenClients()
}
// When the active client changes, auto-expand it.
watch(
  () => clients.currentClientId,
  (cid) => {
    if (!cid) return
    if (!openClients.value.has(cid)) {
      const next = new Set(openClients.value)
      next.add(cid)
      openClients.value = next
      persistOpenClients()
    }
  },
  { immediate: true }
)

async function pickProject(clientId: string, projectId: string) {
  if (clients.currentClientId !== clientId) clients.setCurrentClient(clientId)
  projects.setCurrentProject(projectId)
  if (router.currentRoute.value.name !== 'workstation-tasks') {
    await router.push({ name: 'workstation-tasks' })
  }
}

// ── New-project inline creator (per client) ───────────────────────────────
// Any role can create a project. After creation the creator is auto-added as
// project_members.role = 'lead' so they can manage it. RLS controls who else
// sees it (VA-created projects are private to creator + members + PM/admin).
const newProjectFor = ref<string | null>(null) // client_id we're creating under
const newProjectName = ref('')
const newProjectError = ref<string | null>(null)
const newProjectSaving = ref(false)

function startNewProject(clientId: string, ev?: Event) {
  ev?.stopPropagation()
  newProjectFor.value = clientId
  newProjectName.value = ''
  newProjectError.value = null
  // Make sure the client is expanded so the input is visible.
  if (!openClients.value.has(clientId)) {
    const next = new Set(openClients.value)
    next.add(clientId)
    openClients.value = next
    persistOpenClients()
  }
}
function cancelNewProject() {
  newProjectFor.value = null
  newProjectName.value = ''
  newProjectError.value = null
}

async function commitNewProject() {
  const clientId = newProjectFor.value
  const name = newProjectName.value.trim()
  if (!clientId || !name || newProjectSaving.value) return
  newProjectSaving.value = true
  newProjectError.value = null
  try {
    const project = await projects.createProject({ name, client_id: clientId })
    // Note: creator is auto-added as 'lead' by the projects_seed_members
    // database trigger, which also seeds existing VAs/PMs on the client.
    // No client-side membership write needed here.

    // Switch context to the new project and route to Tasks.
    if (clients.currentClientId !== clientId) clients.setCurrentClient(clientId)
    projects.setCurrentProject(project.id)
    cancelNewProject()
    if (router.currentRoute.value.name !== 'workstation-tasks') {
      await router.push({ name: 'workstation-tasks' })
    }
  } catch (e) {
    const msg = (e as Error).message
    if (msg.toLowerCase().includes('row-level security') || msg.toLowerCase().includes('permission denied')) {
      newProjectError.value = "You don't have permission to create projects for this client."
    } else {
      newProjectError.value = msg
    }
  } finally {
    newProjectSaving.value = false
  }
}
</script>

<template>
  <div>
    <!-- Projects tree, grouped by client -->
    <div
      v-if="open"
      class="pt-3 pb-1 px-2 text-[0.65rem] uppercase tracking-wider text-base-content/50 font-semibold"
    >
      Projects
    </div>
    <div v-if="open" class="space-y-0.5">
      <template v-for="c in clients.clients" :key="c.id">
        <div class="group/client flex items-center">
          <button
            type="button"
            class="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-base-200 transition-colors text-left min-w-0"
            :class="clients.currentClientId === c.id && 'text-base-content font-medium'"
            @click="toggleClientOpen(c.id)"
          >
            <span
              class="w-3 h-3 inline-flex items-center justify-center text-[0.7rem] text-base-content/50 transition-transform shrink-0"
              :class="openClients.has(c.id) && 'rotate-90'"
            >
              ▶
            </span>
            <span class="flex-1 truncate">{{ c.name }}</span>
            <span class="text-[0.7rem] text-base-content/40 tabular-nums">
              {{ (projects.projectsByClient[c.id] ?? []).length }}
            </span>
          </button>
          <button
            type="button"
            class="opacity-0 group-hover/client:opacity-100 focus:opacity-100 w-6 h-6 rounded-md flex items-center justify-center text-base-content/50 hover:text-primary hover:bg-primary/10 transition-all shrink-0"
            title="New project for this client"
            aria-label="New project"
            @click="startNewProject(c.id, $event)"
          >
            <Plus class="w-3.5 h-3.5" :stroke-width="2" />
          </button>
        </div>
        <ExpandTransition>
        <ul
          v-if="openClients.has(c.id)"
          class="pl-4 space-y-0.5"
        >
          <li v-for="p in projects.projectsByClient[c.id] ?? []" :key="p.id">
            <button
              type="button"
              class="w-full flex items-center gap-2 px-2 py-1 rounded-md text-sm transition-colors text-left"
              :class="
                projects.currentProjectId === p.id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'hover:bg-base-200 text-base-content/80'
              "
              @click="pickProject(c.id, p.id)"
            >
              <span
                class="w-1 h-1 rounded-full shrink-0"
                :class="
                  p.status === 'active'
                    ? 'bg-success'
                    : p.status === 'paused'
                    ? 'bg-warning'
                    : 'bg-base-content/30'
                "
              />
              <span class="truncate">{{ p.name }}</span>
            </button>
          </li>

          <!-- Inline new-project input -->
          <li v-if="newProjectFor === c.id" class="px-2 py-1">
            <input
              v-model="newProjectName"
              autofocus
              type="text"
              placeholder="Project name — Enter to create"
              class="w-full bg-base-100 border border-primary/40 rounded-md px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              :disabled="newProjectSaving"
              @keydown.enter.prevent="commitNewProject"
              @keydown.esc="cancelNewProject"
              @blur="newProjectName.trim() ? commitNewProject() : cancelNewProject()"
            />
            <p
              v-if="newProjectError"
              class="text-[0.65rem] text-error mt-1"
            >
              {{ newProjectError }}
            </p>
          </li>

          <li
            v-else-if="(projects.projectsByClient[c.id] ?? []).length === 0"
            class="px-2 py-1 text-xs text-base-content/40 italic"
          >
            No projects
          </li>
        </ul>
        </ExpandTransition>
      </template>
      <div
        v-if="clients.clients.length === 0"
        class="px-2 py-1 text-xs text-base-content/40 italic"
      >
        No clients yet
      </div>
    </div>
  </div>
</template>
