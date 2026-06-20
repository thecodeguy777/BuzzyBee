<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import {
  Mic, MicOff, Video, VideoOff, MonitorUp, MonitorOff, PhoneOff, Wand2, Copy, Check, Crown, Users, Loader2,
  Maximize2, X, Hand, Smile, MessageSquare, UserPlus, Send, Clock,
} from 'lucide-vue-next'
import HexAvatar from '@/components/shared/HexAvatar.vue'
import MeetingVideo from '@/components/shared/MeetingVideo.vue'
import hivemindMark from '@/assets/landing/hivemind-mark-dark.svg'
import { useAuthStore } from '@/stores/auth'
import { useMeetingRoom, type Participant } from '@/composables/useMeetingRoom'
import { useMediaPermissions } from '@/composables/useMediaPermissions'
import MediaPermissionNotice from '@/components/shared/MediaPermissionNotice.vue'

// Meeting room, rebuilt to the Claude Design handoff (Meeting.html): dark
// stage, adaptive tile grid, presenting layout with filmstrip, People/Chat
// side panel, round control bar, flying reactions. Camera is opt-in (off by
// default) — tiles fall back to avatars until someone turns it on. The
// prototype's REC pill stays absent: recording doesn't exist yet.

const props = defineProps<{ token: string }>()
const auth = useAuthStore()
const room = useMeetingRoom()

// Check mic + camera permissions the moment the link loads, so we can guide
// people to unblock them before they try to join.
const perms = useMediaPermissions()
const permsBlocked = computed(() => perms.mic.value === 'denied' || perms.cam.value === 'denied')

const GUEST_NAME_KEY = 'buzzybee.meet.guest-name'
const guestName = ref(window.localStorage.getItem(GUEST_NAME_KEY) ?? '')
const needsName = ref(false)
const peeking = ref(false)
const invalidRoom = ref(false)
const left = ref(false)
const copied = ref(false)

onMounted(async () => {
  // Wait for session restore so a logged-in member isn't mistaken for a guest.
  if (!auth.ready) {
    await new Promise<void>((res) => {
      const stop = watch(
        () => auth.ready,
        (r) => { if (r) { stop(); res() } },
        { immediate: true },
      )
    })
  }
  if (auth.user) {
    await room.join(props.token)
  } else {
    // Guests get the portal: resolve the room first so the landing shows the
    // real meeting title (and dead links fail before anyone types a name).
    peeking.value = true
    const meta = await room.peek(props.token)
    peeking.value = false
    if (!meta) invalidRoom.value = true
    else if (!meta.valid) invalidRoom.value = true
    else needsName.value = true
  }
})

async function joinAsGuest() {
  if (!guestName.value.trim()) return
  window.localStorage.setItem(GUEST_NAME_KEY, guestName.value.trim())
  stopMicPreview()
  needsName.value = false
  await room.join(props.token, guestName.value)
}

// ── Green-room mic check ──────────────────────────────────────────────────────
// Pre-join level meter so guests join *knowing* their mic works. The preview
// stream is released before join; the room re-acquires without a second prompt.
const micPreviewOn = ref(false)
const micLevel = ref(0)
const micError = ref(false)
let previewStream: MediaStream | null = null
let previewCtx: AudioContext | null = null
let previewRaf = 0

async function toggleMicPreview() {
  if (micPreviewOn.value) {
    stopMicPreview()
    return
  }
  micError.value = false
  try {
    previewStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  } catch {
    micError.value = true
    return
  }
  micPreviewOn.value = true
  const AC = window.AudioContext || (window as any).webkitAudioContext
  previewCtx = new AC()
  const src = previewCtx!.createMediaStreamSource(previewStream)
  const an = previewCtx!.createAnalyser()
  an.fftSize = 512
  src.connect(an)
  const buf = new Uint8Array(an.fftSize)
  const tick = () => {
    previewRaf = requestAnimationFrame(tick)
    an.getByteTimeDomainData(buf)
    let sum = 0
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128
      sum += v * v
    }
    // RMS → perceptual-ish 0..1 with a little gain so speech fills the meter.
    micLevel.value = Math.min(1, Math.sqrt(sum / buf.length) * 4)
  }
  tick()
}
function stopMicPreview() {
  cancelAnimationFrame(previewRaf)
  previewRaf = 0
  previewStream?.getTracks().forEach((t) => t.stop())
  previewStream = null
  void previewCtx?.close().catch(() => {})
  previewCtx = null
  micPreviewOn.value = false
  micLevel.value = 0
}
onBeforeUnmount(stopMicPreview)
function leaveRoom() {
  void room.leave()
  left.value = true
}
function copyLink() {
  navigator.clipboard?.writeText(window.location.href).then(() => {
    copied.value = true
    window.setTimeout(() => (copied.value = false), 1500)
  })
}

const roomTitle = computed(() => room.room.value?.title || 'Meeting')

// ── Call timer (since I joined) ───────────────────────────────────────────────
const elapsed = ref(0)
let timer: ReturnType<typeof setInterval> | undefined
watch(
  () => room.status.value,
  (s) => {
    if (s === 'live' && !timer) timer = setInterval(() => elapsed.value++, 1000)
    if (s !== 'live' && timer) { clearInterval(timer); timer = undefined }
  },
)
onBeforeUnmount(() => clearInterval(timer))
const mmss = computed(() => {
  const m = Math.floor(elapsed.value / 60)
  const s = elapsed.value % 60
  const mm = m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` : String(m).padStart(2, '0')
  return `${mm}:${String(s).padStart(2, '0')}`
})

// ── Stage layout ──────────────────────────────────────────────────────────────
// Meet-style: the grid always fits the stage — tiles shrink as people join,
// nothing scrolls. Rows are derived so cols × rows covers everyone.
const gridCols = computed(() => {
  const n = room.admittedPeople.value.length
  if (n <= 1) return 1
  if (n <= 4) return 2
  if (n <= 9) return 3
  return 4
})
const gridRows = computed(() => Math.max(1, Math.ceil(room.admittedPeople.value.length / gridCols.value)))

// Screen share viewer (first active remote screen).
const screenVideo = ref<HTMLVideoElement | null>(null)
const activeScreen = computed(() => {
  const entries = Object.entries(room.remoteScreens.value)
  if (!entries.length) return null
  const [uid, ms] = entries[0]
  const p = room.online.value.find((o) => o.userId === uid)
  return { uid, name: p?.name ?? 'Someone', stream: ms }
})
const presenting = computed(() => !!activeScreen.value || room.sharingScreen.value)
const presenterName = computed(() =>
  activeScreen.value ? activeScreen.value.name : 'You',
)
// Remote share wins; otherwise show my own share back to me, so the presenter
// can confirm what the room is actually seeing.
const stageStream = computed(
  () => activeScreen.value?.stream ?? (room.sharingScreen.value ? room.localScreen.value : null),
)
watch(stageStream, () => {
  nextTick(() => {
    if (screenVideo.value) screenVideo.value.srcObject = stageStream.value
  })
})
function fullscreenScreen() {
  screenVideo.value?.requestFullscreen?.()
}

// ── Side panel + reactions ────────────────────────────────────────────────────
const panel = ref<'people' | 'chat' | null>(null)
function togglePanel(p: 'people' | 'chat') {
  panel.value = panel.value === p ? null : p
}
const chatDraft = ref('')
const chatScroller = ref<HTMLElement | null>(null)
function sendChatMsg() {
  room.sendChat(chatDraft.value)
  chatDraft.value = ''
}
watch(
  () => room.chat.value.length,
  () => nextTick(() => {
    if (chatScroller.value) chatScroller.value.scrollTop = chatScroller.value.scrollHeight
  }),
)
const unseenChat = ref(0)
watch(
  () => room.chat.value.length,
  (n, old) => { if (panel.value !== 'chat' && n > (old ?? 0)) unseenChat.value++ },
)
watch(panel, (p) => { if (p === 'chat') unseenChat.value = 0 })

const reactOpen = ref(false)
const REACTIONS = ['👍', '❤️', '😂', '🎉', '👏', '🙌', '🔥']
function react(emoji: string) {
  room.sendReaction(emoji)
  reactOpen.value = false
}

function chatTime(at: number) {
  return new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
const isYou = (p: Participant) => p.userId === room.myId.value

// A participant's live camera stream, or null (→ tile falls back to avatar).
function camStream(p: Participant): MediaStream | null {
  if (p.userId === room.myId.value) return room.cameraOn.value ? room.localCamera.value : null
  return room.remoteCameras.value[p.userId] ?? null
}
</script>

<template>
  <!-- w-full (not w-screen: that includes the scrollbar and overflows
       horizontally) and dvh (vh overflows under mobile URL bars). The whole
       surface — portal included — lives on the dark stage. -->
  <div class="mtg h-screen h-[100dvh] w-full overflow-hidden flex flex-col">
    <!-- ── Guest portal: name + mic check ── -->
    <div v-if="needsName" class="flex-1 flex items-center justify-center p-4">
      <div class="mtg-card w-full max-w-md">
        <div class="flex items-center gap-2 mb-6">
          <img :src="hivemindMark" alt="" class="w-5 h-auto" />
          <span class="font-display text-sm font-semibold tracking-wide" style="color: var(--mtg-fg-2)">HiveMind Meet</span>
        </div>
        <p class="text-[0.7rem] font-bold uppercase tracking-widest mb-1.5" style="color: #d3a3d8">You're invited to</p>
        <h1 class="font-display text-2xl font-bold mb-6">{{ roomTitle }}</h1>

        <label class="block mb-4">
          <span class="block text-xs font-semibold mb-1.5" style="color: var(--mtg-fg-2)">Your name</span>
          <input
            v-model="guestName"
            autofocus
            placeholder="Maria Santos"
            class="mtg-input"
            @keydown.enter="joinAsGuest"
          />
        </label>

        <!-- mic check -->
        <div class="rounded-xl border px-3.5 py-3 mb-5" style="border-color: var(--mtg-border); background: var(--tile)">
          <div class="flex items-center gap-3">
            <button
              type="button"
              class="mtg-ctrlbtn !w-10 !h-10"
              :class="micPreviewOn ? 'active' : ''"
              :title="micPreviewOn ? 'Stop mic check' : 'Test your mic'"
              @click="toggleMicPreview"
            >
              <Mic class="w-[18px] h-[18px]" :stroke-width="1.75" />
            </button>
            <div class="flex-1 min-w-0">
              <div class="text-[13px] font-semibold">{{ micPreviewOn ? 'Say something…' : 'Test your mic' }}</div>
              <div class="mt-1.5 h-1.5 rounded-full overflow-hidden" style="background: rgba(255, 255, 255, 0.08)">
                <div
                  class="h-full rounded-full transition-[width] duration-75"
                  :style="{ width: micLevel * 100 + '%', background: micLevel > 0.05 ? '#2bb673' : 'transparent' }"
                />
              </div>
            </div>
          </div>
          <p v-if="micError" class="text-[11.5px] mt-2" style="color: #ff8a9b">
            Mic access was blocked — allow it in your browser, or join muted and fix it after.
          </p>
        </div>

        <!-- permission readiness, checked on load -->
        <MediaPermissionNotice
          :mic="perms.mic.value"
          :cam="perms.cam.value"
          class="mb-5"
          @recheck="perms.refresh"
        />

        <button class="mtg-join" :disabled="!guestName.trim()" @click="joinAsGuest">
          Join meeting
        </button>
      </div>
    </div>

    <!-- ── Left / ended / denied / error / dead link ── -->
    <div v-else-if="left || invalidRoom || room.status.value === 'ended' || room.status.value === 'denied' || room.status.value === 'error'" class="flex-1 flex items-center justify-center p-4">
      <div class="mtg-card w-full max-w-sm text-center">
        <p class="font-display text-lg font-bold mb-1">
          <template v-if="left">You left the meeting</template>
          <template v-else-if="room.status.value === 'denied'">Not admitted</template>
          <template v-else-if="room.status.value === 'error'">Can't join</template>
          <template v-else>This meeting has ended</template>
        </p>
        <p class="text-sm mb-5" style="color: var(--mtg-fg-2)">
          <template v-if="room.status.value === 'denied'">The host didn't let you in.</template>
          <template v-else-if="room.status.value === 'error'">{{ room.error.value || 'Something went wrong.' }}</template>
          <template v-else-if="left">You can rejoin if it's still active.</template>
          <template v-else-if="invalidRoom">This link is no longer active — ask for a fresh one.</template>
          <template v-else>Thanks for joining.</template>
        </p>
        <div class="flex gap-2 justify-center">
          <button v-if="left" class="mtg-join !w-auto px-6" @click="left = false; room.join(props.token, guestName)">Rejoin</button>
          <a v-if="auth.user" class="mtg-pillbtn" href="/app">Go to workstation</a>
        </div>
      </div>
    </div>

    <!-- ── Joining / resolving ── -->
    <div v-else-if="peeking || room.status.value === 'joining' || room.status.value === 'idle'" class="flex-1 flex items-center justify-center">
      <Loader2 class="w-6 h-6 animate-spin" style="color: var(--mtg-fg-3)" />
    </div>

    <!-- ── Lobby ── -->
    <div v-else-if="room.status.value === 'lobby'" class="flex-1 flex items-center justify-center p-4">
      <div class="mtg-card w-full max-w-sm text-center">
        <span class="mtg-lobby-pulse mx-auto mb-4">
          <HexAvatar :name="guestName || 'You'" :size="56" />
        </span>
        <p class="font-display text-lg font-bold mb-1">Asking to join…</p>
        <p class="text-sm mb-5" style="color: var(--mtg-fg-2)">
          Someone in <span class="font-semibold" style="color: var(--mtg-fg)">{{ roomTitle }}</span> will let you in shortly.
        </p>
        <button class="mtg-pillbtn mx-auto" @click="leaveRoom">Cancel</button>
      </div>
    </div>

    <!-- ── Live: the dark stage ── -->
    <div v-else-if="room.status.value === 'live'" class="flex-1 min-h-0 flex flex-col">
      <!-- header -->
      <div class="mtg-header">
        <div class="min-w-0">
          <div class="flex items-center gap-2.5">
            <span class="text-[15.5px] font-bold truncate">{{ roomTitle }}</span>
          </div>
          <div class="text-xs flex items-center gap-2" style="color: var(--mtg-fg-2)">
            <span>{{ room.admittedPeople.value.length }} in call</span>
            <span class="w-[3px] h-[3px] rounded-full" style="background: var(--mtg-fg-3)" />
            <span class="tabular-nums">{{ mmss }}</span>
          </div>
        </div>
        <div class="flex-1" />
        <!-- stacked avatars -->
        <div class="hidden sm:flex items-center mr-1">
          <span
            v-for="(p, i) in room.admittedPeople.value.slice(0, 4)"
            :key="p.userId"
            :style="{ marginLeft: i ? '-8px' : '0' }"
          >
            <HexAvatar :name="p.name" :color-key="p.userId" :size="28" />
          </span>
        </div>
        <button class="mtg-pillbtn" @click="copyLink">
          <component :is="copied ? Check : Copy" class="w-4 h-4" :stroke-width="1.75" />
          {{ copied ? 'Copied' : 'Copy link' }}
        </button>
      </div>

      <!-- permission banner — only when blocked (an actionable reset is needed) -->
      <div v-if="permsBlocked" class="flex-none px-4 pt-3">
        <MediaPermissionNotice :mic="perms.mic.value" :cam="perms.cam.value" @recheck="perms.refresh" />
      </div>

      <!-- body -->
      <div class="flex-1 flex min-h-0 relative">
        <!-- PRESENTING layout: big share + filmstrip -->
        <div v-if="presenting" class="flex-1 min-w-0 flex flex-col gap-3 px-4 py-3.5">
          <div class="flex-1 relative rounded-2xl overflow-hidden min-h-0 border" style="border-color: var(--mtg-border); background: #0e0c14">
            <video
              v-if="stageStream"
              ref="screenVideo"
              autoplay
              playsinline
              muted
              class="absolute inset-0 w-full h-full object-contain"
            />
            <div v-else class="absolute inset-0 grid place-items-center">
              <div class="text-center" style="color: var(--mtg-fg-2)">
                <span class="w-[84px] h-[84px] rounded-[22px] grid place-items-center mx-auto mb-4" style="background: rgba(138, 58, 147, 0.26); color: #fff">
                  <MonitorUp class="w-10 h-10" :stroke-width="1.5" />
                </span>
                <div class="text-[17px] font-bold" style="color: var(--mtg-fg)">Your screen</div>
                <div class="text-[13px] mt-1.5">Live to everyone in the call</div>
              </div>
            </div>
            <!-- presenting banner -->
            <div class="absolute left-3.5 top-3.5 inline-flex items-center gap-2 px-3 py-[7px] rounded-[10px] text-[13px] font-bold text-white shadow-lg" style="background: rgba(43, 182, 115, 0.92)">
              <span class="w-2 h-2 rounded-full bg-white" />{{ presenterName }} {{ activeScreen ? 'is presenting' : 'are presenting' }}
            </div>
            <div v-if="stageStream" class="absolute right-3.5 top-3.5">
              <button class="mtg-ctrlbtn !w-[38px] !h-[38px]" style="background: rgba(15, 12, 20, 0.6)" title="Fullscreen" @click="fullscreenScreen">
                <Maximize2 class="w-[17px] h-[17px]" :stroke-width="1.75" />
              </button>
            </div>
          </div>
          <!-- filmstrip -->
          <div class="flex gap-2.5 h-24 flex-none overflow-x-auto">
            <div v-for="p in room.admittedPeople.value" :key="p.userId" class="w-[150px] flex-none">
              <div class="mtg-tile h-full" :class="room.speaking.value.has(p.userId) ? 'speaking' : ''">
                <MeetingVideo v-if="camStream(p)" :stream="camStream(p)" :mirror="isYou(p)" class="absolute inset-0" />
                <HexAvatar v-else :name="p.name" :color-key="p.userId" :size="44" />
                <span class="mtg-ring" />
                <span class="mtg-chip left-2 bottom-2 !text-[11px]">
                  <MicOff v-if="p.muted" class="w-3 h-3" style="color: #ff8a9b" :stroke-width="2" />
                  {{ p.name }}{{ isYou(p) ? ' (you)' : '' }}
                </span>
                <span v-if="p.hand" class="mtg-chip right-2 top-2 !p-1" style="background: rgba(217, 165, 49, 0.92)">
                  <Hand class="w-3 h-3" :stroke-width="2" />
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- GRID layout — always fits the viewport; tiles shrink, never scroll -->
        <div
          v-else
          class="flex-1 min-w-0 min-h-0 grid gap-3 p-4"
          :style="{
            gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${gridRows}, minmax(0, 1fr))`,
          }"
        >
          <div v-for="p in room.admittedPeople.value" :key="p.userId" class="min-h-0 min-w-0">
            <div class="mtg-tile w-full h-full" :class="room.speaking.value.has(p.userId) ? 'speaking' : ''">
              <MeetingVideo v-if="camStream(p)" :stream="camStream(p)" :mirror="isYou(p)" class="absolute inset-0" />
              <HexAvatar v-else :name="p.name" :color-key="p.userId" :size="72" />
              <span class="mtg-ring" />
              <span class="mtg-chip left-2.5 bottom-2.5">
                <MicOff v-if="p.muted" class="w-3.5 h-3.5" style="color: #ff8a9b" :stroke-width="2" />
                {{ p.name }}{{ isYou(p) ? ' (you)' : '' }}
                <Crown v-if="p.role === 'host'" class="w-[13px] h-[13px]" style="color: #e6c85a" :stroke-width="2" />
              </span>
              <span v-if="p.hand" class="mtg-chip right-2.5 top-2.5" style="background: rgba(217, 165, 49, 0.92)">
                <Hand class="w-[15px] h-[15px]" :stroke-width="2" />
              </span>
            </div>
          </div>
        </div>

        <!-- side panel -->
        <div v-if="panel" class="mtg-side">
          <div class="h-14 flex-none flex items-center gap-2 pl-[18px] pr-3.5 border-b" style="border-color: var(--mtg-border)">
            <span class="text-[15px] font-bold">
              {{ panel === 'people' ? `People · ${room.admittedPeople.value.length}` : 'In-call messages' }}
            </span>
            <div class="flex-1" />
            <button class="mtg-ctrlbtn !w-8 !h-8" style="background: rgba(255, 255, 255, 0.08)" @click="panel = null">
              <X class="w-4 h-4" :stroke-width="2" />
            </button>
          </div>

          <!-- People -->
          <div v-if="panel === 'people'" class="flex-1 overflow-y-auto px-3 py-2.5">
            <button class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] font-semibold text-[13.5px] mb-2 whitespace-nowrap" style="color: #d3a3d8; background: rgba(138, 58, 147, 0.14)" @click="copyLink">
              <UserPlus class="w-[17px] h-[17px]" :stroke-width="1.75" />
              {{ copied ? 'Link copied — send it' : 'Add people' }}
            </button>

            <!-- waiting room, folded into People -->
            <template v-if="room.canAdmit.value && room.waiting.value.length">
              <div class="px-2 pt-2 pb-1 text-[0.65rem] font-bold uppercase tracking-wider" style="color: var(--mtg-fg-3)">Waiting to join</div>
              <div v-for="p in room.waiting.value" :key="p.userId" class="flex items-center gap-2.5 px-2.5 py-2 rounded-[10px]">
                <HexAvatar :name="p.name" :color-key="p.userId" :size="34" />
                <span class="flex-1 min-w-0 text-[13.5px] font-semibold truncate">{{ p.name }}</span>
                <button class="px-2.5 h-7 rounded-lg text-xs font-bold text-white" style="background: #8a3a93" @click="room.admit(p.userId)">Admit</button>
                <button class="px-2 h-7 rounded-lg text-xs font-semibold" style="color: var(--mtg-fg-2)" @click="room.deny(p.userId)">Deny</button>
              </div>
              <div class="my-2 border-t" style="border-color: var(--mtg-border)" />
            </template>

            <div v-for="p in room.admittedPeople.value" :key="p.userId" class="flex items-center gap-[11px] px-2.5 py-2 rounded-[10px]">
              <HexAvatar :name="p.name" :color-key="p.userId" :size="34" />
              <div class="flex-1 min-w-0">
                <div class="text-[13.5px] font-semibold truncate">
                  {{ p.name }}{{ isYou(p) ? ' (you)' : '' }}
                  <span v-if="p.role === 'host'" class="text-[11px] font-semibold" style="color: var(--mtg-fg-3)"> · Host</span>
                </div>
              </div>
              <Hand v-if="p.hand" class="w-4 h-4" style="color: #e6c85a" :stroke-width="2" />
              <component :is="p.muted ? MicOff : Mic" class="w-4 h-4" :style="{ color: p.muted ? '#ff8a9b' : 'var(--mtg-fg-2)' }" :stroke-width="1.75" />
            </div>
          </div>

          <!-- Chat -->
          <template v-else>
            <div ref="chatScroller" class="flex-1 overflow-y-auto px-4 py-3.5 flex flex-col gap-3.5">
              <p v-if="!room.chat.value.length" class="text-center text-xs py-6" style="color: var(--mtg-fg-3)">
                Messages here are only visible during the call.
              </p>
              <div v-for="(m, i) in room.chat.value" :key="i">
                <div class="flex items-baseline gap-[7px] mb-[3px]">
                  <span class="text-[12.5px] font-bold" :style="{ color: m.from === room.myId.value ? '#5ec8a0' : 'var(--mtg-fg)' }">
                    {{ m.from === room.myId.value ? `${m.name} (you)` : m.name }}
                  </span>
                  <span class="text-[11px]" style="color: var(--mtg-fg-3)">{{ chatTime(m.at) }}</span>
                </div>
                <div class="text-[13.5px] leading-normal" style="color: var(--mtg-fg-2)">{{ m.text }}</div>
              </div>
            </div>
            <div class="px-3.5 py-3 border-t flex gap-2 items-center" style="border-color: var(--mtg-border)">
              <input
                v-model="chatDraft"
                placeholder="Send a message"
                class="flex-1 h-10 px-[13px] rounded-[10px] text-[13.5px] outline-none border"
                style="border-color: var(--mtg-border-2); background: var(--tile); color: var(--mtg-fg)"
                @keydown.enter="sendChatMsg"
              />
              <button class="mtg-ctrlbtn !w-10 !h-10" style="background: #8a3a93" @click="sendChatMsg">
                <Send class="w-4 h-4" :stroke-width="1.75" />
              </button>
            </div>
          </template>
        </div>

        <!-- flying reactions -->
        <div class="absolute inset-0 pointer-events-none overflow-hidden">
          <span
            v-for="r in room.reactions.value"
            :key="r.id"
            class="absolute bottom-5 text-[34px] mtg-flyup"
            :style="{ left: r.x + '%' }"
          >{{ r.emoji }}</span>
        </div>
      </div>

      <!-- control bar (wraps on narrow screens instead of overflowing) -->
      <div class="flex-none flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 px-[18px] pt-3.5 pb-[18px] relative">
        <div class="absolute left-[18px] bottom-5 hidden md:flex items-center gap-2 text-[12.5px] font-semibold" style="color: var(--mtg-fg-2)">
          <Clock class="w-[15px] h-[15px]" :stroke-width="1.75" />
          <span class="tabular-nums">{{ mmss }}</span>
        </div>

        <button class="mtg-ctrlbtn" :class="room.muted.value ? 'muted' : ''" :title="room.muted.value ? 'Unmute' : 'Mute'" @click="room.toggleMute()">
          <component :is="room.muted.value ? MicOff : Mic" class="w-[22px] h-[22px]" :stroke-width="1.75" />
        </button>

        <button class="mtg-ctrlbtn" :class="room.cameraOn.value ? 'active' : ''" :title="room.cameraOn.value ? 'Turn camera off' : 'Turn camera on'" @click="room.toggleCamera()">
          <component :is="room.cameraOn.value ? Video : VideoOff" class="w-[22px] h-[22px]" :stroke-width="1.75" />
        </button>

        <button class="mtg-ctrlbtn" :class="room.sharingScreen.value ? 'active' : ''" :title="room.sharingScreen.value ? 'Stop presenting' : 'Present now'" @click="room.toggleScreenShare()">
          <component :is="room.sharingScreen.value ? MonitorOff : MonitorUp" class="w-[23px] h-[23px]" :stroke-width="1.75" />
        </button>

        <!-- reactions -->
        <div class="relative">
          <button class="mtg-ctrlbtn" title="React" @click="reactOpen = !reactOpen">
            <Smile class="w-[22px] h-[22px]" :stroke-width="1.75" />
          </button>
          <div
            v-if="reactOpen"
            class="absolute bottom-[calc(100%+10px)] left-1/2 -translate-x-1/2 flex gap-1 p-2 rounded-[14px] border shadow-2xl"
            style="background: var(--stage-2); border-color: var(--mtg-border-2)"
          >
            <button
              v-for="em in REACTIONS"
              :key="em"
              class="w-10 h-10 rounded-[10px] text-[22px] grid place-items-center hover:bg-white/10"
              @click="react(em)"
            >{{ em }}</button>
          </div>
        </div>

        <button class="mtg-ctrlbtn" :class="room.handRaised.value ? 'active' : ''" :title="room.handRaised.value ? 'Lower hand' : 'Raise hand'" @click="room.toggleHand()">
          <Hand class="w-[22px] h-[22px]" :stroke-width="1.75" />
        </button>

        <button class="mtg-ctrlbtn relative" :class="panel === 'people' ? 'active' : ''" title="People" @click="togglePanel('people')">
          <Users class="w-[22px] h-[22px]" :stroke-width="1.75" />
          <span class="absolute top-0.5 right-0.5 min-w-4 h-4 px-1 rounded-lg text-[10px] font-extrabold grid place-items-center text-white" style="background: #8a3a93; box-shadow: 0 0 0 2px var(--stage)">
            {{ room.admittedPeople.value.length }}
          </span>
        </button>

        <button class="mtg-ctrlbtn relative" :class="panel === 'chat' ? 'active' : ''" title="Chat" @click="togglePanel('chat')">
          <MessageSquare class="w-[21px] h-[21px]" :stroke-width="1.75" />
          <span v-if="unseenChat" class="absolute top-0.5 right-0.5 min-w-4 h-4 px-1 rounded-lg text-[10px] font-extrabold grid place-items-center text-white" style="background: #e23b54; box-shadow: 0 0 0 2px var(--stage)">
            {{ unseenChat }}
          </span>
        </button>

        <button class="mtg-ctrlbtn" :class="room.noiseSuppression.value ? 'active' : ''" :title="room.rnnoiseActive.value ? 'AI noise cancellation' : 'Noise cancellation'" @click="room.toggleNoise()">
          <Wand2 class="w-[21px] h-[21px]" :stroke-width="1.75" />
        </button>

        <button v-if="room.isHost.value" class="h-[52px] px-5 rounded-full text-sm font-bold text-white" style="background: #e23b54" @click="room.endMeeting()">
          End for all
        </button>
        <button class="mtg-ctrlbtn danger" title="Leave call" @click="leaveRoom">
          <PhoneOff class="w-[22px] h-[22px]" :stroke-width="1.75" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Dark stage palette — from the Meeting.html design handoff. The call surface
   is always dark regardless of app theme: video and shares need it. */
.mtg {
  --stage: #171520;
  --stage-2: #1f1c29;
  --tile: #262232;
  --tile-2: #2d2838;
  --mtg-border: rgba(255, 255, 255, 0.08);
  --mtg-border-2: rgba(255, 255, 255, 0.14);
  --mtg-fg: #f3f1f7;
  --mtg-fg-2: rgba(243, 241, 247, 0.62);
  --mtg-fg-3: rgba(243, 241, 247, 0.4);
  background: var(--stage);
  color: var(--mtg-fg);
}
.mtg-header {
  height: 58px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 18px;
  border-bottom: 1px solid var(--mtg-border);
}
.mtg-pillbtn {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 14px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  color: var(--mtg-fg);
  font-size: 13.5px;
  font-weight: 650;
  white-space: nowrap;
}
.mtg-pillbtn:hover {
  background: rgba(255, 255, 255, 0.16);
}
.mtg-ctrlbtn {
  width: 52px;
  height: 52px;
  flex: none;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #f3f1f7;
  background: rgba(255, 255, 255, 0.1);
  transition: background 0.14s, transform 0.1s;
  position: relative;
}
.mtg-ctrlbtn:hover { background: rgba(255, 255, 255, 0.18); }
.mtg-ctrlbtn:active { transform: scale(0.94); }
.mtg-ctrlbtn.danger { background: #e23b54; }
.mtg-ctrlbtn.danger:hover { background: #cf2f47; }
.mtg-ctrlbtn.muted { background: #e23b54; }
.mtg-ctrlbtn.muted:hover { background: #cf2f47; }
.mtg-ctrlbtn.active { background: #8a3a93; }
.mtg-ctrlbtn.active:hover { background: #7a3283; }
.mtg-tile {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  background: var(--tile);
  border: 1px solid var(--mtg-border);
  display: grid;
  place-items: center;
  transition: box-shadow 0.15s;
}
.mtg-tile.speaking {
  box-shadow: 0 0 0 3px #2bb673, 0 0 0 4px rgba(43, 182, 115, 0.3);
}
.mtg-ring {
  position: absolute;
  inset: 0;
  border-radius: 16px;
  pointer-events: none;
}
@keyframes mtgRipple {
  0% { box-shadow: 0 0 0 0 rgba(43, 182, 115, 0.5); }
  100% { box-shadow: 0 0 0 14px rgba(43, 182, 115, 0); }
}
.mtg-tile.speaking .mtg-ring {
  animation: mtgRipple 1.4s ease-out infinite;
}
.mtg-chip {
  position: absolute;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 8px;
  background: rgba(15, 12, 20, 0.62);
  backdrop-filter: blur(8px);
  color: #fff;
  font-size: 12.5px;
  font-weight: 600;
  max-width: calc(100% - 16px);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mtg-side {
  width: 340px;
  flex: none;
  background: var(--stage-2);
  border-left: 1px solid var(--mtg-border);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
/* Narrow viewports: the panel overlays the stage instead of crushing it. */
@media (max-width: 760px) {
  .mtg-side {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(340px, 92vw);
    z-index: 30;
    box-shadow: -12px 0 32px rgba(0, 0, 0, 0.4);
  }
}
@keyframes mtgFlyUp {
  0% { transform: translateY(0) scale(0.6); opacity: 0; }
  15% { opacity: 1; transform: translateY(-20px) scale(1.1); }
  100% { transform: translateY(-70vh) scale(1); opacity: 0; }
}
.mtg-flyup {
  animation: mtgFlyUp 2.6s ease-out forwards;
}

/* ── Portal (guest landing / lobby / end states) ── */
.mtg-card {
  background: var(--stage-2);
  border: 1px solid var(--mtg-border-2);
  border-radius: 18px;
  padding: 28px;
  box-shadow: 0 24px 70px -12px rgba(0, 0, 0, 0.6);
}
.mtg-input {
  width: 100%;
  height: 44px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid var(--mtg-border-2);
  background: var(--tile);
  color: var(--mtg-fg);
  font-size: 14px;
  outline: none;
  transition: border-color 0.12s;
}
.mtg-input:focus {
  border-color: #8a3a93;
}
.mtg-input::placeholder {
  color: var(--mtg-fg-3);
}
.mtg-join {
  width: 100%;
  height: 46px;
  border-radius: 11px;
  background: #8a3a93;
  color: #fff;
  font-size: 14.5px;
  font-weight: 700;
  transition: background 0.14s, opacity 0.14s;
}
.mtg-join:hover { background: #7a3283; }
.mtg-join:disabled { opacity: 0.45; cursor: not-allowed; }
.mtg-lobby-pulse {
  display: inline-flex;
  border-radius: 50%;
  animation: mtgLobbyPulse 1.8s ease-in-out infinite;
}
@keyframes mtgLobbyPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.06); opacity: 0.85; }
}
</style>
