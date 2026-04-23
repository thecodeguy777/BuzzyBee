<script setup lang="ts">
import rawBee from '@/assets/bee.svg?raw'
import { prefixSvgIds } from '@/utils/svg'

const beeSrc = prefixSvgIds(rawBee, 'cta-bee')
</script>

<template>
  <section id="contact" class="relative bg-base-100 py-24 md:py-32 overflow-hidden">
    <div class="relative max-w-6xl mx-auto px-6">
      <div v-reveal class="relative rounded-[2rem] bg-primary/90 text-primary-content p-10 md:p-16 overflow-hidden shadow-xl shadow-primary/25">
        <!-- Decorative bee tucked in the right side -->
        <div class="absolute -right-10 -bottom-10 lg:-right-6 lg:bottom-0 w-64 lg:w-[22rem] h-64 lg:h-[22rem] opacity-95 pointer-events-none anim-bob">
          <div class="w-full h-full" v-html="beeSrc" />
        </div>

        <!-- Honeycomb pattern decoration -->
        <div class="absolute -top-6 -left-6 opacity-15 pointer-events-none" aria-hidden="true">
          <svg width="160" height="160" viewBox="0 0 160 160" fill="none">
            <g stroke="currentColor" stroke-width="1.5" fill="none">
              <polygon points="20,20 40,10 60,20 60,40 40,50 20,40" />
              <polygon points="60,40 80,30 100,40 100,60 80,70 60,60" />
              <polygon points="100,20 120,10 140,20 140,40 120,50 100,40" />
              <polygon points="20,60 40,50 60,60 60,80 40,90 20,80" />
              <polygon points="100,60 120,50 140,60 140,80 120,90 100,80" />
            </g>
          </svg>
        </div>

        <div class="relative max-w-2xl">
          <div class="inline-flex items-center gap-2 rounded-full bg-primary-content/10 backdrop-blur px-3 py-1 text-xs font-medium tracking-wide mb-5">
            <span class="w-1.5 h-1.5 rounded-full bg-primary-content animate-pulse"></span>
            <span>Book a discovery call</span>
          </div>
          <h2 class="font-display text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.05]">
            Let’s give your business a
            <span class="italic">hive</span>.
          </h2>
          <p class="mt-5 text-lg md:text-xl text-primary-content/85 leading-relaxed max-w-xl">
            Twenty minutes. No commitment. You leave with a scoped role, a shortlist, and a plan for week one.
          </p>
          <div class="mt-10 flex flex-wrap items-center gap-4">
            <a
              href="mailto:hello@buzzybee.co"
              class="btn bg-base-100 text-primary hover:bg-base-100/90 border-0 rounded-full px-7 shadow-md"
            >
              Book a discovery call
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </a>
            <a href="#pricing" class="btn btn-ghost text-primary-content hover:bg-primary-content/10 rounded-full px-6">
              See pricing
            </a>
          </div>
          <div class="mt-8 flex items-center gap-6 text-sm text-primary-content/80">
            <span class="flex items-center gap-2">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              7-day ramp
            </span>
            <span class="flex items-center gap-2">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              Month-to-month
            </span>
            <span class="flex items-center gap-2">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              Swap guarantee
            </span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
