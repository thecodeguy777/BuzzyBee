<script setup lang="ts">
import { computed } from 'vue'

const ROLE_META: Record<string, { label: string; color: string }> = {
  superadmin: { label: 'Owner', color: '#611f69' },
  admin: { label: 'Admin', color: '#7b2d86' },
  pm: { label: 'Project Mgr', color: '#2f6fed' },
  va: { label: 'VA', color: '#0d9488' },
}

const props = defineProps<{ role: string | null | undefined }>()
const meta = computed(() => ROLE_META[props.role ?? 'va'] ?? ROLE_META.va)
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[0.72rem] font-semibold whitespace-nowrap"
    :style="{ background: `color-mix(in oklab, ${meta.color} 12%, var(--color-base-100))`, color: meta.color }"
  >
    <span class="w-[5px] h-[5px] rounded-full bg-current" />
    {{ meta.label }}
  </span>
</template>
