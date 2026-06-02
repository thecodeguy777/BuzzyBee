<script setup lang="ts">
import { ref, computed, inject, nextTick, watch, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  MessagesSquare, Headphones, Mic, MicOff, MonitorUp, PhoneOff, Wand2,
  Send, ChevronDown, Maximize2, Crown, Hash, Bell, BellOff,
} from 'lucide-vue-next'
import HexAvatar from '@/components/shared/HexAvatar.vue'
import { COMMS_STREAM } from '@/composables/commsStream'
import { useChannelsStore } from '@/stores/channels'
import { useTeamStore } from '@/stores/team'

const stream = inject(COMMS_STREAM)!
const channels = useChannelsStore()
const team = useTeamStore()
const route = useRoute()
const router = useRouter()

const expanded = ref(false)
const draft = ref('')
const channelMenuOpen = ref(false)
const listEl = ref<HTMLElement | null>(null)

// Don't shadow the full Comms page — the dock is for *everywhere else*.
const onCommsPage = computed(() => route.name === 'workstation-comms')
// Show whenever there's something to act on: a live call, or any channel to chat in.
const visible = computed(
  () => !onCommsPage.value && (stream.inHuddle.value || channels.channels.length > 0),
)

const channelName = computed(() => channels.currentChannel?.name ?? 'comms')
const firstName = (n: string | null | undefined) => (n || 'Someone').split(' ')[0]
const hostName = computed(() => {
  const h = stream.huddleHost.value
  return h ? firstName(stream.huddlePeople.value.find((p) => p.userId === h)?.name) : ''
})
const speakingNow = computed(() => stream.speaking.value.size > 0)

// Last slice of the channel for the compact view (full history lives in Comms).
const messages = computed(() => stream.rootMessages.value.slice(-50))
function nameFor(m: { user_id: string; user_name: string | null }) {
  return m.user_name || team.profiles[m.user_id]?.full_name || 'Someone'
}
function avatarFor(userId: string) {
  return team.profiles[userId]?.avatar_url ?? null
}
function timeFor(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
// Hide the avatar/name header on consecutive messages from the same author.
function isContinuation(i: number) {
  const m = messages.value[i]
  const prev = messages.value[i - 1]
  return !!prev && !!m && prev.user_id === m.user_id &&
    new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000
}

function scrollToBottom() {
  nextTick(() => {
    if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
  })
}
async function send() {
  const body = draft.value
  if (!body.trim()) return
  draft.value = ''
  try {
    await stream.send(body)
    scrollToBottom()
  } catch {
    draft.value = body
  }
}
function open() {
  expanded.value = true
  channelMenuOpen.value = false
  const id = channels.currentChannelId
  if (id) void channels.markRead(id)
  scrollToBottom()
}
function pickChannel(id: string) {
  channels.select(id)
  channelMenuOpen.value = false
  scrollToBottom()
}
function jumpToComms() {
  router.push({ name: 'workstation-comms' })
}

watch(() => messages.value.length, () => { if (expanded.value) scrollToBottom() })

// While expanded, the dock counts as actively viewing the channel — suppress
// new-message pings and keep it marked read.
let viewing = false
watch(expanded, (v) => {
  if (v) {
    scrollToBottom()
    if (!viewing) { viewing = true; stream.registerViewer() }
  } else if (viewing) {
    viewing = false; stream.unregisterViewer()
  }
})
onBeforeUnmount(() => { if (viewing) stream.unregisterViewer() })
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2 print:hidden">
      <!-- ── Expanded panel ── -->
      <div
        v-if="expanded"
        class="w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-base-300 bg-base-100 shadow-2xl overflow-hidden flex flex-col"
        style="height: min(32rem, calc(100vh - 6rem))"
      >
        <!-- header -->
        <header class="relative flex items-center gap-2 px-3 py-2.5 border-b border-base-300 bg-base-100">
          <button class="flex items-center gap-1.5 min-w-0 rounded-md hover:bg-base-200 px-1.5 py-1 -ml-1" @click="channelMenuOpen = !channelMenuOpen">
            <Hash class="w-4 h-4 text-base-content/50 shrink-0" :stroke-width="2" />
            <span class="font-display font-semibold truncate">{{ channelName }}</span>
            <ChevronDown class="w-3.5 h-3.5 text-base-content/40 shrink-0" :stroke-width="2" />
          </button>
          <span v-if="stream.inHuddle.value && hostName" class="text-[0.65rem] text-base-content/40 truncate">· {{ hostName }} 👑</span>
          <div class="flex-1" />
          <button
            class="w-7 h-7 rounded-md hover:bg-base-200 flex items-center justify-center"
            :class="stream.soundMuted.value ? 'text-base-content/40' : 'text-base-content/60'"
            :title="stream.soundMuted.value ? 'Comms sounds off' : 'Comms sounds on'"
            @click="stream.toggleSounds()"
          >
            <component :is="stream.soundMuted.value ? BellOff : Bell" class="w-4 h-4" :stroke-width="1.75" />
          </button>
          <button class="w-7 h-7 rounded-md hover:bg-base-200 flex items-center justify-center text-base-content/50" title="Open full Comms" @click="jumpToComms">
            <Maximize2 class="w-4 h-4" :stroke-width="1.75" />
          </button>
          <button class="w-7 h-7 rounded-md hover:bg-base-200 flex items-center justify-center text-base-content/50" title="Minimize" @click="expanded = false">
            <ChevronDown class="w-4 h-4" :stroke-width="2" />
          </button>

          <!-- channel switcher -->
          <div v-if="channelMenuOpen" class="absolute left-2 top-full mt-1 z-10 w-56 max-h-64 overflow-y-auto rounded-xl border border-base-300 bg-base-100 shadow-lg p-1" @mouseleave="channelMenuOpen = false">
            <button
              v-for="c in channels.sorted"
              :key="c.id"
              class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left"
              :class="c.id === channels.currentChannelId ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-base-200'"
              @click="pickChannel(c.id)"
            >
              <Hash class="w-3.5 h-3.5 shrink-0" :stroke-width="2" />
              <span class="flex-1 truncate">{{ c.name }}</span>
              <span v-if="channels.unread[c.id]" class="min-w-[1rem] h-4 px-1 rounded-full bg-error text-white text-[0.6rem] font-bold flex items-center justify-center">{{ channels.unread[c.id] }}</span>
            </button>
          </div>
        </header>

        <!-- participants (in a call) -->
        <div v-if="stream.huddlePeople.value.length" class="flex items-center gap-1.5 overflow-x-auto px-3 py-2 border-b border-base-300 bg-primary/5">
          <span
            v-for="p in stream.huddlePeople.value"
            :key="p.userId"
            class="inline-flex items-center gap-1 rounded-full border bg-base-100 pl-0.5 pr-2 py-0.5 shrink-0"
            :class="stream.speaking.value.has(p.userId) ? 'border-success ring-1 ring-success/40' : 'border-base-300'"
            :title="p.name + (p.muted ? ' (muted)' : '')"
          >
            <span class="relative inline-flex">
              <HexAvatar :name="p.name" :avatar-url="p.avatarUrl" :size="18" />
              <span v-if="p.muted" class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-error flex items-center justify-center ring-1 ring-base-100">
                <MicOff class="w-1.5 h-1.5 text-white" :stroke-width="3" />
              </span>
            </span>
            <span class="text-[0.7rem] font-medium">{{ firstName(p.name) }}</span>
            <Crown v-if="p.userId === stream.huddleHost.value" class="w-2.5 h-2.5 text-warning shrink-0" :stroke-width="2.5" />
          </span>
        </div>

        <!-- messages -->
        <div ref="listEl" class="flex-1 min-h-0 overflow-y-auto py-2">
          <div v-if="messages.length === 0" class="px-4 py-8 text-center text-xs text-base-content/40">
            No messages yet — say hello 🐝
          </div>
          <div
            v-for="(m, i) in messages"
            :key="m.id"
            class="flex gap-2 px-3"
            :class="isContinuation(i) ? 'py-0.5' : 'py-1 mt-1'"
          >
            <div class="w-6 shrink-0 flex justify-center">
              <HexAvatar v-if="!isContinuation(i)" :name="nameFor(m)" :avatar-url="avatarFor(m.user_id)" :size="24" />
            </div>
            <div class="flex-1 min-w-0">
              <div v-if="!isContinuation(i)" class="flex items-baseline gap-1.5">
                <span class="text-xs font-semibold truncate">{{ nameFor(m) }}</span>
                <span class="text-[0.6rem] text-base-content/40 shrink-0">{{ timeFor(m.created_at) }}</span>
              </div>
              <div v-if="m.body" class="text-[0.8rem] text-base-content/90 whitespace-pre-wrap break-words leading-snug">{{ m.body }}</div>
              <div v-if="m.attachments?.length" class="text-[0.7rem] text-base-content/50 italic">📎 {{ m.attachments.length }} attachment{{ m.attachments.length > 1 ? 's' : '' }} — open in Comms</div>
            </div>
          </div>
        </div>

        <!-- composer -->
        <div class="px-2 py-2 border-t border-base-300">
          <div class="flex items-center gap-1.5 rounded-xl border border-base-300 bg-base-100 pl-3 pr-1.5 py-1">
            <input
              v-model="draft"
              :placeholder="`Message #${channelName}`"
              class="flex-1 bg-transparent text-sm outline-none min-w-0"
              @keydown.enter.prevent="send"
            />
            <button class="w-7 h-7 rounded-lg bg-primary text-white flex items-center justify-center disabled:opacity-40" :disabled="!draft.trim()" @click="send">
              <Send class="w-3.5 h-3.5" :stroke-width="2" />
            </button>
          </div>
        </div>

        <!-- call controls -->
        <div class="flex items-center gap-1.5 px-2 py-2 border-t border-base-300 bg-base-200/50">
          <template v-if="stream.inHuddle.value">
            <button class="w-8 h-8 rounded-lg flex items-center justify-center" :class="stream.muted.value ? 'bg-error/15 text-error' : 'bg-base-100 text-base-content/70'" :title="stream.muted.value ? 'Unmute' : 'Mute'" @click="stream.toggleMute()">
              <component :is="stream.muted.value ? MicOff : Mic" class="w-4 h-4" :stroke-width="1.75" />
            </button>
            <button class="w-8 h-8 rounded-lg flex items-center justify-center" :class="stream.noiseSuppression.value ? 'bg-primary/15 text-primary' : 'bg-base-100 text-base-content/70'" :title="stream.rnnoiseActive.value ? 'AI noise cancellation' : 'Noise cancellation'" @click="stream.toggleNoise()">
              <Wand2 class="w-4 h-4" :stroke-width="1.75" />
            </button>
            <button class="w-8 h-8 rounded-lg flex items-center justify-center" :class="stream.sharingScreen.value ? 'bg-primary/15 text-primary' : 'bg-base-100 text-base-content/70'" title="Share screen" @click="stream.toggleScreenShare()">
              <MonitorUp class="w-4 h-4" :stroke-width="1.75" />
            </button>
            <div class="flex-1" />
            <button class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-error text-white text-xs font-semibold" @click="stream.toggleHuddle()">
              <PhoneOff class="w-3.5 h-3.5" :stroke-width="1.75" /> Leave
            </button>
          </template>
          <button v-else class="inline-flex items-center justify-center gap-2 h-8 w-full rounded-lg bg-primary text-white text-xs font-semibold" @click="stream.toggleHuddle()">
            <Headphones class="w-4 h-4" :stroke-width="1.75" /> Start huddle in #{{ channelName }}
          </button>
        </div>
      </div>

      <!-- ── Collapsed: in a call ── -->
      <div
        v-if="!expanded && stream.inHuddle.value"
        class="flex items-center gap-2 rounded-full border border-primary/30 bg-base-100 shadow-xl pl-3 pr-1.5 py-1.5"
      >
        <button class="flex items-center gap-2 min-w-0" @click="open" title="Open huddle">
          <span class="relative flex h-2.5 w-2.5 shrink-0">
            <span v-if="speakingNow" class="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 animate-ping" />
            <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
          </span>
          <span class="text-xs font-semibold truncate max-w-[7rem]">#{{ channelName }}</span>
          <span class="flex -space-x-1.5">
            <HexAvatar v-for="p in stream.huddlePeople.value.slice(0, 3)" :key="p.userId" :name="p.name" :avatar-url="p.avatarUrl" :size="22" ring />
          </span>
        </button>
        <button class="w-8 h-8 rounded-full flex items-center justify-center shrink-0" :class="stream.muted.value ? 'bg-error/15 text-error' : 'bg-base-200 text-base-content/70'" :title="stream.muted.value ? 'Unmute' : 'Mute'" @click="stream.toggleMute()">
          <component :is="stream.muted.value ? MicOff : Mic" class="w-4 h-4" :stroke-width="1.75" />
        </button>
        <button class="w-8 h-8 rounded-full bg-error text-white flex items-center justify-center shrink-0" title="Leave" @click="stream.toggleHuddle()">
          <PhoneOff class="w-4 h-4" :stroke-width="1.75" />
        </button>
      </div>

      <!-- ── Collapsed: idle launcher ── -->
      <button
        v-else-if="!expanded"
        class="relative w-14 h-14 rounded-full bg-primary text-white shadow-xl flex items-center justify-center hover:scale-105 transition-transform"
        title="Open chat"
        @click="open"
      >
        <MessagesSquare class="w-6 h-6" :stroke-width="1.75" />
        <span v-if="channels.totalUnread > 0" class="absolute -top-0.5 -right-0.5 min-w-[1.25rem] h-5 px-1 rounded-full bg-error text-white text-[0.65rem] font-bold flex items-center justify-center ring-2 ring-base-100">
          {{ channels.totalUnread > 99 ? '99+' : channels.totalUnread }}
        </span>
      </button>
    </div>
  </Teleport>
</template>
