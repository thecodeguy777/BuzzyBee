<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount, type FunctionalComponent } from 'vue'
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
  MessageCircle,
  Handshake,
  Target,
  FileText,
  Workflow,
  Settings
} from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useChannelsStore } from '@/stores/channels'
import { useTicketsStore } from '@/stores/tickets'
import { useNotifications } from '@/composables/useNotifications'
import SidebarProjectTree from '@/components/workstation/SidebarProjectTree.vue'
import SidebarUser from '@/components/workstation/SidebarUser.vue'

const auth = useAuthStore()
const channels = useChannelsStore()
const ticketsStore = useTicketsStore()
const { unreadCount: inboxUnread } = useNotifications()

type NavItem = { to: string; label: string; icon: FunctionalComponent; exact?: boolean }

// Live unread badge per nav item. Comms unread bumps app-wide because the
// comms stream is provided at the workstation shell, so this updates even when
// you're on another page. Messages (DMs) badge separately from channels;
// Inbox counts unread notifications (same singleton the bell uses); Tickets
// shows the open queue to triagers only — a permanent badge would just nag
// reporters about their own tickets.
function badgeFor(item: NavItem): number {
  if (item.to === '/app/comms') return channels.totalUnread
  if (item.to === '/app/messages') return channels.dmUnreadTotal
  if (item.to === '/app/inbox') return inboxUnread.value
  if (item.to === '/app/tickets') return ticketsStore.canTriage ? ticketsStore.openCount : 0
  return 0
}

const topNavItems = computed<NavItem[]>(() => {
  const items: NavItem[] = [
    { to: '/app', label: 'Home', icon: Home, exact: true },
    { to: '/app/inbox', label: 'Inbox', icon: Inbox },
    { to: '/app/my-tasks', label: 'My tasks', icon: CheckSquare }
  ]
  // Time tracking is a VA-only thing — PMs/admins manage, they don't bill.
  if (auth.role === 'va') items.push({ to: '/app/time', label: 'Time', icon: Clock })
  // Nectar — the opportunity pool. VAs browse & apply; PMs/admins post.
  items.push({ to: '/app/nectar', label: 'Nectar', icon: Target })
  // Forms — intake builder; submissions land as tasks. PMs/admins build them.
  if (auth.role === 'pm' || auth.isAdmin) items.push({ to: '/app/forms', label: 'Forms', icon: FileText })
  // Automations — event-driven flow builder (form submitted, task/deal events…).
  if (auth.role === 'pm' || auth.isAdmin) items.push({ to: '/app/automations', label: 'Automations', icon: Workflow })
  return items
})
const bottomNavItems = computed<NavItem[]>(() => {
  const items: NavItem[] = [
    { to: '/app/comms', label: 'Comms', icon: MessagesSquare },
    { to: '/app/messages', label: 'Messages', icon: MessageCircle },
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
  items.push({ to: '/app/settings', label: 'Settings', icon: Settings })
  return items
})

const PIN_KEY = 'buzzybee.workstation.sidebar-pinned'
const pinned = ref(
  typeof window === 'undefined' ? false : window.localStorage.getItem(PIN_KEY) === '1'
)

// Hover intent: a short delay before expanding (so skimming the cursor across
// the rail doesn't flash the panel open) and a slightly longer one before
// collapsing (so briefly overshooting the edge doesn't slam it shut).
const EXPAND_DELAY_MS = 110
const COLLAPSE_DELAY_MS = 180
const hovering = ref(false)
let hoverTimer: ReturnType<typeof setTimeout> | undefined
function onPointerEnter() {
  clearTimeout(hoverTimer)
  hoverTimer = setTimeout(() => { hovering.value = true }, EXPAND_DELAY_MS)
}
function onPointerLeave() {
  clearTimeout(hoverTimer)
  hoverTimer = setTimeout(() => { hovering.value = false }, COLLAPSE_DELAY_MS)
}
onBeforeUnmount(() => clearTimeout(hoverTimer))

// Keyboard users get the same affordance: tabbing into the rail expands it.
const panel = ref<HTMLElement | null>(null)
const focused = ref(false)
function onFocusIn() {
  focused.value = true
}
function onFocusOut(e: FocusEvent) {
  if (!panel.value?.contains(e.relatedTarget as Node)) focused.value = false
}

const effectiveOpen = computed(() => pinned.value || hovering.value || focused.value)

watch(pinned, (v) => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(PIN_KEY, v ? '1' : '0')
  }
})

function togglePin() {
  pinned.value = !pinned.value
}

const fmtBadge = (n: number) => (n > 99 ? '99+' : String(n))
</script>

<template>
  <aside
    :class="[
      'relative shrink-0 transition-[width] duration-300 ease-in-out motion-reduce:transition-none',
      pinned ? 'w-60' : 'w-14'
    ]"
  >
    <div
      ref="panel"
      @mouseenter="onPointerEnter"
      @mouseleave="onPointerLeave"
      @focusin="onFocusIn"
      @focusout="onFocusOut"
      :style="{
        background: 'linear-gradient(180deg, #2c1248 0%, #25103d 100%)',
        '--color-base-100': '#1f0d35',
        '--color-base-200': 'rgba(255,255,255,0.07)',
        '--color-base-300': 'rgba(255,255,255,0.13)',
        '--color-base-content': 'rgba(255,255,255,0.88)',
        '--color-primary': '#d3a3d8',
        '--color-primary-content': '#2c1248',
        color: 'rgba(255,255,255,0.88)'
      }"
      :class="[
        'absolute inset-y-0 left-0 z-30 border-0 overflow-hidden flex flex-col',
        'transition-[width,box-shadow] duration-300 ease-in-out motion-reduce:transition-none',
        effectiveOpen ? 'w-60' : 'w-14',
        effectiveOpen && !pinned ? 'shadow-xl rounded-r-xl' : ''
      ]"
    >
      <div class="h-14 flex items-center px-2.5 border-b border-base-300 gap-3 shrink-0">
        <button
          type="button"
          :aria-label="pinned ? 'Unpin navigation' : 'Pin navigation open'"
          :aria-pressed="pinned"
          :title="pinned ? 'Unpin navigation' : 'Pin navigation open'"
          class="w-9 h-9 rounded-full border border-base-300 flex items-center justify-center hover:bg-base-200 active:scale-95 transition shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          @click="togglePin"
        >
          <Menu class="w-4 h-4" :stroke-width="2" />
        </button>
        <div
          :class="[
            'leading-tight transition-opacity duration-200 motion-reduce:transition-none whitespace-nowrap',
            effectiveOpen ? 'opacity-100 delay-100' : 'opacity-0'
          ]"
        >
          <div class="font-display text-base font-semibold">BuzzyHive</div>
          <div class="text-xs text-base-content/60">Workstation</div>
        </div>
      </div>

      <nav
        aria-label="Workstation navigation"
        class="flex-1 px-2.5 py-3 text-sm overflow-y-auto overflow-x-hidden"
      >
        <div
          class="h-4 px-2 mb-0.5 text-[0.62rem] font-bold uppercase tracking-wider text-base-content/35 transition-opacity duration-200 motion-reduce:transition-none whitespace-nowrap"
          :class="effectiveOpen ? 'opacity-100 delay-100' : 'opacity-0'"
          aria-hidden="true"
        >
          Workspace
        </div>
        <div class="space-y-1">
          <RouterLink
            v-for="item in topNavItems"
            :key="item.to"
            :to="item.to"
            :title="!effectiveOpen ? item.label : undefined"
            class="flex items-center gap-3 px-2 py-2 rounded-md transition-colors hover:bg-base-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            active-class="bg-primary/10 text-primary font-medium"
            :exact-active-class="item.exact ? 'bg-primary/10 text-primary font-medium' : ''"
          >
            <span class="relative shrink-0">
              <component :is="item.icon" class="w-5 h-5" :stroke-width="1.75" />
              <span
                v-if="badgeFor(item) > 0 && !effectiveOpen"
                class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-error ring-2 ring-base-100"
                :aria-label="fmtBadge(badgeFor(item)) + ' unread'"
              />
            </span>
            <span
              :class="[
                'transition-opacity duration-200 motion-reduce:transition-none whitespace-nowrap',
                effectiveOpen ? 'opacity-100 delay-100' : 'opacity-0'
              ]"
            >
              {{ item.label }}
            </span>
            <span
              v-if="badgeFor(item) > 0 && effectiveOpen"
              class="ml-auto min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-error text-white text-[0.65rem] font-bold flex items-center justify-center"
            >
              {{ fmtBadge(badgeFor(item)) }}
            </span>
          </RouterLink>
        </div>

        <!-- Projects tree, grouped by client -->
        <SidebarProjectTree :open="effectiveOpen" />

        <div
          class="h-4 px-2 mt-3 mb-0.5 text-[0.62rem] font-bold uppercase tracking-wider text-base-content/35 transition-opacity duration-200 motion-reduce:transition-none whitespace-nowrap"
          :class="effectiveOpen ? 'opacity-100 delay-100' : 'opacity-0'"
          aria-hidden="true"
        >
          Modules
        </div>
        <div class="space-y-0.5">
          <RouterLink
            v-for="item in bottomNavItems"
            :key="item.to"
            :to="item.to"
            :title="!effectiveOpen ? item.label : undefined"
            class="flex items-center gap-3 px-2 py-2 rounded-md transition-colors hover:bg-base-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            active-class="bg-primary/10 text-primary font-medium"
            :exact-active-class="item.exact ? 'bg-primary/10 text-primary font-medium' : ''"
          >
            <span class="relative shrink-0">
              <component :is="item.icon" class="w-5 h-5" :stroke-width="1.75" />
              <span
                v-if="badgeFor(item) > 0 && !effectiveOpen"
                class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-error ring-2 ring-base-100"
                :aria-label="fmtBadge(badgeFor(item)) + ' unread'"
              />
            </span>
            <span
              :class="[
                'transition-opacity duration-200 motion-reduce:transition-none whitespace-nowrap',
                effectiveOpen ? 'opacity-100 delay-100' : 'opacity-0'
              ]"
            >
              {{ item.label }}
            </span>
            <span
              v-if="badgeFor(item) > 0 && effectiveOpen"
              class="ml-auto min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-error text-white text-[0.65rem] font-bold flex items-center justify-center"
            >
              {{ fmtBadge(badgeFor(item)) }}
            </span>
          </RouterLink>
        </div>
      </nav>

      <SidebarUser :open="effectiveOpen" />
    </div>
  </aside>
</template>
