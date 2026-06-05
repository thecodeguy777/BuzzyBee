<script setup lang="ts">
// Stacked horizontal allocation bar — visualizes how a budget splits.
// "soft" segments (tools / management overhead) render hatched + muted;
// "people" segments render solid primary. Used by the Direction E hero
// and the "software tax" teardown.
interface Segment {
  pct: number
  label: string
  kind: 'soft' | 'people'
}

withDefaults(defineProps<{ segments: Segment[]; height?: number; animated?: boolean }>(), {
  height: 36,
  animated: false
})

const hatch = 'repeating-linear-gradient(45deg, rgba(0,0,0,0.06) 0 5px, transparent 5px 10px)'
</script>

<template>
  <div class="flex rounded-md overflow-hidden border border-base-300" :style="{ height: height + 'px' }">
    <div
      v-for="(s, i) in segments"
      :key="i"
      class="flex items-center justify-center px-1 text-[10px] font-semibold tracking-wide border-r border-base-300 last:border-r-0 overflow-hidden whitespace-nowrap"
      :class="[s.kind === 'people' ? 'bg-primary text-primary-content' : 'bg-base-200 text-base-content/55', animated ? 'transition-[width] duration-700 ease-out' : '']"
      :style="{ width: s.pct + '%', backgroundImage: s.kind === 'soft' ? hatch : undefined }"
    >
      <span v-if="s.pct >= 16">{{ s.label }}</span>
    </div>
  </div>
</template>
