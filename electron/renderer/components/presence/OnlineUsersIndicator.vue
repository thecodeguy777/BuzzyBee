<script setup lang="ts">
import { ref, computed } from 'vue'
import { Users } from 'lucide-vue-next'
import { usePresence } from '../../composables/usePresence'
import { useProfiles } from '../../composables/useProfiles'
import PresenceAvatars from './PresenceAvatars.vue'

const profiles = useProfiles()

// Global "who's online in HiveMind right now" indicator for the main
// window header. Joins the `ops:online` presence channel — every signed-in
// user lands here regardless of which window they're working from.

const presence = usePresence('ops:online', () => ({
  surface: 'main',
}))

const open = ref(false)
const onlineCount = computed(() => presence.all.value.length)
</script>

<template>
  <div class="relative">
    <button
      class="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-base-200 text-base-content/60 hover:text-base-content transition-colors"
      :title="`${onlineCount} ${onlineCount === 1 ? 'person' : 'people'} online`"
      @click="open = !open"
    >
      <Users class="w-3.5 h-3.5" />
      <span class="text-[11px] font-medium">{{ onlineCount }}</span>
    </button>

    <!-- Dropdown -->
    <div
      v-if="open"
      class="absolute right-0 top-full mt-1 w-60 bg-base-100 border border-base-300 rounded-lg shadow-lg z-50 overflow-hidden"
      @click.stop
    >
      <div class="px-3 py-2 border-b border-base-300 flex items-center gap-2">
        <Users class="w-3.5 h-3.5 text-primary" />
        <span class="text-xs font-semibold">{{ onlineCount }} online now</span>
      </div>
      <div v-if="presence.all.value.length === 0" class="px-3 py-4 text-center text-[11px] text-base-content/40">
        No one else connected.
      </div>
      <div v-else class="py-1 max-h-64 overflow-y-auto">
        <div
          v-for="user in presence.all.value"
          :key="user.ref"
          class="flex items-center gap-2 px-3 py-1.5 hover:bg-base-200/50 transition-colors"
        >
          <PresenceAvatars :users="[user]" size="sm" hideWhenEmpty />
          <div class="flex-1 min-w-0">
            <div class="text-xs font-medium text-base-content truncate">
              {{ user.fullName || profiles.displayName(user.userId, user.email ?? user.userId.slice(0, 8)) }}
              <span v-if="user.userId === presence.me.value" class="text-[10px] font-normal text-base-content/40">(you)</span>
            </div>
            <div v-if="user.email && user.fullName" class="text-[10px] text-base-content/50 truncate">
              {{ user.email }}
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- Click-outside to close -->
    <div v-if="open" class="fixed inset-0 z-40" @click="open = false"></div>
  </div>
</template>
