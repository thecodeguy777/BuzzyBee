<script setup lang="ts">
import { ref } from 'vue'
import { Bug, CheckCircle2 } from 'lucide-vue-next'
import ReportTicketModal from '@/components/workstation/ReportTicketModal.vue'

const open = ref(false)
const lastSentRef = ref<string | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | undefined

function onSubmitted(ref: string) {
  lastSentRef.value = ref
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    lastSentRef.value = null
  }, 4000)
}
</script>

<template>
  <div>
    <button
      type="button"
      class="fixed bottom-4 right-4 z-30 inline-flex items-center gap-2 rounded-full bg-base-100 border border-base-300 shadow-lg px-3 py-2 text-xs font-medium hover:bg-base-200 hover:shadow-xl transition-all opacity-70 hover:opacity-100"
      title="Report a bug or send feedback"
      @click="open = true"
    >
      <Bug class="w-3.5 h-3.5" :stroke-width="1.75" />
      Report
    </button>

    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-2"
    >
      <div
        v-if="lastSentRef"
        class="fixed bottom-16 right-4 z-30 inline-flex items-center gap-2 rounded-lg bg-success text-success-content shadow-lg px-3 py-2 text-xs font-medium"
      >
        <CheckCircle2 class="w-4 h-4" :stroke-width="2" />
        Thanks — sent as <span class="font-mono">{{ lastSentRef }}</span>
      </div>
    </Transition>

    <ReportTicketModal :open="open" @close="open = false" @submitted="onSubmitted" />
  </div>
</template>
