<script setup lang="ts">
import HexAvatar from '@/components/shared/HexAvatar.vue'

withDefaults(
  defineProps<{
    name?: string | null
    email?: string | null
    avatarUrl?: string | null
    online: boolean
    size?: number
  }>(),
  { size: 38 },
)
</script>

<template>
  <span class="relative inline-flex shrink-0">
    <HexAvatar :avatar-url="avatarUrl" :name="name" :email="email" :size="size" tint="primary" />
    <span
      class="absolute -right-px -bottom-px rounded-full ring-2 ring-base-100"
      :class="online ? 'bg-success' : 'bg-base-content/25'"
      :style="{ width: Math.max(8, size * 0.26) + 'px', height: Math.max(8, size * 0.26) + 'px' }"
      :title="online ? 'Online' : 'Offline'"
    />
  </span>
</template>
