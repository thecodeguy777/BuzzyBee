<script setup lang="ts">
import { computed, type FunctionalComponent } from 'vue'

const props = withDefaults(
  defineProps<{
    icon: FunctionalComponent
    label: string
    value: string | number
    sub?: string
    tone?: 'default' | 'error'
    /** Real series to plot. Omit to render no chart (never fabricate one). */
    sparkline?: number[]
    clickable?: boolean
    loading?: boolean
  }>(),
  { tone: 'default', clickable: false, loading: false }
)

defineEmits<{ select: [] }>()

const isError = computed(() => props.tone === 'error')

// Plot the real series into a 200x28 box; area fill below the line.
const W = 200
const H = 28
const linePath = computed(() => {
  const v = props.sparkline
  if (!v || v.length < 2) return ''
  const max = Math.max(...v)
  const min = Math.min(...v)
  const range = max - min || 1
  return v
    .map((n, i) => {
      const x = (i * W) / (v.length - 1)
      const y = H - 2 - ((n - min) / range) * (H - 4)
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
})
const areaPath = computed(() => (linePath.value ? `${linePath.value} L ${W} ${H} L 0 ${H} Z` : ''))
</script>

<template>
  <component
    :is="clickable ? 'button' : 'div'"
    :type="clickable ? 'button' : undefined"
    class="text-left bg-white border rounded-2xl p-4 shadow-hc-1 transition-all w-full"
    :class="[
      clickable ? 'hover:shadow-hc-2 hover:border-base-content/15' : '',
      isError ? 'border-error/30' : 'border-base-300'
    ]"
    :style="isError ? 'background: color-mix(in oklch, var(--color-error) 4%, white)' : ''"
    @click="clickable && $emit('select')"
  >
    <div
      class="text-[0.7rem] font-medium flex items-center gap-1.5"
      :class="isError ? 'text-error' : 'text-base-content/50'"
    >
      <component :is="icon" class="w-3 h-3" :stroke-width="1.75" />
      {{ label }}
    </div>

    <div
      v-if="loading"
      class="h-8 w-14 rounded-md bg-base-200 animate-pulse mt-1.5"
    />
    <div
      v-else
      class="font-display text-3xl font-medium leading-none mt-1.5 tabular-nums"
      :class="isError ? 'text-error' : ''"
    >
      {{ value }}
    </div>

    <div class="text-[0.7rem] text-base-content/50 mt-1">{{ sub }}</div>

    <svg
      v-if="!loading && areaPath"
      class="w-full mt-2"
      height="28"
      viewBox="0 0 200 32"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path :d="areaPath" fill="var(--hc-accent-bg)" opacity="0.7" />
      <path
        :d="linePath"
        fill="none"
        stroke="var(--hc-accent)"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </component>
</template>
