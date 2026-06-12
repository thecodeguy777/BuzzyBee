<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useProjectsStore, type Project } from '@/stores/projects'
import { useTasksStore } from '@/stores/tasks'
import { useClientsStore } from '@/stores/clients'
import { useStatusesStore } from '@/stores/statuses'
import { useAuthStore } from '@/stores/auth'
import {
  ListTodo,
  CheckCircle2,
  CircleAlert,
  CalendarDays,
  Folder,
  UserPlus,
  X as XIcon,
  Crown
} from 'lucide-vue-next'
import { useProjectMembersStore, type ProjectMemberRole } from '@/stores/projectMembers'
import MemberPicker from '@/components/workstation/MemberPicker.vue'
import ProjectActivityPanel from '@/components/workstation/ProjectActivityPanel.vue'

const members = useProjectMembersStore()
const showMemberPicker = ref(false)

function memberInitials(name: string | null, email: string | null) {
  const src = name || email || '?'
  return (
    src
      .split(/\s|@/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('') || 'BB'
  )
}

async function changeRole(userId: string, role: ProjectMemberRole) {
  if (!p.value) return
  try {
    await members.updateRole(p.value.id, userId, role)
  } catch (e) {
    console.warn('[overview] updateRole:', (e as Error).message)
  }
}
async function removeMember(userId: string) {
  if (!p.value) return
  if (!confirm('Remove this member from the project?')) return
  try {
    await members.removeMember(p.value.id, userId)
  } catch (e) {
    console.warn('[overview] removeMember:', (e as Error).message)
  }
}

const projects = useProjectsStore()
const tasks = useTasksStore()
const clients = useClientsStore()
const auth = useAuthStore()
const statusesStore = useStatusesStore()

const p = computed<Project | null>(() => projects.currentProject)

// Who can add/remove/role-change members on this project:
//   - Admin / Superadmin (always)
//   - PM listed on the client (via client_pms)
//   - Project Lead (member with role='lead' on this project)
// Contributors and Viewers see read-only.
const canManageMembers = computed(() => {
  if (auth.isAdmin) return true
  const cid = p.value?.client_id
  if (!cid || !auth.user) return false
  const isPmOnClient =
    auth.role === 'pm' &&
    (clients.pmsByClient[cid] ?? []).some((cp) => cp.pm_id === auth.user!.id)
  if (isPmOnClient) return true
  const isLead = members.currentMembers.some(
    (m) => m.user_id === auth.user!.id && m.role === 'lead'
  )
  return isLead
})

// "Unknown" rows in the Members panel happen when project_members rows
// reference profiles that aren't in the local cache yet. The cache is
// seeded by fetchAll() at boot and on realtime INSERT — but if the user's
// visibility changed (e.g. RLS broadened, or someone was added before this
// session loaded), it stays stale. Watch currentMembers and pull missing
// profiles whenever the list changes.
watch(
  () => members.currentMembers,
  (list) => {
    const missing = list
      .filter((m) => !m.full_name && !m.email)
      .map((m) => m.user_id)
    if (missing.length) void members.loadProfiles(missing)
  },
  { immediate: true, deep: true }
)

const name = ref('')
const description = ref('')
const status = ref<Project['status']>('active')
const saveState = ref<'idle' | 'saving' | 'saved'>('idle')
const confirmDelete = ref(false)
let savedTimer: ReturnType<typeof setTimeout> | undefined

function syncFromProject() {
  if (!p.value) return
  name.value = p.value.name
  description.value = p.value.description ?? ''
  status.value = p.value.status
  saveState.value = 'idle'
}
// Full sync (and reset of transient UI state) when a *different* project is
// selected. For same-project store updates (our own save, realtime), merge
// field-by-field so an unsaved edit in one field isn't clobbered by saving
// another.
watch(
  p,
  (nv, ov) => {
    if (!nv) return
    if (!ov || nv.id !== ov.id) {
      syncFromProject()
      // A "Yes, delete" armed on the previous project must not carry over.
      confirmDelete.value = false
      showMemberPicker.value = false
      return
    }
    if (name.value === ov.name) name.value = nv.name
    if (description.value === (ov.description ?? '')) description.value = nv.description ?? ''
    if (status.value === ov.status) status.value = nv.status
  },
  { immediate: true }
)

async function saveField(patch: Partial<Project>) {
  if (!p.value) return
  if (savedTimer) clearTimeout(savedTimer)
  saveState.value = 'saving'
  try {
    await projects.updateProject(p.value.id, patch)
    saveState.value = 'saved'
    savedTimer = setTimeout(() => {
      if (saveState.value === 'saved') saveState.value = 'idle'
    }, 1500)
  } catch (e) {
    console.warn('[overview] save failed:', (e as Error).message)
    saveState.value = 'idle'
    syncFromProject()
  }
}

async function saveName() {
  const next = name.value.trim()
  if (!next || !p.value) {
    name.value = p.value?.name ?? ''
    return
  }
  if (next === p.value.name) return
  await saveField({ name: next })
}
async function saveDescription() {
  const next = description.value.trim() || null
  if (!p.value) return
  if ((p.value.description ?? null) === next) return
  await saveField({ description: next })
}
async function saveStatus(value: Project['status']) {
  if (!p.value || p.value.status === value) return
  status.value = value
  await saveField({ status: value })
}

// Per-column counts (dynamic keys) for the active breakdown line.
const counts = computed(() => {
  const map: Record<string, number> = {}
  for (const t of tasks.tasksForCurrentProject) map[t.status] = (map[t.status] ?? 0) + 1
  return map
})

// Open (non-done, non-cancelled) columns for the current project.
const openColumns = computed(() =>
  statusesStore.forProject(projects.currentProjectId).filter((c) => !c.is_done && !c.is_cancelled)
)
const totalActive = computed(
  () => tasks.tasksForCurrentProject.filter((t) => statusesStore.isOpen(t.project_id, t.status)).length
)
const doneCount = computed(
  () => tasks.tasksForCurrentProject.filter((t) => statusesStore.isDone(t.project_id, t.status)).length
)
const activeBreakdown = computed(() =>
  openColumns.value.map((c) => `${counts.value[c.key] ?? 0} ${c.label.toLowerCase()}`).join(' · ')
)

const dueSoon = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const week = new Date(today)
  week.setDate(week.getDate() + 7)
  return tasks.tasksForCurrentProject.filter((t) => {
    if (!t.due_on || !statusesStore.isOpen(t.project_id, t.status)) return false
    const d = new Date(t.due_on + 'T00:00:00')
    return d >= today && d <= week
  }).length
})

const overdue = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return tasks.tasksForCurrentProject.filter((t) => {
    if (!t.due_on || !statusesStore.isOpen(t.project_id, t.status)) return false
    return new Date(t.due_on + 'T00:00:00') < today
  }).length
})

const newProjectName = ref('')
const creating = ref(false)

async function createProject() {
  if (!newProjectName.value.trim() || !clients.currentClientId) return
  creating.value = true
  try {
    const created = await projects.createProject({ name: newProjectName.value })
    projects.setCurrentProject(created.id)
    newProjectName.value = ''
  } catch (e) {
    console.warn('[overview] create failed:', (e as Error).message)
  } finally {
    creating.value = false
  }
}

async function destroy() {
  if (!p.value) return
  try {
    await projects.deleteProject(p.value.id)
    confirmDelete.value = false
  } catch (e) {
    console.warn('[overview] delete failed:', (e as Error).message)
  }
}
</script>

<template>
  <div
    :class="[
      // No project: simple centered empty state. With project: 2-col grid
      // (main content + sticky activity panel) on lg+, single column below.
      p
        ? 'grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-6 items-start'
        : 'max-w-3xl mx-auto'
    ]"
  >
    <!-- No project selected -->
    <div
      v-if="!p"
      class="bg-base-100 rounded-xl border border-base-300 shadow-md px-6 py-10 text-center"
    >
      <Folder class="w-8 h-8 mx-auto text-base-content/30" :stroke-width="1.5" />
      <h2 class="font-display text-xl font-semibold mt-3">No project selected</h2>
      <p class="text-xs text-base-content/60 mt-0.5">
        Pick one from the sidebar, or create one for
        <span class="font-medium">{{ clients.currentClient?.name ?? 'this client' }}</span>.
      </p>
      <form
        class="mt-4 flex gap-2 max-w-sm mx-auto"
        @submit.prevent="createProject"
      >
        <input
          v-model="newProjectName"
          type="text"
          class="input input-bordered input-sm flex-1"
          placeholder="Project name"
          :disabled="!clients.currentClientId || creating"
        />
        <button
          type="submit"
          class="btn btn-primary btn-sm"
          :disabled="!newProjectName.trim() || !clients.currentClientId || creating"
        >
          {{ creating ? '…' : 'Create' }}
        </button>
      </form>
    </div>

    <!-- Main content column (left cell of the grid on lg+) -->
    <div v-else class="space-y-6 min-w-0">
      <!-- Project header / editor -->
      <div class="bg-base-100 rounded-xl border border-base-300 shadow-md p-5 space-y-3">
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1 min-w-0">
            <div class="text-xs text-base-content/50 mb-1 flex items-center gap-2">
              <Folder class="w-3.5 h-3.5" :stroke-width="1.75" />
              {{ clients.currentClient?.name ?? '—' }}
            </div>
            <input
              v-model="name"
              type="text"
              class="font-display text-lg font-semibold w-full bg-transparent outline-none rounded px-2 py-1 -ml-2 hover:bg-base-200/60 focus:bg-base-200/80 transition-colors"
              placeholder="Project name"
              @blur="saveName"
              @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
            />
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <select
              :value="status"
              class="select select-sm select-bordered"
              @change="saveStatus(($event.target as HTMLSelectElement).value as Project['status'])"
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </select>
            <span
              v-if="saveState === 'saving'"
              class="text-xs text-base-content/50 italic"
            >Saving…</span>
            <span
              v-else-if="saveState === 'saved'"
              class="text-xs text-success font-medium"
            >Saved</span>
          </div>
        </div>
        <textarea
          v-model="description"
          rows="3"
          class="w-full bg-transparent outline-none text-sm resize-y rounded-md px-2 py-1.5 -mx-2 hover:bg-base-200/60 focus:bg-base-200/80 transition-colors"
          placeholder="What is this project about? Markdown OK."
          @blur="saveDescription"
        />
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="bg-base-100 rounded-xl border border-base-300 shadow-sm p-4">
          <div class="flex items-center justify-between">
            <span class="text-xs uppercase tracking-wider text-base-content/60 font-semibold">Active</span>
            <ListTodo class="w-4 h-4 text-base-content/40" :stroke-width="1.75" />
          </div>
          <div class="font-display text-lg font-semibold mt-1 tabular-nums">
            {{ totalActive }}
          </div>
          <div class="text-[0.7rem] text-base-content/50 mt-0.5">
            {{ activeBreakdown }}
          </div>
        </div>

        <div class="bg-base-100 rounded-xl border border-base-300 shadow-sm p-4">
          <div class="flex items-center justify-between">
            <span class="text-xs uppercase tracking-wider text-base-content/60 font-semibold">Done</span>
            <CheckCircle2 class="w-4 h-4 text-success" :stroke-width="1.75" />
          </div>
          <div class="font-display text-lg font-semibold mt-1 tabular-nums">
            {{ doneCount }}
          </div>
        </div>

        <div class="bg-base-100 rounded-xl border border-base-300 shadow-sm p-4">
          <div class="flex items-center justify-between">
            <span class="text-xs uppercase tracking-wider text-base-content/60 font-semibold">Due this week</span>
            <CalendarDays class="w-4 h-4 text-info" :stroke-width="1.75" />
          </div>
          <div class="font-display text-lg font-semibold mt-1 tabular-nums">
            {{ dueSoon }}
          </div>
        </div>

        <div class="bg-base-100 rounded-xl border border-base-300 shadow-sm p-4">
          <div class="flex items-center justify-between">
            <span class="text-xs uppercase tracking-wider text-base-content/60 font-semibold">Overdue</span>
            <CircleAlert class="w-4 h-4 text-error" :stroke-width="1.75" />
          </div>
          <div
            class="font-display text-lg font-semibold mt-1 tabular-nums"
            :class="overdue > 0 && 'text-error'"
          >
            {{ overdue }}
          </div>
        </div>
      </div>

      <!-- Members -->
      <div class="bg-base-100 rounded-xl border border-base-300 shadow-sm">
        <header class="flex items-center justify-between px-5 py-3 border-b border-base-300/60">
          <div class="text-xs uppercase tracking-wider text-base-content/60 font-semibold">
            Members
            <span class="text-base-content/40 normal-case">({{ members.currentMembers.length }})</span>
          </div>
          <button
            v-if="canManageMembers"
            type="button"
            class="btn btn-ghost btn-xs gap-1.5"
            @click="showMemberPicker = true"
          >
            <UserPlus class="w-3.5 h-3.5" :stroke-width="1.75" />
            Add
          </button>
        </header>

        <ul
          v-if="members.currentMembers.length"
          class="divide-y divide-base-300/60"
        >
          <li
            v-for="m in members.currentMembers"
            :key="m.user_id"
            class="group flex items-center gap-3 px-5 py-3 hover:bg-base-200/30 transition-colors"
          >
            <div
              class="w-9 h-9 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center shrink-0 overflow-hidden"
            >
              <img
                v-if="m.avatar_url"
                :src="m.avatar_url"
                :alt="m.full_name ?? ''"
                class="w-full h-full object-cover"
              />
              <span v-else>{{ memberInitials(m.full_name, m.email) }}</span>
            </div>

            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium truncate">
                {{ m.full_name || m.email || 'Unknown' }}
              </div>
              <div
                v-if="m.full_name && m.email"
                class="text-xs text-base-content/50 truncate"
              >
                {{ m.email }}
              </div>
            </div>

            <!-- Manager: editable role dropdown (no redundant Lead badge) -->
            <select
              v-if="canManageMembers"
              :value="m.role"
              class="text-xs px-2 py-1 rounded-md border border-base-300 bg-base-100 hover:border-base-content/30 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 capitalize shrink-0 cursor-pointer"
              @change="changeRole(m.user_id, ($event.target as HTMLSelectElement).value as ProjectMemberRole)"
            >
              <option value="lead">Lead</option>
              <option value="contributor">Contributor</option>
              <option value="viewer">Viewer</option>
            </select>

            <!-- Non-manager: read-only role label -->
            <span
              v-else
              class="inline-flex items-center gap-1 text-[0.65rem] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
              :class="
                m.role === 'lead'
                  ? 'text-warning bg-warning/10'
                  : 'text-base-content/55 bg-base-200/60'
              "
            >
              <Crown v-if="m.role === 'lead'" class="w-3 h-3" :stroke-width="2" />
              {{ m.role }}
            </span>

            <button
              v-if="canManageMembers"
              type="button"
              class="opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 rounded-md flex items-center justify-center text-base-content/40 hover:text-error hover:bg-error/10 shrink-0"
              title="Remove from project"
              @click="removeMember(m.user_id)"
            >
              <XIcon class="w-3.5 h-3.5" :stroke-width="1.75" />
            </button>
          </li>
        </ul>
        <div v-else class="px-5 py-8 text-center text-sm text-base-content/50">
          <p>No members yet.</p>
          <button
            v-if="canManageMembers"
            type="button"
            class="btn btn-ghost btn-xs gap-1.5 mt-2 text-primary"
            @click="showMemberPicker = true"
          >
            <UserPlus class="w-3.5 h-3.5" :stroke-width="1.75" />
            Add the first member
          </button>
        </div>
      </div>

      <MemberPicker :open="showMemberPicker" @close="showMemberPicker = false" />

      <!-- Danger zone -->
      <div class="border-t border-base-300/60 pt-4">
        <details class="text-sm">
          <summary class="cursor-pointer text-base-content/60 hover:text-error transition-colors">
            Delete project
          </summary>
          <div class="mt-3 p-4 rounded-lg border border-error/30 bg-error/5 flex items-center justify-between gap-3 flex-wrap">
            <div class="text-xs text-base-content/70">
              Removes the project and every task in it. This is permanent.
            </div>
            <button
              v-if="!confirmDelete"
              type="button"
              class="btn btn-error btn-xs"
              @click="confirmDelete = true"
            >
              Delete project
            </button>
            <div v-else class="flex items-center gap-2">
              <button class="btn btn-error btn-xs" @click="destroy">Yes, delete</button>
              <button class="btn btn-ghost btn-xs" @click="confirmDelete = false">Cancel</button>
            </div>
          </div>
        </details>
      </div>
    </div>

    <!-- Right column: project status + activity (lg+ only) -->
    <ProjectActivityPanel v-if="p" class="hidden lg:flex" />
  </div>
</template>
