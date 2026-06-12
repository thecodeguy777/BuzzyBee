<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Wifi } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useOnlinePresence } from '@/composables/useOnlinePresence'
import HexAvatar from '@/components/shared/HexAvatar.vue'

// "Who's in the building" — a live count in the topbar (admin eyes only) with
// a popover listing everyone online, their role, where in the app they are
// (clickable), and since when. Everyone tracks; only admins see the list.

const auth = useAuthStore()
const { list, count, ready } = useOnlinePresence()

const open = ref(false)
const rootEl = ref<HTMLElement | null>(null)

function onDocClick(e: MouseEvent) {
  if (open.value && rootEl.value && !rootEl.value.contains(e.target as Node)) open.value = false
}
function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}
onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onEsc)
})
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onEsc)
})

const ROLE_LABEL: Record<string, string> = {
  superadmin: 'Superadmin', admin: 'Admin', pm: 'PM', va: 'VA', sales: 'Sales', client: 'Client',
}
const ROLE_CLASS: Record<string, string> = {
  superadmin: 'bg-error/10 text-error',
  admin: 'bg-error/10 text-error',
  pm: 'bg-info/10 text-info',
  va: 'bg-primary/10 text-primary',
  sales: 'bg-warning/10 text-warning',
  client: 'bg-base-200 text-base-content/60',
}

// /app/comms → "Comms"; /app → "Home"; /app/team/abc → "Team".
function pageLabel(path: string) {
  const seg = path.replace(/^\/app\/?/, '').split(/[/?#]/)[0]
  if (!seg) return 'Home'
  return seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' ')
}
function sinceLabel(at: string) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(at).getTime()) / 60_000))
  if (mins < 1) return 'just now'
  if (mins < 60) return mins + 'm'
  return Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm'
}

const others = computed(() => list.value.filter((p) => p.user_id !== auth.user?.id))
</script>

<template>
  <div v-if="auth.isAdmin" ref="rootEl" class="relative">
    <button
      type="button"
      class="flex items-center gap-1.5 h-8 px-2.5 rounded-full text-xs font-semibold transition-colors hover:bg-base-200"
      :class="open ? 'bg-base-200 text-base-content' : 'text-base-content/60'"
      :title="count + ' online now'"
      :aria-expanded="open"
      aria-haspopup="true"
      @click="open = !open"
    >
      <span class="relative flex h-2 w-2">
        <span v-if="count > 0" class="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 animate-ping" />
        <span class="relative inline-flex rounded-full h-2 w-2" :class="count > 0 ? 'bg-success' : 'bg-base-content/30'" />
      </span>
      <span class="tabular-nums">{{ ready ? count : '·' }}</span>
      <span class="hidden md:inline">online</span>
    </button>

    <Transition
      enter-active-class="transition-all duration-150 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      leave-active-class="transition-opacity duration-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="absolute right-0 top-full mt-1.5 z-50 w-80 rounded-xl border border-base-300 bg-base-100 shadow-xl overflow-hidden"
        role="menu"
      >
        <div class="px-4 py-2.5 border-b border-base-300 flex items-center gap-2">
          <Wifi class="w-3.5 h-3.5 text-success" :stroke-width="2" />
          <span class="text-xs font-semibold">In the building</span>
          <span class="text-[0.65rem] text-base-content/50">{{ count }} {{ count === 1 ? 'person' : 'people' }}</span>
        </div>

        <ul class="max-h-80 overflow-y-auto py-1">
          <li v-for="p in list" :key="p.user_id">
            <div class="px-3 py-2 flex items-center gap-2.5 hover:bg-base-200/50">
              <span class="relative shrink-0">
                <HexAvatar :avatar-url="p.avatar_url" :name="p.name" :size="30" :font-size="11" />
                <span class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success ring-2 ring-base-100" />
              </span>
              <span class="flex-1 min-w-0">
                <span class="flex items-center gap-1.5 min-w-0">
                  <span class="text-sm font-medium truncate">
                    {{ p.name }}{{ p.user_id === auth.user?.id ? ' (you)' : '' }}
                  </span>
                  <span
                    class="text-[0.6rem] font-bold uppercase px-1.5 py-px rounded shrink-0"
                    :class="ROLE_CLASS[p.role] ?? 'bg-base-200 text-base-content/60'"
                  >{{ ROLE_LABEL[p.role] ?? p.role }}</span>
                </span>
                <span class="flex items-center gap-1.5 text-[0.68rem] text-base-content/50 min-w-0">
                  <RouterLink
                    :to="p.path || '/app'"
                    class="truncate hover:underline hover:text-primary"
                    :title="'Go to ' + (p.path || '/app')"
                    @click="open = false"
                  >
                    {{ pageLabel(p.path || '/app') }}
                    <span class="font-mono text-[0.62rem] text-base-content/35">{{ p.path || '/app' }}</span>
                  </RouterLink>
                  <span class="text-base-content/30 shrink-0">·</span>
                  <span class="shrink-0 tabular-nums">{{ sinceLabel(p.at) }}</span>
                </span>
              </span>
            </div>
          </li>
          <li v-if="!list.length" class="px-4 py-6 text-center text-xs text-base-content/50">
            {{ ready ? 'Nobody else is online right now.' : 'Connecting…' }}
          </li>
        </ul>

        <div v-if="others.length === 0 && list.length > 0" class="px-4 py-2 border-t border-base-300/60 text-[0.65rem] text-base-content/40">
          Just you so far — this updates live as people sign in.
        </div>
      </div>
    </Transition>
  </div>
</template>
