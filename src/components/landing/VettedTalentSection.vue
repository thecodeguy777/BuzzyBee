<script setup lang="ts">
import { ref, computed } from 'vue'
import AmbientGradient from './AmbientGradient.vue'
import { BadgeCheck, Target, Zap, Award } from 'lucide-vue-next'
import { useInViewProgress } from '@/composables/useInViewProgress'

const funnelEl = ref<HTMLElement | null>(null)
const { progress } = useInViewProgress(funnelEl)

const prefersReduced =
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const p = computed(() => (prefersReduced ? 1 : progress.value))

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

// Each stage's bar starts full and "drains" to its target width as the funnel
// scrolls into view — thousands narrowing to the top 3%.
const funnel = [
  { label: 'Monthly applicants', value: '2,000+', w: 100, bar: 'bg-primary/20' },
  { label: 'Pass AI pre-screen', value: '~30%', w: 74, bar: 'bg-primary/35' },
  { label: 'Clear recruiter interview', value: '~12%', w: 52, bar: 'bg-primary/55' },
  { label: 'Pass skills assessment', value: '~6%', w: 32, bar: 'bg-primary/75' },
  { label: 'Hired & placed', value: 'Top 3%', w: 18, bar: 'bg-primary' }
]
const barWidth = (i: number, target: number) => {
  const t = smooth(0.08 + i * 0.05, 0.42 + i * 0.05, p.value)
  return 100 + (target - 100) * t
}

const pillars = [
  {
    icon: BadgeCheck,
    title: 'High-quality workforce',
    body: 'Degree-holding professionals from the top 3% of thousands of applicants. Screened, not gig-economy labor.'
  },
  {
    icon: Target,
    title: 'Intelligent staffing',
    body: 'Matched to your industry, tools, and time zone. The right person for your workflow, never a random assignment.'
  },
  {
    icon: Zap,
    title: 'Highly effective people',
    body: 'Trained on your playbook, so they\'re productive from week one. No months-long ramp-up.'
  },
  {
    icon: Award,
    title: 'Trained & retained',
    body: 'Continuous upskilling and 94% retention, so your playbook compounds instead of resetting every few months.'
  }
]
</script>

<template>
  <section id="talent" class="relative py-24 md:py-32 border-t border-base-300 bg-base-200 overflow-hidden">
    <div class="absolute inset-0 pointer-events-none">
      <AmbientGradient :opacity="0.13" tone="purple" />
    </div>

    <div class="relative max-w-6xl mx-auto px-6">
      <!-- Header -->
      <div v-reveal class="text-center max-w-2xl mx-auto mb-14">
        <div class="flex items-center gap-3 mb-3 justify-center">
          <span class="text-xs font-medium uppercase tracking-wider text-primary">Screened talent</span>
        </div>
        <h2 class="font-display text-3xl md:text-4xl tracking-tight leading-tight text-base-content">
          Only the top 3% make it through.
        </h2>
        <p class="mt-4 text-base text-base-content/60 leading-relaxed">
          Every BuzzyHive VA clears AI pre-screening, a recruiter interview, and a role-specific skills test before they ever touch your account. Then we match them to your tools and time zone.
        </p>
      </div>

      <div class="grid lg:grid-cols-[minmax(0,440px)_1fr] gap-10 lg:gap-14 items-center">
        <!-- Screening funnel (drains on scroll) -->
        <div ref="funnelEl" v-reveal class="border border-base-300 rounded-lg p-6 bg-base-100">
          <div class="text-[11px] font-medium uppercase tracking-wider text-base-content/50 mb-5">The screening funnel</div>
          <div class="space-y-4">
            <div v-for="(stage, i) in funnel" :key="stage.label">
              <div class="flex items-center justify-between text-[11px] mb-1.5">
                <span class="text-base-content/60">{{ stage.label }}</span>
                <span class="font-bold text-base-content/80">{{ stage.value }}</span>
              </div>
              <div class="h-3 rounded-full bg-base-200 overflow-hidden">
                <div class="h-full rounded-full" :class="stage.bar" :style="{ width: barWidth(i, stage.w) + '%' }"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Quality pillars -->
        <div v-reveal="100" class="grid gap-4 sm:grid-cols-2 stagger-children">
          <div
            v-for="pl in pillars"
            :key="pl.title"
            class="relative border border-base-300 rounded-lg p-6 bg-base-100 group hover:border-primary/30 transition-all duration-300"
          >
            <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/10 to-plum/10 border border-primary/15 flex items-center justify-center mb-4">
              <component :is="pl.icon" class="w-5 h-5 text-primary" />
            </div>
            <h3 class="text-base font-semibold text-base-content mb-2">{{ pl.title }}</h3>
            <p class="text-sm text-base-content/60 leading-relaxed">{{ pl.body }}</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
