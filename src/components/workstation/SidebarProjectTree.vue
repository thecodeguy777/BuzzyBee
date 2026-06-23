<script setup lang="ts">
// Client-centric sidebar switcher (Claude Design: Sidebar Redesign.html, mapped
// to our data model — the mockup's "project" = our CLIENT, its "lists" = that
// client's PROJECTS). One client at a time: a switcher picks the active client,
// the current client's projects render inline, and "+ New project" sits BELOW
// the list (a deliberate per-client action — NOT inside the switcher dropdown,
// since project creation is its own thing, not a casual switcher option).
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, ChevronDown, Check, Search } from 'lucide-vue-next'
import { useClientsStore, type Client } from '@/stores/clients'
import { useProjectsStore } from '@/stores/projects'
import { useTasksStore, type Task } from '@/stores/tasks'
import { useTimeStore } from '@/stores/time'
import { useChannelsStore } from '@/stores/channels'
import { useNotifications } from '@/composables/useNotifications'

const clients = useClientsStore()
const projects = useProjectsStore()
const tasks = useTasksStore()
const time = useTimeStore()
const channels = useChannelsStore()
const { notifications } = useNotifications()
const router = useRouter()

defineProps<{ open: boolean }>()

const currentClient = computed(() => clients.currentClient)
const currentProjects = computed(() =>
  clients.currentClientId ? (projects.projectsByClient[clients.currentClientId] ?? []) : [],
)

const initial = (name?: string | null) => (name?.trim()?.[0] ?? '?').toUpperCase()
const projectCount = (c: Client) => (projects.projectsByClient[c.id] ?? []).length
const clientBadge = (c: Client) => channels.unreadByClient[c.id] ?? null
const projectDot = (p: { status?: string }) =>
  p.status === 'active' ? 'bg-success' : p.status === 'paused' ? 'bg-warning' : 'bg-base-content/30'

// ── Per-project attention badges (real signals, no new query) ───────────────
// attention = my open tasks (no completed_at) overdue or due today; mentions/new
// come from UNREAD notifications mapped to a project (source_type 'task' → the
// task's project via the loaded tasks store, or 'project' directly). Notifications
// are page-loaded, so mentions/new reflect *recent* unread — fine for a cue.
const tasksById = computed(() => {
  const m: Record<string, Task> = {}
  for (const t of tasks.tasks) m[t.id] = t
  return m
})
function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
interface PBadge { attention: number; mentions: number; isNew: boolean }
const badgesByProject = computed<Record<string, PBadge>>(() => {
  const out: Record<string, PBadge> = {}
  const at = (pid: string) => (out[pid] ??= { attention: 0, mentions: 0, isNew: false })
  const today = localToday()
  for (const t of tasks.tasks) {
    if (!t.project_id || t.completed_at || !t.due_on || t.due_on > today) continue
    if (!tasks.isMine(t)) continue
    at(t.project_id).attention++
  }
  for (const n of notifications.value) {
    if (n.is_read) continue
    const pid =
      n.source_type === 'project' ? n.source_id
      : n.source_type === 'task' && n.source_id ? (tasksById.value[n.source_id]?.project_id ?? null)
      : null
    if (!pid) continue
    if (n.type === 'mention') at(pid).mentions++
    else if (n.type === 'task_assigned' || n.type === 'subtask_assigned' || n.type === 'task_handoff') at(pid).isNew = true
  }
  return out
})
const BLANK: PBadge = { attention: 0, mentions: 0, isNew: false }
const projBadge = (pid: string | null) => (pid ? badgesByProject.value[pid] ?? BLANK : BLANK)
// How many of a client's projects currently need attention (switcher rollup).
function clientAttention(clientId: string): number {
  let n = 0
  for (const p of projects.projectsByClient[clientId] ?? []) {
    const b = badgesByProject.value[p.id]
    if (b && (b.attention || b.mentions || b.isNew)) n++
  }
  return n
}

// ── Client switcher dropdown (switch only — no create) ──────────────────────
const switcherEl = ref<HTMLElement | null>(null)
const menuOpen = ref(false)
const search = ref('')
const filteredClients = computed(() => {
  const q = search.value.trim().toLowerCase()
  return q ? clients.clients.filter((c) => c.name.toLowerCase().includes(q)) : clients.clients
})
function toggleMenu() {
  menuOpen.value = !menuOpen.value
  if (menuOpen.value) search.value = ''
}
function pickClient(c: Client) {
  // Time-aware switch (may surface SwitchClientModal to confirm the running entry).
  time.requestSwitch(c.id)
  menuOpen.value = false
}
function onDocClick(e: MouseEvent) {
  if (menuOpen.value && switcherEl.value && !switcherEl.value.contains(e.target as Node)) menuOpen.value = false
}
function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') menuOpen.value = false
}
onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onEsc)
  // The shell primes clients + projects but not tasks; load them so the
  // per-project attention badges have data app-wide (idempotent — skipped if
  // another view already loaded them).
  if (!tasks.loading && !tasks.tasks.length) void tasks.fetchAll()
})
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onEsc)
})

// ── Pick a project (the current client's "lists") ───────────────────────────
async function pickProject(projectId: string) {
  projects.setCurrentProject(projectId)
  if (router.currentRoute.value.name !== 'workstation-tasks') {
    await router.push({ name: 'workstation-tasks' })
  }
}

// ── + New project (under the current client) — deliberate, OUTSIDE the dropdown.
// Any role may create; the projects_seed_members DB trigger adds the creator as
// 'lead' and seeds the client's VAs/PMs into project_members.
const creating = ref(false)
const newName = ref('')
const newError = ref<string | null>(null)
const saving = ref(false)
function startCreate() {
  if (!clients.currentClientId) return
  creating.value = true
  newName.value = ''
  newError.value = null
}
function cancelCreate() {
  creating.value = false
  newName.value = ''
  newError.value = null
}
async function commitCreate() {
  const clientId = clients.currentClientId
  const name = newName.value.trim()
  if (!clientId || !name || saving.value) return
  saving.value = true
  newError.value = null
  try {
    const project = await projects.createProject({ name, client_id: clientId })
    projects.setCurrentProject(project.id)
    cancelCreate()
    if (router.currentRoute.value.name !== 'workstation-tasks') {
      await router.push({ name: 'workstation-tasks' })
    }
  } catch (e) {
    const msg = (e as Error).message
    newError.value =
      msg.toLowerCase().includes('row-level security') || msg.toLowerCase().includes('permission denied')
        ? "You don't have permission to create projects for this client."
        : msg
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="open" class="mt-3">
    <div class="px-2 mb-1.5 text-[0.62rem] font-bold uppercase tracking-wider text-base-content/35">
      Current client
    </div>

    <!-- ── client switcher ── -->
    <div ref="switcherEl" class="relative px-0.5">
      <button
        type="button"
        class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-base-200 border border-base-300 hover:bg-base-300/60 transition-colors"
        :class="menuOpen && 'bg-base-300/60'"
        @click.stop="toggleMenu"
      >
        <span class="relative w-7 h-7 rounded-lg grid place-items-center text-white text-xs font-bold shrink-0" style="background: linear-gradient(135deg, #8a3a93, #5e1b57)">
          {{ initial(currentClient?.name) }}
          <span v-if="clients.currentClientId && clientAttention(clients.currentClientId)" class="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-warning ring-2" style="--tw-ring-color: #2c1248" />
        </span>
        <span class="flex-1 min-w-0 text-left">
          <span class="block text-sm font-bold text-white truncate leading-tight">{{ currentClient?.name ?? 'No client' }}</span>
          <span class="block text-[0.7rem] text-base-content/55">
            {{ currentProjects.length }} project{{ currentProjects.length === 1 ? '' : 's' }}<template v-if="clients.currentClientId && clientAttention(clients.currentClientId)"> · {{ clientAttention(clients.currentClientId) }} need attention</template>
          </span>
        </span>
        <ChevronDown class="w-4 h-4 shrink-0 text-base-content/60 transition-transform" :class="menuOpen && 'rotate-180'" :stroke-width="2" />
      </button>

      <!-- dropdown: switch client only (white popover, per the design) -->
      <transition name="dropdown">
        <div
          v-if="menuOpen"
          class="absolute left-1 right-1 top-[calc(100%+6px)] z-40 rounded-xl bg-white border border-[#e7e2ef] shadow-2xl overflow-hidden p-1.5"
          style="color: #1b1722"
          @click.stop
        >
          <div class="flex items-center gap-2 px-2.5 py-2 mb-1 rounded-lg bg-[#f6f4f9]">
            <Search class="w-3.5 h-3.5 shrink-0" style="color: #6a6577" :stroke-width="2" />
            <input v-model="search" placeholder="Switch client…" class="flex-1 bg-transparent outline-none text-[0.82rem]" style="color: #1b1722" />
          </div>
          <div class="max-h-72 overflow-y-auto">
            <button
              v-for="c in filteredClients"
              :key="c.id"
              type="button"
              class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors hover:bg-[#f6f4f9]"
              :class="c.id === clients.currentClientId && 'bg-[#f4ebf6]'"
              @click="pickClient(c)"
            >
              <span class="w-7 h-7 rounded-lg grid place-items-center text-white text-xs font-bold shrink-0" style="background: linear-gradient(135deg, #8a3a93, #5e1b57)">{{ initial(c.name) }}</span>
              <span class="flex-1 min-w-0">
                <span class="block text-[0.83rem] font-semibold truncate leading-tight" style="color: #1b1722">{{ c.name }}</span>
                <span class="block text-[0.68rem]" style="color: #6a6577">{{ projectCount(c) }} project{{ projectCount(c) === 1 ? '' : 's' }}</span>
              </span>
              <span v-if="clientAttention(c.id)" class="shrink-0 text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full" style="background: #fdf0d9; color: #a96a08">{{ clientAttention(c.id) }} attention</span>
              <span v-else-if="clientBadge(c)?.mentions" class="shrink-0 min-w-[1.05rem] h-[1.05rem] px-1 rounded-full bg-error text-white text-[0.6rem] font-bold grid place-items-center">@{{ clientBadge(c)!.mentions }}</span>
              <span v-else-if="clientBadge(c)?.unread" class="shrink-0 min-w-[1.05rem] h-[1.05rem] px-1 rounded-full text-white text-[0.6rem] font-bold grid place-items-center" style="background: #b066c0">{{ clientBadge(c)!.unread }}</span>
              <Check v-if="c.id === clients.currentClientId" class="w-4 h-4 shrink-0" style="color: #8a3a93" :stroke-width="2.5" />
            </button>
            <p v-if="!filteredClients.length" class="px-2.5 py-3 text-xs" style="color: #6a6577">No clients{{ search ? ' match' : ' yet' }}.</p>
          </div>
        </div>
      </transition>
    </div>

    <!-- ── the current client's projects (the "lists") ── -->
    <div class="mt-1.5 space-y-0.5">
      <button
        v-for="p in currentProjects"
        :key="p.id"
        type="button"
        class="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-left text-sm transition-colors"
        :class="projects.currentProjectId === p.id ? 'bg-base-300/70 text-white font-semibold' : 'text-base-content/75 hover:bg-base-200'"
        @click="pickProject(p.id)"
      >
        <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="projectDot(p)" />
        <span class="flex-1 truncate">{{ p.name }}</span>
        <!-- one pill, priority: mentions › attention › new -->
        <span v-if="projBadge(p.id).mentions" class="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style="background: rgba(226, 86, 111, 0.2); color: #f0909f" title="You were mentioned">@{{ projBadge(p.id).mentions }}</span>
        <span v-else-if="projBadge(p.id).attention" class="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style="background: rgba(245, 166, 35, 0.18); color: #f5b942" title="Needs attention — overdue or due today"><span class="w-1 h-1 rounded-full bg-current" />{{ projBadge(p.id).attention }}</span>
        <span v-else-if="projBadge(p.id).isNew" class="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style="background: rgba(91, 141, 239, 0.2); color: #8fb4f7" title="New task assigned">new</span>
      </button>
      <p v-if="currentClient && !currentProjects.length && !creating" class="px-3 py-1 text-xs italic text-base-content/40">No projects yet</p>

      <!-- + New project — OUTSIDE the dropdown, a deliberate per-client action -->
      <div v-if="creating" class="px-2 py-1">
        <input
          v-model="newName"
          autofocus
          type="text"
          placeholder="Project name — Enter to create"
          class="w-full bg-base-100 border border-primary/50 rounded-lg px-2.5 py-1.5 text-sm text-base-content outline-none focus:ring-2 focus:ring-primary/40"
          :disabled="saving"
          @keydown.enter.prevent="commitCreate"
          @keydown.esc="cancelCreate"
          @blur="newName.trim() ? commitCreate() : cancelCreate()"
        />
        <p v-if="newError" class="text-[0.65rem] text-error mt-1">{{ newError }}</p>
      </div>
      <button
        v-else-if="currentClient"
        type="button"
        class="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-left text-[0.82rem] font-medium text-base-content/45 hover:text-white hover:bg-base-200 transition-colors"
        @click="startCreate"
      >
        <Plus class="w-4 h-4 shrink-0" :stroke-width="2" />
        New project
      </button>
    </div>
  </div>
</template>
