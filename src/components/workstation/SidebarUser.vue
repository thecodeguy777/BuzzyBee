<script setup lang="ts">
import { RouterLink, useRouter } from 'vue-router'
import { LogOut } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import HexAvatar from '@/components/shared/HexAvatar.vue'

defineProps<{ open: boolean }>()

const auth = useAuthStore()
const router = useRouter()

async function handleSignOut() {
  await auth.signOut()
  await router.push({ name: 'login' })
}
</script>

<template>
  <div class="border-t border-base-300 px-2.5 py-3 shrink-0">
    <RouterLink
      :to="{ name: 'workstation-profile' }"
      class="flex items-center gap-3 px-1 py-1 rounded-md hover:bg-base-200 transition-colors"
    >
      <HexAvatar
        :avatar-url="auth.profile?.avatar_url"
        :label="auth.initials"
        :name="auth.fullName"
        :size="36"
      />
      <div
        :class="[
          'flex-1 min-w-0 leading-tight transition-opacity duration-200',
          open ? 'opacity-100 delay-100' : 'opacity-0'
        ]"
      >
        <div class="text-sm font-medium truncate">{{ auth.fullName }}</div>
        <div class="text-xs text-base-content/60 truncate">
          {{ auth.role.toUpperCase() }}
        </div>
      </div>
    </RouterLink>
    <button
      v-show="open"
      class="btn btn-ghost btn-xs w-full justify-start gap-2 mt-1"
      @click="handleSignOut"
    >
      <LogOut class="w-3.5 h-3.5" :stroke-width="1.75" />
      Sign out
    </button>
  </div>
</template>
