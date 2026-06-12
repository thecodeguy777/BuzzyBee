<script setup lang="ts">
import { computed } from 'vue'
import { WEEKLY_CAPACITY_HOURS, utilOf, utilColor, formatHours } from './capacity'

const props = withDefaults(
  defineProps<{ seconds: number; capacity?: number; showLabel?: boolean }>(),
  { capacity: WEEKLY_CAPACITY_HOURS, showLabel: true },
)
const util = computed(() => utilOf(props.seconds, props.capacity))
const color = computed(() => utilColor(util.value))
const pct = computed(() => Math.round(util.value * 100))
</script>

<template>
  <div class="min-w-0">
    <div class="flex items-baseline gap-1.5 mb-1 whitespace-nowrap">
      <span class="text-[0.8rem] font-bold tabular-nums">{{ formatHours(seconds) }}</span>
      <span class="text-[0.68rem] text-base-content/50">/ {{ capacity }}h</span>
      <span v-if="showLabel" class="ml-auto text-[0.68rem] font-bold" :style="{ color }">{{ pct }}%</span>
    </div>
    <div class="h-1.5 rounded-full bg-base-200 overflow-hidden">
      <div
        class="h-full rounded-full transition-[width] duration-300"
        :style="{ width: Math.min(pct, 100) + '%', background: color }"
      />
    </div>
  </div>
</template>
