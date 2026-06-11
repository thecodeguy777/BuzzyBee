<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { Hash, Plus, ChevronDown, Check, Headphones, MessageCircle } from 'lucide-vue-next'
import { RouterLink } from 'vue-router'
import SeenCluster from '@/components/comms/SeenCluster.vue'
import { useChannelsStore } from '@/stores/channels'
import { useClientsStore } from '@/stores/clients'

const props = defineProps<{
  onlineCount: number
  currentChannelId: string | null
  /** Map of channel id → huddle participant count (cross-channel presence). */
  huddleByChannel?: Record<string, number>
  /** Map of channel id → people (besides you) currently sitting in it. */
  viewersByChannel?: Record<string, { id: string; name: string; avatarUrl: string | null }[]>
}>()
const emit = defineEmits<{ choose: [id: string]; error: [msg: string] }>()

const channels = useChannelsStore()
const clients = useClientsStore()

const viewersTitle = (id: string) => {
  const v = props.viewersByChannel?.[id] ?? []
  return v.map((m) => m.name.split(' ')[0]).join(', ') + (v.length === 1 ? ' is' : ' are') + ' here now'
}

// ── Client / workspace switcher ──────────────────────────────────────────────
const switcherOpen = ref(false)
function chooseClient(id: string) {
  switcherOpen.value = false
  if (id !== clients.currentClientId) clients.setCurrentClient(id)
}

// ── Add channel ──────────────────────────────────────────────────────────────
const addingChannel = ref(false)
const newChannelName = ref('')
const channelInput = ref<HTMLInputElement | null>(null)
function beginAdd() {
  addingChannel.value = true
  nextTick(() => channelInput.value?.focus())
}
async function commitAddChannel() {
  const v = newChannelName.value.trim()
  newChannelName.value = ''
  addingChannel.value = false
  if (!v) return
  try {
    const ch = await channels.addChannel(v)
    if (ch) emit('choose', ch.id)
  } catch (e) {
    emit('error', (e as Error).message)
  }
}
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <!-- Workspace switcher -->
    <div class="relative border-b border-base-300">
      <button
        class="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-base-200/50 transition-colors"
        @click="switcherOpen = !switcherOpen"
      >
        <span class="w-2.5 h-2.5 rounded-full bg-success shrink-0" />
        <span class="flex-1 min-w-0">
          <span class="block font-display text-base font-semibold truncate">{{ clients.currentClient?.name ?? 'Workspace' }}</span>
          <span class="block text-[0.7rem] text-success font-medium">{{ onlineCount }} online</span>
        </span>
        <ChevronDown class="w-4 h-4 text-base-content/40 transition-transform" :class="switcherOpen ? 'rotate-180' : ''" :stroke-width="1.75" />
      </button>

      <div v-if="switcherOpen" class="absolute inset-0 z-10" @click="switcherOpen = false" />
      <div
        v-if="switcherOpen"
        class="absolute left-2 right-2 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-base-300 bg-base-100 shadow-2xl py-1"
      >
        <div class="px-3 pt-1 pb-1 text-[0.6rem] font-semibold uppercase tracking-wider text-base-content/40">Switch workspace</div>
        <button
          v-for="c in clients.clients.filter((x) => x.status !== 'archived')"
          :key="c.id"
          class="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-base-200"
          @click="chooseClient(c.id)"
        >
          <span class="flex-1 truncate" :class="c.id === clients.currentClientId ? 'font-semibold' : ''">{{ c.name }}</span>
          <Check v-if="c.id === clients.currentClientId" class="w-3.5 h-3.5 text-primary shrink-0" :stroke-width="2.5" />
        </button>
        <p v-if="!clients.clients.length" class="px-3 py-2 text-xs text-base-content/40">No workspaces yet.</p>
      </div>
    </div>

    <!-- Channel list -->
    <div class="flex-1 overflow-y-auto px-2 py-2">
      <!-- skeleton (cold load only) -->
      <div v-if="channels.loading && !channels.channels.length" class="px-1 pt-2 space-y-1.5">
        <div v-for="n in 6" :key="n" class="flex items-center gap-2 px-1 py-1">
          <div class="w-4 h-4 rounded bg-base-200 animate-pulse shrink-0" />
          <div class="h-3 rounded bg-base-200 animate-pulse" :style="{ width: `${50 + ((n * 17) % 40)}%` }" />
        </div>
      </div>

      <template v-else>
      <div v-if="channels.pinned.length" class="px-2 pt-2 pb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-base-content/50">Pinned</div>
      <button
        v-for="c in channels.pinned"
        :key="c.id"
        class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left"
        :class="c.id === currentChannelId ? 'bg-primary/10 text-primary font-semibold' : channels.isUnread(c.id) ? 'text-base-content font-semibold hover:bg-base-200' : 'text-base-content/60 hover:bg-base-200'"
        @click="emit('choose', c.id)"
      >
        <Hash class="w-4 h-4 shrink-0" :stroke-width="2" />
        <span class="flex-1 truncate">{{ c.name }}</span>
        <span v-if="viewersByChannel?.[c.id]?.length" class="shrink-0" :title="viewersTitle(c.id)">
          <SeenCluster :members="viewersByChannel[c.id]" :size="14" :max="3" />
        </span>
        <span v-if="huddleByChannel?.[c.id]" class="inline-flex items-center gap-0.5 text-success shrink-0 animate-pulse" title="Huddle in progress">
          <Headphones class="w-3.5 h-3.5" :stroke-width="2" />
          <span class="text-[0.6rem] font-bold tabular-nums">{{ huddleByChannel[c.id] }}</span>
        </span>
        <span v-if="channels.mentions[c.id]" class="min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-error text-white text-[0.65rem] font-bold flex items-center justify-center" title="You were mentioned">@{{ channels.mentions[c.id] }}</span>
        <span v-else-if="channels.unread[c.id]" class="min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-primary text-primary-content text-[0.65rem] font-bold flex items-center justify-center">{{ channels.unread[c.id] }}</span>
      </button>

      <div class="px-2 pt-3 pb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-base-content/50">Channels</div>
      <button
        v-for="c in channels.unpinned"
        :key="c.id"
        class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left"
        :class="c.id === currentChannelId ? 'bg-primary/10 text-primary font-semibold' : channels.isUnread(c.id) ? 'text-base-content font-semibold hover:bg-base-200' : 'text-base-content/60 hover:bg-base-200'"
        @click="emit('choose', c.id)"
      >
        <Hash class="w-4 h-4 shrink-0" :stroke-width="2" />
        <span class="flex-1 truncate">{{ c.name }}</span>
        <span v-if="viewersByChannel?.[c.id]?.length" class="shrink-0" :title="viewersTitle(c.id)">
          <SeenCluster :members="viewersByChannel[c.id]" :size="14" :max="3" />
        </span>
        <span v-if="huddleByChannel?.[c.id]" class="inline-flex items-center gap-0.5 text-success shrink-0 animate-pulse" title="Huddle in progress">
          <Headphones class="w-3.5 h-3.5" :stroke-width="2" />
          <span class="text-[0.6rem] font-bold tabular-nums">{{ huddleByChannel[c.id] }}</span>
        </span>
        <span v-if="channels.mentions[c.id]" class="min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-error text-white text-[0.65rem] font-bold flex items-center justify-center" title="You were mentioned">@{{ channels.mentions[c.id] }}</span>
        <span v-else-if="channels.unread[c.id]" class="min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-primary text-primary-content text-[0.65rem] font-bold flex items-center justify-center">{{ channels.unread[c.id] }}</span>
      </button>

      <form v-if="addingChannel" class="px-1 pt-1" @submit.prevent="commitAddChannel">
        <input
          ref="channelInput"
          v-model="newChannelName"
          placeholder="new-channel"
          class="w-full rounded-md border border-primary/40 bg-base-100 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          @blur="commitAddChannel"
          @keydown.esc="addingChannel = false; newChannelName = ''"
        />
      </form>
      <button v-else class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-base-content/50 hover:bg-base-200" @click="beginAdd">
        <Plus class="w-4 h-4" :stroke-width="2" /> Add channel
      </button>

      <!-- Direct messages live in their own surface now -->
      <RouterLink
        :to="{ name: 'workstation-messages' }"
        class="mt-3.5 w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-base-content/60 hover:bg-base-200"
      >
        <MessageCircle class="w-4 h-4 shrink-0" :stroke-width="2" />
        <span class="flex-1 truncate">Direct messages</span>
        <span v-if="channels.dmMentionTotal" class="min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-error text-white text-[0.65rem] font-bold flex items-center justify-center">@{{ channels.dmMentionTotal }}</span>
        <span v-else-if="channels.dmUnreadTotal" class="min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-primary text-primary-content text-[0.65rem] font-bold flex items-center justify-center">{{ channels.dmUnreadTotal }}</span>
      </RouterLink>
      </template>
    </div>
  </div>
</template>
