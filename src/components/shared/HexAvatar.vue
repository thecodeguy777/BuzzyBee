<script setup lang="ts">
import { computed } from 'vue'
import { HEX_CLIP_ID } from '@/lib/hexPath'
import { userColor } from '@/lib/userColor'
import HexClipDef from './HexClipDef.vue'

/**
 * Honeycomb-cell avatar for the Workstation. Replaces circular avatars with the
 * brand's rounded hexagon. Color-preserving: photos use the real `avatarUrl`,
 * initials keep the existing `bg-primary/15 text-primary` tint — only the
 * *shape* changes, never the palette.
 */
const props = defineProps<{
  /** Profile photo URL. When set, it's shown clipped to the cell. */
  avatarUrl?: string | null
  /** Full name — used for initials + tooltip when no explicit label. */
  name?: string | null
  /** Email — fallback source for initials. */
  email?: string | null
  /** Explicit label (e.g. "+3"). Overrides computed initials. */
  label?: string
  /** Explicit CSS background (e.g. a hashed color). White text. Overrides tint. */
  fill?: string
  /** Per-user identity key (user id). When set and there's no photo/explicit
   *  fill, the initials cell gets that user's deterministic color. */
  colorKey?: string | null
  /** Cell size in px (bounding box). */
  size?: number
  /** White rim — for overlapping avatar stacks. */
  ring?: boolean
  /** Green "online" dot, bottom-right. */
  online?: boolean
  /** Muted styling for "+N" overflow / empty cells. */
  placeholder?: boolean
  /** Override the auto-computed font size. */
  fontSize?: number
  /** Tooltip text. Defaults to name/email. */
  title?: string
  /** Initials color scheme — preserves each call site's existing tint. */
  tint?: 'primary' | 'secondary' | 'warning' | 'neutral'
}>()

// Literal class strings so Tailwind's scanner picks them up from this file.
const TINTS = {
  primary: 'bg-primary/15 text-primary',
  secondary: 'bg-secondary/20 text-secondary',
  warning: 'bg-warning/20 text-warning',
  neutral: 'bg-base-200 text-base-content/70',
} as const

function initialsOf(name?: string | null, email?: string | null): string {
  const src = name || email || '?'
  return (
    src
      .split(/\s|@|[._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('') || 'BB'
  )
}

const size = computed(() => props.size ?? 32)
const ringW = computed(() => (props.ring ? Math.max(1.5, size.value * 0.09) : 0))
const innerSize = computed(() => size.value - ringW.value * 2)
const fontPx = computed(() => props.fontSize ?? Math.round(size.value * 0.4))
const label = computed(() => props.label ?? initialsOf(props.name, props.email))
// Effective fill: explicit fill wins; else derive from colorKey when there's no
// photo to show. (Photos keep the real avatar; color is only for initials.)
const effFill = computed(
  () => props.fill ?? (props.colorKey && !props.avatarUrl ? userColor(props.colorKey) : undefined),
)
const tip = computed(() => props.title ?? props.name ?? props.email ?? '')
const clip = `url(#${HEX_CLIP_ID})`
const dotPx = computed(() => Math.max(6, Math.round(size.value * 0.26)))
</script>

<template>
  <div
    class="relative inline-flex shrink-0 items-center justify-center align-middle"
    :style="{ width: size + 'px', height: size + 'px' }"
    :title="tip"
  >
    <HexClipDef />

    <!-- White rim (interlocking honeycomb look in stacks) -->
    <div
      v-if="ring"
      class="absolute inset-0 bg-base-100"
      :style="{ clipPath: clip, WebkitClipPath: clip }"
    />

    <!-- The cell -->
    <div
      class="flex items-center justify-center font-semibold overflow-hidden"
      :class="placeholder
        ? 'bg-base-200 text-base-content/60'
        : (effFill ? 'text-white' : TINTS[tint ?? 'primary'])"
      :style="{
        width: innerSize + 'px',
        height: innerSize + 'px',
        background: !placeholder && effFill ? effFill : undefined,
        clipPath: clip,
        WebkitClipPath: clip,
        fontSize: fontPx + 'px',
      }"
    >
      <img
        v-if="avatarUrl && !placeholder"
        :src="avatarUrl"
        :alt="label"
        class="w-full h-full object-cover"
      />
      <span v-else>{{ label }}</span>
    </div>

    <!-- Online dot (kept circular — not a person avatar) -->
    <span
      v-if="online"
      class="absolute bottom-0 right-0 rounded-full bg-success border border-base-100"
      :style="{ width: dotPx + 'px', height: dotPx + 'px' }"
    />

    <!-- Overlay badge slot (e.g. a completion dot) — rendered above the cell -->
    <slot name="badge" />
  </div>
</template>
