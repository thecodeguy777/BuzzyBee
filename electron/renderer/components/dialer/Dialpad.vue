<script setup lang="ts">
import { Delete } from 'lucide-vue-next'

const props = defineProps<{
  value: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:value', v: string): void
  (e: 'press', digit: string): void
}>()

const rows: { digit: string; letters?: string }[][] = [
  [{ digit: '1' }, { digit: '2', letters: 'ABC' }, { digit: '3', letters: 'DEF' }],
  [{ digit: '4', letters: 'GHI' }, { digit: '5', letters: 'JKL' }, { digit: '6', letters: 'MNO' }],
  [{ digit: '7', letters: 'PQRS' }, { digit: '8', letters: 'TUV' }, { digit: '9', letters: 'WXYZ' }],
  [{ digit: '*' }, { digit: '0', letters: '+' }, { digit: '#' }],
]

function press(digit: string) {
  if (props.disabled) return
  emit('update:value', props.value + digit)
  emit('press', digit)
}

function backspace() {
  if (props.disabled || props.value.length === 0) return
  emit('update:value', props.value.slice(0, -1))
}
</script>

<template>
  <div class="space-y-1.5">
    <div v-for="(row, i) in rows" :key="i" class="grid grid-cols-3 gap-1.5">
      <button
        v-for="key in row"
        :key="key.digit"
        class="h-12 rounded-lg border border-base-300 hover:border-primary hover:bg-primary/5 active:bg-primary/10 transition-colors flex flex-col items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="disabled"
        @click="press(key.digit)"
      >
        <span class="text-lg font-light text-base-content leading-none">{{ key.digit }}</span>
        <span v-if="key.letters" class="text-[8px] tracking-widest text-base-content/40 leading-none mt-0.5">{{ key.letters }}</span>
      </button>
    </div>

    <div class="flex justify-center">
      <button
        class="p-1.5 rounded-md text-base-content/50 hover:text-base-content hover:bg-base-200 transition-colors disabled:opacity-30"
        :disabled="disabled || value.length === 0"
        title="Backspace"
        @click="backspace"
      >
        <Delete class="w-3.5 h-3.5" />
      </button>
    </div>
  </div>
</template>
