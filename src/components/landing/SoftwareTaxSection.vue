<script setup lang="ts">
import AmbientGradient from './AmbientGradient.vue'
import AllocationBar from './AllocationBar.vue'

const usualSegments = [
  { pct: 28, label: 'Software 28%', kind: 'soft' as const },
  { pct: 18, label: 'Mgmt 18%', kind: 'soft' as const },
  { pct: 54, label: 'People 54%', kind: 'people' as const }
]

const hiveSegments = [
  { pct: 100, label: 'People 100%', kind: 'people' as const }
]

const usualPoints = [
  'Nearly half your budget evaporates on tools + oversight before any work happens',
  'You still assemble and maintain the stack yourself',
  'Six logins, six bills, six things that can break'
]

const hivePoints = [
  'All six platform tools included at $0',
  'A managing PM included — not a line item',
  'One login, one bill, one teammate already inside it'
]
</script>

<template>
  <section id="software-tax" class="relative py-24 md:py-32 border-t border-base-300 overflow-hidden">
    <div class="absolute inset-0 pointer-events-none">
      <AmbientGradient :opacity="0.16" tone="purple" />
    </div>

    <div class="relative max-w-6xl mx-auto px-6">
      <!-- Header -->
      <div v-reveal class="text-center max-w-2xl mx-auto mb-14">
        <div class="flex items-center gap-3 mb-3 justify-center">
          <span class="text-xs font-medium uppercase tracking-wider text-primary">The software tax</span>
        </div>
        <h2 class="font-display text-3xl md:text-4xl tracking-tight leading-tight text-base-content">
          You're renting tools that don't do the work.
        </h2>
        <p class="mt-4 text-base text-base-content/60 leading-relaxed">
          Slack, Asana, a time tracker, a docs app &mdash; overhead that produces nothing. BuzzyHive bundles all of it in, so your money buys output instead of subscriptions.
        </p>
      </div>

      <!-- Two-way teardown -->
      <div v-reveal="100" class="grid gap-6 md:grid-cols-2 items-start">
        <!-- The usual way -->
        <div class="border border-base-300 rounded-lg p-8 bg-base-100">
          <div class="text-[11px] font-medium uppercase tracking-wider text-base-content/50 mb-4">The usual way — money split three ways</div>
          <AllocationBar :segments="usualSegments" :height="40" />
          <ul class="mt-5 space-y-2.5">
            <li v-for="p in usualPoints" :key="p" class="flex gap-2.5 text-sm text-base-content/65 leading-relaxed">
              <svg class="w-4 h-4 shrink-0 mt-0.5 text-base-content/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
              {{ p }}
            </li>
          </ul>
        </div>

        <!-- With BuzzyHive -->
        <div class="relative border border-primary/40 rounded-lg p-8 bg-base-100 shadow-lg shadow-primary/10">
          <div class="text-[11px] font-medium uppercase tracking-wider text-primary mb-4">With BuzzyHive — all of it on the work</div>
          <AllocationBar :segments="hiveSegments" :height="40" />
          <ul class="mt-5 space-y-2.5">
            <li v-for="p in hivePoints" :key="p" class="flex gap-2.5 text-sm text-base-content/70 leading-relaxed">
              <svg class="w-4 h-4 shrink-0 mt-0.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              {{ p }}
            </li>
          </ul>
          <div class="mt-5">
            <span class="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded bg-primary/10 text-primary">Your whole budget redirected to actual output</span>
          </div>
        </div>
      </div>

      <!-- Closing line -->
      <div class="mt-12 text-center">
        <p class="text-lg font-medium text-base-content/80">
          Same budget. <span class="text-primary">Nearly twice the work actually done.</span>
        </p>
      </div>
    </div>
  </section>
</template>
