<script setup lang="ts">
// Cheap CSS-only alternative to FlowingGradient. Multiple layered radial
// gradients with a slow CSS animation to suggest motion. No GPU shaders,
// no WebGL context. Good enough for non-hero sections.

withDefaults(defineProps<{
  /** Overall opacity (0-1). */
  opacity?: number
  /** Tone bias. */
  tone?: 'blue' | 'purple' | 'mixed'
}>(), {
  opacity: 0.08,
  tone: 'mixed',
})
</script>

<template>
  <div
    class="absolute inset-0 pointer-events-none ambient-gradient"
    :class="`tone-${tone}`"
    :style="{ opacity }"
  ></div>
</template>

<style scoped>
.ambient-gradient {
  background:
    radial-gradient(ellipse 60% 40% at 20% 30%, var(--g1), transparent 60%),
    radial-gradient(ellipse 50% 35% at 80% 70%, var(--g2), transparent 60%),
    radial-gradient(ellipse 45% 30% at 50% 100%, var(--g3), transparent 60%);
  filter: blur(20px);
  animation: ambient-drift 24s ease-in-out infinite;
  will-change: background-position;
}

.tone-blue   { --g1: #93c5fd; --g2: #c7d2fe; --g3: #ddd6fe; }
.tone-purple { --g1: #c7d2fe; --g2: #d8b4fe; --g3: #f5d0fe; }
.tone-mixed  { --g1: #93c5fd; --g2: #c4b5fd; --g3: #f0abfc; }

@keyframes ambient-drift {
  0%, 100% {
    background-position: 0% 0%, 0% 0%, 0% 0%;
  }
  50% {
    background-position: 4% -3%, -3% 4%, 2% -2%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ambient-gradient { animation: none; }
}
</style>
