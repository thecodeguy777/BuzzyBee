<script setup lang="ts">
import { computed } from 'vue'

// The little signal-bar priority indicator from the mock. Task.priority is
// 1 (highest) … 4 (lowest); we collapse to High / Medium / Low like the design.
const props = defineProps<{ priority: number }>()

const level = computed<'High' | 'Medium' | 'Low'>(() =>
  props.priority <= 2 ? 'High' : props.priority === 3 ? 'Medium' : 'Low'
)
const count = computed(() => (level.value === 'High' ? 3 : level.value === 'Medium' ? 2 : 1))
const color = computed(() => (level.value === 'High' ? '#d6336c' : level.value === 'Medium' ? '#c2700c' : '#5b8a72'))
</script>

<template>
  <span class="inline-flex items-end gap-px" style="height: 11px" :title="`${level} priority`">
    <span
      v-for="i in 3"
      :key="i"
      class="rounded-sm"
      :style="{ width: '2.5px', height: `${4 + (i - 1) * 3.5}px`, background: i <= count ? color : 'color-mix(in oklab, var(--color-base-content) 16%, transparent)' }"
    />
  </span>
</template>
