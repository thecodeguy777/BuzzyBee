<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  /** Raw source SVG as a string (import via `?raw`). */
  source: string
  /** Region in the source SVG's coordinate space. */
  x: number
  y: number
  width: number
  height: number
}>()

// Extract everything between the outer <svg ...> and </svg>
const innerContent = computed(() => {
  const match = props.source.match(/<svg[^>]*>([\s\S]*)<\/svg>/)
  return match ? match[1] : ''
})
</script>

<template>
  <svg
    :viewBox="`${x} ${y} ${width} ${height}`"
    xmlns="http://www.w3.org/2000/svg"
    xmlns:xlink="http://www.w3.org/1999/xlink"
    class="w-full h-full"
    preserveAspectRatio="xMidYMid meet"
    aria-hidden="true"
    v-html="innerContent"
  />
</template>
