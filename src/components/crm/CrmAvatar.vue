<script setup lang="ts">
// Rounded-square avatar tile (companies, contacts, owners) — matches the CRM
// design's square logo treatment, distinct from the honeycomb HexAvatar used
// for chat people.
const props = withDefaults(
  defineProps<{
    name?: string
    initials?: string
    color?: string
    avatarUrl?: string | null
    size?: number
    radius?: number
  }>(),
  { size: 28, radius: 8 }
)

function initialsOf() {
  if (props.initials) return props.initials
  const src = props.name ?? '?'
  return src.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?'
}
</script>

<template>
  <div
    class="shrink-0 inline-grid place-items-center font-semibold text-white overflow-hidden"
    :style="{
      width: size + 'px',
      height: size + 'px',
      borderRadius: radius + 'px',
      background: color ?? 'var(--accent)',
      fontSize: Math.round(size * 0.4) + 'px',
    }"
    :title="name"
  >
    <img v-if="avatarUrl" :src="avatarUrl" :alt="name" class="w-full h-full object-cover" />
    <span v-else>{{ initialsOf() }}</span>
  </div>
</template>
