<script setup lang="ts">
import FlowingGradient from './FlowingGradient.vue'
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
    <div class="relative z-10 w-full max-w-6xl mx-auto px-6 pt-32 pb-20 md:pt-40 md:pb-32">
      <div class="max-w-2xl">
        <!-- Badge -->
        <div class="inline-flex items-center gap-2 border border-white/20 bg-white/80 backdrop-blur-sm px-3 py-1 rounded-md text-xs font-medium tracking-wide mb-8">
          <span class="w-1.5 h-1.5 rounded-full bg-primary"></span>
          <span class="text-base-content/70">Built for Real Estate Professionals</span>
        </div>

        <h1 class="font-display text-4xl md:text-5xl lg:text-6xl tracking-tight leading-[1.1] text-base-content">
          Stop losing leads to
          <span class="text-primary">admin work</span>.
        </h1>

        <p class="mt-6 text-base md:text-lg text-base-content/60 max-w-xl leading-relaxed">
          Your dedicated virtual assistant handles lead follow-up, transaction coordination, listing management, and CRM so you can focus on closing deals and growing your book of business.
        </p>

        <div class="mt-8 flex flex-wrap items-center gap-3">
          <a href="#contact" class="inline-flex items-center gap-2 bg-primary text-primary-content font-medium px-5 py-2.5 rounded-md hover:opacity-90 transition-opacity text-sm">
            Get your VA in 7 days
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </a>
          <a href="#how" class="inline-flex items-center gap-2 border border-base-300 bg-white/70 backdrop-blur-sm text-base-content/70 font-medium px-5 py-2.5 rounded-md hover:border-base-content/30 hover:text-base-content transition-colors text-sm">
            See how it works
          </a>
        </div>

        <!-- Stats row -->
        <div class="mt-14 grid grid-cols-2 sm:grid-cols-4 gap-px border border-base-300 rounded-lg overflow-hidden bg-base-300">
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
    </div>
  </section>
</template>
