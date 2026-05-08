<script setup lang="ts">
</script>

<template>
  <section id="contact" class="relative py-24 md:py-32 border-t border-base-300 overflow-hidden">
    <div class="max-w-6xl mx-auto px-6">
      <div v-reveal class="relative border border-base-300 rounded-lg overflow-hidden">
        <!-- Gradient background -->
        <div class="relative p-10 md:p-16" style="background: linear-gradient(135deg, #1e40af 0%, #6366f1 50%, #a855f7 100%);">
          <!-- Grid overlay -->
          <div class="absolute inset-0 pointer-events-none opacity-10"
            style="background-image: linear-gradient(to right, rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.3) 1px, transparent 1px); background-size: 40px 40px;"
          ></div>

          <!-- Glow orb -->
          <div class="absolute top-[-20%] right-[-10%] w-[50%] h-[80%] pointer-events-none opacity-30 blur-3xl"
            style="background: radial-gradient(ellipse at center, #a855f7 0%, transparent 60%);"
          ></div>

          <div class="relative max-w-2xl">
            <div class="text-[11px] font-medium uppercase tracking-wider text-white/50 mb-4">Free discovery call</div>
            <h2 class="font-display text-3xl md:text-4xl lg:text-5xl tracking-tight leading-tight text-white">
              Your next closing pays for a full year.
            </h2>
            <p class="mt-4 text-base text-white/70 leading-relaxed max-w-lg">
              Twenty minutes on a call. You leave with a scoped role, a VA shortlist, and a plan for week one. No commitment, no pressure.
            </p>
            <div class="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="mailto:hello@hivemind.co"
                class="inline-flex items-center gap-2 bg-white text-gray-900 font-medium px-5 py-2.5 rounded-md hover:bg-white/90 transition-colors text-sm"
              >
                Book a discovery call
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </a>
              <a href="#pricing" class="inline-flex items-center gap-2 text-white/70 font-medium px-5 py-2.5 rounded-md border border-white/20 hover:bg-white/10 transition-colors text-sm">
                See pricing
              </a>
            </div>
            <div class="mt-8 flex flex-wrap items-center gap-6 text-xs text-white/50">
              <span class="flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                VA working in 7 days
              </span>
              <span class="flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Cancel anytime after 3 months
              </span>
              <span class="flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Swap guarantee
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
