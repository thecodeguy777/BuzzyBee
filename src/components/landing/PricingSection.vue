<script setup lang="ts">
import rawHoneycomb from '@/assets/icons/honeycomb.svg?raw'
import rawHoney from '@/assets/icons/honey.svg?raw'
import rawFlower from '@/assets/icons/flower.svg?raw'
import { prefixSvgIds } from '@/utils/svg'

const honeycombSrc = prefixSvgIds(rawHoneycomb, 'pr-hc')
const honeySrc = prefixSvgIds(rawHoney, 'pr-hn')
const flowerSrc = prefixSvgIds(rawFlower, 'pr-fl')

const commonFeatures = [
  'Pre-vetted Filipino VA (top 3% of applicants)',
  '7-day onboarding with SOPs and playbook',
  'Managed PM support and weekly check-ins',
  'Daily EOD reports in the BuzzyBee platform',
  'VA swap guarantee if the fit is off'
]

const tiers = [
  {
    name: 'Starter',
    icon: flowerSrc,
    price: '$1,200',
    cadence: '/ mo',
    tagline: 'Admin horsepower for solo founders and lean teams.',
    features: [
      'Inbox, calendar, and scheduling',
      'Data entry, research, light CRM',
      'Document prep and formatting',
      'Up to 160 hrs / month'
    ],
    cta: 'Start with Starter',
    highlight: false
  },
  {
    name: 'Professional',
    icon: honeySrc,
    price: '$1,600',
    cadence: '/ mo',
    tagline: 'Creative and ops support for growing SMBs.',
    features: [
      'Everything in Starter, plus:',
      'Social media scheduling and light design',
      'Bookkeeping assistance (Xero / QuickBooks)',
      'Content production and light copy editing',
      'Up to 160 hrs / month'
    ],
    cta: 'Hire a Professional',
    highlight: true,
    badge: 'Most popular'
  },
  {
    name: 'Development',
    icon: honeycombSrc,
    price: '$2,200',
    cadence: '/ mo',
    tagline: 'Specialist support for product, marketing, and tech teams.',
    features: [
      'Everything in Professional, plus:',
      'Dev support: QA, light front-end, tickets',
      'Marketing ops: automations, campaigns, analytics',
      'Project management with full stack tools',
      'Up to 160 hrs / month'
    ],
    cta: 'Scope a Specialist',
    highlight: false
  }
]
</script>

<template>
  <section id="pricing" class="relative bg-base-100 py-24 md:py-32 overflow-hidden">
    <!-- Honeycomb dot pattern -->
    <div class="absolute inset-0 pointer-events-none bg-honeycomb opacity-60"></div>
    <!-- Background wash -->
    <div
      class="absolute inset-0 pointer-events-none"
      style="background:
        radial-gradient(ellipse 50% 40% at 50% 0%, oklch(90% 0.08 85 / 0.45) 0%, transparent 60%),
        radial-gradient(ellipse 40% 30% at 90% 100%, oklch(88% 0.06 175 / 0.35) 0%, transparent 65%);"
    ></div>

    <div class="relative max-w-7xl mx-auto px-6">
      <!-- Header -->
      <div v-reveal class="text-center max-w-2xl mx-auto mb-16">
        <div class="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-xs font-medium tracking-wide mb-4">
          <span class="text-primary">Pricing</span>
        </div>
        <h2 class="font-display text-4xl md:text-5xl font-semibold tracking-tight leading-tight">
          One VA, one flat rate,
          <span class="italic text-primary">no surprises</span>.
        </h2>
        <p class="mt-5 text-lg text-base-content/70 leading-relaxed">
          Full-time managed placement. Pick the tier that matches the work. Swap, scale, or cancel anytime.
        </p>
      </div>

      <!-- Tier cards -->
      <div class="grid gap-6 lg:grid-cols-3">
        <div
          v-for="(tier, i) in tiers"
          :key="tier.name"
          v-reveal="i * 120"
          class="relative rounded-3xl border bg-base-100 p-7 md:p-8 flex flex-col transition-all duration-300 hover:-translate-y-2 hover:shadow-xl"
          :class="tier.highlight
            ? 'border-primary/60 shadow-xl shadow-primary/25 ring-1 ring-primary/30 lg:-translate-y-3'
            : 'border-base-300 shadow-sm hover:border-primary/40'"
        >
          <!-- Badge -->
          <div
            v-if="tier.badge"
            class="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-content text-xs font-semibold tracking-wide uppercase px-3 py-1 rounded-full shadow-sm"
          >
            {{ tier.badge }}
          </div>

          <!-- Header: icon + name + tagline -->
          <div class="flex items-start gap-4 mb-5">
            <div
              class="shrink-0 w-14 h-14 rounded-2xl border flex items-center justify-center"
              :class="tier.highlight ? 'bg-primary/15 border-primary/30' : 'bg-secondary/30 border-secondary/60'"
            >
              <div class="w-10 h-10 icon-wrap" v-html="tier.icon" />
            </div>
            <div class="flex-1">
              <h3 class="font-display text-2xl font-semibold leading-snug">{{ tier.name }}</h3>
              <p class="text-sm text-base-content/70 leading-snug mt-1">{{ tier.tagline }}</p>
            </div>
          </div>

          <!-- Price -->
          <div class="flex items-baseline gap-2 mb-6 pb-6 border-b border-base-300">
            <span class="font-display text-5xl font-semibold text-base-content">{{ tier.price }}</span>
            <span class="text-base-content/60 text-sm">USD {{ tier.cadence }}</span>
          </div>

          <!-- Features -->
          <ul class="space-y-2.5 mb-8">
            <li v-for="f in tier.features" :key="f" class="flex items-start gap-2.5 text-sm text-base-content/80">
              <svg class="shrink-0 w-5 h-5 mt-0.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <span>{{ f }}</span>
            </li>
          </ul>

          <!-- CTA -->
          <div class="mt-auto">
            <a
              href="#contact"
              class="btn w-full rounded-full"
              :class="tier.highlight ? 'btn-primary shadow-md shadow-primary/20' : 'btn-outline btn-primary'"
            >
              {{ tier.cta }}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>
      </div>

      <!-- Common features row -->
      <div class="mt-14 rounded-3xl bg-base-200 border border-base-300 p-7 md:p-8">
        <div class="flex items-center gap-3 mb-4">
          <span class="font-display text-xl font-semibold">Included in every plan</span>
          <span class="h-px flex-1 bg-base-300"></span>
        </div>
        <ul class="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <li v-for="f in commonFeatures" :key="f" class="flex items-start gap-2 text-sm text-base-content/75">
            <svg class="shrink-0 w-4 h-4 mt-0.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            <span>{{ f }}</span>
          </li>
        </ul>
      </div>

      <!-- Enterprise / custom line -->
      <div class="mt-10 text-center">
        <p class="text-base-content/70">
          Need more than one VA, or a dedicated team?
          <a href="#contact" class="text-primary font-medium hover:underline">Talk to us about custom hives</a>.
        </p>
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
