<script setup lang="ts">
import rawBeeLaptop from '@/assets/bee-laptop.svg?raw'
import rawHoneycomb from '@/assets/icons/honeycomb.svg?raw'
import rawCheck from '@/assets/icons/check.svg?raw'
import rawThoughtbubble from '@/assets/icons/thoughtbubble.svg?raw'
import rawFlower from '@/assets/icons/flower.svg?raw'
import { prefixSvgIds } from '@/utils/svg'

const beeLaptopSrc = prefixSvgIds(rawBeeLaptop, 'why-beelap')
const honeycombSrc = prefixSvgIds(rawHoneycomb, 'why-hc')
const checkSrc = prefixSvgIds(rawCheck, 'why-ck')
const thoughtbubbleSrc = prefixSvgIds(rawThoughtbubble, 'why-tb')
const flowerSrc = prefixSvgIds(rawFlower, 'why-fl')

const pillars = [
  {
    icon: honeycombSrc,
    title: 'Better pay. Better bees.',
    body: 'We pay VAs 30–50% above the market median. Top talent applies to us first and stays longer, so your playbook compounds instead of resetting.',
    stat: '$600–$900/mo',
    statLabel: 'VA take-home',
    accent: 'amber'
  },
  {
    icon: checkSrc,
    title: 'One platform, zero chaos.',
    body: 'EOD reports, time tracking, client playbooks, and PM check-ins live in a single dashboard. Replace the Slack + Drive + Time Doctor sprawl with software that was built for this.',
    stat: '1 tool',
    statLabel: 'vs. 5–8 SaaS seats',
    accent: 'mint'
  },
  {
    icon: thoughtbubbleSrc,
    title: 'Run by people who’ve done the job.',
    body: 'Two of our founders work inside leading VA agencies today. The playbooks, onboarding flows, and daily rituals are shaped by what actually works, not by a consultant’s deck.',
    stat: '1,000+',
    statLabel: 'placements studied',
    accent: 'salmon'
  },
  {
    icon: flowerSrc,
    title: 'AI-augmented, not AI-replaced.',
    body: 'Our VAs are trained on Claude, ChatGPT, and workflow automations from day one. You get a human operator who moves 2–3× faster on the repetitive stuff.',
    stat: '2–3×',
    statLabel: 'throughput on admin tasks',
    accent: 'amber'
  }
]

const accentClass: Record<string, string> = {
  amber: 'bg-primary/10 border-primary/25 text-primary',
  mint: 'bg-secondary/30 border-secondary/60 text-base-content',
  salmon: 'bg-accent/15 border-accent/30 text-accent'
}
</script>

<template>
  <section id="why" class="relative bg-base-200 py-24 md:py-32 overflow-hidden">
    <!-- Background wash -->
    <div
      class="absolute inset-0 pointer-events-none"
      style="background:
        radial-gradient(ellipse 50% 40% at 90% 15%, oklch(90% 0.08 85 / 0.4) 0%, transparent 60%),
        radial-gradient(ellipse 40% 30% at 5% 90%, oklch(88% 0.06 175 / 0.35) 0%, transparent 65%);"
    ></div>

    <div class="relative max-w-7xl mx-auto px-6">
      <!-- Decorative bee-laptop — next to the header on the right -->
      <div
        class="absolute -top-4 right-2 w-64 lg:w-80 h-64 lg:h-80 pointer-events-none hidden lg:block anim-drift-rev opacity-95 z-0"
      >
        <div class="w-full h-full" v-html="beeLaptopSrc" />
      </div>

      <!-- Header -->
      <div v-reveal class="relative z-10 max-w-2xl mb-14">
        <div class="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-xs font-medium tracking-wide mb-4">
          <span class="text-primary">Why BuzzyBee</span>
        </div>
        <h2 class="font-display text-4xl md:text-5xl font-semibold tracking-tight leading-tight">
          We pay worker bees more.
          <br class="hidden md:block" />
          You get the
          <span class="italic text-primary">hive that works</span>.
        </h2>
        <p class="mt-5 text-lg text-base-content/70 leading-relaxed">
          Most VA agencies are relationship businesses running on spreadsheets. We treat it like a product. Better incentives for the talent, better tools for the operator, better outcomes for you.
        </p>
      </div>

      <!-- Pillar cards 2×2 -->
      <div class="grid gap-5 md:grid-cols-2">
        <div
          v-for="(p, i) in pillars"
          :key="p.title"
          v-reveal="i * 90"
          class="relative rounded-3xl border border-base-300 bg-base-100 p-7 md:p-8 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
        >
          <div class="flex items-start gap-5">
            <div
              class="shrink-0 w-16 h-16 rounded-2xl border flex items-center justify-center"
              :class="accentClass[p.accent]"
            >
              <div class="w-11 h-11 icon-wrap" v-html="p.icon" />
            </div>
            <div class="flex-1">
              <h3 class="font-display text-2xl font-semibold mb-2 leading-snug">{{ p.title }}</h3>
              <p class="text-base-content/70 leading-relaxed">{{ p.body }}</p>
              <div class="mt-5 flex items-baseline gap-3 pt-4 border-t border-base-300">
                <span class="font-display text-2xl text-primary">{{ p.stat }}</span>
                <span class="text-xs uppercase tracking-[0.12em] text-base-content/50 font-medium">{{ p.statLabel }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.icon-wrap :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
