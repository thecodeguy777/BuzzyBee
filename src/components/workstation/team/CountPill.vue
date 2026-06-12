<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ n: number; kind: 'open' | 'overdue' | 'done' }>()
const style = computed(() => {
  const map = {
    open: { background: 'var(--st-rev-bg)', color: 'var(--st-rev-fg)' },
    overdue: { background: 'var(--st-block-bg)', color: 'var(--st-block-fg)' },
    done: { background: 'var(--st-done-bg)', color: 'var(--st-done-fg)' },
  }
  return map[props.kind]
})
</script>

<template>
  <span v-if="!n" class="text-[0.8rem] text-base-content/40 font-semibold">—</span>
  <span
    v-else
    class="inline-flex items-center justify-center min-w-6 h-[22px] px-2 rounded-[7px] text-[0.78rem] font-bold tabular-nums"
    :style="style"
  >{{ n }}</span>
</template>
