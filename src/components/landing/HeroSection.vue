<script setup lang="ts">
import BeeMark from './BeeMark.vue'
</script>

<template>
  <section class="relative overflow-hidden min-h-[100vh] flex items-center bg-base-100">
    <!-- Soft warm backdrop -->
    <div
      class="absolute inset-0 pointer-events-none"
      style="background:
        radial-gradient(ellipse 70% 50% at 85% 50%, oklch(92% 0.09 85 / 0.55) 0%, transparent 60%),
        radial-gradient(ellipse 60% 40% at 15% 20%, oklch(88% 0.06 175 / 0.35) 0%, transparent 65%);"
    ></div>

    <!-- Confetti sparkles scattered around -->
    <svg class="absolute inset-0 w-full h-full pointer-events-none opacity-70" aria-hidden="true">
      <g fill="oklch(72% 0.17 85)">
        <circle cx="8%"  cy="28%" r="3"   class="anim-twinkle" style="transform-origin: 8% 28%; animation-delay: 0s" />
        <circle cx="12%" cy="70%" r="2"   class="anim-twinkle" style="transform-origin: 12% 70%; animation-delay: 0.8s" />
        <circle cx="42%" cy="18%" r="2.5" class="anim-twinkle" style="transform-origin: 42% 18%; animation-delay: 1.6s" />
        <circle cx="55%" cy="82%" r="3"   class="anim-twinkle" style="transform-origin: 55% 82%; animation-delay: 2.4s" />
      </g>
      <g stroke="oklch(72% 0.17 20)" stroke-width="2" stroke-linecap="round" fill="none">
        <path d="M 6% 55% l 10 0 M calc(6% + 5px) calc(55% - 5px) l 0 10" class="anim-twinkle" style="transform-origin: 6% 55%; animation-delay: 1.2s" />
        <path d="M 48% 40% l 8 0 M calc(48% + 4px) calc(40% - 4px) l 0 8" class="anim-twinkle" style="transform-origin: 48% 40%; animation-delay: 2s" />
      </g>
    </svg>

    <!-- Bee — on the right -->
    <div class="absolute top-1/2 right-[4%] -translate-y-1/2 w-[30rem] h-[30rem] max-w-[38vw] max-h-[75vh] pointer-events-none z-10">
      <BeeMark />
    </div>

    <!-- Copy -->
    <div class="relative z-20 w-full max-w-7xl mx-auto px-6 pt-32 pb-20 md:pt-40 md:pb-32">
      <div class="max-w-2xl">
        <div class="inline-flex items-center gap-2 rounded-full border border-base-content/10 bg-base-100/70 backdrop-blur px-3 py-1 text-xs font-medium tracking-wide mb-6 shadow-sm">
          <span class="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"></span>
          <span class="text-base-content/70">Now onboarding U.S. SMBs · March 2026</span>
        </div>

        <h1 class="font-display text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.05] text-base-content">
          Your hive of
          <span class="relative inline-block">
            <span class="relative z-10 italic text-primary">hardworking</span>
            <svg class="absolute -bottom-1 left-0 w-full h-3 text-primary/60" viewBox="0 0 200 12" fill="none" preserveAspectRatio="none">
              <path d="M2 8 Q 50 2, 100 6 T 198 5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none" />
            </svg>
          </span>
          virtual&nbsp;talent.
        </h1>

        <p class="mt-6 text-lg md:text-xl text-base-content/70 max-w-xl leading-relaxed">
          Pre-vetted Filipino virtual assistants placed with U.S. small businesses.
          Built on a unified platform, not duct-taped spreadsheets.
        </p>

        <div class="mt-10 flex flex-wrap items-center gap-4">
          <a href="#contact" class="btn btn-primary rounded-full px-6 shadow-lg shadow-primary/25">
            Book a discovery call
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </a>
          <a href="#how" class="btn btn-ghost rounded-full px-6 text-base-content hover:bg-base-content/5">
            See how it works
          </a>
        </div>

        <dl class="mt-12 grid grid-cols-3 gap-6 max-w-md">
          <div>
            <dt class="text-xs uppercase tracking-[0.12em] text-base-content/50 font-medium">Savings</dt>
            <dd class="font-display text-2xl text-primary mt-1">50–80%</dd>
          </div>
          <div>
            <dt class="text-xs uppercase tracking-[0.12em] text-base-content/50 font-medium">Ramp</dt>
            <dd class="font-display text-2xl text-primary mt-1">7 days</dd>
          </div>
          <div>
            <dt class="text-xs uppercase tracking-[0.12em] text-base-content/50 font-medium">From</dt>
            <dd class="font-display text-2xl text-primary mt-1">$1,200<span class="text-sm text-base-content/50">/mo</span></dd>
          </div>
        </dl>
      </div>
    </div>
  </section>
</template>

<style scoped>
.bee-float {
  animation: bee-float 6s ease-in-out infinite;
}
@keyframes bee-float {
  0%, 100% { transform: translate(0, -50%) rotate(-1.5deg); }
  50% { transform: translate(-8px, calc(-50% - 14px)) rotate(1.5deg); }
}
</style>
