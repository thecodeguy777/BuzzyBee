<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Bell } from 'lucide-vue-next'
import { useNotifications } from '@/composables/useNotifications'

const router = useRouter()
const { unreadCount } = useNotifications()

const rootEl = ref<HTMLElement | null>(null)
const open = ref(false)

function toggle() {
  open.value = !open.value
}
function close() {
  open.value = false
}
async function gotoInbox() {
  close()
  await router.push({ name: 'workstation-inbox' })
}

function onDocClick(e: MouseEvent) {
  if (!open.value) return
  if (rootEl.value && !rootEl.value.contains(e.target as Node)) close()
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div ref="rootEl" class="relative">
    <button
      type="button"
      class="relative w-9 h-9 rounded-full flex items-center justify-center hover:bg-base-200 transition-colors"
      :aria-label="`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`"
      @click="gotoInbox"
    >
      <Bell class="w-4 h-4" :stroke-width="1.75" />
      <span
        v-if="unreadCount > 0"
        class="absolute -top-0.5 -right-0.5 min-w-[1rem] h-4 rounded-full bg-error text-white text-[0.6rem] font-bold tabular-nums flex items-center justify-center px-1"
      >
        {{ unreadCount > 99 ? '99+' : unreadCount }}
      </span>
    </button>
  </div>
</template>
