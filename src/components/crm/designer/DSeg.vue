<script setup lang="ts">
// Segmented control for the designer inspector.
defineProps<{ options: { v: string; label: string }[]; modelValue: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()
</script>

<template>
  <div class="flex gap-[3px] bg-base-200 p-[3px] rounded-lg">
    <button
      v-for="o in options"
      :key="o.v"
      type="button"
      class="flex-1 flex items-center justify-center px-1 py-1.5 rounded-md text-[12px] font-semibold transition-all"
      :class="modelValue === o.v ? 'bg-base-100 text-base-content shadow-sm' : 'text-base-content/50 hover:text-base-content/80'"
      @click="emit('update:modelValue', o.v)"
    >{{ o.label }}</button>
  </div>
</template>
