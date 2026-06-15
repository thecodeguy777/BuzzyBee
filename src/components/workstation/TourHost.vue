<script setup lang="ts">
// App-root overlay for the cinematic first-run tour. Always mounted (like
// NotificationToastHost / BuzzOverlay); inert until the tour starts.
//
// Drives the REAL workstation UI (over the seeded demo workspace) and, on top
// of it, paints a dimmed backdrop with a spotlight cut-out around the current
// step's anchor plus a positioned popover. Falls back to a centered caption
// when a step has no anchor or its anchor didn't resolve.
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight, Sparkles, X } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import {
  bindTourRouter,
  isTourNavigating,
  recoverInterruptedTour,
  registerTourSteps,
  useTour,
} from '@/composables/useTour'
import { cinematicTourSteps } from '@/lib/tourSteps'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const {
  active,
  current,
  index,
  total,
  targetRect,
  resolving,
  nextStep,
  prevStep,
  skipTour,
  maybeAutoStartTour,
  remeasure,
} = useTour()

bindTourRouter(router)
registerTourSteps(cinematicTourSteps)

const PAD = 8
const GAP = 14
const POP_W = 340
const POP_H_EST = 240

const spotlightStyle = computed(() => {
  const r = targetRect.value
  if (!r) return null
  const pad = current.value?.padding ?? PAD
  return {
    top: `${r.top - pad}px`,
    left: `${r.left - pad}px`,
    width: `${r.width + pad * 2}px`,
    height: `${r.height + pad * 2}px`,
  }
})

const popoverStyle = computed(() => {
  const r = targetRect.value
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (!r) {
    // centered caption
    return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }
  const clampX = (x: number) => Math.max(16, Math.min(x, vw - POP_W - 16))
  const clampY = (y: number) => Math.max(16, Math.min(y, vh - POP_H_EST - 16))
  const centerX = r.left + r.width / 2 - POP_W / 2
  const placement = current.value?.placement

  // Beside the anchor when there's room; otherwise fall through to vertical.
  if (placement === 'right' && r.right + GAP + POP_W <= vw - 16) {
    return { top: `${clampY(r.top)}px`, left: `${r.right + GAP}px` }
  }
  if (placement === 'left' && r.left - GAP - POP_W >= 16) {
    return { top: `${clampY(r.top)}px`, left: `${r.left - GAP - POP_W}px` }
  }

  // auto vertical: prefer below, flip above when there isn't room — and clamp
  // both axes so a long caption can never render off-screen.
  const below = vh - r.bottom > POP_H_EST + GAP || r.top < POP_H_EST + GAP
  const top = below ? r.bottom + GAP : r.top - GAP - POP_H_EST
  return { top: `${clampY(top)}px`, left: `${clampX(centerX)}px` }
})

const isLast = computed(() => index.value >= total.value - 1)

// ---- keyboard + viewport sync (only while active) ---------------------------

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    skipTour()
  } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
    e.preventDefault()
    void nextStep()
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    void prevStep()
  }
}

watch(active, (on) => {
  if (on) {
    window.addEventListener('keydown', onKeydown, true)
    window.addEventListener('resize', remeasure)
    // capture:true so we catch scrolls inside scroll containers, not just window
    window.addEventListener('scroll', remeasure, true)
  } else {
    window.removeEventListener('keydown', onKeydown, true)
    window.removeEventListener('resize', remeasure)
    window.removeEventListener('scroll', remeasure, true)
  }
})

// ---- first-run auto-start ----------------------------------------------------

let autoStarted = false
function tryAutoStart() {
  if (autoStarted) return
  if (!auth.user?.id) return
  // only inside the workstation, never on the public landing/login chrome
  if ((route.meta as { layout?: string }).layout !== 'workstation') return
  autoStarted = true
  // small beat so the shell has painted
  window.setTimeout(() => {
    if ((route.meta as { layout?: string }).layout === 'workstation') void maybeAutoStartTour()
  }, 900)
}

watch(() => auth.user?.id, tryAutoStart, { immediate: true })
watch(() => route.name, tryAutoStart)

// End the tour (and restore the workspace) if the user navigates away via a
// route change the tour itself didn't drive — e.g. the browser back button.
watch(
  () => route.name,
  (name) => {
    if (active.value && !isTourNavigating() && current.value?.route && name !== current.value.route) {
      skipTour()
    }
  }
)

// Recover from a tour interrupted by a reload/close mid-run (restore the client).
onMounted(recoverInterruptedTour)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('resize', remeasure)
  window.removeEventListener('scroll', remeasure, true)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="active" class="bb-tour" role="dialog" aria-modal="true" aria-label="Product tour">
      <!-- full-screen click-blocker; dimmed itself only when there's no
           spotlight AND we're not mid-resolve (so loads aren't blacked out) -->
      <div class="bb-tour__block" :class="{ 'bb-tour__block--dim': !targetRect && !resolving }" />

      <!-- spotlight cut-out (box-shadow paints the dim everywhere but the hole) -->
      <div v-if="spotlightStyle" class="bb-tour__spot" :style="spotlightStyle" />

      <!-- caption popover -->
      <div v-show="!resolving || targetRect" class="bb-tour__pop" :style="popoverStyle">
        <button class="bb-tour__close" type="button" aria-label="Skip tour" @click="skipTour">
          <X :size="16" :stroke-width="2" />
        </button>

        <div class="bb-tour__eyebrow">
          <Sparkles :size="13" :stroke-width="2" />
          <span>Step {{ index + 1 }} of {{ total }}</span>
        </div>

        <h3 class="bb-tour__title">{{ current?.title }}</h3>
        <p class="bb-tour__body">{{ current?.body }}</p>

        <div class="bb-tour__dots" aria-hidden="true">
          <span
            v-for="n in total"
            :key="n"
            class="bb-tour__dot"
            :class="{ 'is-on': n - 1 === index }"
          />
        </div>

        <div class="bb-tour__actions">
          <button class="bb-tour__skip" type="button" @click="skipTour">Skip</button>
          <div class="bb-tour__nav">
            <button
              v-if="index > 0"
              class="bb-tour__btn bb-tour__btn--ghost"
              type="button"
              @click="prevStep"
            >
              <ArrowLeft :size="15" :stroke-width="2" /> Back
            </button>
            <button class="bb-tour__btn bb-tour__btn--primary" type="button" @click="nextStep">
              {{ isLast ? 'Finish' : 'Next' }}
              <ArrowRight v-if="!isLast" :size="15" :stroke-width="2" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.bb-tour {
  position: fixed;
  inset: 0;
  z-index: 9000;
}

.bb-tour__block {
  position: absolute;
  inset: 0;
  pointer-events: auto;
}
.bb-tour__block--dim {
  background: rgba(13, 9, 18, 0.74);
}

.bb-tour__spot {
  position: fixed;
  border-radius: 14px;
  box-shadow: 0 0 0 9999px rgba(13, 9, 18, 0.74);
  outline: 2px solid #a85be0;
  outline-offset: 2px;
  pointer-events: none;
  transition:
    top 0.3s cubic-bezier(0.22, 1, 0.36, 1),
    left 0.3s cubic-bezier(0.22, 1, 0.36, 1),
    width 0.3s cubic-bezier(0.22, 1, 0.36, 1),
    height 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

.bb-tour__pop {
  position: fixed;
  width: 340px;
  max-width: calc(100vw - 32px);
  background: #1c1426;
  color: #f3ecfa;
  border: 1px solid rgba(168, 91, 224, 0.35);
  border-radius: 16px;
  padding: 18px 18px 16px;
  box-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.7);
  z-index: 1;
  transition:
    top 0.3s cubic-bezier(0.22, 1, 0.36, 1),
    left 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

.bb-tour__close {
  position: absolute;
  top: 12px;
  right: 12px;
  color: rgba(243, 236, 250, 0.5);
  transition: color 0.15s;
}
.bb-tour__close:hover {
  color: #f3ecfa;
}

.bb-tour__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #c79bef;
  margin-bottom: 8px;
}

.bb-tour__title {
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.3;
  margin-bottom: 6px;
}

.bb-tour__body {
  font-size: 0.875rem;
  line-height: 1.5;
  color: rgba(243, 236, 250, 0.78);
  margin-bottom: 14px;
}

.bb-tour__dots {
  display: flex;
  gap: 5px;
  margin-bottom: 14px;
}
.bb-tour__dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: rgba(168, 91, 224, 0.28);
  transition: all 0.2s;
}
.bb-tour__dot.is-on {
  width: 18px;
  background: #a85be0;
}

.bb-tour__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.bb-tour__skip {
  font-size: 0.8rem;
  color: rgba(243, 236, 250, 0.5);
  transition: color 0.15s;
}
.bb-tour__skip:hover {
  color: rgba(243, 236, 250, 0.85);
}

.bb-tour__nav {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bb-tour__btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.825rem;
  font-weight: 600;
  padding: 7px 14px;
  border-radius: 10px;
  transition: all 0.15s;
}
.bb-tour__btn--ghost {
  color: rgba(243, 236, 250, 0.75);
}
.bb-tour__btn--ghost:hover {
  background: rgba(168, 91, 224, 0.12);
  color: #f3ecfa;
}
.bb-tour__btn--primary {
  background: linear-gradient(135deg, #a85be0, #8b3fd1);
  color: #fff;
  box-shadow: 0 6px 16px -6px rgba(168, 91, 224, 0.7);
}
.bb-tour__btn--primary:hover {
  filter: brightness(1.08);
}
</style>
