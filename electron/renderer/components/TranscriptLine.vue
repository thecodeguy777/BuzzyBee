<script setup lang="ts">
import { computed } from 'vue'
import type { TranscriptChunk } from '../../shared/ipc-channels'

const props = defineProps<{ line: TranscriptChunk }>()

const isVA = computed(() => props.line.speaker === 'You')
</script>

<template>
  <div class="flex gap-2 items-start animate-fade-in">
    <span
      class="shrink-0 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
      :class="isVA
        ? 'bg-blue-500/20 text-blue-300'
        : 'bg-purple-500/20 text-purple-300'"
    >
      {{ line.speaker }}
    </span>
    <span
      class="text-xs leading-relaxed"
      :class="line.isFinal ? 'text-white/85' : 'text-white/40 italic'"
    >
      {{ line.text }}
    </span>
  </div>
</template>

<style scoped>
@keyframes fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in {
  animation: fade-in 0.3s ease-out;
}
</style>
