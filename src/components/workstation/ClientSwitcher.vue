<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ChevronDown, Check, Settings2 } from 'lucide-vue-next'
import { RouterLink } from 'vue-router'
import { useClientsStore, type Client } from '@/stores/clients'
import { useTimeStore } from '@/stores/time'
import { useChannelsStore } from '@/stores/channels'

const clients = useClientsStore()
const time = useTimeStore()
const channels = useChannelsStore()

// Per-workspace message badges so a ping in an unselected client is visible.
const badge = (c: Client) => channels.unreadByClient[c.id] ?? null

const open = ref(false)
const rootEl = ref<HTMLElement | null>(null)

function toggle() {
  open.value = !open.value
}
function close() {
  open.value = false
}
function pick(c: Client) {
  time.requestSwitch(c.id)
  close()
}

function onDocClick(e: MouseEvent) {
  if (!open.value) return
  if (rootEl.value && !rootEl.value.contains(e.target as Node)) close()
}
function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}
onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onEsc)
})
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onEsc)
})

const label = computed(() => clients.currentClient?.name ?? 'No client selected')
const empty = computed(() => clients.loaded && clients.clients.length === 0)

function statusDot(c: Client) {
  if (c.status === 'active') return 'bg-success'
  if (c.status === 'paused') return 'bg-warning'
  return 'bg-base-300'
}
</script>

<template>
  <div ref="rootEl" class="relative">
    <button
      type="button"
      class="btn btn-sm btn-ghost gap-2"
      :aria-expanded="open"
      :aria-haspopup="true"
      :disabled="empty"
      @click="toggle"
    >
      <span class="hidden sm:inline text-xs text-base-content/60">Client</span>
      <span
        :class="[
          'font-medium max-w-[6.5rem] sm:max-w-[14rem] truncate',
          !clients.currentClient && 'text-base-content/60'
        ]"
      >
        {{ empty ? 'No clients assigned' : label }}
      </span>
      <!-- another workspace has unread messages -->
      <span
        v-if="channels.otherClientsUnread > 0"
        class="min-w-[1.05rem] h-[1.05rem] px-1 rounded-full bg-error text-white text-[0.62rem] font-bold flex items-center justify-center"
        :title="channels.otherClientsUnread + ' unread in other workspaces'"
      >{{ channels.otherClientsUnread > 99 ? '99+' : channels.otherClientsUnread }}</span>
      <ChevronDown class="w-3.5 h-3.5" :stroke-width="1.75" />
    </button>

    <transition name="dropdown">
    <div
      v-if="open"
      class="absolute z-40 mt-1 w-72 rounded-lg border border-base-300 bg-base-100 shadow-lg overflow-hidden"
      role="menu"
    >
      <div class="px-3 py-2 text-xs uppercase tracking-wide text-base-content/60 border-b border-base-300">
        Your clients
      </div>

      <ul class="max-h-72 overflow-y-auto py-1">
        <li v-if="clients.loading" class="px-3 py-2 text-sm text-base-content/60">
          Loading…
        </li>
        <li v-else-if="!clients.hasClients" class="px-3 py-3 text-sm text-base-content/60">
          You have no client assignments yet.
        </li>
        <li v-for="c in clients.clients" :key="c.id">
          <button
            type="button"
            class="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-base-200 transition-colors"
            :class="c.status !== 'active' && 'opacity-60'"
            role="menuitem"
            @click="pick(c)"
          >
            <span
              :class="['w-2 h-2 rounded-full shrink-0', statusDot(c)]"
              :title="c.status"
            />
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium truncate">{{ c.name }}</div>
              <div class="text-xs text-base-content/60 capitalize">
                {{ c.tier ?? '—' }} · {{ c.preferred_channel ?? 'no channel' }}
              </div>
            </div>
            <span
              v-if="badge(c)?.mentions"
              class="min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-error text-white text-[0.65rem] font-bold flex items-center justify-center shrink-0"
              title="You were mentioned"
            >@{{ badge(c)!.mentions }}</span>
            <span
              v-else-if="badge(c)?.unread"
              class="min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-primary text-primary-content text-[0.65rem] font-bold flex items-center justify-center shrink-0"
              :title="badge(c)!.unread + ' unread messages'"
            >{{ badge(c)!.unread }}</span>
            <Check
              v-if="c.id === clients.currentClientId"
              class="w-4 h-4 text-primary shrink-0"
              :stroke-width="2.5"
            />
          </button>
        </li>
      </ul>

      <div class="border-t border-base-300">
        <RouterLink
          :to="{ name: 'workstation-clients' }"
          class="flex items-center gap-2 px-3 py-2 text-sm hover:bg-base-200 transition-colors"
          @click="close"
        >
          <Settings2 class="w-4 h-4" :stroke-width="1.75" />
          Manage clients
        </RouterLink>
      </div>
    </div>
    </transition>
  </div>
</template>
