<script setup lang="ts">
import AmbientGradient from './AmbientGradient.vue'

const testimonials = [
  {
    quote: 'My VA took over lead follow-up and transaction coordination in week one. Two months in, I closed 3 extra deals because I wasn\'t buried in paperwork. I\'m finally home for dinner.',
    name: 'Alana J.',
    role: 'Real Estate Broker, Austin TX'
  },
  {
    quote: 'I was paying a part-time TC $25/hour to do half of what my HiveMind VA now handles full-time. The EOD reports alone keep me more organized than I\'ve ever been.',
    name: 'Marcus T.',
    role: 'Team Lead, Phoenix AZ'
  },
  {
    quote: 'She knew Dotloop and Follow Up Boss on day one. I didn\'t have to explain what a listing agreement was. That\'s the difference between this and hiring off Fiverr.',
    name: 'Sarah K.',
    role: 'Solo Agent, Charlotte NC'
  },
  {
    quote: 'We brought on two VAs for our 6-agent team. They handle all the CRM, social media, and transaction files. My agents are producing 30% more because they only do dollar-productive work now.',
    name: 'David R.',
    role: 'Brokerage Owner, Denver CO'
  },
  {
    quote: 'The speed-to-lead difference is insane. My VA responds to every new inquiry within 3 minutes. My conversion rate from lead to appointment doubled in the first month.',
    name: 'Jennifer M.',
    role: 'Luxury Agent, Miami FL'
  }
]
</script>

<template>
  <section id="testimonials" class="relative py-24 md:py-32 border-t border-base-300 bg-base-200 overflow-hidden">
    <div class="absolute inset-0 pointer-events-none">
      <AmbientGradient :opacity="0.1" tone="purple" />
    </div>

    <div class="relative max-w-6xl mx-auto px-6">
      <!-- Header -->
      <div v-reveal class="max-w-2xl mb-14">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-8 h-0.5 rounded-full bg-gradient-to-r from-primary to-purple-500"></div>
          <span class="text-xs font-medium uppercase tracking-wider text-primary">Results</span>
        </div>
        <h2 class="font-display text-3xl md:text-4xl tracking-tight leading-tight text-base-content">
          Agents who got their weekends back.
        </h2>
        <p class="mt-4 text-base text-base-content/60 leading-relaxed">
          What real estate professionals say after their first 60 days.
        </p>
      </div>

      <!-- Testimonial grid -->
      <div v-reveal="100" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <!-- Featured -->
        <div class="relative border border-base-300 rounded-lg p-8 bg-base-100 lg:col-span-2 flex flex-col">
          <div class="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-primary via-purple-500 to-transparent"></div>
          <svg class="w-6 h-6 text-primary/30 mb-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 11c0-3.5 2.5-6 6-6v3c-2 0-3 1.5-3 3v1h4v6H3zm12 0c0-3.5 2.5-6 6-6v3c-2 0-3 1.5-3 3v1h4v6h-7z" />
          </svg>
          <p class="text-lg font-medium leading-relaxed text-base-content/90 mb-6">
            {{ testimonials[0].quote }}
          </p>
          <div class="mt-auto flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center">
              <span class="text-xs font-semibold text-white">{{ testimonials[0].name[0] }}</span>
            </div>
            <div>
              <div class="text-sm font-medium text-base-content">{{ testimonials[0].name }}</div>
              <div class="text-xs text-base-content/50">{{ testimonials[0].role }}</div>
            </div>
          </div>
        </div>

        <!-- Standard cards -->
        <div
          v-for="t in testimonials.slice(1)"
          :key="t.name"
          class="relative border border-base-300 rounded-lg p-6 bg-base-100 flex flex-col hover:border-primary/20 transition-colors"
        >
          <p class="text-sm text-base-content/70 leading-relaxed mb-5">{{ t.quote }}</p>
          <div class="mt-auto flex items-center gap-3 pt-4 border-t border-base-300">
            <div class="w-7 h-7 rounded-full bg-gradient-to-br from-primary/80 to-purple-500/80 flex items-center justify-center">
              <span class="text-[10px] font-semibold text-white">{{ t.name[0] }}</span>
            </div>
            <div>
              <div class="text-xs font-medium text-base-content">{{ t.name }}</div>
              <div class="text-[11px] text-base-content/50">{{ t.role }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
