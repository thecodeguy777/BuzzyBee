<script setup lang="ts">
import { computed } from 'vue'
import HexAvatar from '@/components/shared/HexAvatar.vue'
import type { TeamClientRef } from './capacity'

const props = withDefaults(
  defineProps<{ clients: TeamClientRef[]; size?: number; max?: number }>(),
  { size: 24, max: 4 },
)
const shown = computed(() => props.clients.slice(0, props.max))
const extra = computed(() => props.clients.length - shown.value.length)
</script>

<template>
  <span v-if="clients.length === 0" class="text-[0.8rem] text-base-content/40 font-medium">—</span>
  <div v-else class="flex items-center">
    <span
      v-for="(c, i) in shown"
      :key="c.id"
      class="rounded-lg ring-2 ring-base-100"
      :class="i > 0 && '-ml-1.5'"
      :title="c.name"
    >
      <HexAvatar :name="c.name" :size="size" />
    </span>
    <span
      v-if="extra > 0"
      class="-ml-1.5 rounded-lg ring-2 ring-base-100 bg-base-200 text-base-content/70 text-[0.68rem] font-bold grid place-items-center"
      :style="{ width: size + 'px', height: size + 'px' }"
    >+{{ extra }}</span>
  </div>
</template>
