<script setup lang="ts">
import { computed } from 'vue'
import HexAvatar from '@/components/shared/HexAvatar.vue'

// "Seen by" avatars packed into a honeycomb cluster — flat-top hexagons that
// interlock like puzzle pieces (a 2-column comb), with the white ring as the
// seam. Overflows to a "+N" cell. Cells are keyed by member so arrivals drop
// in with a bubbly spring, departures pop out, and survivors glide (FLIP) to
// their new slot.
const props = withDefaults(
  defineProps<{
    members: { id: string; name: string; avatarUrl: string | null }[]
    size?: number
    max?: number
  }>(),
  { size: 16, max: 4 }
)

// Flat-top hexagon tessellation (× size): columns step 3/4 across, rows step
// √3/2 down, odd columns shift down half a row.
const COL = 0.75
const ROW = 0.866
const OFF = 0.433

const overflow = computed(() => Math.max(0, props.members.length - props.max))
const shown = computed(() => props.members.slice(0, overflow.value ? props.max - 1 : props.max))
const total = computed(() => shown.value.length + (overflow.value ? 1 : 0))

function cellStyle(i: number) {
  const s = props.size
  const col = i % 2
  const row = Math.floor(i / 2)
  return {
    position: 'absolute' as const,
    left: col * COL * s + 'px',
    top: row * ROW * s + (col === 1 ? OFF * s : 0) + 'px',
    zIndex: i,
  }
}
const box = computed(() => {
  const s = props.size
  let w = 0
  let h = 0
  for (let i = 0; i < total.value; i++) {
    const col = i % 2
    const row = Math.floor(i / 2)
    w = Math.max(w, col * COL * s + s)
    h = Math.max(h, row * ROW * s + (col === 1 ? OFF * s : 0) + s)
  }
  return { w, h }
})
// Hairline honeycomb seam between cells (kept sub-pixel-thin, not rounded).
const seam = computed(() => Math.max(0.5, props.size * 0.03))
</script>

<template>
  <TransitionGroup
    tag="div"
    name="seen-pop"
    class="seen-cluster relative inline-block align-middle"
    :style="{ width: box.w + 'px', height: box.h + 'px' }"
  >
    <HexAvatar
      v-for="(m, idx) in shown"
      :key="m.id"
      :style="cellStyle(idx)"
      :name="m.name"
      :avatar-url="m.avatarUrl"
      :color-key="m.id"
      :title="m.name"
      :size="size"
      ring
      :ring-width="seam"
    />
    <HexAvatar
      v-if="overflow"
      key="__overflow"
      :style="cellStyle(shown.length)"
      :label="`+${overflow}`"
      :size="size"
      :font-size="Math.round(size * 0.42)"
      placeholder
      ring
      :ring-width="seam"
    />
  </TransitionGroup>
</template>

<style scoped>
.seen-cluster {
  transition: width 0.3s cubic-bezier(0.34, 1.3, 0.64, 1), height 0.3s cubic-bezier(0.34, 1.3, 0.64, 1);
}

/* Arrival: fall from above and squash into the comb with a bubbly overshoot. */
.seen-pop-enter-active {
  animation: seen-fall 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
@keyframes seen-fall {
  0% { opacity: 0; transform: translateY(-14px) scale(0.3); }
  55% { opacity: 1; transform: translateY(2px) scale(1.12); }
  75% { transform: translateY(-1px) scale(0.96); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

/* Departure: pop out and sink. */
.seen-pop-leave-active {
  transition: opacity 0.22s ease-in, transform 0.22s ease-in;
}
.seen-pop-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.35);
}

/* Survivors glide to their new comb slot (Vue FLIP). */
.seen-pop-move {
  transition: transform 0.35s cubic-bezier(0.34, 1.3, 0.64, 1);
}

@media (prefers-reduced-motion: reduce) {
  .seen-cluster,
  .seen-pop-enter-active,
  .seen-pop-leave-active,
  .seen-pop-move {
    animation: none;
    transition: none;
  }
}
</style>
