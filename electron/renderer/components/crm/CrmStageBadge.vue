<script setup lang="ts">
import { computed } from 'vue'
import type { LeadStage } from '../../composables/useLeads'

const props = defineProps<{
  stage: LeadStage
  size?: 'xs' | 'sm'
}>()

const STYLES: Record<LeadStage, { label: string; cls: string }> = {
  'lead':         { label: 'Lead',        cls: 'bg-base-300/60 text-base-content/70' },
  'contacted':    { label: 'Contacted',   cls: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  'qualified':    { label: 'Qualified',   cls: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400' },
  'discovery':    { label: 'Discovery',   cls: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400' },
  'proposal':     { label: 'Proposal',    cls: 'bg-violet-500/15 text-violet-700 dark:text-violet-400' },
  'negotiation':  { label: 'Negotiation', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  'closed-won':   { label: 'Won',         cls: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-semibold' },
  'closed-lost':  { label: 'Lost',        cls: 'bg-red-500/15 text-red-700 dark:text-red-400' },
}

const style = computed(() => STYLES[props.stage])
const sizeClasses = computed(() =>
  props.size === 'xs'
    ? 'text-[9px] px-1.5 py-0.5'
    : 'text-[10px] px-2 py-0.5',
)
</script>

<template>
  <span class="inline-flex items-center font-medium uppercase tracking-wider rounded" :class="[style.cls, sizeClasses]">
    {{ style.label }}
  </span>
</template>
