<script setup lang="ts">
import { computed } from 'vue'
import HexAvatar from '@/components/shared/HexAvatar.vue'

// "X is typing…" — hex avatars of the typers + a chat-bubble with wave dots.
// Ephemeral: fed by the stream's broadcast typing events, never the DB.
const props = defineProps<{
  members: { id: string; name: string; avatarUrl: string | null }[]
}>()

function first(n: string) {
  return n.split(' ')[0] || n
}
const phrase = computed(() => {
  const n = props.members.map((m) => first(m.name))
  if (n.length === 0) return ''
  if (n.length === 1) return `${n[0]} is typing`
  if (n.length === 2) return `${n[0]} and ${n[1]} are typing`
  if (n.length === 3) return `${n[0]}, ${n[1]} and ${n[2]} are typing`
  return `${n[0]}, ${n[1]} and ${n.length - 2} others are typing`
})
</script>

<template>
  <Transition name="ti-fade">
    <div v-if="members.length" class="flex items-center gap-2 px-2 h-7" aria-live="polite">
      <span class="flex -space-x-2">
        <HexAvatar
          v-for="t in members.slice(0, 3)"
          :key="t.id"
          :name="t.name"
          :avatar-url="t.avatarUrl"
          :color-key="t.id"
          :size="22"
          ring
        />
      </span>
      <span class="ti-bubble">
        <span class="ti-dots"><i /><i /><i /></span>
      </span>
      <span class="text-[0.78rem] text-base-content/60 truncate">{{ phrase }}</span>
    </div>
  </Transition>
</template>

<style scoped>
.ti-bubble {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 14px;
  border-bottom-left-radius: 4px;
  background: color-mix(in oklab, var(--accent, #8b5cf6) 12%, transparent);
}
.ti-dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.ti-dots i {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: var(--accent, #8b5cf6);
  display: inline-block;
  animation: ti-wave 1.3s ease-in-out infinite;
  opacity: 0.3;
}
.ti-dots i:nth-child(2) { animation-delay: 0.2s; }
.ti-dots i:nth-child(3) { animation-delay: 0.4s; }
@keyframes ti-wave {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.85); }
  40% { opacity: 1; transform: scale(1); }
}

/* Mount/unmount fade so it doesn't pop. */
.ti-fade-enter-active,
.ti-fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.ti-fade-enter-from,
.ti-fade-leave-to {
  opacity: 0;
  transform: translateY(3px);
}

@media (prefers-reduced-motion: reduce) {
  .ti-dots i { animation: none; opacity: 0.7; }
}
</style>
