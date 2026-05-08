<script setup lang="ts">
import { ref, computed } from 'vue'
import AmbientGradient from './AmbientGradient.vue'

const commonFeatures = [
  'Pre-vetted Filipino VA (top 3% of applicants)',
  '7-day onboarding with real estate playbook',
  'Managed PM support and weekly check-ins',
  'Daily EOD reports in the HiveMind platform',
  'VA swap guarantee if the fit is off'
]

type BillingCycle = '3mo' | '6mo' | '1yr'

const selectedCycle = ref<BillingCycle>('6mo')

const cycles: { key: BillingCycle; label: string; discount: number; badge?: string }[] = [
  { key: '3mo', label: '3 months', discount: 0 },
  { key: '6mo', label: '6 months', discount: 10, badge: '-10%' },
  { key: '1yr', label: '1 year', discount: 20, badge: '-20%' }
]

const basePrices = [1200, 1600, 2200]

const tiers = computed(() => {
  const cycle = cycles.find(c => c.key === selectedCycle.value)!
  const mult = (100 - cycle.discount) / 100

  return [
    {
      name: 'Solo Agent',
      price: Math.round(basePrices[0] * mult),
      tagline: 'Admin horsepower for individual agents ready to scale.',
      features: [
        'Lead follow-up and CRM management',
        'Calendar, email, and inbox triage',
        'Listing data entry and updates',
        'Basic social media scheduling',
        'Up to 160 hrs / month (full-time)'
      ],
      cta: 'Start with Solo',
      highlight: false
    },
    {
      name: 'Top Producer',
      price: Math.round(basePrices[1] * mult),
      tagline: 'Transaction and marketing support for high-volume agents.',
      features: [
        'Everything in Solo, plus:',
        'Transaction coordination (contract-to-close)',
        'Marketing content creation (Canva, video)',
        'Listing presentation and CMA prep',
        'Up to 160 hrs / month (full-time)'
      ],
      cta: 'Go Top Producer',
      highlight: true,
      badge: 'Most popular'
    },
    {
      name: 'Team Lead',
      price: Math.round(basePrices[2] * mult),
      tagline: 'Operations-level support for teams and brokerages.',
      features: [
        'Everything in Top Producer, plus:',
        'Multi-agent calendar and pipeline management',
        'Recruiting coordination and onboarding support',
        'Advanced marketing ops and ad management',
        'Up to 160 hrs / month (full-time)'
      ],
      cta: 'Scale Your Team',
      highlight: false
    }
  ]
})

const currentDiscount = computed(() => cycles.find(c => c.key === selectedCycle.value)!.discount)
</script>

<template>
  <section id="pricing" class="relative py-24 md:py-32 border-t border-base-300 overflow-hidden">
    <div class="absolute inset-0 pointer-events-none">
      <AmbientGradient :opacity="0.12" tone="mixed" />
    </div>

    <div class="relative max-w-6xl mx-auto px-6">
      <!-- Header -->
      <div class="text-center max-w-2xl mx-auto mb-10">
        <div class="flex items-center gap-3 mb-3 justify-center">
          <div class="w-8 h-0.5 rounded-full bg-gradient-to-r from-primary to-purple-500"></div>
          <span class="text-xs font-medium uppercase tracking-wider text-primary">Pricing</span>
          <div class="w-8 h-0.5 rounded-full bg-gradient-to-l from-primary to-purple-500"></div>
        </div>
        <h2 class="font-display text-3xl md:text-4xl tracking-tight leading-tight text-base-content">
          Less than one closing. Every month.
        </h2>
        <p class="mt-4 text-base text-base-content/60 leading-relaxed">
          Full-time, managed VA placement. Pick the tier that matches your production level. Commit longer, pay less.
        </p>
      </div>

      <!-- Billing toggle -->
      <div class="flex justify-center mb-12">
        <div class="inline-flex items-center gap-0 border border-base-300 rounded-md overflow-hidden bg-base-100">
          <button
            v-for="cycle in cycles"
            :key="cycle.key"
            class="relative px-4 py-2 text-xs font-medium transition-all duration-150 border-r border-base-300 last:border-r-0"
            :class="selectedCycle === cycle.key
              ? 'bg-gradient-to-r from-primary to-purple-600 text-white'
              : 'text-base-content/60 hover:text-base-content hover:bg-base-200'"
            @click="selectedCycle = cycle.key"
          >
            {{ cycle.label }}
            <span
              v-if="cycle.badge && selectedCycle !== cycle.key"
              class="ml-1 text-[10px] font-semibold text-purple-500"
            >{{ cycle.badge }}</span>
          </button>
        </div>
      </div>

      <!-- Tier cards -->
      <div class="grid gap-4 lg:grid-cols-3">
        <div
          v-for="tier in tiers"
          :key="tier.name"
          class="relative border rounded-lg p-8 flex flex-col transition-all duration-300"
          :class="tier.highlight
            ? 'border-primary/50 bg-base-100 shadow-md shadow-primary/5'
            : 'border-base-300 bg-base-100 hover:border-primary/30'"
        >
          <!-- Gradient top border on highlighted -->
          <div v-if="tier.highlight" class="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-primary via-purple-500 to-primary/30"></div>

          <!-- Badge -->
          <div v-if="tier.badge" class="mb-4">
            <span class="text-[10px] font-semibold uppercase tracking-wider bg-gradient-to-r from-primary to-purple-500 text-white px-2 py-0.5 rounded">
              {{ tier.badge }}
            </span>
          </div>

          <!-- Header -->
          <div class="mb-6">
            <h3 class="text-lg font-semibold text-base-content">{{ tier.name }}</h3>
            <p class="text-xs text-base-content/50 mt-1">{{ tier.tagline }}</p>
          </div>

          <!-- Price -->
          <div class="mb-6 pb-6 border-b border-base-300">
            <span class="text-4xl font-bold text-base-content tracking-tight">${{ tier.price.toLocaleString() }}</span>
            <span class="text-sm text-base-content/50 ml-1">/ mo</span>
            <div v-if="currentDiscount > 0" class="mt-2">
              <span class="text-[11px] font-medium bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">{{ currentDiscount }}% off monthly rate</span>
            </div>
          </div>

          <!-- Features -->
          <ul class="space-y-2.5 mb-8">
            <li v-for="f in tier.features" :key="f" class="flex items-start gap-2 text-xs text-base-content/70">
              <svg class="shrink-0 w-3.5 h-3.5 mt-0.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <span>{{ f }}</span>
            </li>
          </ul>

          <!-- CTA -->
          <div class="mt-auto">
            <a
              href="#contact"
              class="block text-center text-sm font-medium py-2.5 rounded-md border transition-all duration-200"
              :class="tier.highlight
                ? 'bg-gradient-to-r from-primary to-purple-600 text-white border-transparent hover:opacity-90'
                : 'border-base-300 text-base-content/70 hover:border-primary hover:text-primary'"
            >
              {{ tier.cta }}
            </a>
          </div>
        </div>
      </div>

      <!-- Common features -->
      <div class="mt-10 border border-base-300 rounded-lg p-6">
        <div class="text-xs font-medium uppercase tracking-wider text-base-content/50 mb-4">Included in every plan</div>
        <div class="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div v-for="f in commonFeatures" :key="f" class="flex items-start gap-2 text-xs text-base-content/60">
            <svg class="shrink-0 w-3.5 h-3.5 mt-0.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            <span>{{ f }}</span>
          </div>
        </div>
      </div>

      <!-- Custom -->
      <div class="mt-8 text-center">
        <p class="text-sm text-base-content/50">
          Running a team of 5+ agents?
          <a href="#contact" class="text-primary font-medium hover:underline">Let's build a custom package</a>.
        </p>
      </div>
    </div>
  </section>
</template>
