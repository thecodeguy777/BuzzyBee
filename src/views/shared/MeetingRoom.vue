<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import {
  Mic, MicOff, Video, VideoOff, SwitchCamera, Sparkles, ImagePlus, MonitorUp, MonitorOff, PhoneOff, Wand2, Bell, BellOff, AlertTriangle, Copy, Check, Crown, Users, Loader2,
  Maximize2, X, Hand, Smile, MessageSquare, UserPlus, Send, Clock, Lock, ArrowRight,
} from 'lucide-vue-next'
import HexAvatar from '@/components/shared/HexAvatar.vue'
import MeetingVideo from '@/components/shared/MeetingVideo.vue'
import HexSpinner from '@/components/shared/HexSpinner.vue'
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
// Broadcast our own mic/cam permission trouble so peers get a "!" on our tile.
watch([() => perms.mic.value, () => perms.cam.value], ([mic, cam]) => room.setPermissionState(mic, cam), { immediate: true })

// ── Responsive / device ───────────────────────────────────────────────────────
const vw = ref(typeof window !== 'undefined' ? window.innerWidth : 1024)
function onResize() { vw.value = window.innerWidth }
onMounted(() => window.addEventListener('resize', onResize))
onBeforeUnmount(() => window.removeEventListener('resize', onResize))
const isPhone = computed(() => vw.value < 640)
// Screen-share isn't available on iOS Safari (no getDisplayMedia) — hide the
// button rather than offer something that silently fails. Flip-camera only
// makes sense on touch devices with a front/back camera.
const canShareScreen =
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia
const isTouch =
  typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches

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
  const startCamera = camPreviewOn.value
  stopMicPreview()
  stopCamPreview()
  needsName.value = false
  await room.join(props.token, guestName.value, { startCamera })
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

// ── Green-room camera preview ─────────────────────────────────────────────────
// Self-view before joining, so guests can check framing/lighting. The preview
// stream is released on join; the room re-acquires (no second prompt). Whether
// it's on when they click Join carries into the call via { startCamera }.
const camPreviewOn = ref(false)
// Reactive so the green-room preview can render through <MeetingVideo>, which
// carries the iOS autoplay-retry + tap-to-play recovery.
const camPreviewStream = ref<MediaStream | null>(null)
async function toggleCamPreview() {
  if (camPreviewOn.value) {
    stopCamPreview()
    return
  }
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'user' } },
      audio: false,
    })
  } catch {
    return
  }
  camPreviewStream.value = stream
  camPreviewOn.value = true
}
function stopCamPreview() {
  camPreviewStream.value?.getTracks().forEach((t) => t.stop())
  camPreviewStream.value = null
  camPreviewOn.value = false
}
onBeforeUnmount(stopCamPreview)

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
  // Phones (portrait): stack a pair vertically, otherwise cap at 2 columns so
  // tiles stay tall enough to read a face.
  if (isPhone.value) return n <= 2 ? 1 : 2
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
    if (screenVideo.value) {
      screenVideo.value.srcObject = stageStream.value
      // iOS Safari won't autoplay a late-bound srcObject — nudge it.
      void screenVideo.value.play().catch(() => {})
    }
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

// Permission warning for a participant (mic/cam blocked) → "!" badge + tooltip.
function permWarn(p: Participant): string | null {
  if (p.micBlocked && p.camBlocked) return 'Mic & camera blocked'
  if (p.micBlocked) return 'Microphone blocked'
  if (p.camBlocked) return 'Camera blocked'
  return null
}

// ── Join-modal mic meter (design: Join Meeting.html) ──
// Bars rise with the real preview level (micLevel), shaped by a centered hump
// so it reads like a VU meter reacting to your voice.
const meterBars = Array.from({ length: 16 })
const meterWeights = meterBars.map((_, i) => 0.55 + 0.45 * Math.sin((i / (meterBars.length - 1)) * Math.PI))
function barHeight(i: number): number {
  if (!micPreviewOn.value) return 34
  return Math.round(20 + Math.min(1, micLevel.value) * 80 * meterWeights[i])
}
function barColor(i: number): string {
  if (!micPreviewOn.value) return 'rgba(255,255,255,.1)'
  const lvl = Math.min(1, micLevel.value) * meterWeights[i]
  return lvl > 0.7 ? '#b066c0' : lvl > 0.4 ? '#8a3a93' : 'rgba(176,102,192,.5)'
}

// ── Background picker (none / blur / preset image / upload) ────────────────────
const bgOpen = ref(false)
const bgFileInput = ref<HTMLInputElement | null>(null)
const customBgUrl = ref<string | null>(null)

// Presets are gradient data-URLs generated on the fly — on-brand, no assets.
const BG_PRESETS = [
  { id: 'plum', label: 'Plum', stops: ['#2a1430', '#b266bb'] },
  { id: 'slate', label: 'Slate', stops: ['#1f2937', '#475569'] },
  { id: 'honey', label: 'Honey', stops: ['#3a2a10', '#e8b84d'] },
]
const presetUrls = ref<Record<string, string>>({})
function makeGradient(stops: string[]): string {
  const c = document.createElement('canvas')
  c.width = 1280
  c.height = 720
  const x = c.getContext('2d')!
  const g = x.createLinearGradient(0, 0, 1280, 720)
  g.addColorStop(0, stops[0])
  g.addColorStop(1, stops[1])
  x.fillStyle = g
  x.fillRect(0, 0, 1280, 720)
  const v = x.createRadialGradient(640, 360, 180, 640, 360, 820)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,0.4)')
  x.fillStyle = v
  x.fillRect(0, 0, 1280, 720)
  return c.toDataURL('image/jpeg', 0.85)
}
onMounted(() => { for (const p of BG_PRESETS) presetUrls.value[p.id] = makeGradient(p.stops) })

function pickBg(mode: 'none' | 'blur') { room.setBackground(mode); bgOpen.value = false }
function pickImage(url: string | null) { if (url) void room.setBackgroundImage(url); bgOpen.value = false }
function onBgFile(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = '' // allow re-picking the same file
  if (!f) return
  if (customBgUrl.value) URL.revokeObjectURL(customBgUrl.value)
  customBgUrl.value = URL.createObjectURL(f)
  void room.setBackgroundImage(customBgUrl.value)
  bgOpen.value = false
}
onBeforeUnmount(() => { if (customBgUrl.value) URL.revokeObjectURL(customBgUrl.value) })
const isBgImg = (url: string | null | undefined) =>
  room.bgMode.value === 'image' && !!url && room.bgImageUrl.value === url
</script>

<template>
  <!-- w-full (not w-screen: that includes the scrollbar and overflows
       horizontally) and dvh (vh overflows under mobile URL bars). The whole
       surface — portal included — lives on the dark stage. -->
  <div class="mtg h-screen h-[100dvh] w-full overflow-hidden flex flex-col">
    <!-- ── Guest join modal (Claude Design: Join Meeting.html) ── -->
    <div v-if="needsName" class="flex-1 overflow-y-auto flex p-4">
      <div class="jm-shell">
        <!-- LEFT: live preview -->
        <div class="jm-preview">
          <div class="jm-brand">
            <img :src="hivemindMark" alt="" class="jm-logo" />
            <span class="jm-bn">HiveMind<span> Meet</span></span>
          </div>

          <div class="jm-stage">
            <MeetingVideo
              v-if="camPreviewOn && camPreviewStream"
              :stream="camPreviewStream"
              :mirror="true"
              class="absolute inset-0"
            />
            <div v-else class="jm-camoff">
              <HexAvatar :name="guestName || 'You'" :size="112" />
              <div class="jm-camoff-msg">Camera is off</div>
            </div>
          </div>
          <span v-if="camPreviewOn" class="jm-mirror">Your camera is mirrored to you only</span>

          <div class="jm-selfchip" :class="micPreviewOn ? '' : 'muted'">
            <span class="jm-minimic">
              <component :is="micPreviewOn ? Mic : MicOff" class="w-[15px] h-[15px]" :stroke-width="2" />
            </span>
            <span>{{ guestName.trim().split(' ')[0] || 'You' }}</span>
          </div>

          <div class="jm-pvctrls">
            <button type="button" class="jm-pvbtn" :class="micPreviewOn ? '' : 'off'" :title="micPreviewOn ? 'Stop mic test' : 'Test your mic'" @click="toggleMicPreview">
              <component :is="micPreviewOn ? Mic : MicOff" class="w-[21px] h-[21px]" :stroke-width="2" />
            </button>
            <button type="button" class="jm-pvbtn" :class="camPreviewOn ? '' : 'off'" :title="camPreviewOn ? 'Turn camera off' : 'Turn camera on'" @click="toggleCamPreview">
              <component :is="camPreviewOn ? Video : VideoOff" class="w-[21px] h-[21px]" :stroke-width="2" />
            </button>
          </div>
        </div>

        <!-- RIGHT: setup -->
        <div class="jm-setup">
          <div class="jm-kicker">You're invited to</div>
          <h1 class="jm-title">{{ roomTitle }}</h1>

          <div class="jm-field">
            <label class="jm-flabel" for="jm-name">Your name</label>
            <input
              id="jm-name"
              v-model="guestName"
              autofocus
              autocomplete="name"
              placeholder="Maria Santos"
              class="jm-input"
              @keydown.enter="joinAsGuest"
            />
          </div>

          <!-- mic test — the meter is driven by the real preview level -->
          <div class="jm-mic" :class="micPreviewOn ? '' : 'muted'">
            <div class="jm-mic-ic"><Mic class="w-[19px] h-[19px]" :stroke-width="2" /></div>
            <div class="flex-1 min-w-0">
              <div class="jm-mic-top">
                <span class="jm-mic-t">{{ micError ? 'Mic is blocked' : 'Test your mic' }}</span>
                <span class="jm-mic-s">{{ micPreviewOn ? 'Say something…' : 'Tap the mic to test' }}</span>
              </div>
              <div class="jm-meter">
                <span v-for="(_, i) in meterBars" :key="i" class="jm-bar" :style="{ height: barHeight(i) + '%', background: barColor(i) }" />
              </div>
            </div>
          </div>
          <p v-if="micError" class="jm-micerr">Mic access was blocked — allow it in your browser, or join muted and fix it after.</p>

          <!-- blocked permissions → reset steps -->
          <MediaPermissionNotice v-if="permsBlocked" :mic="perms.mic.value" :cam="perms.cam.value" class="mt-3" @recheck="perms.refresh" />

          <div class="jm-spacer" />

          <div v-if="!permsBlocked" class="jm-permit">
            <Lock class="w-[15px] h-[15px]" :stroke-width="1.9" />
            <span>Your camera &amp; mic stay off until you turn them on. Nothing is recorded before you join.</span>
          </div>

          <button class="jm-join" :disabled="!guestName.trim()" @click="joinAsGuest">
            Join now
            <ArrowRight class="w-[18px] h-[18px]" :stroke-width="2.4" />
          </button>
        </div>
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
          <span class="hidden sm:inline">{{ copied ? 'Copied' : 'Copy link' }}</span>
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
          <TransitionGroup tag="div" name="tile" class="flex gap-2.5 h-24 flex-none overflow-x-auto">
            <div v-for="p in room.admittedPeople.value" :key="p.userId" class="w-[150px] flex-none">
              <div class="mtg-tile h-full" :class="room.speaking.value.has(p.userId) ? 'speaking' : ''">
                <MeetingVideo v-if="camStream(p)" :stream="camStream(p)" :mirror="isYou(p) && room.selfMirrored.value" class="absolute inset-0 mtg-fade-in" />
                <HexAvatar v-else :name="p.name" :color-key="p.userId" :size="44" />
                <span class="mtg-ring" />
                <span class="mtg-chip left-2 bottom-2 !text-[11px]">
                  <MicOff v-if="p.muted" class="w-3 h-3" style="color: #ff8a9b" :stroke-width="2" />
                  {{ p.name }}{{ isYou(p) ? ' (you)' : '' }}
                </span>
                <span v-if="p.hand" class="mtg-chip mtg-pop right-2 top-2 !p-1" style="background: rgba(217, 165, 49, 0.92)">
                  <Hand class="w-3 h-3" :stroke-width="2" />
                </span>
                <span v-if="permWarn(p)" class="mtg-chip mtg-pop left-2 top-2 !p-1" style="background: rgba(226, 59, 84, 0.92)" :title="permWarn(p) || ''">
                  <AlertTriangle class="w-3 h-3" :stroke-width="2.4" />
                </span>
                <div v-if="isYou(p) && room.bgLoading.value" class="absolute inset-0 grid place-items-center mtg-fade-in" style="background: rgba(15, 12, 20, 0.55)">
                  <HexSpinner :size="30" />
                </div>
              </div>
            </div>
          </TransitionGroup>
        </div>

        <!-- GRID layout — always fits the viewport; tiles shrink, never scroll -->
        <TransitionGroup
          v-else
          tag="div"
          name="tile"
          class="flex-1 min-w-0 min-h-0 grid gap-3 p-4"
          :style="{
            gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${gridRows}, minmax(0, 1fr))`,
          }"
        >
          <div v-for="p in room.admittedPeople.value" :key="p.userId" class="min-h-0 min-w-0">
            <div class="mtg-tile w-full h-full" :class="room.speaking.value.has(p.userId) ? 'speaking' : ''">
              <MeetingVideo v-if="camStream(p)" :stream="camStream(p)" :mirror="isYou(p) && room.selfMirrored.value" class="absolute inset-0 mtg-fade-in" />
              <HexAvatar v-else :name="p.name" :color-key="p.userId" :size="72" />
              <span class="mtg-ring" />
              <span class="mtg-chip left-2.5 bottom-2.5">
                <MicOff v-if="p.muted" class="w-3.5 h-3.5" style="color: #ff8a9b" :stroke-width="2" />
                {{ p.name }}{{ isYou(p) ? ' (you)' : '' }}
                <Crown v-if="p.role === 'host'" class="w-[13px] h-[13px]" style="color: #e6c85a" :stroke-width="2" />
              </span>
              <span v-if="p.hand" class="mtg-chip mtg-pop right-2.5 top-2.5" style="background: rgba(217, 165, 49, 0.92)">
                <Hand class="w-[15px] h-[15px]" :stroke-width="2" />
              </span>
              <span v-if="permWarn(p)" class="mtg-chip mtg-pop left-2.5 top-2.5 !p-1.5" style="background: rgba(226, 59, 84, 0.92)" :title="permWarn(p) || ''">
                <AlertTriangle class="w-[14px] h-[14px]" :stroke-width="2.4" />
              </span>
              <div v-if="isYou(p) && room.bgLoading.value" class="absolute inset-0 grid place-items-center mtg-fade-in" style="background: rgba(15, 12, 20, 0.55)">
                <HexSpinner :size="46" />
              </div>
            </div>
          </div>
        </TransitionGroup>

        <!-- side panel -->
        <Transition name="panel">
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
              <AlertTriangle v-if="permWarn(p)" class="w-4 h-4" style="color: #ff8a9b" :stroke-width="2" :title="permWarn(p) || ''" />
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
        </Transition>

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
      <div class="mtg-controls mtg-rise flex-none flex flex-wrap items-center justify-center gap-2 sm:gap-3 px-2.5 sm:px-[18px] pt-3.5 relative">
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

        <button v-if="isTouch && room.cameraOn.value" class="mtg-ctrlbtn" title="Flip camera" @click="room.flipCamera()">
          <SwitchCamera class="w-[22px] h-[22px]" :stroke-width="1.75" />
        </button>

        <!-- background picker: none / blur / preset images / upload -->
        <div v-if="room.cameraOn.value" class="relative">
          <button class="mtg-ctrlbtn" :class="room.bgMode.value !== 'none' ? 'active' : ''" title="Background" @click="bgOpen = !bgOpen">
            <Sparkles class="w-[22px] h-[22px]" :stroke-width="1.75" />
          </button>
          <div
            v-if="bgOpen"
            class="absolute bottom-[calc(100%+10px)] left-1/2 -translate-x-1/2 grid grid-cols-3 gap-2 p-2.5 rounded-[14px] border shadow-2xl"
            style="background: var(--stage-2); border-color: var(--mtg-border-2); width: 216px"
          >
            <button class="mtg-bgtile" :class="room.bgMode.value === 'none' ? 'sel' : ''" @click="pickBg('none')">
              <VideoOff class="w-[18px] h-[18px]" :stroke-width="1.75" /><span>None</span>
            </button>
            <button class="mtg-bgtile" :class="room.bgMode.value === 'blur' ? 'sel' : ''" @click="pickBg('blur')">
              <Sparkles class="w-[18px] h-[18px]" :stroke-width="1.75" /><span>Blur</span>
            </button>
            <button
              v-for="p in BG_PRESETS"
              :key="p.id"
              class="mtg-bgtile !p-0 overflow-hidden"
              :class="isBgImg(presetUrls[p.id]) ? 'sel' : ''"
              :title="p.label"
              @click="pickImage(presetUrls[p.id])"
            >
              <img v-if="presetUrls[p.id]" :src="presetUrls[p.id]" class="w-full h-full object-cover" :alt="p.label" />
            </button>
            <button
              v-if="customBgUrl"
              class="mtg-bgtile !p-0 overflow-hidden"
              :class="isBgImg(customBgUrl) ? 'sel' : ''"
              title="Your image"
              @click="pickImage(customBgUrl)"
            >
              <img :src="customBgUrl" class="w-full h-full object-cover" alt="Your background" />
            </button>
            <button class="mtg-bgtile" title="Upload an image" @click="bgFileInput?.click()">
              <ImagePlus class="w-[18px] h-[18px]" :stroke-width="1.75" /><span>Upload</span>
            </button>
          </div>
          <input ref="bgFileInput" type="file" accept="image/*" class="hidden" @change="onBgFile" />
        </div>

        <button v-if="canShareScreen" class="mtg-ctrlbtn" :class="room.sharingScreen.value ? 'active' : ''" :title="room.sharingScreen.value ? 'Stop presenting' : 'Present now'" @click="room.toggleScreenShare()">
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

        <button class="mtg-ctrlbtn" :class="room.soundsOn.value ? '' : 'muted'" :title="room.soundsOn.value ? 'Meeting sounds on' : 'Meeting sounds off'" @click="room.toggleSounds()">
          <component :is="room.soundsOn.value ? Bell : BellOff" class="w-[21px] h-[21px]" :stroke-width="1.75" />
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
  min-height: 58px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  /* Reserve the notch / status-bar inset on phones so the title clears it. */
  padding: env(safe-area-inset-top) 18px 0;
  border-bottom: 1px solid var(--mtg-border);
}
.mtg-controls {
  /* Keep the bar above the iOS home indicator. */
  padding-bottom: max(18px, env(safe-area-inset-bottom));
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
/* Tighter controls on phones so the bar stays one or two rows, not three. */
@media (max-width: 640px) {
  .mtg-ctrlbtn { width: 46px; height: 46px; }
}
.mtg-bgtile {
  aspect-ratio: 1;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--mtg-fg);
  font-size: 10px;
  font-weight: 600;
}
.mtg-bgtile:hover { background: rgba(255, 255, 255, 0.16); }
.mtg-bgtile.sel { outline: 2px solid #8a3a93; outline-offset: -2px; }
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
    padding-top: env(safe-area-inset-top);
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

/* ── Premium motion ── (all gated behind reduced-motion) */
@keyframes mtgPop { from { transform: scale(0.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes mtgRise { from { transform: translateY(14px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes mtgFadeIn { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: no-preference) {
  /* Pop with a touch of overshoot — hand-raise / warning badges. */
  .mtg-pop { animation: mtgPop 0.34s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
  /* Control bar eases up when the stage appears. */
  .mtg-rise { animation: mtgRise 0.5s cubic-bezier(0.22, 1, 0.36, 1) both; }
  /* Camera video / loading overlay fade in. */
  .mtg-fade-in { animation: mtgFadeIn 0.4s ease both; }

  /* Tile grid/filmstrip: new joiners scale in, leavers scale out, and the
     whole layout glides (FLIP) when it reflows. The premium centerpiece. */
  .tile-enter-active { transition: opacity 0.4s ease, transform 0.45s cubic-bezier(0.22, 1, 0.36, 1); }
  .tile-leave-active { transition: opacity 0.28s ease, transform 0.3s cubic-bezier(0.4, 0, 1, 1); }
  .tile-enter-from, .tile-leave-to { opacity: 0; transform: scale(0.82); }
  .tile-move { transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1); }

  /* Side panel slides + fades. */
  .panel-enter-active, .panel-leave-active { transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s ease; }
  .panel-enter-from, .panel-leave-to { transform: translateX(18px); opacity: 0; }

  .mtg-ctrlbtn { transition: background 0.14s, transform 0.12s cubic-bezier(0.34, 1.56, 0.64, 1); }
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

/* ── Guest join modal (Claude Design: Join Meeting.html) ── */
.jm-shell {
  width: 100%;
  max-width: 1040px;
  margin: auto;
  display: grid;
  grid-template-columns: 1.32fr 1fr;
  border-radius: 24px;
  overflow: hidden;
  background: var(--stage-2);
  border: 1px solid var(--mtg-border);
  box-shadow: 0 40px 90px -30px rgba(0, 0, 0, 0.7);
}
.jm-preview {
  position: relative;
  background: linear-gradient(165deg, #1a1622, #0e0b14);
  min-height: 540px;
  display: flex;
  flex-direction: column;
  padding: 22px;
}
.jm-brand { display: flex; align-items: center; gap: 10px; z-index: 3; }
.jm-logo { width: 24px; height: auto; filter: drop-shadow(0 3px 6px rgba(120, 60, 140, 0.5)); }
.jm-bn { font-size: 16px; font-weight: 800; letter-spacing: -0.3px; }
.jm-bn span { color: #b066c0; }
.jm-stage { flex: 1; position: relative; display: grid; place-items: center; margin: 14px 0 0; border-radius: 16px; overflow: hidden; }
.jm-camoff { display: flex; flex-direction: column; align-items: center; gap: 16px; }
.jm-camoff-msg { font-size: 14px; color: var(--mtg-fg-3); font-weight: 500; }
.jm-mirror {
  position: absolute; left: 18px; bottom: 84px; font-size: 11px; font-weight: 600; color: var(--mtg-fg-3);
  background: rgba(0, 0, 0, 0.4); padding: 4px 9px; border-radius: 7px; backdrop-filter: blur(6px); z-index: 3;
}
.jm-selfchip {
  position: absolute; left: 18px; bottom: 22px; display: inline-flex; align-items: center; gap: 8px;
  padding: 7px 13px; border-radius: 10px; background: rgba(12, 9, 18, 0.6); backdrop-filter: blur(10px);
  font-size: 13.5px; font-weight: 650; z-index: 3; border: 1px solid rgba(255, 255, 255, 0.07);
}
.jm-minimic { display: grid; place-items: center; color: #2bb673; }
.jm-selfchip.muted .jm-minimic { color: #ff7e93; }
.jm-pvctrls { position: absolute; left: 50%; bottom: 22px; transform: translateX(-50%); display: flex; gap: 12px; z-index: 3; }
.jm-pvbtn {
  width: 50px; height: 50px; border-radius: 50%; display: grid; place-items: center; color: #fff;
  background: rgba(255, 255, 255, 0.12); backdrop-filter: blur(8px); transition: background 0.14s, transform 0.1s;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.jm-pvbtn:hover { background: rgba(255, 255, 255, 0.2); }
.jm-pvbtn:active { transform: scale(0.93); }
.jm-pvbtn.off { background: #e23b54; border-color: transparent; }
.jm-pvbtn.off:hover { background: #cf2f47; }
.jm-setup { padding: 32px 32px 28px; display: flex; flex-direction: column; }
.jm-kicker { font-size: 11.5px; font-weight: 750; letter-spacing: 1.6px; text-transform: uppercase; color: #b066c0; }
.jm-title { font-size: 26px; font-weight: 800; letter-spacing: -0.7px; margin-top: 9px; line-height: 1.12; }
.jm-field { margin-top: 22px; }
.jm-flabel { font-size: 12.5px; font-weight: 650; color: var(--mtg-fg-2); margin-bottom: 8px; display: block; }
.jm-input {
  width: 100%; height: 48px; padding: 0 14px; border-radius: 12px; background: var(--stage);
  border: 1px solid var(--mtg-border); color: var(--mtg-fg); font-size: 15px; font-weight: 550; outline: none;
  transition: border-color 0.14s, box-shadow 0.14s;
}
.jm-input::placeholder { color: var(--mtg-fg-3); }
.jm-input:focus { border-color: #8a3a93; box-shadow: 0 0 0 3px rgba(138, 58, 147, 0.25); }
.jm-mic { margin-top: 14px; display: flex; align-items: center; gap: 13px; padding: 12px 14px; border-radius: 13px; background: var(--tile); border: 1px solid var(--mtg-border); }
.jm-mic-ic { width: 40px; height: 40px; border-radius: 11px; flex: none; display: grid; place-items: center; background: rgba(138, 58, 147, 0.16); color: #b066c0; }
.jm-mic.muted .jm-mic-ic { background: rgba(226, 59, 84, 0.16); color: #ff7e93; }
.jm-mic-top { display: flex; align-items: baseline; gap: 8px; }
.jm-mic-t { font-size: 13.5px; font-weight: 700; }
.jm-mic-s { font-size: 11.5px; color: var(--mtg-fg-3); margin-left: auto; }
.jm-meter { display: flex; gap: 3px; margin-top: 9px; height: 14px; align-items: flex-end; }
.jm-bar { flex: 1; border-radius: 2px; height: 34%; transition: height 0.1s ease, background 0.1s; }
.jm-micerr { font-size: 11.5px; color: #ff8a9b; margin-top: 8px; line-height: 1.4; }
.jm-spacer { flex: 1; min-height: 16px; }
.jm-permit { display: flex; align-items: center; gap: 9px; font-size: 12px; color: var(--mtg-fg-3); margin-top: 16px; line-height: 1.45; }
.jm-permit svg { flex: none; }
.jm-join {
  margin-top: 14px; height: 52px; border-radius: 14px; background: linear-gradient(140deg, #7a3bd0, #b066c0); color: #fff;
  font-size: 16px; font-weight: 750; display: flex; align-items: center; justify-content: center; gap: 9px;
  box-shadow: 0 12px 30px -8px rgba(138, 58, 147, 0.6); transition: transform 0.12s, box-shadow 0.18s, opacity 0.14s;
}
.jm-join:hover { transform: translateY(-1px); box-shadow: 0 16px 38px -10px rgba(138, 58, 147, 0.7); }
.jm-join:active { transform: translateY(0); }
.jm-join:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; transform: none; }
.jm-join svg { transition: transform 0.18s; }
.jm-join:not(:disabled):hover svg { transform: translateX(3px); }
@media (max-width: 860px) {
  .jm-shell { grid-template-columns: 1fr; max-width: 460px; }
  .jm-preview { min-height: 300px; }
}
</style>
