<script setup lang="ts">
import { computed } from 'vue'
import HexAvatar from '@/components/shared/HexAvatar.vue'

// "Seen by" avatars packed into a honeycomb cluster — flat-top hexagons that
// interlock like puzzle pieces (a 2-column comb), with the white ring as the
// seam. Overflows to a "+N" cell.
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

const cells = computed(() => {
  const s = props.size
  const out: { x: number; y: number }[] = []
  for (let i = 0; i < total.value; i++) {
    const col = i % 2
    const row = Math.floor(i / 2)
    out.push({ x: col * COL * s, y: row * ROW * s + (col === 1 ? OFF * s : 0) })
  }
  return out
})
const box = computed(() => {
  const s = props.size
  const xs = cells.value.map((c) => c.x)
  const ys = cells.value.map((c) => c.y)
  return { w: Math.max(0, ...xs) + s, h: Math.max(0, ...ys) + s }
})
// Hairline honeycomb seam between cells (kept sub-pixel-thin, not rounded).
const seam = computed(() => Math.max(0.5, props.size * 0.03))
</script>

<template>
  <div class="relative inline-block align-middle" :style="{ width: box.w + 'px', height: box.h + 'px' }">
    <template v-for="(c, idx) in cells" :key="idx">
      <HexAvatar
        v-if="idx < shown.length"
        :style="{ position: 'absolute', left: c.x + 'px', top: c.y + 'px', zIndex: idx }"
        :name="shown[idx].name"
        :avatar-url="shown[idx].avatarUrl"
        :color-key="shown[idx].id"
        :title="shown[idx].name"
        :size="size"
        ring
        :ring-width="seam"
      />
      <HexAvatar
        v-else
        :style="{ position: 'absolute', left: c.x + 'px', top: c.y + 'px', zIndex: idx }"
        :label="`+${overflow}`"
        :size="size"
        :font-size="Math.round(size * 0.42)"
        placeholder
        ring
        :ring-width="seam"
      />
    </template>
  </div>
</template>
