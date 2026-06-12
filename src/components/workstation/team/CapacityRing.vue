<script setup lang="ts">
import { computed } from 'vue'
import { WEEKLY_CAPACITY_HOURS, utilOf, utilColor, utilLabel } from './capacity'

const props = withDefaults(
  defineProps<{ seconds: number; capacity?: number; size?: number }>(),
  { capacity: WEEKLY_CAPACITY_HOURS, size: 104 },
)
const util = computed(() => utilOf(props.seconds, props.capacity))
const color = computed(() => utilColor(util.value))
const r = computed(() => (props.size - 16) / 2)
const circumference = computed(() => 2 * Math.PI * r.value)
const offset = computed(() => circumference.value * (1 - Math.min(util.value, 1)))
</script>

<template>
  <div class="relative shrink-0" :style="{ width: size + 'px', height: size + 'px' }">
    <svg :width="size" :height="size" class="-rotate-90">
      <circle :cx="size / 2" :cy="size / 2" :r="r" fill="none" class="stroke-base-200" stroke-width="10" />
      <circle
        :cx="size / 2" :cy="size / 2" :r="r" fill="none"
        :stroke="color" stroke-width="10" stroke-linecap="round"
        :stroke-dasharray="circumference" :stroke-dashoffset="offset"
        style="transition: stroke-dashoffset 0.5s ease"
      />
    </svg>
    <div class="absolute inset-0 grid place-items-center text-center">
      <div>
        <div class="text-xl font-extrabold tracking-tight leading-none">{{ Math.round(util * 100) }}%</div>
        <div class="text-[0.68rem] font-semibold mt-0.5" :style="{ color }">{{ utilLabel(util) }}</div>
      </div>
    </div>
  </div>
</template>
