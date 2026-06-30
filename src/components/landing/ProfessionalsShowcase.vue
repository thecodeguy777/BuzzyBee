<script setup lang="ts">
// "The people you hire" — leads the page with the professional, not the product.
// Faces, real roles, the tools they already know, and what they actually handle.
// Light section that sits in the people cluster (Meet your VA / Screened talent),
// reusing the landing design language. Honeycomb (hex) avatars via HexClipDef.
import AmbientGradient from './AmbientGradient.vue'
import HexClipDef from '@/components/shared/HexClipDef.vue'
import { BadgeCheck, Check } from 'lucide-vue-next'

const pros = [
  {
    initials: 'MR',
    color: '#8E4EC6',
    name: 'Marisol Reyes',
    role: 'Real Estate VA',
    years: '6 yrs',
    knows: ['Follow Up Boss', 'Flexmls', 'kvCORE', 'DocuSign'],
    handles: ['Audit MLS listings for price & status drift', 'FSBO + expired outreach with notes back', 'Qualify new leads within five minutes'],
  },
  {
    initials: 'JC',
    color: '#0090FF',
    name: 'Joban Cruz',
    role: 'Shopify Operator VA',
    years: '4 yrs',
    knows: ['Shopify', 'Klaviyo', 'Gorgias', 'Recharge'],
    handles: ['New SKUs from draft to live with alt-text', 'Gorgias queue cleared, replies under 4 hrs', 'Promo launches end to end: theme, email, socials'],
  },
  {
    initials: 'PN',
    color: '#46A758',
    name: 'Priya Nair',
    role: 'White-Label Production VA',
    years: '7 yrs',
    knows: ['Asana', 'Meta Ads Manager', 'Looker Studio', 'Canva'],
    handles: ['Monthly client reporting decks from live ad data', 'Social scheduled across the agency roster', 'Ad ops: budgets, pacing, creative swaps'],
  },
]
</script>

<template>
  <section id="professionals" class="relative py-24 md:py-32 border-t border-base-300 overflow-hidden">
    <HexClipDef />
    <div class="absolute inset-0 pointer-events-none">
      <AmbientGradient :opacity="0.12" tone="purple" />
    </div>

    <div class="relative max-w-6xl mx-auto px-6">
      <!-- Header -->
      <div v-reveal class="text-center max-w-2xl mx-auto mb-14">
        <div class="flex items-center gap-3 mb-3 justify-center">
          <span class="text-xs font-medium uppercase tracking-wider text-primary">The people you hire</span>
        </div>
        <h2 class="font-display text-3xl md:text-4xl tracking-tight leading-tight text-base-content">
          They already know your CRM and your tools.
        </h2>
        <p class="mt-4 text-base text-base-content/60 leading-relaxed">
          The platform is just how you see the work. The work itself is done by a real, trained person
          who already knows your tools and does the job from day one. Here's who that looks like.
        </p>
      </div>

      <!-- Professional cards -->
      <div v-reveal="100" class="grid gap-5 md:grid-cols-3 stagger-children">
        <div
          v-for="p in pros"
          :key="p.name"
          class="relative border border-base-300 rounded-2xl p-6 bg-base-100 group hover:border-primary/30 hover:shadow-lg transition-all duration-300"
        >
          <!-- person -->
          <div class="flex items-center gap-3.5">
            <span
              class="grid place-items-center w-14 h-14 text-white text-base font-bold shrink-0"
              :style="{ background: p.color, clipPath: 'url(#hc-hex-clip)', WebkitClipPath: 'url(#hc-hex-clip)' }"
            >{{ p.initials }}</span>
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="font-semibold text-base-content">{{ p.name }}</span>
                <BadgeCheck class="w-4 h-4 text-primary shrink-0" :stroke-width="2" />
              </div>
              <div class="text-[13px] text-base-content/55">{{ p.role }} · {{ p.years }}</div>
            </div>
          </div>

          <!-- knows (tool chips) -->
          <div class="mt-5">
            <div class="text-[10px] uppercase tracking-wider text-base-content/40 mb-2">Already knows</div>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="t in p.knows"
                :key="t"
                class="text-[11px] font-medium text-base-content/70 bg-base-200 border border-base-300 rounded-md px-2 py-0.5"
              >{{ t }}</span>
            </div>
          </div>

          <!-- handles -->
          <div class="mt-5 pt-4 border-t border-base-300">
            <div class="text-[10px] uppercase tracking-wider text-base-content/40 mb-2.5">Handles for you</div>
            <ul class="space-y-2">
              <li v-for="h in p.handles" :key="h" class="flex items-start gap-2 text-[13px] text-base-content/70">
                <span class="mt-0.5 shrink-0 grid place-items-center w-4 h-4 rounded-full bg-primary/10 text-primary">
                  <Check class="w-2.5 h-2.5" :stroke-width="3" />
                </span>
                {{ h }}
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- closing line -->
      <div v-reveal="200" class="mt-10 text-center">
        <p class="text-sm text-base-content/60">
          <span class="font-semibold text-base-content">Every plan includes one</span>,
          matched to your business, managed by a dedicated project manager, with the BuzzyHive team behind them.
        </p>
      </div>
    </div>
  </section>
</template>
