<script setup lang="ts">
import { computed } from 'vue'

// Maps the app's per-project semantic status token onto the design's soft
// status-chip palette (--st-* in style.css). Renders a tinted pill with a
// same-color dot, exactly like the mock.
const props = withDefaults(
  defineProps<{ label: string; color?: string; sm?: boolean }>(),
  { color: 'neutral', sm: false }
)

const MAP: Record<string, [string, string]> = {
  success: ['var(--st-done-bg)', 'var(--st-done-fg)'],
  warning: ['var(--st-prog-bg)', 'var(--st-prog-fg)'],
  info: ['var(--st-rev-bg)', 'var(--st-rev-fg)'],
  primary: ['var(--st-rev-bg)', 'var(--st-rev-fg)'],
  error: ['var(--st-block-bg)', 'var(--st-block-fg)'],
  neutral: ['var(--st-todo-bg)', 'var(--st-todo-fg)'],
  muted: ['var(--st-todo-bg)', 'var(--st-todo-fg)']
}
const style = computed(() => {
  const [bg, fg] = MAP[props.color] || MAP.neutral
  return {
    background: bg,
    color: fg,
    padding: props.sm ? '1px 7px' : '2px 9px',
    fontSize: props.sm ? '11px' : '11.5px'
  }
})
</script>

<template>
  <span class="inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap leading-normal" :style="style">
    <span class="rounded-full shrink-0" style="width: 5.5px; height: 5.5px; background: currentColor" />
    {{ label }}
  </span>
</template>
