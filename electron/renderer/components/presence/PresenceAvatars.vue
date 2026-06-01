<script setup lang="ts">
import { computed } from 'vue'
import type { PresenceUser } from '../../composables/usePresence'
import { useProfiles } from '../../composables/useProfiles'
import HexAvatar from '../HexAvatar.vue'

const profiles = useProfiles()

const props = defineProps<{
  users: PresenceUser[]
  max?: number
  size?: 'sm' | 'md'
  /** Hide entirely when no one is present (default false — shows a soft "no one else here" hint). */
  hideWhenEmpty?: boolean
}>()

const max = computed(() => props.max ?? 4)
const sizePx = computed(() => props.size === 'md' ? 28 : 22)
const fontPx = computed(() => props.size === 'md' ? 11 : 9)

const displayed = computed(() => props.users.slice(0, max.value))
const hiddenCount = computed(() => Math.max(0, props.users.length - max.value))

function displayName(user: PresenceUser): string {
  // Prefer the presence payload's own fullName, then fall back to the
  // profile cache (so other reps show real names, not just email locals).
  if (user.fullName) return user.fullName
  return profiles.displayName(user.userId, user.email ?? user.userId.slice(0, 8))
}

function initials(user: PresenceUser): string {
  const src = user.fullName || (user.email ? user.email.split('@')[0] : user.userId)
  const parts = src.replace(/[._-]+/g, ' ').split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function gradient(userId: string): string {
  let h = 0
  for (const c of userId) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const hue1 = h % 360
  const hue2 = (hue1 + 50) % 360
  return `linear-gradient(135deg, hsl(${hue1} 65% 55%), hsl(${hue2} 70% 50%))`
}
</script>

<template>
  <div v-if="users.length > 0" class="flex items-center -space-x-1.5">
    <HexAvatar
      v-for="user in displayed"
      :key="user.ref"
      :label="initials(user)"
      :fill="gradient(user.userId)"
      :size="sizePx"
      :font-size="fontPx"
      ring
      online
      :title="displayName(user)"
    />
    <HexAvatar
      v-if="hiddenCount > 0"
      :label="`+${hiddenCount}`"
      :size="sizePx"
      :font-size="fontPx"
      ring
      placeholder
      :title="`${hiddenCount} more`"
    />
  </div>
  <span v-else-if="!hideWhenEmpty" class="text-[10px] text-base-content/40">
    Only you
  </span>
</template>
