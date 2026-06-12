<script setup lang="ts">
// Labeled switch for the designer inspector.
defineProps<{ modelValue: boolean; label: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()
</script>

<template>
  <label class="flex items-center gap-2.5 cursor-pointer">
    <button
      type="button"
      class="w-[34px] h-5 rounded-full relative flex-none transition-colors"
      :style="{ background: modelValue ? 'var(--accent)' : 'var(--color-base-300)' }"
      role="switch"
      :aria-checked="modelValue"
      @click.prevent="emit('update:modelValue', !modelValue)"
    >
      <span
        class="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-[left] shadow"
        :style="{ left: modelValue ? '16px' : '2px' }"
      />
    </button>
    <span class="text-[13px] font-semibold text-base-content">{{ label }}</span>
  </label>
</template>
