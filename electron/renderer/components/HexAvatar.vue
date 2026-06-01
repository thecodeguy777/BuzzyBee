<script setup lang="ts">
import { computed } from 'vue'
import { HEX_CLIP_ID } from '../lib/hexPath'
import HexClipDef from './HexClipDef.vue'

/**
 * Honeycomb-cell avatar. Replaces circular avatars across the app with the
 * brand's rounded-hexagon. Color-preserving by design: callers pass their
 * existing `fill` (a CSS background — solid or gradient) and pre-computed
 * `label` (initials), so this changes the *shape* only, never the palette.
 */
const props = defineProps<{
  /** Initials / short text shown inside the cell. */
  label: string
  /** CSS background for the cell (solid color or gradient). Ignored when `placeholder`. */
  fill?: string
  /** Cell size in px (width = height of the hex bounding box). */
  size?: number
  /** White rim around the cell — used for overlapping avatar stacks. */
  ring?: boolean
  /** Green "online" dot, bottom-right. */
  online?: boolean
  /** Muted styling for "+N" overflow / empty cells. */
  placeholder?: boolean
  /** Override the auto-computed font size. */
  fontSize?: number
  /** Tooltip text. Defaults to `label`. */
  title?: string
}>()

const size = computed(() => props.size ?? 24)
const ringW = computed(() => (props.ring ? Math.max(1.5, size.value * 0.09) : 0))
const innerSize = computed(() => size.value - ringW.value * 2)
const fontPx = computed(() => props.fontSize ?? Math.round(size.value * 0.42))
const clip = `url(#${HEX_CLIP_ID})`
const dotPx = computed(() => Math.max(6, Math.round(size.value * 0.28)))
</script>

<template>
  <div
    class="relative inline-flex shrink-0 items-center justify-center"
    :style="{ width: size + 'px', height: size + 'px' }"
    :title="title ?? label"
  >
    <!-- Shared rounded-hex clip definition (objectBoundingBox → reusable at any size) -->
    <HexClipDef />

    <!-- White rim (interlocking honeycomb look in stacks) -->
    <div
      v-if="ring"
      class="absolute inset-0 bg-base-100"
      :style="{ clipPath: clip, WebkitClipPath: clip }"
    />

    <!-- The cell -->
    <div
      class="flex items-center justify-center font-semibold"
      :class="placeholder ? 'bg-base-200 text-base-content/60' : 'text-white'"
      :style="{
        width: innerSize + 'px',
        height: innerSize + 'px',
        background: placeholder ? undefined : (fill || 'var(--color-primary)'),
        clipPath: clip,
        WebkitClipPath: clip,
        fontSize: fontPx + 'px',
      }"
    >
      {{ label }}
    </div>

    <!-- Online dot (kept circular — not a person avatar) -->
    <span
      v-if="online"
      class="absolute bottom-0 right-0 rounded-full bg-green-500 border border-base-100"
      :style="{ width: dotPx + 'px', height: dotPx + 'px' }"
    />
  </div>
</template>
