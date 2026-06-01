<script setup lang="ts">
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-vue-next'
import { useToast, type ToastKind } from '../composables/useToast'

const toast = useToast()

const ICON: Record<ToastKind, any> = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
}

const STYLE: Record<ToastKind, string> = {
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  info:    'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  error:   'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
}
</script>

<template>
  <div
    class="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
    style="max-width: 320px;"
  >
    <transition-group name="toast">
      <div
        v-for="t in toast.toasts.value"
        :key="t.id"
        class="pointer-events-auto rounded-lg border shadow-lg backdrop-blur-sm px-3 py-2 flex items-start gap-2 text-xs"
        :class="STYLE[t.kind]"
      >
        <component :is="ICON[t.kind]" class="w-4 h-4 shrink-0 mt-0.5" />
        <div class="flex-1 min-w-0">
          <div class="font-medium leading-snug">{{ t.message }}</div>
          <div v-if="t.detail" class="text-[11px] opacity-80 mt-0.5 leading-snug">{{ t.detail }}</div>
        </div>
        <button
          class="opacity-50 hover:opacity-100 transition-opacity shrink-0"
          @click="toast.dismiss(t.id)"
          title="Dismiss"
        >
          <X class="w-3 h-3" />
        </button>
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(20px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
.toast-leave-active {
  position: absolute;
  right: 0;
}
</style>
