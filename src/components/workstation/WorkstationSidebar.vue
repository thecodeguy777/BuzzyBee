<script setup lang="ts">
import { computed, ref, watch, type FunctionalComponent } from 'vue'
import { RouterLink } from 'vue-router'
import {
  Home,
  Users,
  Menu,
  Clock,
  Inbox,
  CheckSquare,
  Bug,
  UsersRound,
  MessagesSquare,
  Handshake
} from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useChannelsStore } from '@/stores/channels'
import SidebarProjectTree from '@/components/workstation/SidebarProjectTree.vue'
import SidebarUser from '@/components/workstation/SidebarUser.vue'

const auth = useAuthStore()
const channels = useChannelsStore()

type NavItem = { to: string; label: string; icon: FunctionalComponent; exact?: boolean }

// Live unread badge per nav item. Comms unread bumps app-wide because the
// comms stream is provided at the workstation shell, so this updates even when
// you're on another page.
function badgeFor(item: NavItem): number {
  return item.to === '/app/comms' ? channels.totalUnread : 0
}

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
    { to: '/app/comms', label: 'Comms', icon: MessagesSquare },
    { to: '/app/crm', label: 'CRM', icon: Handshake },
    { to: '/app/clients', label: 'Clients', icon: Users }
  ]
  if (auth.role === 'pm' || auth.isAdmin) {
    items.push({ to: '/app/team', label: 'Team', icon: UsersRound })
  }
  // Comms / Playbook / EOD Report are roadmap modules — re-add to the nav
  // once their views exist. For now they 404, so they're hidden.
  // Tickets / bug triage is universal — anyone can file and view a bug
  // report. RLS still scopes what each role sees inside the page.
  items.push({ to: '/app/tickets', label: 'Tickets', icon: Bug })
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
</script>

<template>
  <aside
    :class="[
      'relative shrink-0 transition-[width] duration-300 ease-in-out',
      pinned ? 'w-60' : 'w-14'
    ]"
  >
    <div
      @mouseenter="hovering = true"
      @mouseleave="hovering = false"
      :style="{
        background: 'linear-gradient(180deg, #1e2a6e 0%, #211a52 50%, #14102f 100%)',
        '--color-base-100': '#1a1645',
        '--color-base-200': 'rgba(255,255,255,0.08)',
        '--color-base-300': 'rgba(255,255,255,0.14)',
        '--color-base-content': 'rgba(255,255,255,0.88)',
        '--color-primary': '#a5b4fc',
        '--color-primary-content': '#161335',
        color: 'rgba(255,255,255,0.88)'
      }"
      :class="[
        'absolute inset-y-0 left-0 z-30 border-0 overflow-hidden flex flex-col',
        'transition-[width,box-shadow] duration-300 ease-in-out',
        effectiveOpen ? 'w-60' : 'w-14',
        effectiveOpen && !pinned ? 'shadow-xl rounded-r-xl' : ''
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
          <div class="font-display text-base font-semibold">HiveMind</div>
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
        <SidebarProjectTree :open="effectiveOpen" />

        <div class="pt-3 space-y-0.5">
          <RouterLink
            v-for="item in bottomNavItems"
            :key="item.to"
            :to="item.to"
            class="flex items-center gap-3 px-2 py-2 rounded-md transition-colors hover:bg-base-200"
            active-class="bg-primary/10 text-primary font-medium"
            :exact-active-class="item.exact ? 'bg-primary/10 text-primary font-medium' : ''"
          >
            <span class="relative shrink-0">
              <component :is="item.icon" class="w-5 h-5" :stroke-width="1.75" />
              <span
                v-if="badgeFor(item) > 0 && !effectiveOpen"
                class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-error ring-2 ring-base-100"
              />
            </span>
            <span
              :class="[
                'transition-opacity duration-200 whitespace-nowrap',
                effectiveOpen ? 'opacity-100 delay-100' : 'opacity-0'
              ]"
            >
              {{ item.label }}
            </span>
            <span
              v-if="badgeFor(item) > 0 && effectiveOpen"
              class="ml-auto min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-error text-white text-[0.65rem] font-bold flex items-center justify-center"
            >
              {{ badgeFor(item) > 99 ? '99+' : badgeFor(item) }}
            </span>
          </RouterLink>
        </div>
      </nav>

      <SidebarUser :open="effectiveOpen" />
    </div>
  </aside>
</template>
