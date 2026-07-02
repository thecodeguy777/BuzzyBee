<script setup lang="ts">
import type { FunctionalComponent } from 'vue'
import { X } from 'lucide-vue-next'

// Shared modal shell for the Meetings page. Parents mount it with v-if (the
// whole subtree only exists while open — that's the optimization), so the
// transitions run on `appear`.

defineProps<{
  title: string
  subtitle?: string
  icon: FunctionalComponent
  /** Tailwind width class for the panel, e.g. 'w-[520px]'. */
  width?: string
  /** Constrain height + let the body scroll (transcript). */
  scrollBody?: boolean
}>()
defineEmits<{ close: [] }>()
</script>

<template>
  <Teleport to="body">
    <Transition name="mtm-fade" appear>
      <div class="fixed inset-0 z-50 bg-black/40" @click="$emit('close')" />
    </Transition>
    <Transition name="mtm-pop" appear>
      <div class="fixed inset-0 z-[51] grid place-items-center p-4 pointer-events-none">
        <div
          class="pointer-events-auto max-w-full bg-base-100 rounded-2xl border border-base-300 shadow-2xl overflow-hidden flex flex-col"
          :class="[width ?? 'w-[520px]', scrollBody ? 'max-h-[85vh]' : '']"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
        >
          <div class="flex items-center gap-2.5 px-4 py-3.5 border-b border-base-300 shrink-0">
            <span class="w-8 h-8 rounded-lg grid place-items-center text-primary" style="background: var(--accent-soft)">
              <component :is="icon" class="w-4 h-4" :stroke-width="2" />
            </span>
            <div class="flex-1 min-w-0">
              <div class="text-[0.95rem] font-bold leading-tight truncate">{{ title }}</div>
              <div v-if="subtitle" class="text-[0.72rem] text-base-content/50 truncate">{{ subtitle }}</div>
            </div>
            <button type="button" class="btn btn-ghost btn-sm btn-circle" aria-label="Close" @click="$emit('close')">
              <X class="w-4 h-4" :stroke-width="2" />
            </button>
          </div>
          <div :class="scrollBody ? 'flex-1 overflow-y-auto' : ''">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.mtm-fade-enter-active { transition: opacity 0.18s ease; }
.mtm-fade-enter-from { opacity: 0; }

.mtm-pop-enter-active { transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.2, 0.9, 0.3, 1.15); }
.mtm-pop-enter-from { opacity: 0; transform: scale(0.96) translateY(8px); }
</style>
