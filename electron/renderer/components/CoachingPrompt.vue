<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Sparkles } from 'lucide-vue-next'

const props = defineProps<{
  text: string
}>()

const visible = ref(true)

onMounted(() => {
  // Auto-dismiss after 10 seconds
  setTimeout(() => {
    visible.value = false
  }, 10000)
})
</script>

<template>
  <Transition name="coaching">
    <div
      v-if="visible"
      class="rounded-lg p-3 coaching-pulse"
      style="background: linear-gradient(135deg, rgba(37, 99, 235, 0.15), rgba(168, 85, 247, 0.15)); border: 1px solid rgba(99, 102, 241, 0.3);"
    >
      <div class="flex items-start gap-2">
        <Sparkles class="w-3.5 h-3.5 text-purple-300 shrink-0 mt-0.5" />
        <p class="text-xs text-white/90 leading-relaxed">{{ text }}</p>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.coaching-enter-active { transition: all 0.4s ease-out; }
.coaching-leave-active { transition: all 0.3s ease-in; }
.coaching-enter-from { opacity: 0; transform: translateY(8px) scale(0.95); }
.coaching-leave-to { opacity: 0; transform: translateX(20px); }
</style>
