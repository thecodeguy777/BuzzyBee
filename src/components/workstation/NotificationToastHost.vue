<script setup lang="ts">
// App-root toast host: shows a slide-in card + plays a chime whenever a NEW
// notification arrives over realtime (never on initial load / pagination —
// that guarantee lives in useNotifications' onNewNotification). Mounted once at
// the root next to <BuzzOverlay /> so it reaches any page.
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { X } from 'lucide-vue-next'
import {
  useNotifications,
  onNewNotification,
  typeIcon,
  typeColor,
  type Notification
} from '@/composables/useNotifications'
import { useAuthStore } from '@/stores/auth'
import { playNotify, primeAudio } from '@/lib/commsSounds'

const { openNotification, init, reset } = useNotifications()
const auth = useAuthStore()

// This host is the one always-mounted consumer, so it owns the notifications
// lifecycle: start the realtime channel on login (regardless of which route is
// open) and tear it down on logout (clears the stale channel + in-memory list
// so a signed-out shared tab can't see/hear the previous user's notifications).
watch(
  () => auth.user?.id,
  (id) => {
    if (id) void init(id)
    else void reset()
  },
  { immediate: true }
)

interface ToastItem {
  n: Notification
  timer: ReturnType<typeof setTimeout>
}

const MAX_VISIBLE = 3
const TTL_MS = 5000
const visible = ref<ToastItem[]>([])

function dismiss(id: string) {
  const idx = visible.value.findIndex((t) => t.n.id === id)
  if (idx === -1) return
  clearTimeout(visible.value[idx].timer)
  visible.value.splice(idx, 1)
}

function pushToast(n: Notification) {
  // Drop the oldest once we hit the cap — the bell badge is the catch-all.
  while (visible.value.length >= MAX_VISIBLE) {
    const oldest = visible.value.shift()
    if (oldest) clearTimeout(oldest.timer)
  }
  const timer = setTimeout(() => dismiss(n.id), TTL_MS)
  visible.value.push({ n, timer })
}

async function activate(n: Notification) {
  dismiss(n.id)
  await openNotification(n)
}

let unsub: (() => void) | null = null

// Resume audio on the first user gesture so a background notification chime is
// audible even if the user hasn't clicked since load.
function primeOnce() {
  primeAudio()
  window.removeEventListener('pointerdown', primeOnce)
  window.removeEventListener('keydown', primeOnce)
}

onMounted(() => {
  window.addEventListener('pointerdown', primeOnce, { once: true })
  window.addEventListener('keydown', primeOnce, { once: true })
  unsub = onNewNotification((n) => {
    // Fail closed: never toast on an unauthenticated surface (e.g. a late
    // INSERT arriving on the login/public page after sign-out).
    if (!auth.user?.id) return
    // Defense in depth: the DB triggers already skip the actor and the realtime
    // channel is user-scoped, but never toast my own action or another user's row.
    if (n.actor_id && n.actor_id === auth.user.id) return
    if (n.user_id !== auth.user.id) return
    pushToast(n)
    playNotify()
  })
})

onUnmounted(() => {
  if (unsub) unsub()
  for (const t of visible.value) clearTimeout(t.timer)
  visible.value = []
  window.removeEventListener('pointerdown', primeOnce)
  window.removeEventListener('keydown', primeOnce)
})
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed top-4 right-4 flex flex-col gap-2 pointer-events-none"
      style="z-index: 9990"
    >
      <TransitionGroup name="notif-toast">
        <div
          v-for="t in visible"
          :key="t.n.id"
          role="button"
          tabindex="0"
          class="pointer-events-auto w-[21rem] max-w-[calc(100vw-2rem)] flex items-start gap-3 pl-3 pr-2 py-2.5 rounded-xl border border-base-300 bg-base-100 shadow-2xl cursor-pointer hover:bg-base-200/40 transition-colors"
          @click="activate(t.n)"
          @keydown.enter="activate(t.n)"
        >
          <div
            class="w-7 h-7 rounded-lg bg-base-200/60 grid place-items-center shrink-0 mt-0.5"
            :class="typeColor(t.n.type)"
          >
            <component :is="typeIcon(t.n.type)" class="w-3.5 h-3.5" :stroke-width="1.75" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="text-[13px] font-bold text-base-content truncate">{{ t.n.title }}</span>
              <span
                v-if="t.n.source_ref"
                class="text-[0.6rem] font-mono text-base-content/50 shrink-0"
              >
                {{ t.n.source_ref }}
              </span>
            </div>
            <p v-if="t.n.preview" class="text-xs text-base-content/55 truncate mt-0.5">
              {{ t.n.preview }}
            </p>
          </div>
          <button
            type="button"
            class="w-6 h-6 rounded-md grid place-items-center text-base-content/40 hover:text-base-content hover:bg-base-200 shrink-0"
            aria-label="Dismiss"
            @click.stop="dismiss(t.n.id)"
          >
            <X class="w-3.5 h-3.5" :stroke-width="2" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.notif-toast-enter-active {
  animation: notif-in 0.26s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
}
.notif-toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.notif-toast-leave-to {
  opacity: 0;
  transform: translateX(16px);
}
.notif-toast-move {
  transition: transform 0.2s ease;
}
@keyframes notif-in {
  from {
    opacity: 0;
    transform: translateX(24px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
}
</style>
