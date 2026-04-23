<script setup lang="ts">
import rawBeeFlying from '@/assets/bee-flying.svg?raw'
import rawThoughtbubble from '@/assets/icons/thoughtbubble.svg?raw'
import rawCheck from '@/assets/icons/check.svg?raw'
import rawCalendar from '@/assets/icons/calendar.svg?raw'
import rawHoney from '@/assets/icons/honey.svg?raw'
import rawHoneycomb from '@/assets/icons/honeycomb.svg?raw'
import { prefixSvgIds } from '@/utils/svg'

const beeFlyingSrc = prefixSvgIds(rawBeeFlying, 'how-beefly')
const thoughtbubbleSrc = prefixSvgIds(rawThoughtbubble, 'how-tb')
const checkSrc = prefixSvgIds(rawCheck, 'how-ck')
const calendarSrc = prefixSvgIds(rawCalendar, 'how-cal')
const honeySrc = prefixSvgIds(rawHoney, 'how-hn')
const honeycombSrc = prefixSvgIds(rawHoneycomb, 'how-hc')

const steps = [
  { icon: thoughtbubbleSrc, num: '01', title: 'Discovery call', body: 'A 20-minute call to scope the role, your tools, and the outcomes you need.' },
  { icon: checkSrc,          num: '02', title: 'Curated match', body: 'Within 72 hours we shortlist three pre-vetted VAs tailored to your brief.' },
  { icon: calendarSrc,       num: '03', title: '7-day onboarding', body: 'Playbooks, SOPs, and a ramp plan so your VA ships value in week one.' },
  { icon: honeySrc,          num: '04', title: 'Managed support', body: 'A project manager runs EOD reports, weekly check-ins, and quarterly reviews.' },
  { icon: honeycombSrc,      num: '05', title: 'Scale the hive', body: 'Add VAs, upgrade tiers, or specialize as your business grows.' }
]
</script>

<template>
  <section id="how" class="relative bg-base-100 py-24 md:py-32 overflow-hidden">
    <!-- Background wash -->
    <div
      class="absolute inset-0 pointer-events-none"
      style="background:
        radial-gradient(ellipse 50% 40% at 10% 30%, oklch(88% 0.06 175 / 0.3) 0%, transparent 65%),
        radial-gradient(ellipse 50% 40% at 95% 85%, oklch(90% 0.08 85 / 0.35) 0%, transparent 65%);"
    ></div>

    <!-- Decorative flying bee — top right, gently drifting -->
    <div class="absolute -top-4 right-2 lg:right-6 w-72 lg:w-[26rem] h-72 lg:h-[26rem] pointer-events-none hidden lg:block anim-drift">
      <div class="w-full h-full" v-html="beeFlyingSrc" />
    </div>

    <div class="relative max-w-7xl mx-auto px-6">
      <!-- Header -->
      <div v-reveal class="max-w-2xl mb-16">
        <div class="inline-flex items-center gap-2 rounded-full bg-secondary/40 px-3 py-1 text-xs font-medium tracking-wide mb-4">
          <span class="text-base-content/80">How it works</span>
        </div>
        <h2 class="font-display text-4xl md:text-5xl font-semibold tracking-tight leading-tight">
          From first call to a
          <span class="italic text-primary">scaled team</span>
          in seven days.
        </h2>
        <p class="mt-5 text-lg text-base-content/70 leading-relaxed">
          No job boards, no resume stacks, no cold freelancers. Just a small, managed process that gets the right person working on your business fast.
        </p>
      </div>

      <!-- Steps: horizontal snap-scroll on mobile, grid on md+ -->
      <ol class="relative flex md:grid gap-5 md:gap-6 md:grid-cols-5 overflow-x-auto md:overflow-visible snap-x snap-mandatory scroll-smooth -mx-6 px-6 md:mx-0 md:px-0 pb-4 md:pb-0">
        <!-- Dotted connector line (desktop only) -->
        <div
          class="hidden md:block absolute top-10 left-[10%] right-[10%] h-px pointer-events-none"
          style="background: repeating-linear-gradient(to right, oklch(70% 0.15 82) 0 6px, transparent 6px 14px);"
        ></div>

        <li
          v-for="(step, i) in steps"
          :key="step.num"
          v-reveal="i * 90"
          class="relative snap-center shrink-0 w-[82%] md:w-auto flex flex-col items-start text-left group"
        >
          <!-- Icon bubble (centered in its column so the dotted line connects cleanly) -->
          <div class="self-center relative w-20 h-20 rounded-full bg-base-100 border-2 border-primary/30 shadow-sm flex items-center justify-center mb-5 transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-[-4deg] group-hover:shadow-md">
            <div class="w-14 h-14 icon-wrap" v-html="step.icon" />
          </div>

          <div class="font-mono text-xs tracking-[0.18em] text-primary mb-2">STEP {{ step.num }}</div>
          <h3 class="font-display text-xl font-semibold mb-2 leading-snug">{{ step.title }}</h3>
          <p class="text-sm text-base-content/70 leading-relaxed">{{ step.body }}</p>
        </li>
      </ol>

      <!-- Footer CTA -->
      <div class="mt-16 flex flex-wrap items-center gap-4">
        <a href="#contact" class="btn btn-primary rounded-full px-6 shadow-md shadow-primary/20">
          Start with a discovery call
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </a>
        <span class="text-sm text-base-content/60">No commitment · 20 minutes · Free</span>
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
