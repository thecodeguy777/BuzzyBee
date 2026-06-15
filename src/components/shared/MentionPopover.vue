<script setup lang="ts">
// Presentational popover for useMentionAutocomplete — a teleported, fixed
// list of mention candidates. Buttons use @mousedown.prevent so picking a
// row doesn't blur the composer first.
import HexAvatar from '@/components/shared/HexAvatar.vue'
import type { MentionCandidate } from '@/composables/useMentionAutocomplete'

defineProps<{
  open: boolean
  matches: MentionCandidate[]
  activeIndex: number
  style: Record<string, string>
}>()
defineEmits<{ (e: 'pick', c: MentionCandidate): void }>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && matches.length"
      role="listbox"
      class="fixed z-[60] w-56 rounded-xl border border-base-300 bg-base-100 shadow-2xl overflow-hidden py-1"
      :style="style"
    >
      <button
        v-for="(p, i) in matches"
        :key="p.id"
        type="button"
        role="option"
        :aria-selected="i === activeIndex"
        class="w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm"
        :class="i === activeIndex ? 'bg-primary/10' : 'hover:bg-base-200'"
        @mousedown.prevent="$emit('pick', p)"
      >
        <HexAvatar :name="p.name" :avatar-url="p.avatarUrl" :color-key="p.id" :size="22" />
        <span class="truncate">{{ p.name }}</span>
      </button>
    </div>
  </Teleport>
</template>
