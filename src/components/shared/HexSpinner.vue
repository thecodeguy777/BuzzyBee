<script setup lang="ts">
// Hexagonal loading spinner — a honey-colored arc tracing a hexagon outline.
// On-brand for BuzzyHive (honeycomb). Used while the background-blur pipeline
// loads (dynamic import + WASM + model).
defineProps<{ size?: number }>()
</script>

<template>
  <span
    class="hexspin"
    :style="{ width: (size ?? 44) + 'px', height: (size ?? 44) + 'px' }"
    role="status"
    aria-label="Loading"
  >
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <polygon class="hex-track" points="50,5 89,27.5 89,72.5 50,95 11,72.5 11,27.5" />
      <polygon class="hex-arc" points="50,5 89,27.5 89,72.5 50,95 11,72.5 11,27.5" />
    </svg>
  </span>
</template>

<style scoped>
.hexspin { display: inline-grid; place-items: center; }
.hexspin svg { width: 100%; height: 100%; }
.hex-track,
.hex-arc {
  fill: none;
  stroke-width: 8;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.hex-track { stroke: rgba(255, 255, 255, 0.16); }
.hex-arc {
  stroke: #e8b84d; /* BuzzyHive honey */
  stroke-dasharray: 72 198; /* visible arc of the ~270 perimeter */
  animation: hex-trace 1.3s linear infinite;
}
@keyframes hex-trace { to { stroke-dashoffset: -270; } }
</style>
