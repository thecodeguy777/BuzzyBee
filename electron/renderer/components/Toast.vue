<script setup lang="ts">
import { ref, watch } from 'vue'
import { CheckCircle2, AlertCircle, X } from 'lucide-vue-next'

const props = defineProps<{
  message: string
  type?: 'success' | 'error'
  show: boolean
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const visible = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

watch(() => props.show, (val) => {
  if (val) {
    visible.value = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      visible.value = false
      emit('close')
    }, 3000)
  } else {
    visible.value = false
  }
}, { immediate: true })
</script>

<template>
  <Transition name="toast">
    <div
      v-if="visible"
      class="fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg max-w-sm"
      :class="type === 'error'
        ? 'bg-red-50 border-red-200 text-red-800'
        : 'bg-base-100 border-primary/30 shadow-primary/10'"
      style="backdrop-filter: blur(8px);"
    >
      <component
        :is="type === 'error' ? AlertCircle : CheckCircle2"
        class="w-4 h-4 shrink-0"
        :class="type === 'error' ? 'text-red-500' : 'text-primary'"
      />
      <span class="text-sm font-medium">{{ message }}</span>
      <button
        class="ml-2 text-base-content/40 hover:text-base-content/70 transition-colors"
        @click="visible = false; emit('close')"
      >
        <X class="w-3.5 h-3.5" />
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.toast-enter-active { transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.toast-leave-active { transition: all 0.25s ease-in; }
.toast-enter-from { opacity: 0; transform: translateY(20px); }
.toast-leave-to { opacity: 0; transform: translateX(20px); }
</style>
