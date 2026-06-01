<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { AlertTriangle } from 'lucide-vue-next'
import { useDialog } from '../composables/useDialog'

const dialog = useDialog()

const active = computed(() => dialog.queue.value[0] ?? null)
const promptValue = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

// Reset input + autofocus whenever the active dialog changes
watch(active, (cur) => {
  if (!cur) {
    promptValue.value = ''
    return
  }
  if (cur.kind === 'prompt') {
    promptValue.value = cur.defaultValue
    nextTick(() => inputRef.value?.focus())
  }
}, { immediate: true })

function onConfirm() {
  const cur = active.value
  if (!cur) return
  if (cur.kind === 'confirm') {
    cur.resolve(true)
  } else {
    if (cur.required && !promptValue.value.trim()) return
    cur.resolve(promptValue.value)
  }
}

function onCancel() {
  const cur = active.value
  if (!cur) return
  if (cur.kind === 'confirm') cur.resolve(false)
  else cur.resolve(null)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.preventDefault(); onCancel() }
  if (e.key === 'Enter') {
    if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return
    e.preventDefault()
    onConfirm()
  }
}
</script>

<template>
  <transition name="dialog-fade">
    <div
      v-if="active"
      class="fixed inset-0 z-[200] flex items-center justify-center px-4"
      style="background: rgba(0,0,0,0.4); backdrop-filter: blur(2px);"
      @keydown="onKeydown"
      @click.self="onCancel"
    >
      <div
        class="bg-base-100 border border-base-300 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden"
      >
        <!-- Header -->
        <div class="px-5 pt-4 pb-3 flex items-start gap-3">
          <div
            v-if="active.destructive"
            class="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center shrink-0"
          >
            <AlertTriangle class="w-4 h-4 text-red-500" />
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="text-sm font-semibold text-base-content">{{ active.title }}</h3>
            <p v-if="active.message" class="text-xs text-base-content/70 mt-1 leading-relaxed">
              {{ active.message }}
            </p>
          </div>
        </div>

        <!-- Prompt input -->
        <div v-if="active.kind === 'prompt'" class="px-5 pb-3">
          <input
            ref="inputRef"
            v-model="promptValue"
            type="text"
            :placeholder="active.placeholder"
            class="w-full text-sm px-3 py-2 rounded border border-base-300 bg-base-100 focus:border-primary focus:outline-none"
            @keydown="onKeydown"
          />
        </div>

        <!-- Buttons -->
        <div class="px-5 py-3 bg-base-200/40 border-t border-base-300 flex justify-end gap-2">
          <button
            class="px-3 py-1.5 text-xs font-medium rounded text-base-content/70 hover:text-base-content hover:bg-base-300/50 transition-colors"
            @click="onCancel"
          >
            {{ active.cancelLabel }}
          </button>
          <button
            class="px-3 py-1.5 text-xs font-medium rounded text-white transition-colors"
            :class="active.destructive
              ? 'bg-red-500 hover:bg-red-600'
              : 'bg-primary hover:bg-primary/90'"
            :disabled="active.kind === 'prompt' && active.required && !promptValue.trim()"
            @click="onConfirm"
          >
            {{ active.confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.15s ease;
}
.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}
</style>
