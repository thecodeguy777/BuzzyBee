<script setup lang="ts">
import { computed } from 'vue'
import { HEALTH, type Health } from '@/lib/crmData'

const props = defineProps<{ health: Health }>()
const h = computed(() => HEALTH[props.health])
</script>

<template>
  <span v-if="h" class="inline-flex items-center gap-1.5 text-[11px] font-semibold" :style="{ color: h.color }">
    <span class="w-[7px] h-[7px] rounded-full" :style="{ background: h.color }" />
    {{ h.label }}
  </span>
</template>
