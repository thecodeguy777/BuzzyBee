<script setup lang="ts">
import FlowingGradient from './FlowingGradient.vue'
import realtorImg from '@/assets/landing/hero-realtor-home.webp'
import vaImg from '@/assets/landing/hero-va-call.webp'
</script>

<template>
  <section class="relative min-h-[100vh] flex items-center bg-base-100 overflow-hidden">
    <!-- Flowing gradient background -->
    <div class="absolute inset-0">
      <FlowingGradient />
    </div>

    <!-- Subtle grid overlay -->
    <div class="absolute inset-0 pointer-events-none opacity-[0.15]"
      style="background-image: linear-gradient(to right, var(--hm-gray-200) 1px, transparent 1px), linear-gradient(to bottom, var(--hm-gray-200) 1px, transparent 1px); background-size: 60px 60px;"
    ></div>

    <!-- Content -->
    <div class="relative z-10 w-full max-w-6xl mx-auto px-6 pt-32 pb-20 md:pt-40 md:pb-24">
      <div class="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] gap-10 lg:gap-12 items-center">
        <!-- Left column: copy -->
        <div class="max-w-2xl">
          <!-- Badge -->
          <div class="inline-flex items-center gap-2 border border-white/30 bg-white/80 backdrop-blur-sm px-3 py-1 rounded-md text-xs font-medium tracking-wide mb-8">
            <span class="w-1.5 h-1.5 rounded-full bg-primary"></span>
            <span class="text-base-content/70">Built for Real Estate Professionals</span>
          </div>

          <h1 class="font-display text-4xl md:text-5xl lg:text-6xl tracking-tight leading-[1.1] text-base-content">
            Stop losing leads to
            <span class="text-primary">admin work</span>.
          </h1>

          <p class="mt-6 text-base md:text-lg text-base-content/70 max-w-xl leading-relaxed">
            Your dedicated virtual assistant handles lead follow-up, transaction coordination, listing management, and CRM so you can focus on closing deals and growing your book of business.
          </p>

          <div class="mt-8 flex flex-wrap items-center gap-3">
            <a href="#contact" class="inline-flex items-center gap-2 bg-primary text-primary-content font-medium px-5 py-2.5 rounded-md hover:opacity-90 transition-opacity text-sm shadow-md shadow-primary/20">
              Get your VA in 7 days
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </a>
            <a href="#how" class="inline-flex items-center gap-2 border border-base-300 bg-white/80 backdrop-blur-sm text-base-content/80 font-medium px-5 py-2.5 rounded-md hover:border-base-content/30 hover:text-base-content transition-colors text-sm">
              See how it works
            </a>
          </div>

          <!-- Stats row -->
          <div class="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-px border border-base-300 rounded-lg overflow-hidden bg-base-300">
            <div class="bg-white/90 backdrop-blur-sm p-4 text-center">
              <div class="text-2xl font-bold text-base-content tracking-tight">70%</div>
              <div class="text-[11px] uppercase tracking-wider text-base-content/50 mt-1">Cost savings</div>
            </div>
            <div class="bg-white/90 backdrop-blur-sm p-4 text-center">
              <div class="text-2xl font-bold text-base-content tracking-tight">7 days</div>
              <div class="text-[11px] uppercase tracking-wider text-base-content/50 mt-1">Ramp time</div>
            </div>
            <div class="bg-white/90 backdrop-blur-sm p-4 text-center">
              <div class="text-2xl font-bold text-base-content tracking-tight">$1,200</div>
              <div class="text-[11px] uppercase tracking-wider text-base-content/50 mt-1">Starting at /mo</div>
            </div>
            <div class="bg-white/90 backdrop-blur-sm p-4 text-center">
              <div class="text-2xl font-bold text-base-content tracking-tight">0</div>
              <div class="text-[11px] uppercase tracking-wider text-base-content/50 mt-1">Lock-in</div>
            </div>
          </div>
        </div>

        <!-- Right column: realtor + VA visual collage -->
        <div class="hidden lg:block relative h-[480px]">
          <!-- Main realtor portrait -->
          <div class="absolute top-0 right-0 w-[78%] aspect-[4/5] rounded-2xl overflow-hidden shadow-2xl shadow-primary/20 border border-white/40">
            <img :src="realtorImg" alt="Real estate professional" class="w-full h-full object-cover" decoding="async" fetchpriority="high" />
            <!-- Subtle gradient overlay -->
            <div class="absolute inset-0 bg-gradient-to-t from-primary/15 to-transparent pointer-events-none"></div>
          </div>

          <!-- Floating VA card overlapping bottom-left -->
          <div class="absolute bottom-0 left-0 w-[58%] aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl shadow-purple-500/20 border-2 border-white/80">
            <img :src="vaImg" alt="Virtual assistant on call" class="w-full h-full object-cover" decoding="async" />
            <div class="absolute inset-0 bg-gradient-to-t from-purple-500/10 to-transparent pointer-events-none"></div>
          </div>

          <!-- Floating "live" badge -->
          <div class="absolute top-6 left-2 inline-flex items-center gap-1.5 bg-white/95 backdrop-blur-sm border border-base-300 rounded-full px-3 py-1.5 shadow-lg">
            <span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
            <span class="text-[10px] font-semibold uppercase tracking-wider text-base-content/70">7-day ramp</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
