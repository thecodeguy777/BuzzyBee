<script setup lang="ts">
import AmbientGradient from './AmbientGradient.vue'
import vaImg from '@/assets/landing/hero-va-call.webp'

const stats = [
  { stat: 'Top 3%', label: 'of applicants' },
  { stat: '7 days', label: 'to onboard' },
  { stat: '94%', label: 'retention' }
]
</script>

<template>
  <section class="relative py-24 md:py-32 border-t border-base-300 overflow-hidden">
    <div class="absolute inset-0 pointer-events-none">
      <AmbientGradient :opacity="0.12" tone="blue" />
    </div>

    <div class="relative max-w-6xl mx-auto px-6">
      <div class="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
        <!-- Visual -->
        <div v-reveal class="relative aspect-[4/3] rounded-2xl overflow-hidden border border-base-300 shadow-lg order-last lg:order-first">
          <img :src="vaImg" alt="Maria Santos, a BuzzyHive virtual assistant, on a call" width="700" height="467" class="w-full h-full object-cover" loading="lazy" decoding="async" />
          <div class="absolute inset-0 bg-gradient-to-tr from-primary/15 via-transparent to-plum/10 pointer-events-none"></div>
          <!-- Recruiter-approved badge -->
          <div class="absolute top-4 left-4 inline-flex items-center gap-1.5 bg-white/95 backdrop-blur-sm border border-base-300 rounded-full px-3 py-1.5 shadow-lg">
            <svg class="w-3.5 h-3.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            <span class="text-[10px] font-semibold uppercase tracking-wider text-base-content/70">Recruiter approved</span>
          </div>
          <!-- Named VA caption — she's the protagonist, not anonymous stock -->
          <div class="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/65 to-transparent pointer-events-none"></div>
          <div class="absolute bottom-3.5 left-4">
            <div class="text-white font-semibold text-sm drop-shadow-sm">Maria Santos</div>
            <div class="text-white/85 text-[11px] drop-shadow-sm">Executive VA · 6 yrs · Slack, HubSpot, Notion</div>
          </div>
        </div>

        <!-- Copy -->
        <div v-reveal="100">
          <div class="flex items-center gap-3 mb-3">
            <span class="text-xs font-medium uppercase tracking-wider text-primary">Meet your VA</span>
          </div>
          <h2 class="font-display text-3xl md:text-4xl tracking-tight leading-tight text-base-content">
            A real person. Screened harder than most hires.
          </h2>
          <p class="mt-4 text-base text-base-content/60 leading-relaxed">
            Every plan includes a pre-screened assistant, top 3% of applicants, who already lives inside the platform. Pre-interviewed by AI, reviewed by a human recruiter, managed by a project manager.
          </p>

          <div class="mt-8 grid grid-cols-3 gap-2 sm:gap-3">
            <div
              v-for="s in stats"
              :key="s.label"
              class="border border-base-300 rounded-lg p-3 sm:p-4 bg-base-100 text-center"
            >
              <div class="text-xl font-bold tracking-tight bg-gradient-to-r from-primary to-plum bg-clip-text text-transparent">{{ s.stat }}</div>
              <div class="text-[11px] uppercase tracking-wider text-base-content/50 mt-1">{{ s.label }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
