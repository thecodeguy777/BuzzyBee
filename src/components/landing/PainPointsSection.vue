<script setup lang="ts">
import AmbientGradient from './AmbientGradient.vue'
import { PhoneMissed, Clock, DollarSign } from 'lucide-vue-next'
import painImg from '@/assets/landing/pain-laptop-paperwork.webp'

const painPoints = [
  {
    stat: '78%',
    label: 'of leads go cold',
    description: 'Because no one followed up within the first 5 minutes. You were at a showing. Your VA won\'t be.',
    icon: PhoneMissed
  },
  {
    stat: '20hrs',
    label: 'lost per week',
    description: 'Top agents spend 20+ hours weekly on admin: scheduling, paperwork, CRM updates, email. That\'s 20 hours not spent selling.',
    icon: Clock
  },
  {
    stat: '$0',
    label: 'revenue from busywork',
    description: 'Every minute spent updating MLS, coordinating inspectors, or chasing signatures is a minute you\'re not generating commission.',
    icon: DollarSign
  }
]
</script>

<template>
  <section id="pain" class="relative py-24 md:py-32 border-t border-base-300 overflow-hidden">
    <!-- Flowing gradient bg -->
    <div class="absolute inset-0 pointer-events-none">
      <AmbientGradient :opacity="0.18" tone="purple" />
    </div>

    <div class="relative max-w-6xl mx-auto px-6">
      <!-- Header -->
      <div v-reveal class="max-w-2xl mb-14">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-8 h-0.5 rounded-full bg-gradient-to-r from-secondary to-purple-500"></div>
          <span class="text-xs font-medium uppercase tracking-wider text-secondary">The Problem</span>
        </div>
        <h2 class="font-display text-3xl md:text-4xl tracking-tight leading-tight text-base-content">
          You became an agent to sell homes. Not to drown in admin.
        </h2>
        <p class="mt-4 text-base text-base-content/60 leading-relaxed">
          The average top-producing realtor spends more time on coordination than actual selling. Meanwhile, leads are going cold and deals are slipping through the cracks.
        </p>
      </div>

      <!-- Banner image: paperwork drowning the realtor -->
      <div v-reveal="50" class="mb-10 rounded-2xl overflow-hidden border border-base-300 shadow-md aspect-[2.5/1] relative">
        <img :src="painImg" alt="Realtor buried in paperwork at laptop" class="w-full h-full object-cover" loading="lazy" decoding="async" />
        <div class="absolute inset-0 bg-gradient-to-r from-base-100/80 via-base-100/0 to-base-100/0"></div>
        <div class="absolute inset-0 flex items-center px-8 md:px-12">
          <p class="text-base md:text-xl font-display font-medium text-base-content/85 max-w-md">
            Every contract, every signature, every chase. <em class="text-secondary">Time you'll never get back.</em>
          </p>
        </div>
      </div>

      <!-- Pain point cards -->
      <div v-reveal="100" class="grid gap-6 md:grid-cols-3 stagger-children revealed">
        <div
          v-for="pain in painPoints"
          :key="pain.stat"
          class="relative border border-base-300 rounded-lg p-8 bg-base-100 overflow-hidden group hover:border-secondary/40 transition-colors"
        >
          <!-- Gradient top edge -->
          <div class="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-secondary/60 via-purple-500/60 to-transparent"></div>

          <!-- Icon -->
          <div class="w-10 h-10 rounded-lg bg-secondary/10 border border-secondary/20 flex items-center justify-center mb-4">
            <component :is="pain.icon" class="w-5 h-5 text-secondary" />
          </div>

          <div class="text-4xl font-bold tracking-tight bg-gradient-to-br from-secondary to-purple-500 bg-clip-text text-transparent">{{ pain.stat }}</div>
          <div class="text-xs font-medium uppercase tracking-wider text-base-content/50 mt-1 mb-4">{{ pain.label }}</div>
          <p class="text-sm text-base-content/60 leading-relaxed">{{ pain.description }}</p>
        </div>
      </div>

      <!-- Transition -->
      <div class="mt-14 text-center">
        <p class="text-lg font-medium text-base-content/80">
          What if you had a full-time assistant who handled <em>all of it</em> for less than one closing?
        </p>
        <a href="#how" class="inline-flex items-center gap-2 mt-4 text-sm font-medium text-primary hover:opacity-80 transition-opacity">
          Here's how it works
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </a>
      </div>
    </div>
  </section>
</template>
