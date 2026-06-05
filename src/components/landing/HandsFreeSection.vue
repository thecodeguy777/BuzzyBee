<script setup lang="ts">
import { ref, computed } from 'vue'
import AmbientGradient from './AmbientGradient.vue'
import { ListChecks } from 'lucide-vue-next'
import { useInViewProgress } from '@/composables/useInViewProgress'

const listEl = ref<HTMLElement | null>(null)
const { progress } = useInViewProgress(listEl)

const prefersReduced =
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const p = computed(() => (prefersReduced ? 1 : progress.value))

const tasks = [
  'Follow up with 12 new leads',
  'Update the CRM pipeline',
  "Schedule Tuesday's showings",
  'Draft & send the closing docs',
  "Post this week's new listings",
  "Reconcile last month's invoices"
]

// Tasks check themselves off one by one as the list scrolls through.
const done = (i: number) => p.value > 0.18 + i * (0.6 / tasks.length)
const doneCount = computed(() => tasks.reduce((n, _, i) => n + (done(i) ? 1 : 0), 0))
const allDone = computed(() => doneCount.value === tasks.length)
</script>

<template>
  <section class="relative py-24 md:py-32 border-t border-base-300 overflow-hidden bg-base-100">
    <div class="absolute inset-0 pointer-events-none">
      <AmbientGradient :opacity="0.12" tone="blue" />
    </div>

    <div class="relative max-w-6xl mx-auto px-6">
      <div class="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <!-- Copy -->
        <div v-reveal>
          <div class="flex items-center gap-3 mb-3">
            <div class="w-8 h-0.5 rounded-full bg-gradient-to-r from-primary to-purple-500"></div>
            <span class="text-xs font-medium uppercase tracking-wider text-primary">Hands-free</span>
          </div>
          <h2 class="font-display text-3xl md:text-4xl lg:text-5xl tracking-tight leading-[1.1] text-base-content">
            Look ma &mdash; no hands.
          </h2>
          <p class="mt-5 text-base text-base-content/60 leading-relaxed max-w-md">
            Your whole to-do list, handled while you were out closing deals. You delegate once &mdash; your VA and the platform take it from there. No nudging, no following up, no "did you get to this?"
          </p>
          <div class="mt-7 inline-flex items-center gap-2 rounded-full border border-base-300 bg-base-100 px-3.5 py-1.5 text-[13px] font-medium text-base-content/60">
            <span class="w-1.5 h-1.5 rounded-full bg-green-500" :class="{ 'animate-pulse': !allDone }"></span>
            {{ doneCount }} of {{ tasks.length }} done today
          </div>
        </div>

        <!-- Self-clearing task list -->
        <div ref="listEl" class="rounded-2xl border border-base-300 bg-base-100 shadow-xl p-5 sm:p-6">
          <div class="flex items-center justify-between mb-5">
            <div class="flex items-center gap-2 text-sm font-semibold text-base-content">
              <ListChecks class="w-4 h-4 text-primary" />
              Today's tasks
            </div>
            <span
              class="text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded transition-colors duration-300"
              :class="allDone ? 'bg-green-500/10 text-green-600' : 'bg-primary/10 text-primary'"
            >{{ doneCount }}/{{ tasks.length }}</span>
          </div>

          <ul class="space-y-2.5">
            <li v-for="(t, i) in tasks" :key="t" class="flex items-center gap-3">
              <span
                class="shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-all duration-300"
                :class="done(i) ? 'bg-primary border-primary text-white scale-100' : 'border-base-300 text-transparent'"
              >
                <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              </span>
              <span
                class="text-sm transition-all duration-300"
                :class="done(i) ? 'line-through text-base-content/40' : 'text-base-content/75'"
              >{{ t }}</span>
              <span v-if="done(i)" class="ml-auto text-[10px] uppercase tracking-wider text-base-content/35">done</span>
            </li>
          </ul>

          <div
            class="mt-5 pt-4 border-t border-base-300 text-center text-xs transition-colors duration-300"
            :class="allDone ? 'text-primary font-medium' : 'text-base-content/45'"
          >
            {{ allDone ? "Inbox zero — and you didn't lift a finger. ✨" : 'Working through it…' }}
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
