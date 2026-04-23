<script setup lang="ts">
withDefaults(defineProps<{
  /** 'amber-mint' | 'mint-amber' | 'cream' — flips the gradient direction per divider for rhythm. */
  variant?: 'amber-mint' | 'mint-amber' | 'cream'
  /** Height of the wave band in rem (default 5). */
  height?: number
}>(), {
  variant: 'amber-mint',
  height: 5
})
</script>

<template>
  <div
    class="relative w-full overflow-hidden pointer-events-none select-none"
    :style="{ height: height + 'rem' }"
    aria-hidden="true"
  >
    <svg
      class="absolute inset-0 h-full wave-drift"
      style="width: 200%;"
      viewBox="0 0 2880 160"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient :id="`wave-grad-${variant}`" x1="0" y1="0" x2="1" y2="0">
          <template v-if="variant === 'amber-mint'">
            <stop offset="0%"   stop-color="oklch(88% 0.14 85)"  stop-opacity="0.45" />
            <stop offset="40%"  stop-color="oklch(86% 0.12 135)" stop-opacity="0.55" />
            <stop offset="70%"  stop-color="oklch(83% 0.1 175)"  stop-opacity="0.55" />
            <stop offset="100%" stop-color="oklch(88% 0.14 85)"  stop-opacity="0.4" />
          </template>
          <template v-else-if="variant === 'mint-amber'">
            <stop offset="0%"   stop-color="oklch(83% 0.1 175)"  stop-opacity="0.5" />
            <stop offset="45%"  stop-color="oklch(88% 0.14 85)"  stop-opacity="0.55" />
            <stop offset="75%"  stop-color="oklch(82% 0.15 55)"  stop-opacity="0.45" />
            <stop offset="100%" stop-color="oklch(83% 0.1 175)"  stop-opacity="0.5" />
          </template>
          <template v-else>
            <stop offset="0%"   stop-color="oklch(92% 0.08 85)"  stop-opacity="0.55" />
            <stop offset="50%"  stop-color="oklch(96% 0.05 85)"  stop-opacity="0.7" />
            <stop offset="100%" stop-color="oklch(92% 0.08 85)"  stop-opacity="0.55" />
          </template>
        </linearGradient>

        <linearGradient :id="`wave-grad-${variant}-back`" x1="0" y1="0" x2="1" y2="0">
          <template v-if="variant === 'amber-mint'">
            <stop offset="0%"   stop-color="oklch(85% 0.1 175)"  stop-opacity="0.25" />
            <stop offset="100%" stop-color="oklch(88% 0.14 85)"  stop-opacity="0.25" />
          </template>
          <template v-else-if="variant === 'mint-amber'">
            <stop offset="0%"   stop-color="oklch(88% 0.14 85)"  stop-opacity="0.25" />
            <stop offset="100%" stop-color="oklch(83% 0.1 175)"  stop-opacity="0.25" />
          </template>
          <template v-else>
            <stop offset="0%"   stop-color="oklch(92% 0.08 85)"  stop-opacity="0.35" />
            <stop offset="100%" stop-color="oklch(92% 0.08 85)"  stop-opacity="0.35" />
          </template>
        </linearGradient>
      </defs>

      <!-- Back ribbon (wider amplitude, softer opacity, slightly higher) -->
      <path
        d="
          M 0 55
          C 320 15, 640 95, 960 55
          C 1280 15, 1600 95, 1920 55
          C 2240 15, 2560 95, 2880 55
          L 2880 115
          C 2560 75, 2240 155, 1920 115
          C 1600 75, 1280 155, 960 115
          C 640 75, 320 155, 0 115
          Z
        "
        :fill="`url(#wave-grad-${variant}-back)`"
      />

      <!-- Front ribbon -->
      <path
        d="
          M 0 70
          C 280 30, 560 110, 840 70
          C 1120 30, 1400 110, 1680 70
          C 1960 30, 2240 110, 2520 70
          C 2700 48, 2790 90, 2880 70
          L 2880 100
          C 2700 78, 2520 132, 2240 100
          C 1960 68, 1680 140, 1400 100
          C 1120 60, 840 140, 560 100
          C 280 60, 140 130, 0 100
          Z
        "
        :fill="`url(#wave-grad-${variant})`"
      />
    </svg>
  </div>
</template>

<style scoped>
.wave-drift {
  animation: wave-drift 28s linear infinite;
  will-change: transform;
}
@keyframes wave-drift {
  0%   { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
@media (prefers-reduced-motion: reduce) {
  .wave-drift { animation: none; }
}
</style>
