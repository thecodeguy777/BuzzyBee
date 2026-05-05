<script setup lang="ts">
import { computed, ref, watch, type FunctionalComponent } from 'vue'
// keep computed import; initials/fullName/role now come from the auth store
import { RouterLink, useRouter } from 'vue-router'
import {
  Home,
  Users,
  ListTodo,
  MessageSquare,
  BookOpen,
  FileText,
  LogOut,
  Menu,
  Clock,
  Inbox,
  CheckSquare,
  Bug,
  UsersRound
} from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'
import { useProjectsStore } from '@/stores/projects'
import ClientSwitcher from '@/components/workstation/ClientSwitcher.vue'
import TimerChip from '@/components/workstation/TimerChip.vue'
import SwitchClientModal from '@/components/workstation/SwitchClientModal.vue'
import GlobalSearch from '@/components/workstation/GlobalSearch.vue'
import NotificationBell from '@/components/workstation/NotificationBell.vue'
import ReportButton from '@/components/workstation/ReportButton.vue'
import ActivityRail from '@/components/workstation/ActivityRail.vue'

const auth = useAuthStore()
const clients = useClientsStore()
const projects = useProjectsStore()
const router = useRouter()

if (auth.isAuthenticated && !clients.loaded) {
  void clients.fetchMine()
}
if (auth.isAuthenticated && !projects.loaded) {
  void projects.fetchAll()
}

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

type NavItem = { to: string; label: string; icon: FunctionalComponent; exact?: boolean }

const topNavItems = computed<NavItem[]>(() => {
  const items: NavItem[] = [
    { to: '/app', label: 'Home', icon: Home, exact: true },
    { to: '/app/inbox', label: 'Inbox', icon: Inbox },
    { to: '/app/my-tasks', label: 'My tasks', icon: CheckSquare }
  ]
  // Time tracking is a VA-only thing — PMs/admins manage, they don't bill.
  if (auth.role === 'va') items.push({ to: '/app/time', label: 'Time', icon: Clock })
  return items
})
const bottomNavItems = computed<NavItem[]>(() => {
  const items: NavItem[] = [
    { to: '/app/clients', label: 'Clients', icon: Users }
  ]
  if (auth.role === 'pm' || auth.isAdmin) {
    items.push({ to: '/app/team', label: 'Team', icon: UsersRound })
  }
  items.push(
    { to: '/app/comms', label: 'Comms', icon: MessageSquare },
    { to: '/app/playbook', label: 'Playbook', icon: BookOpen },
    { to: '/app/eod', label: 'EOD Report', icon: FileText }
  )
  if (auth.isAdmin) {
    items.push({ to: '/app/tickets', label: 'Tickets', icon: Bug })
  }
  return items
})

const PIN_KEY = 'buzzybee.workstation.sidebar-pinned'
const pinned = ref(
  typeof window === 'undefined' ? false : window.localStorage.getItem(PIN_KEY) === '1'
)
const hovering = ref(false)
const effectiveOpen = computed(() => pinned.value || hovering.value)

watch(pinned, (v) => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(PIN_KEY, v ? '1' : '0')
  }
})

function togglePin() {
  pinned.value = !pinned.value
}

async function handleSignOut() {
  await auth.signOut()
  await router.push({ name: 'login' })
}
</script>

<template>
  <div class="min-h-screen flex bg-base-200 text-base-content">
    <aside
      :class="[
        'relative shrink-0 transition-[width] duration-300 ease-in-out',
        pinned ? 'w-60' : 'w-14'
      ]"
    >
      <div
        @mouseenter="hovering = true"
        @mouseleave="hovering = false"
        :class="[
          'absolute inset-y-0 left-0 z-30 bg-base-100 border-r border-base-300 overflow-hidden flex flex-col',
          'transition-[width,box-shadow] duration-300 ease-in-out',
          effectiveOpen ? 'w-60' : 'w-14',
          effectiveOpen && !pinned ? 'shadow-xl' : ''
        ]"
      >
        <div class="h-14 flex items-center px-2.5 border-b border-base-300 gap-3 shrink-0">
          <button
            type="button"
            :aria-label="pinned ? 'Unpin navigation' : 'Pin navigation open'"
            :aria-pressed="pinned"
            class="w-9 h-9 rounded-full border border-base-300 flex items-center justify-center hover:bg-base-200 active:scale-95 transition shrink-0"
            @click="togglePin"
          >
            <Menu class="w-4 h-4" :stroke-width="2" />
          </button>
          <div
            :class="[
              'leading-tight transition-opacity duration-200 whitespace-nowrap',
              effectiveOpen ? 'opacity-100 delay-100' : 'opacity-0'
            ]"
          >
            <div class="font-display text-base font-semibold">BuzzyBee</div>
            <div class="text-xs text-base-content/60">Workstation</div>
          </div>
        </div>

        <nav class="flex-1 px-2.5 py-3 space-y-1 text-sm overflow-y-auto overflow-x-hidden">
          <RouterLink
            v-for="item in topNavItems"
            :key="item.to"
            :to="item.to"
            class="flex items-center gap-3 px-2 py-2 rounded-md transition-colors hover:bg-base-200"
            active-class="bg-primary/10 text-primary font-medium"
            :exact-active-class="item.exact ? 'bg-primary/10 text-primary font-medium' : ''"
          >
            <component :is="item.icon" class="w-5 h-5 shrink-0" :stroke-width="1.75" />
            <span
              :class="[
                'transition-opacity duration-200 whitespace-nowrap',
                effectiveOpen ? 'opacity-100 delay-100' : 'opacity-0'
              ]"
            >
              {{ item.label }}
            </span>
          </RouterLink>

          <!-- Projects tree, grouped by client -->
          <div
            v-if="effectiveOpen"
            class="pt-3 pb-1 px-2 text-[0.65rem] uppercase tracking-wider text-base-content/50 font-semibold"
          >
            Projects
          </div>
          <div v-if="effectiveOpen" class="space-y-0.5">
            <template v-for="c in clients.clients" :key="c.id">
              <button
                type="button"
                class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-base-200 transition-colors text-left"
                :class="clients.currentClientId === c.id && 'text-base-content font-medium'"
                @click="toggleClientOpen(c.id)"
              >
                <span
                  class="w-3 h-3 inline-flex items-center justify-center text-[0.7rem] text-base-content/50 transition-transform"
                  :class="openClients.has(c.id) && 'rotate-90'"
                >
                  ▶
                </span>
                <span class="flex-1 truncate">{{ c.name }}</span>
                <span class="text-[0.7rem] text-base-content/40 tabular-nums">
                  {{ (projects.projectsByClient[c.id] ?? []).length }}
                </span>
              </button>
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
                <li
                  v-if="(projects.projectsByClient[c.id] ?? []).length === 0"
                  class="px-2 py-1 text-xs text-base-content/40 italic"
                >
                  No projects
                </li>
              </ul>
            </template>
            <div
              v-if="clients.clients.length === 0"
              class="px-2 py-1 text-xs text-base-content/40 italic"
            >
              No clients yet
            </div>
          </div>

          <div class="pt-3 space-y-0.5">
            <RouterLink
              v-for="item in bottomNavItems"
              :key="item.to"
              :to="item.to"
              class="flex items-center gap-3 px-2 py-2 rounded-md transition-colors hover:bg-base-200"
              active-class="bg-primary/10 text-primary font-medium"
              :exact-active-class="item.exact ? 'bg-primary/10 text-primary font-medium' : ''"
            >
              <component :is="item.icon" class="w-5 h-5 shrink-0" :stroke-width="1.75" />
              <span
                :class="[
                  'transition-opacity duration-200 whitespace-nowrap',
                  effectiveOpen ? 'opacity-100 delay-100' : 'opacity-0'
                ]"
              >
                {{ item.label }}
              </span>
            </RouterLink>
          </div>
        </nav>

        <div class="border-t border-base-300 px-2.5 py-3 shrink-0">
          <RouterLink
            :to="{ name: 'workstation-profile' }"
            class="flex items-center gap-3 px-1 py-1 rounded-md hover:bg-base-200 transition-colors"
          >
            <div
              class="w-9 h-9 rounded-full bg-primary/20 text-primary flex items-center justify-center font-semibold shrink-0 overflow-hidden"
            >
              <img
                v-if="auth.profile?.avatar_url"
                :src="auth.profile.avatar_url"
                :alt="auth.fullName"
                class="w-full h-full object-cover"
              />
              <span v-else>{{ auth.initials }}</span>
            </div>
            <div
              :class="[
                'flex-1 min-w-0 leading-tight transition-opacity duration-200',
                effectiveOpen ? 'opacity-100 delay-100' : 'opacity-0'
              ]"
            >
              <div class="text-sm font-medium truncate">{{ auth.fullName }}</div>
              <div class="text-xs text-base-content/60 truncate">
                {{ auth.role.toUpperCase() }}
              </div>
            </div>
          </RouterLink>
          <button
            v-show="effectiveOpen"
            class="btn btn-ghost btn-xs w-full justify-start gap-2 mt-1"
            @click="handleSignOut"
          >
            <LogOut class="w-3.5 h-3.5" :stroke-width="1.75" />
            Sign out
          </button>
        </div>
      </div>
    </aside>

    <div class="flex-1 flex flex-col min-w-0">
      <header
        class="h-14 bg-base-100 border-b border-base-300 flex items-center px-3 sm:px-5 gap-3"
      >
        <ClientSwitcher />

        <div class="flex-1 flex justify-center min-w-0 px-2">
          <GlobalSearch />
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <NotificationBell />
          <TimerChip v-if="auth.role === 'va'" />
        </div>
      </header>

      <main
        :class="[
          'flex-1 overflow-y-auto pr-6 py-6 transition-[padding] duration-300 ease-in-out',
          pinned ? 'pl-6' : 'pl-44'
        ]"
      >
        <slot />
      </main>
    </div>

    <ActivityRail />

    <SwitchClientModal />
    <ReportButton />
  </div>
</template>
