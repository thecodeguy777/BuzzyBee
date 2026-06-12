<script setup lang="ts">
import { Check } from 'lucide-vue-next'
// Color swatch row. 'accent' is a virtual swatch bound to the doc accent.
defineProps<{ options: string[]; modelValue: string; allowAccent?: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()
</script>

<template>
  <div class="flex gap-[7px] flex-wrap">
    <button
      v-if="allowAccent"
      type="button"
      title="Theme accent"
      class="w-[26px] h-[26px] rounded-[7px] grid place-items-center"
      :style="{
        background: 'var(--accent)',
        boxShadow: modelValue === 'accent' ? '0 0 0 2px var(--color-base-100), 0 0 0 4px var(--accent)' : 'inset 0 0 0 1px rgba(0,0,0,.1)',
      }"
      @click="emit('update:modelValue', 'accent')"
    ><Check v-if="modelValue === 'accent'" :size="13" class="text-white" /></button>
    <button
      v-for="c in options"
      :key="c"
      type="button"
      :title="c"
      class="w-[26px] h-[26px] rounded-[7px] grid place-items-center"
      :style="{
        background: c,
        boxShadow: modelValue === c ? `0 0 0 2px var(--color-base-100), 0 0 0 4px ${c}` : 'inset 0 0 0 1px rgba(0,0,0,.12)',
      }"
      @click="emit('update:modelValue', c)"
    ><Check v-if="modelValue === c" :size="13" class="text-white" /></button>
  </div>
</template>
