<script setup lang="ts">
import AmbientGradient from './AmbientGradient.vue'

// Replaces the old PricingSection. Pricing is anchored on the discovery call
// (we match VA hours to real workload), so this slot tells the story of the
// partnership itself — the steps prospects move through after they book.
//
// Step 1 is highlighted because it's the entry point — the only one the
// visitor controls. Everything else follows once they book.
const steps = [
  {
    n: '01',
    day: 'Day 0',
    title: 'Discovery call',
    blurb: 'A 20-minute call to map your workload, your stack, and the tasks eating your week. By the end you know exactly what a VA handles and what it costs — no deck, no pressure.',
    highlight: true,
  },
  {
    n: '02',
    day: 'Day 1–3',
    title: 'Match',
    blurb: 'We pick from our top 3% bench, brief them on your business, and introduce you. If the fit feels off, we swap — no questions, no clock running.',
    highlight: false,
  },
  {
    n: '03',
    day: 'Day 4–7',
    title: 'Onboarding',
    blurb: 'Your VA shadows your workflows, learns your tools (CRM, MLS, transaction software), and starts taking real work off your plate using a playbook we tailor to your business.',
    highlight: false,
  },
  {
    n: '04',
    day: 'Day 8+',
    title: 'Daily rhythm',
    blurb: 'End-of-day reports land in your HiveMind dashboard. A PM runs weekly check-ins to keep the partnership tight. You focus on closings — we run the back office.',
    highlight: false,
  },
]

const includes = [
  'Pre-vetted Filipino VA (top 3% of applicants)',
  '7-day onboarding with a tailored playbook',
  'Managed PM support and weekly check-ins',
  'Daily EOD reports in the HiveMind platform',
  'VA swap guarantee if the fit is off',
]
</script>

<template>
  <section id="how-it-works" class="relative py-24 md:py-32 border-t border-base-300 overflow-hidden">
    <div class="absolute inset-0 pointer-events-none">
      <AmbientGradient :opacity="0.12" tone="mixed" />
    </div>

    <div class="relative max-w-6xl mx-auto px-6">
      <!-- Header -->
      <div class="text-center max-w-2xl mx-auto mb-14">
        <div class="flex items-center gap-3 mb-3 justify-center">
          <div class="w-8 h-0.5 rounded-full bg-gradient-to-r from-primary to-purple-500"></div>
          <span class="text-xs font-medium uppercase tracking-wider text-primary">How it works</span>
          <div class="w-8 h-0.5 rounded-full bg-gradient-to-l from-primary to-purple-500"></div>
        </div>
        <h2 class="font-display text-3xl md:text-4xl tracking-tight leading-tight text-base-content">
          From a 20-minute call to a daily rhythm.
        </h2>
        <p class="mt-4 text-base text-base-content/60 leading-relaxed">
          Pricing is tailored on the discovery call so VA hours match your actual workload — no rigid tiers, no surprise upcharges. Here's the journey from hello to working partnership.
        </p>
      </div>

      <!-- Steps -->
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div
          v-for="step in steps"
          :key="step.n"
          class="relative border rounded-lg p-7 flex flex-col transition-all duration-300"
          :class="step.highlight
            ? 'border-primary/50 bg-base-100 shadow-md shadow-primary/5'
            : 'border-base-300 bg-base-100 hover:border-primary/30'"
        >
          <!-- Gradient top border on the entry-point step -->
          <div v-if="step.highlight" class="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-primary via-purple-500 to-primary/30"></div>

          <!-- Step number + day label -->
          <div class="flex items-center gap-3 mb-5">
            <div
              class="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold tracking-tight"
              :class="step.highlight
                ? 'bg-gradient-to-br from-primary to-purple-600 text-white'
                : 'bg-base-200 text-base-content/60 border border-base-300'"
            >
              {{ step.n }}
            </div>
            <span class="text-[10px] font-semibold uppercase tracking-wider text-base-content/40">
              {{ step.day }}
            </span>
          </div>

          <!-- Title + blurb -->
          <h3 class="text-base font-semibold text-base-content mb-2">{{ step.title }}</h3>
          <p class="text-xs text-base-content/60 leading-relaxed">{{ step.blurb }}</p>

          <!-- Entry-point hint on step 1 -->
          <div v-if="step.highlight" class="mt-5 pt-4 border-t border-base-300">
            <span class="text-[10px] font-semibold uppercase tracking-wider bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
              You are here →
            </span>
          </div>
        </div>
      </div>

      <!-- CTA band -->
      <div class="mt-12 border border-base-300 rounded-lg p-8 text-center bg-base-100">
        <h3 class="text-xl md:text-2xl font-semibold tracking-tight text-base-content">
          Ready to see your number?
        </h3>
        <p class="mt-2 text-sm text-base-content/60 max-w-lg mx-auto">
          The discovery call is 20 minutes and pressure-free. We'll quote based on the work you actually need done, not a tier you have to grow into.
        </p>
        <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a
            href="#contact"
            class="inline-flex items-center gap-2 bg-gradient-to-r from-primary to-purple-600 text-white font-medium px-5 py-2.5 rounded-md hover:opacity-90 transition-opacity text-sm"
          >
            Book your discovery call
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </a>
          <a
            href="#faq"
            class="inline-flex items-center gap-2 text-base-content/60 font-medium px-5 py-2.5 rounded-md border border-base-300 hover:border-primary/40 hover:text-base-content transition-colors text-sm"
          >
            Read the FAQ first
          </a>
        </div>
      </div>

      <!-- What's included -->
      <div class="mt-10 border border-base-300 rounded-lg p-6">
        <div class="text-xs font-medium uppercase tracking-wider text-base-content/50 mb-4">Included in every partnership</div>
        <div class="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div v-for="f in includes" :key="f" class="flex items-start gap-2 text-xs text-base-content/60">
            <svg class="shrink-0 w-3.5 h-3.5 mt-0.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            <span>{{ f }}</span>
          </div>
        </div>
      </div>

      <!-- Custom path -->
      <div class="mt-8 text-center">
        <p class="text-sm text-base-content/50">
          Running a team of 5+ agents?
          <a href="#contact" class="text-primary font-medium hover:underline">Tell us about it</a> — we'll build a custom partnership.
        </p>
      </div>
    </div>
  </section>
</template>
