<script setup lang="ts">
import { ref, computed } from 'vue'
import { CheckSquare, CalendarDays, TrendingUp } from 'lucide-vue-next'
import { useInViewProgress } from '@/composables/useInViewProgress'

const sceneEl = ref<HTMLElement | null>(null)
const { progress } = useInViewProgress(sceneEl)

const prefersReduced =
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const p = computed(() => (prefersReduced ? 1 : progress.value))

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

// 0 = drained gray, 1 = full color. Holds gray on entry, floods through the middle.
const colored = computed(() => smooth(0.18, 0.6, p.value))
const grayscale = computed(() => 1 - colored.value)

const sceneStyle = computed(() => ({
  filter: `grayscale(${grayscale.value}) saturate(${0.55 + colored.value * 0.95}) brightness(${0.96 + colored.value * 0.04})`
}))

// Cards drift in from a scattered/tilted state and settle as color arrives.
const settle = (dx: number, dy: number, rot: number) => {
  const c = colored.value
  return { transform: `translate(${dx * (1 - c)}px, ${dy * (1 - c)}px) rotate(${rot * (1 - c)}deg)` }
}

const phase = computed(() => (p.value < 0.45 ? 'Before' : 'After'))
</script>

<template>
  <section class="relative py-24 md:py-32 border-t border-base-300 overflow-hidden bg-base-100">
    <div class="relative max-w-6xl mx-auto px-6">
      <div class="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <!-- Copy -->
        <div v-reveal>
          <div class="flex items-center gap-3 mb-3">
            <span class="text-xs font-medium uppercase tracking-wider text-primary">Before &amp; after</span>
          </div>
          <h2 class="font-display text-3xl md:text-4xl lg:text-5xl tracking-tight leading-[1.1] text-base-content">
            Finally, your business in color.
          </h2>
          <p class="mt-5 text-base text-base-content/60 leading-relaxed max-w-md">
            For months it ran in grayscale &mdash; a dozen tabs, scattered tools, busywork with no end. The week your BuzzyHive team and platform click into place, the color comes back.
          </p>

          <!-- Before → After indicator -->
          <div class="mt-8 inline-flex items-center gap-3 text-sm font-medium">
            <span
              class="transition-colors duration-300"
              :class="phase === 'Before' ? 'text-base-content/40' : 'text-base-content/30 line-through'"
            >Overwhelmed &amp; gray</span>
            <svg class="w-4 h-4 text-base-content/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
            <span
              class="transition-colors duration-300"
              :class="phase === 'After' ? 'text-primary' : 'text-base-content/40'"
            >In color &amp; in control</span>
          </div>
        </div>

        <!-- Scene: product collage that floods from gray → color -->
        <div ref="sceneEl" class="relative h-[400px] sm:h-[440px]">
          <!-- Color glow that blooms in as things resolve -->
          <div
            class="absolute inset-8 rounded-[40px] blur-3xl pointer-events-none transition-none"
            style="background: radial-gradient(ellipse at center, #b266bb55, #8e3a9733 55%, transparent 75%)"
            :style="{ opacity: colored }"
          ></div>

          <div class="absolute inset-0 will-change-[filter]" :style="sceneStyle">
            <!-- Task card (top-left) -->
            <div class="absolute left-0 top-4 w-52 max-w-[70%] rounded-xl border border-base-300 bg-base-100 shadow-xl p-4" :style="settle(-28, 18, -7)">
              <div class="flex items-center gap-2 mb-3">
                <span class="text-[9px] font-bold uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded">HiveFlow</span>
              </div>
              <div class="space-y-2">
                <div class="flex items-center gap-2 text-xs text-base-content/70">
                  <CheckSquare class="w-4 h-4 text-green-500 shrink-0" /> Listing photos live
                </div>
                <div class="flex items-center gap-2 text-xs text-base-content/70">
                  <CheckSquare class="w-4 h-4 text-green-500 shrink-0" /> Leads followed up
                </div>
              </div>
            </div>

            <!-- Chat card (top-right) -->
            <div class="absolute right-0 top-0 w-56 max-w-[74%] rounded-xl border border-base-300 bg-base-100 shadow-xl p-4" :style="settle(30, -14, 6)">
              <div class="flex items-start gap-2.5">
                <div class="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-plum text-white flex items-center justify-center text-[11px] font-bold shrink-0">M</div>
                <div>
                  <div class="text-[11px] font-semibold text-base-content">Maria Santos</div>
                  <div class="mt-1 text-xs text-base-content/70 bg-base-200 rounded-lg rounded-tl-none px-3 py-2">Closed the Johnson deal 🎉</div>
                </div>
              </div>
            </div>

            <!-- Stat card (bottom-left) -->
            <div class="absolute left-6 bottom-2 w-40 max-w-[60%] rounded-xl border border-base-300 bg-base-100 shadow-xl p-4" :style="settle(-22, 26, 5)">
              <div class="flex items-center gap-1.5 text-green-600">
                <TrendingUp class="w-4 h-4" />
                <span class="text-2xl font-bold tracking-tight">+32%</span>
              </div>
              <div class="text-[11px] text-base-content/50 mt-1">deals closed this month</div>
            </div>

            <!-- Calendar card (bottom-right) -->
            <div class="absolute right-4 bottom-8 w-44 max-w-[62%] rounded-xl border border-base-300 bg-base-100 shadow-xl overflow-hidden" :style="settle(26, 20, -5)">
              <div class="flex items-center gap-2 px-3 py-2 bg-primary text-primary-content">
                <CalendarDays class="w-4 h-4" />
                <span class="text-[11px] font-semibold">Today</span>
              </div>
              <div class="p-3 space-y-1.5">
                <div class="flex items-center gap-2 text-[11px] text-base-content/70">
                  <span class="w-1.5 h-1.5 rounded-full bg-secondary"></span> Showing · 2:00 PM
                </div>
                <div class="flex items-center gap-2 text-[11px] text-base-content/70">
                  <span class="w-1.5 h-1.5 rounded-full bg-plum"></span> Closing · 4:30 PM
                </div>
              </div>
            </div>

            <!-- Live badge (center) -->
            <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 bg-base-100 border border-base-300 rounded-full px-3 py-1.5 shadow-lg" :style="settle(0, 0, 0)">
              <span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
              <span class="text-[10px] font-semibold uppercase tracking-wider text-base-content/70">Team online</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
