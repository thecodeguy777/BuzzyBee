<script setup lang="ts">
// Range + readout for the designer inspector.
withDefaults(defineProps<{ modelValue: number; min: number; max: number; step?: number; suffix?: string }>(), { step: 1, suffix: '' })
const emit = defineEmits<{ (e: 'update:modelValue', v: number): void }>()
</script>

<template>
  <div class="flex items-center gap-2.5">
    <input
      type="range"
      class="range range-xs flex-1"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      @input="emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
    />
    <span class="w-12 text-right text-[12.5px] font-semibold text-base-content tabular-nums">{{ modelValue }}{{ suffix }}</span>
  </div>
</template>
