<script setup lang="ts">
import { watch, onBeforeUnmount } from 'vue'
import HexAvatar from '@/components/shared/HexAvatar.vue'
import { startBuzzRing } from '@/lib/commsSounds'
import { useBuzz } from '@/composables/useBuzz'

// Full-screen buzz takeover + the sender's "saw it" receipt toast. Mounted
// once in WorkstationLayout so a buzz lands on any page of the app.

const { incoming, seenBy, ack, dismiss } = useBuzz()

// Loud enough to matter, bounded enough to not be hostage-taking.
const AUTO_DISMISS_MS = 20_000

let stopRing: (() => void) | null = null
let dismissTimer: ReturnType<typeof setTimeout> | undefined
let titleTimer: ReturnType<typeof setInterval> | undefined
let baseTitle = ''

function cleanup() {
  stopRing?.()
  stopRing = null
  clearTimeout(dismissTimer)
  clearInterval(titleTimer)
  titleTimer = undefined
  if (baseTitle) {
    document.title = baseTitle
    baseTitle = ''
  }
}

watch(incoming, (b) => {
  cleanup()
  if (!b) return
  stopRing = startBuzzRing()
  try {
    navigator.vibrate?.([220, 90, 220, 90, 220])
  } catch {
    /* not supported */
  }
  // Tab title flash — covers the backgrounded-tab case.
  baseTitle = document.title
  let flip = false
  titleTimer = setInterval(() => {
    document.title = (flip = !flip) ? `BUZZ — ${b.fromName}` : baseTitle
  }, 900)
  // OS-level notification when the tab is hidden (only if already permitted —
  // we never interrupt a buzz with a permission prompt).
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(`${b.fromName} is buzzing you`, { body: 'They need you in HiveMind right now.' })
    } catch {
      /* ignore */
    }
  }
  dismissTimer = setTimeout(dismiss, AUTO_DISMISS_MS)
})

onBeforeUnmount(cleanup)
</script>

<template>
  <Teleport to="body">
    <Transition name="buzz-pop">
      <!-- z above everything (meeting takeover, modals, dock) — a buzz wins. -->
      <div
        v-if="incoming"
        class="fixed inset-0 grid place-items-center overflow-hidden"
        style="z-index: 9999"
      >
        <!-- dim + blur whatever's behind, on any page -->
        <div class="absolute inset-0 bg-base-300/85 backdrop-blur-md" />
        <!-- full-screen colour wash that pulses (currentColor = primary) -->
        <div class="buzz-glow absolute inset-0 text-primary" />

        <!-- content -->
        <div class="buzz-shake relative flex flex-col items-center gap-6 px-8 text-center">
          <span class="relative inline-flex">
            <span class="buzz-ring absolute inset-0 rounded-full border-[3px] border-primary" />
            <span class="buzz-ring buzz-ring-2 absolute inset-0 rounded-full border-[3px] border-primary" />
            <span class="buzz-pulse relative inline-flex">
              <HexAvatar :avatar-url="incoming.fromAvatar" :name="incoming.fromName" :size="128" tint="primary" />
            </span>
          </span>
          <div>
            <div class="font-display text-3xl sm:text-4xl font-extrabold tracking-tight">{{ incoming.fromName }} is buzzing you</div>
            <div class="text-base text-base-content/65 mt-2">They need your attention right now</div>
          </div>
          <button
            type="button"
            class="h-14 px-12 rounded-2xl bg-primary text-primary-content text-lg font-bold hover:opacity-90 shadow-xl shadow-primary/30"
            @click="ack"
          >
            I'm here
          </button>
        </div>
      </div>
    </Transition>

    <!-- Sender receipt: the other side pressed "I'm here". -->
    <Transition name="buzz-toast">
      <div
        v-if="seenBy"
        class="fixed bottom-5 right-5 px-4 py-3 rounded-xl border border-base-300 bg-base-100 shadow-xl text-sm font-semibold"
        style="z-index: 9998"
      >
        {{ seenBy.name }} saw your buzz
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.buzz-shake {
  animation: buzz-shake 0.55s ease-in-out infinite;
}
@keyframes buzz-shake {
  0%, 100% { transform: translateX(0); }
  15% { transform: translateX(-7px) rotate(-0.6deg); }
  30% { transform: translateX(6px) rotate(0.5deg); }
  45% { transform: translateX(-5px); }
  60% { transform: translateX(4px); }
  75% { transform: translateX(-2px); }
}
.buzz-pulse {
  animation: buzz-pulse 0.9s ease-in-out infinite;
}
@keyframes buzz-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.08); }
}
/* Full-screen colour wash, breathing — currentColor is the primary. */
.buzz-glow {
  background: radial-gradient(circle at 50% 42%, currentColor, transparent 62%);
  animation: buzz-glow 1.1s ease-in-out infinite;
  pointer-events: none;
}
@keyframes buzz-glow {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.92; }
}
/* Radar pings expanding off the avatar. */
.buzz-ring {
  animation: buzz-ring 1.6s ease-out infinite;
}
.buzz-ring-2 {
  animation-delay: 0.8s;
}
@keyframes buzz-ring {
  0% { transform: scale(1); opacity: 0.65; }
  100% { transform: scale(1.85); opacity: 0; }
}
.buzz-pop-enter-active {
  transition: opacity 0.15s ease;
}
.buzz-pop-leave-active {
  transition: opacity 0.12s ease;
}
.buzz-pop-enter-from,
.buzz-pop-leave-to {
  opacity: 0;
}
.buzz-toast-enter-active,
.buzz-toast-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.buzz-toast-enter-from,
.buzz-toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
