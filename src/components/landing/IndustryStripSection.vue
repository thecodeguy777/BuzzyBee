<script setup lang="ts">
import AmbientGradient from './AmbientGradient.vue'

const industries = [
  'Real Estate',
  'E-commerce',
  'Agencies',
  'Coaches',
  'Pro Services',
  'Construction',
  'Wellness',
  'Hospitality'
]
</script>

<template>
  <section class="relative py-20 md:py-24 border-t border-base-300 bg-base-200 overflow-hidden">
    <div class="absolute inset-0 pointer-events-none">
      <AmbientGradient :opacity="0.1" tone="mixed" />
    </div>

    <div class="relative max-w-6xl mx-auto px-6 text-center">
      <div v-reveal>
        <div class="flex items-center gap-3 mb-3 justify-center">
          <div class="w-8 h-0.5 rounded-full bg-gradient-to-r from-primary to-purple-500"></div>
          <span class="text-xs font-medium uppercase tracking-wider text-primary">Who it's for</span>
          <div class="w-8 h-0.5 rounded-full bg-gradient-to-l from-primary to-purple-500"></div>
        </div>
        <h2 class="font-display text-2xl md:text-3xl tracking-tight leading-tight text-base-content">
          One platform, every industry.
        </h2>
      </div>

      <div v-reveal="100" class="mt-8 flex flex-wrap items-center justify-center gap-2.5">
        <span
          v-for="ind in industries"
          :key="ind"
          class="inline-flex items-center gap-2 border border-base-300 rounded-full bg-base-100 px-4 py-1.5 text-[13px] font-medium text-base-content/70"
        >
          <span class="w-1.5 h-1.5 rounded-sm bg-primary/70"></span>
          {{ ind }}
        </span>
      </div>
    </div>
  </section>
</template>
