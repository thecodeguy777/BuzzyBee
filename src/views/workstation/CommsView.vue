<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onBeforeUnmount, inject } from 'vue'
import { useRouter } from 'vue-router'
import {
  Hash, Plus, Search, Users, Headphones, Mic, MicOff, MonitorUp, PhoneOff,
  Paperclip, Image as ImageIcon, Link2, Smile, AtSign, Send, Sparkles, X, ChevronDown, CheckSquare, Settings2, Crown, Maximize2, Bell, BellOff, Wand2
} from 'lucide-vue-next'
import HexAvatar from '@/components/shared/HexAvatar.vue'
import CommsMessage from '@/components/comms/CommsMessage.vue'
import MicCheck from '@/components/comms/MicCheck.vue'
import MediaPicker from '@/components/comms/MediaPicker.vue'
import { type Gif } from '@/lib/giphy'
import { useChannelsStore } from '@/stores/channels'
import { COMMS_STREAM } from '@/composables/commsStream'
import { useClientsStore } from '@/stores/clients'
import { useTasksStore } from '@/stores/tasks'
import { useAuthStore } from '@/stores/auth'
import { uploadCommsFile, linkAttachment } from '@/lib/commsAttachments'
import type { Attachment } from '@/composables/useChannelStream'

const router = useRouter()
const channels = useChannelsStore()
const clients = useClientsStore()
const tasks = useTasksStore()
const auth = useAuthStore()

const currentChannelId = computed(() => channels.currentChannelId)
// Shared with the floating CommsDock + provided by WorkstationLayout so the
// huddle survives navigation. (Falls back to a local instance if ever rendered
// outside the workstation shell.)
const stream = inject(COMMS_STREAM)!

const canManage = computed(() => auth.isAdmin || auth.role === 'pm')
const commsError = ref<string | null>(null)
const showMicCheck = ref(false)

// ── Channel list ────────────────────────────────────────────────────────────
// Switching the viewed channel re-binds the shared stream, which would drop an
// active huddle (it lives on the channel you joined). Confirm first.
function chooseChannel(id: string) {
  if (id === currentChannelId.value) return
  if (stream.inHuddle.value &&
      !window.confirm(`Leave the huddle in #${channels.currentChannel?.name} to open another channel?`)) {
    return
  }
  channels.select(id)
}

const addingChannel = ref(false)
const newChannelName = ref('')
async function commitAddChannel() {
  const v = newChannelName.value.trim()
  newChannelName.value = ''
  addingChannel.value = false
  if (!v) return
  try {
    await channels.addChannel(v)
  } catch (e) {
    commsError.value = (e as Error).message
  }
}

// ── Composer ────────────────────────────────────────────────────────────────
const draft = ref('')
const pending = ref<Attachment[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const fileAccept = ref('*/*')
const streamEnd = ref<HTMLElement | null>(null)

function scrollToBottom() {
  nextTick(() => streamEnd.value?.scrollIntoView({ block: 'end' }))
}
watch(() => stream.rootMessages.value.length, () => scrollToBottom())
watch(currentChannelId, () => {
  pending.value = []
  draft.value = ''
  scrollToBottom()
})

function pickFiles(accept: string) {
  fileAccept.value = accept
  nextTick(() => fileInput.value?.click())
}
async function onFilesChosen(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  const cid = currentChannelId.value
  if (!cid) return
  for (const f of files) {
    try {
      pending.value = [...pending.value, await uploadCommsFile(cid, f)]
    } catch (err) {
      commsError.value = (err as Error).message
    }
  }
}
// Paste an image straight from the clipboard (e.g. a screenshot) → attach it.
async function onPaste(e: ClipboardEvent) {
  const items = Array.from(e.clipboardData?.items ?? [])
  const imageFiles = items
    .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
    .map((it) => it.getAsFile())
    .filter((f): f is File => !!f)
  if (imageFiles.length === 0) return // plain text paste — let it through
  e.preventDefault()
  const cid = currentChannelId.value
  if (!cid) return
  for (const f of imageFiles) {
    // Screenshots arrive as a generic "image.png" — give them a unique name.
    const file =
      f.name && f.name !== 'image.png'
        ? f
        : new File([f], `screenshot-${Date.now()}.png`, { type: f.type || 'image/png' })
    try {
      pending.value = [...pending.value, await uploadCommsFile(cid, file)]
    } catch (err) {
      commsError.value = (err as Error).message
    }
  }
}

function addLink() {
  const url = window.prompt('Paste a link')
  if (!url) return
  const a = linkAttachment(url)
  if (a) pending.value = [...pending.value, a]
}
function addEmoji(e: string) {
  draft.value += e
}

// Tabbed emoji/GIF picker. Teleported to <body> (the composer column is
// overflow-hidden, which would clip an in-flow popover) and pinned above the
// trigger button via fixed coords. Emoji inserts + keeps it open; GIF sends.
const showPicker = ref(false)
const pickerBtn = ref<HTMLElement | null>(null)
const pickerStyle = ref<Record<string, string>>({})
function positionPicker() {
  const el = pickerBtn.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const W = 320
  const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8))
  pickerStyle.value = { left: `${left}px`, bottom: `${window.innerHeight - r.top + 8}px` }
}
function togglePicker() {
  showPicker.value = !showPicker.value
  if (showPicker.value) nextTick(positionPicker)
}
function onPickerReposition() {
  if (showPicker.value) positionPicker()
}
async function onPickGif(g: Gif) {
  showPicker.value = false
  try {
    await stream.send('', { attachments: [{ kind: 'image', name: 'GIF', url: g.url, mime: 'image/gif' }] })
    scrollToBottom()
  } catch (e) {
    commsError.value = (e as Error).message
  }
}
async function onSend() {
  const body = draft.value
  if (!body.trim() && pending.value.length === 0) return
  const atts = pending.value
  draft.value = ''
  pending.value = []
  try {
    await stream.send(body, { attachments: atts })
    scrollToBottom()
  } catch (e) {
    draft.value = body
    pending.value = atts
    commsError.value = (e as Error).message
  }
}

// ── Thread panel ────────────────────────────────────────────────────────────
const threadParentId = ref<string | null>(null)
const threadDraft = ref('')
const threadParent = computed(() =>
  stream.rootMessages.value.find((m) => m.id === threadParentId.value) ?? null,
)
const threadReplies = computed(() =>
  threadParentId.value ? stream.repliesByParent.value[threadParentId.value] ?? [] : [],
)
async function sendReply() {
  const body = threadDraft.value
  if (!body.trim() || !threadParentId.value) return
  threadDraft.value = ''
  try {
    await stream.send(body, { parentId: threadParentId.value })
  } catch (e) {
    threadDraft.value = body
    commsError.value = (e as Error).message
  }
}
watch(currentChannelId, () => { threadParentId.value = null })

// ── Message → task / linked task ─────────────────────────────────────────────
function linkedTaskFor(id: string | null) {
  if (!id) return null
  return tasks.tasks.find((t) => t.id === id) ?? null
}

// A message is a compact "continuation" when it's from the same author as the
// previous one, within 5 minutes, and neither is pinned/flagged as a decision
// (those keep their own header so the marker shows).
function isContinuation(i: number) {
  const list = stream.rootMessages.value
  const m = list[i]
  const prev = list[i - 1]
  if (!prev || !m) return false
  if (m.is_pinned || m.is_decision || prev.is_pinned || prev.is_decision) return false
  if (prev.user_id !== m.user_id) return false
  return new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000
}
async function makeTask(m: any) {
  try {
    await stream.createTaskFromMessage(m)
  } catch (e) {
    commsError.value = (e as Error).message
  }
}
function openTask(taskId: string) {
  tasks.selectTask(taskId)
  router.push({ name: 'workstation-tasks' })
}

// ── Decisions ─────────────────────────────────────────────────────────────────
async function pinAllToTasks() {
  for (const d of stream.decisions.value) {
    if (!d.linked_task_id) {
      try { await stream.createTaskFromMessage(d) } catch (e) { commsError.value = (e as Error).message }
    }
  }
}

const headerMembers = computed(() => stream.online.value.slice(0, 6))
const firstName = (n: string) => (n || 'Someone').split(' ')[0]
const hostName = computed(() => {
  const h = stream.huddleHost.value
  return h ? stream.huddlePeople.value.find((p) => p.userId === h)?.name?.split(' ')[0] ?? '' : ''
})

// Keyboard shortcut: M toggles mute while in a huddle (ignored while typing).
function onHuddleKey(e: KeyboardEvent) {
  if (!stream.inHuddle.value || e.metaKey || e.ctrlKey || e.altKey) return
  if (e.key.toLowerCase() !== 'm') return
  const el = document.activeElement as HTMLElement | null
  const tag = el?.tagName?.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || el?.isContentEditable) return
  e.preventDefault()
  stream.toggleMute()
}
onMounted(() => {
  window.addEventListener('keydown', onHuddleKey)
  window.addEventListener('resize', onPickerReposition)
  // Viewing the full channel = "seen": suppress new-message pings + clear unread.
  stream.registerViewer()
  if (currentChannelId.value) void channels.markRead(currentChannelId.value)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onHuddleKey)
  window.removeEventListener('resize', onPickerReposition)
  stream.unregisterViewer()
})

// Screen share: show the first active remote screen in a video tile.
const screenVideo = ref<HTMLVideoElement | null>(null)
const activeScreen = computed(() => {
  const entries = Object.entries(stream.remoteScreens.value)
  if (!entries.length) return null
  const [userId, ms] = entries[0]
  const p = stream.online.value.find((o) => o.userId === userId)
  return { userId, name: p?.name ?? 'Someone', stream: ms }
})
watch(activeScreen, (a) => {
  nextTick(() => {
    if (screenVideo.value) screenVideo.value.srcObject = a?.stream ?? null
  })
})
function fullscreenScreen() {
  screenVideo.value?.requestFullscreen?.()
}
</script>

<template>
  <div class="h-full min-h-0 flex gap-3">
    <!-- ── Channel list ── -->
    <aside class="hidden md:flex w-60 shrink-0 flex-col rounded-xl border border-base-300 bg-base-100 shadow-sm overflow-hidden">
      <button class="flex items-center gap-2.5 px-4 py-3 border-b border-base-300 text-left">
        <span class="w-2.5 h-2.5 rounded-full bg-success shrink-0" />
        <span class="flex-1 min-w-0">
          <span class="block font-display text-base font-semibold truncate">{{ clients.currentClient?.name ?? 'Workspace' }}</span>
          <span class="block text-[0.7rem] text-success font-medium">{{ stream.online.value.length }} online</span>
        </span>
        <ChevronDown class="w-4 h-4 text-base-content/40" :stroke-width="1.75" />
      </button>

      <div class="flex-1 overflow-y-auto px-2 py-2">
        <div v-if="channels.pinned.length" class="px-2 pt-2 pb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-base-content/50">Pinned</div>
        <button
          v-for="c in channels.pinned"
          :key="c.id"
          class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left"
          :class="c.id === currentChannelId ? 'bg-primary/10 text-primary font-semibold' : channels.isUnread(c.id) ? 'text-base-content font-semibold hover:bg-base-200' : 'text-base-content/60 hover:bg-base-200'"
          @click="chooseChannel(c.id)"
        >
          <Hash class="w-4 h-4 shrink-0" :stroke-width="2" />
          <span class="flex-1 truncate">{{ c.name }}</span>
          <span v-if="channels.unread[c.id]" class="min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-error text-white text-[0.65rem] font-bold flex items-center justify-center">{{ channels.unread[c.id] }}</span>
        </button>

        <div class="px-2 pt-3 pb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-base-content/50">Channels</div>
        <button
          v-for="c in channels.unpinned"
          :key="c.id"
          class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left"
          :class="c.id === currentChannelId ? 'bg-primary/10 text-primary font-semibold' : channels.isUnread(c.id) ? 'text-base-content font-semibold hover:bg-base-200' : 'text-base-content/60 hover:bg-base-200'"
          @click="chooseChannel(c.id)"
        >
          <Hash class="w-4 h-4 shrink-0" :stroke-width="2" />
          <span class="flex-1 truncate">{{ c.name }}</span>
          <span v-if="channels.unread[c.id]" class="min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-error text-white text-[0.65rem] font-bold flex items-center justify-center">{{ channels.unread[c.id] }}</span>
        </button>

        <form v-if="addingChannel" class="px-1 pt-1" @submit.prevent="commitAddChannel">
          <input
            v-model="newChannelName"
            autofocus
            placeholder="new-channel"
            class="w-full rounded-md border border-primary/40 bg-base-100 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            @blur="commitAddChannel"
            @keydown.esc="addingChannel = false; newChannelName = ''"
          />
        </form>
        <button v-else class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-base-content/50 hover:bg-base-200" @click="addingChannel = true">
          <Plus class="w-4 h-4" :stroke-width="2" /> Add channel
        </button>
      </div>
    </aside>

    <!-- ── Message column ── -->
    <main class="flex-1 min-w-0 flex flex-col rounded-xl border border-base-300 bg-base-100 shadow-sm overflow-hidden">
      <!-- header -->
      <header class="flex items-center gap-3 px-5 py-3 border-b border-base-300">
        <Hash class="w-5 h-5 text-base-content/60" :stroke-width="2" />
        <div class="min-w-0">
          <div class="flex items-baseline gap-2">
            <span class="font-display text-lg font-semibold truncate">{{ channels.currentChannel?.name ?? 'comms' }}</span>
            <span v-if="channels.currentChannel?.topic" class="text-xs text-base-content/50 truncate">{{ channels.currentChannel.topic }}</span>
          </div>
        </div>
        <div class="flex-1" />
        <div class="flex -space-x-1.5">
          <HexAvatar v-for="p in headerMembers" :key="p.userId" :name="p.name" :avatar-url="p.avatarUrl" :color-key="p.userId" :size="26" ring />
        </div>
        <button
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
          :class="stream.inHuddle.value ? 'bg-error/10 text-error' : 'bg-primary text-white'"
          @click="stream.toggleHuddle()"
        >
          <Headphones class="w-4 h-4" :stroke-width="1.75" /> {{ stream.inHuddle.value ? 'Leave' : 'Huddle' }}
        </button>
        <button class="w-8 h-8 rounded-lg hover:bg-base-200 flex items-center justify-center text-base-content/60" title="Mic &amp; sound check" @click="showMicCheck = true"><Settings2 class="w-4 h-4" :stroke-width="1.75" /></button>
        <button class="w-8 h-8 rounded-lg hover:bg-base-200 flex items-center justify-center text-base-content/60" title="Search"><Search class="w-4 h-4" :stroke-width="1.75" /></button>
        <button class="w-8 h-8 rounded-lg hover:bg-base-200 flex items-center justify-center text-base-content/60" title="Members"><Users class="w-4 h-4" :stroke-width="1.75" /></button>
      </header>

      <p v-if="commsError || stream.huddleError.value" class="px-5 py-1.5 text-xs text-error flex items-center gap-2">
        {{ commsError || stream.huddleError.value }}
        <button class="underline" @click="commsError = null; stream.huddleError.value = null">dismiss</button>
      </p>

      <!-- screen share viewer -->
      <div v-if="activeScreen || stream.sharingScreen.value" class="mx-4 mt-2 rounded-xl border border-base-300 overflow-hidden">
        <div class="flex items-center gap-2 px-3 py-1.5 bg-base-200/60 text-xs">
          <MonitorUp class="w-3.5 h-3.5 text-primary" :stroke-width="1.75" />
          <span class="font-medium">
            <template v-if="activeScreen">{{ firstName(activeScreen.name) }} is sharing their screen</template>
            <template v-else>You're sharing your screen</template>
          </span>
          <div class="flex-1" />
          <button v-if="activeScreen" class="inline-flex items-center gap-1 text-base-content/60 hover:text-primary font-medium" title="Fullscreen" @click="fullscreenScreen">
            <Maximize2 class="w-3.5 h-3.5" :stroke-width="1.75" /> Fullscreen
          </button>
          <button v-if="stream.sharingScreen.value" class="text-error font-medium" @click="stream.toggleScreenShare()">Stop sharing</button>
        </div>
        <video v-if="activeScreen" ref="screenVideo" autoplay playsinline muted class="w-full max-h-[65vh] bg-black object-contain" />
        <div v-else class="px-3 py-5 text-center text-xs text-base-content/50">Your screen is visible to everyone in the huddle.</div>
      </div>

      <!-- stream -->
      <div class="flex-1 min-h-0 overflow-y-auto py-2">
        <!-- Decisions & action items -->
        <div v-if="stream.decisions.value.length" class="mx-4 my-2 rounded-xl border border-primary/30 bg-primary/5 overflow-hidden">
          <div class="flex items-center gap-2 px-4 py-2">
            <Sparkles class="w-4 h-4 text-primary" :stroke-width="1.75" />
            <span class="text-xs font-bold uppercase tracking-wider text-primary">Decisions & action items</span>
            <div class="flex-1" />
            <button class="text-xs font-medium text-primary" @click="pinAllToTasks">Pin all to Tasks →</button>
          </div>
          <div class="flex flex-wrap gap-2 px-3 pb-3">
            <div v-for="d in stream.decisions.value" :key="d.id" class="flex items-center gap-2 rounded-lg border border-base-300 bg-base-100 px-3 py-1.5 text-xs">
              <button
                class="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                :class="d.decision_done ? 'bg-success border-success' : 'border-base-300'"
                @click="stream.toggleDecisionDone(d)"
              >
                <svg v-if="d.decision_done" width="9" height="9" viewBox="0 0 12 12"><path d="M2.5 6.5L5 9l4.5-5" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <span :class="d.decision_done ? 'line-through text-base-content/40' : 'text-base-content'">{{ d.body || 'Decision' }}</span>
            </div>
          </div>
        </div>

        <CommsMessage
          v-for="(m, i) in stream.rootMessages.value"
          :key="m.id"
          :message="m"
          :continuation="isContinuation(i)"
          :reactions="stream.reactionList(m.id)"
          :reply-count="(stream.repliesByParent.value[m.id] ?? []).length"
          :last-reply-at="(stream.repliesByParent.value[m.id] ?? []).at(-1)?.created_at"
          :linked-task="linkedTaskFor(m.linked_task_id)"
          :can-manage="canManage"
          @react="(e) => stream.toggleReaction(m.id, e)"
          @open-thread="threadParentId = m.id"
          @make-task="makeTask(m)"
          @toggle-pin="stream.togglePin(m)"
          @mark-decision="stream.markDecision(m)"
          @open-task="openTask"
        />
        <div v-if="!stream.loading.value && stream.rootMessages.value.length === 0" class="px-5 py-10 text-center text-sm text-base-content/40">
          No messages yet — say hello 🐝
        </div>
        <div ref="streamEnd" />
      </div>

      <!-- huddle bar -->
      <div
        v-if="stream.inHuddle.value || stream.huddlePeople.value.length"
        class="mx-4 mb-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2"
      >
        <div class="flex items-center gap-3">
          <span class="relative flex h-2.5 w-2.5 shrink-0">
            <span class="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 animate-ping" />
            <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
          </span>
          <div class="leading-tight shrink-0">
            <div class="text-xs font-semibold">Huddle</div>
            <div class="text-[0.65rem] text-base-content/50">
              in #{{ channels.currentChannel?.name }}<template v-if="hostName"> · hosted by {{ hostName }}</template>
            </div>
          </div>

          <!-- participants -->
          <div class="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0 py-0.5">
            <span
              v-for="p in stream.huddlePeople.value"
              :key="p.userId"
              class="inline-flex items-center gap-1.5 rounded-full border bg-base-100 pl-0.5 pr-2 py-0.5 shrink-0 transition-colors"
              :class="stream.speaking.value.has(p.userId) ? 'border-success ring-1 ring-success/40' : 'border-base-300'"
              :title="p.name + (p.muted ? ' (muted)' : '')"
            >
              <span class="relative inline-flex">
                <HexAvatar :name="p.name" :avatar-url="p.avatarUrl" :color-key="p.userId" :size="22" />
                <span v-if="p.muted" class="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-error flex items-center justify-center ring-1 ring-base-100">
                  <MicOff class="w-2 h-2 text-white" :stroke-width="2.5" />
                </span>
              </span>
              <span class="text-xs font-medium">{{ firstName(p.name) }}</span>
              <Crown v-if="p.userId === stream.huddleHost.value" class="w-3 h-3 text-warning shrink-0" :stroke-width="2" />
            </span>
          </div>

          <!-- controls -->
          <template v-if="stream.inHuddle.value">
            <button class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" :class="stream.muted.value ? 'bg-error/15 text-error' : 'bg-base-200 text-base-content/70'" :title="stream.muted.value ? 'Unmute (M)' : 'Mute (M)'" @click="stream.toggleMute()">
              <component :is="stream.muted.value ? MicOff : Mic" class="w-4 h-4" :stroke-width="1.75" />
            </button>
            <button
              class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              :class="stream.noiseSuppression.value ? 'bg-primary/15 text-primary' : 'bg-base-200 text-base-content/70'"
              :title="stream.noiseSuppression.value
                ? (stream.rnnoiseActive.value ? 'AI noise cancellation: on' : 'Noise cancellation: on')
                : 'Noise cancellation: off'"
              @click="stream.toggleNoise()"
            ><Wand2 class="w-4 h-4" :stroke-width="1.75" /></button>
            <button
              class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              :class="stream.soundMuted.value ? 'bg-base-200 text-base-content/40' : 'bg-base-200 text-base-content/70'"
              :title="stream.soundMuted.value ? 'Sounds off — join/share chimes muted' : 'Sounds on — join/share chimes'"
              @click="stream.toggleSounds()"
            ><component :is="stream.soundMuted.value ? BellOff : Bell" class="w-4 h-4" :stroke-width="1.75" /></button>
            <button class="w-9 h-9 rounded-lg bg-base-200 text-base-content/70 flex items-center justify-center shrink-0" title="Mic &amp; sound" @click="showMicCheck = true"><Settings2 class="w-4 h-4" :stroke-width="1.75" /></button>
            <button
              class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              :class="stream.sharingScreen.value ? 'bg-primary/15 text-primary' : 'bg-base-200 text-base-content/70'"
              :title="stream.sharingScreen.value ? 'Stop sharing screen' : 'Share screen'"
              @click="stream.toggleScreenShare()"
            ><MonitorUp class="w-4 h-4" :stroke-width="1.75" /></button>
            <button class="w-9 h-9 rounded-lg bg-error text-white flex items-center justify-center shrink-0" title="Leave" @click="stream.toggleHuddle()"><PhoneOff class="w-4 h-4" :stroke-width="1.75" /></button>
          </template>
          <button v-else class="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold shrink-0" @click="stream.toggleHuddle()">Join</button>
        </div>

        <!-- shortcut hint -->
        <div v-if="stream.inHuddle.value" class="mt-1.5 pl-6 flex items-center gap-2 text-[0.65rem] text-base-content/40">
          <span>Press <kbd class="px-1 py-px rounded bg-base-200 font-mono text-base-content/60">M</kbd> to {{ stream.muted.value ? 'unmute' : 'mute' }}</span>
          <span v-if="stream.noiseSuppression.value" class="inline-flex items-center gap-1 text-primary/70 font-medium">
            <Wand2 class="w-3 h-3" :stroke-width="2" /> {{ stream.rnnoiseActive.value ? 'AI noise cancellation on' : 'Noise cancellation on' }}
          </span>
        </div>
      </div>

      <!-- composer -->
      <div class="px-4 pb-4">
        <div class="rounded-2xl border border-base-300 bg-base-100 shadow-sm overflow-hidden">
          <div v-if="pending.length" class="flex flex-wrap gap-2 px-3 pt-3">
            <span v-for="(a, i) in pending" :key="i" class="inline-flex items-center gap-1.5 rounded-lg bg-base-200 px-2 py-1 text-xs">
              <component :is="a.kind === 'image' ? ImageIcon : a.kind === 'link' ? Link2 : Paperclip" class="w-3.5 h-3.5 text-base-content/60" />
              <span class="max-w-[10rem] truncate">{{ a.name }}</span>
              <button class="text-base-content/40 hover:text-error" @click="pending.splice(i, 1)"><X class="w-3 h-3" /></button>
            </span>
          </div>
          <textarea
            v-model="draft"
            rows="1"
            :placeholder="`Message #${channels.currentChannel?.name ?? ''}`"
            class="w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm outline-none leading-relaxed min-h-0"
            @keydown.enter.exact.prevent="onSend"
            @paste="onPaste"
          />
          <div class="flex items-center gap-1 px-2 pb-2">
            <button class="w-8 h-8 rounded-lg hover:bg-base-200 flex items-center justify-center text-base-content/50" title="Attach file" @click="pickFiles('*/*')"><Paperclip class="w-4 h-4" :stroke-width="1.75" /></button>
            <button class="w-8 h-8 rounded-lg hover:bg-base-200 flex items-center justify-center text-base-content/50" title="Image" @click="pickFiles('image/*')"><ImageIcon class="w-4 h-4" :stroke-width="1.75" /></button>
            <button class="w-8 h-8 rounded-lg hover:bg-base-200 flex items-center justify-center text-base-content/50" title="Link" @click="addLink"><Link2 class="w-4 h-4" :stroke-width="1.75" /></button>
            <button ref="pickerBtn" class="w-8 h-8 rounded-lg hover:bg-base-200 flex items-center justify-center" :class="showPicker ? 'bg-base-200 text-primary' : 'text-base-content/50'" title="Emoji & GIFs" @click="togglePicker"><Smile class="w-4 h-4" :stroke-width="1.75" /></button>
            <button class="w-8 h-8 rounded-lg hover:bg-base-200 flex items-center justify-center text-base-content/50" title="Mention"><AtSign class="w-4 h-4" :stroke-width="1.75" /></button>
            <div class="flex-1" />
            <button
              class="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center disabled:opacity-40"
              :disabled="stream.sending.value || (!draft.trim() && pending.length === 0)"
              @click="onSend"
            >
              <Send class="w-4 h-4" :stroke-width="2" />
            </button>
          </div>
        </div>
      </div>

      <input ref="fileInput" type="file" multiple :accept="fileAccept" class="hidden" @change="onFilesChosen" />
    </main>

    <!-- ── Thread panel ── -->
    <aside v-if="threadParent" class="hidden lg:flex w-80 shrink-0 flex-col rounded-xl border border-base-300 bg-base-100 shadow-sm overflow-hidden">
      <div class="flex items-center gap-2 px-4 py-3 border-b border-base-300">
        <CheckSquare class="w-4 h-4 text-base-content/60" :stroke-width="1.75" />
        <span class="text-sm font-semibold">Thread</span>
        <span class="text-xs text-base-content/40">· #{{ channels.currentChannel?.name }}</span>
        <div class="flex-1" />
        <button class="w-7 h-7 rounded-md hover:bg-base-200 flex items-center justify-center text-base-content/50" @click="threadParentId = null"><X class="w-4 h-4" :stroke-width="1.75" /></button>
      </div>
      <div class="flex-1 min-h-0 overflow-y-auto py-2">
        <CommsMessage
          :message="threadParent!"
          :reactions="stream.reactionList(threadParent!.id)"
          :reply-count="0"
          :linked-task="linkedTaskFor(threadParent!.linked_task_id)"
          @react="(e) => stream.toggleReaction(threadParent!.id, e)"
          @make-task="makeTask(threadParent!)"
          @toggle-pin="stream.togglePin(threadParent!)"
          @open-task="openTask"
        />
        <div class="flex items-center gap-3 px-4 py-1 text-[0.7rem] text-base-content/40">
          <span class="flex-1 h-px bg-base-300" />{{ threadReplies.length }} {{ threadReplies.length === 1 ? 'reply' : 'replies' }}<span class="flex-1 h-px bg-base-300" />
        </div>
        <CommsMessage
          v-for="r in threadReplies"
          :key="r.id"
          :message="r"
          :reactions="stream.reactionList(r.id)"
          :reply-count="0"
          @react="(e) => stream.toggleReaction(r.id, e)"
          @make-task="makeTask(r)"
          @toggle-pin="stream.togglePin(r)"
          @open-task="openTask"
        />
      </div>
      <div class="px-3 pb-3">
        <div class="flex items-center gap-2 rounded-xl border border-base-300 px-3 py-2">
          <input
            v-model="threadDraft"
            placeholder="Reply…"
            class="flex-1 bg-transparent text-sm outline-none"
            @keydown.enter.prevent="sendReply"
          />
          <button class="w-7 h-7 rounded-lg bg-primary text-white flex items-center justify-center" @click="sendReply"><Send class="w-3.5 h-3.5" :stroke-width="2" /></button>
        </div>
      </div>
    </aside>

    <MicCheck v-if="showMicCheck" @close="showMicCheck = false" />

    <!-- Emoji/GIF picker — teleported out of the overflow-hidden composer column -->
    <Teleport to="body">
      <template v-if="showPicker">
        <div class="fixed inset-0 z-[55]" @click="showPicker = false" />
        <div class="fixed z-[60]" :style="pickerStyle">
          <MediaPicker @emoji="addEmoji" @gif="onPickGif" @close="showPicker = false" />
        </div>
      </template>
    </Teleport>
  </div>
</template>
