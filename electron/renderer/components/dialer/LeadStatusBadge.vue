<script setup lang="ts">
import { computed } from 'vue'
import type { LeadStatus } from '../../composables/useLeads'

const props = defineProps<{
  status: LeadStatus
  size?: 'xs' | 'sm'
}>()

type Style = { label: string; cls: string }

const STYLES: Record<LeadStatus, Style> = {
  'new':            { label: 'New',          cls: 'bg-base-200 text-base-content/70' },
  'calling':        { label: 'Calling',      cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  'contacted':      { label: 'Contacted',    cls: 'bg-green-500/15 text-green-700 dark:text-green-400' },
  'callback':       { label: 'Callback',     cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  'voicemail':      { label: 'Voicemail',    cls: 'bg-purple-500/15 text-purple-600 dark:text-purple-400' },
  'no-answer':      { label: 'No answer',    cls: 'bg-base-300 text-base-content/60' },
  'not-interested': { label: 'Not interested', cls: 'bg-orange-500/15 text-orange-700 dark:text-orange-400' },
  'wrong-number':   { label: 'Wrong number', cls: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  'dnc':            { label: 'DNC',          cls: 'bg-red-500/20 text-red-700 dark:text-red-300 font-semibold' },
  'invalid':        { label: 'Invalid',      cls: 'bg-base-300 text-base-content/40 line-through' },
  'done':           { label: 'Done',         cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
}

const style = computed(() => STYLES[props.status])

const sizeClasses = computed(() =>
  props.size === 'xs'
    ? 'text-[8px] px-1 py-0.5'
    : 'text-[9px] px-1.5 py-0.5',
)
</script>

<template>
  <span
    class="inline-flex items-center font-medium uppercase tracking-wider rounded"
    :class="[style.cls, sizeClasses]"
  >
    <span
      v-if="status === 'calling'"
      class="w-1 h-1 rounded-full bg-blue-500 animate-pulse mr-1"
    />
    {{ style.label }}
  </span>
</template>
