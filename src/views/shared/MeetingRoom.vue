<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import {
  Mic, MicOff, MonitorUp, PhoneOff, Wand2, Copy, Check, Crown, Users, Loader2, Maximize2,
} from 'lucide-vue-next'
import HexAvatar from '@/components/shared/HexAvatar.vue'
import { useAuthStore } from '@/stores/auth'
import { useMeetingRoom } from '@/composables/useMeetingRoom'

const props = defineProps<{ token: string }>()
const auth = useAuthStore()
const room = useMeetingRoom()

const guestName = ref('')
const needsName = ref(false)
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
  if (auth.user) await room.join(props.token)
  else needsName.value = true
})

async function joinAsGuest() {
  if (!guestName.value.trim()) return
  needsName.value = false
  await room.join(props.token, guestName.value)
}
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

// Screen share viewer (first active remote screen).
const screenVideo = ref<HTMLVideoElement | null>(null)
const activeScreen = computed(() => {
  const entries = Object.entries(room.remoteScreens.value)
  if (!entries.length) return null
  const [uid, ms] = entries[0]
  const p = room.online.value.find((o) => o.userId === uid)
  return { uid, name: p?.name ?? 'Someone', stream: ms }
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
  <div class="h-screen w-screen bg-base-300 text-base-content flex flex-col">
    <!-- ── Name entry (guest) ── -->
    <div v-if="needsName" class="flex-1 flex items-center justify-center p-4">
      <div class="w-full max-w-sm rounded-2xl border border-base-300 bg-base-100 shadow-xl p-6">
        <div class="flex items-center gap-2 mb-1">
          <Users class="w-5 h-5 text-primary" :stroke-width="1.75" />
          <span class="font-display text-lg font-semibold">{{ roomTitle }}</span>
        </div>
        <p class="text-sm text-base-content/60 mb-4">Enter your name to join the meeting.</p>
        <input
          v-model="guestName"
          autofocus
          placeholder="Your name"
          class="input input-bordered w-full mb-3"
          @keydown.enter="joinAsGuest"
        />
        <button class="btn btn-primary w-full" :disabled="!guestName.trim()" @click="joinAsGuest">Join meeting</button>
      </div>
    </div>

    <!-- ── Left / ended / denied / error ── -->
    <div v-else-if="left || room.status.value === 'ended' || room.status.value === 'denied' || room.status.value === 'error'" class="flex-1 flex items-center justify-center p-4">
      <div class="w-full max-w-sm rounded-2xl border border-base-300 bg-base-100 shadow-xl p-6 text-center">
        <p class="font-display text-lg font-semibold mb-1">
          <template v-if="left">You left the meeting</template>
          <template v-else-if="room.status.value === 'denied'">Not admitted</template>
          <template v-else-if="room.status.value === 'error'">Can't join</template>
          <template v-else>This meeting has ended</template>
        </p>
        <p class="text-sm text-base-content/60 mb-4">
          <template v-if="room.status.value === 'denied'">The host didn't let you in.</template>
          <template v-else-if="room.status.value === 'error'">{{ room.error.value || 'Something went wrong.' }}</template>
          <template v-else-if="left">You can rejoin if it's still active.</template>
          <template v-else>Thanks for joining.</template>
        </p>
        <div class="flex gap-2 justify-center">
          <button v-if="left" class="btn btn-primary btn-sm" @click="left = false; room.join(props.token, guestName)">Rejoin</button>
          <a class="btn btn-ghost btn-sm" href="/app">Go to workstation</a>
        </div>
      </div>
    </div>

    <!-- ── Joining ── -->
    <div v-else-if="room.status.value === 'joining' || room.status.value === 'idle'" class="flex-1 flex items-center justify-center">
      <Loader2 class="w-6 h-6 animate-spin text-base-content/40" />
    </div>

    <!-- ── Lobby ── -->
    <div v-else-if="room.status.value === 'lobby'" class="flex-1 flex items-center justify-center p-4">
      <div class="w-full max-w-sm rounded-2xl border border-base-300 bg-base-100 shadow-xl p-6 text-center">
        <Loader2 class="w-6 h-6 animate-spin text-primary mx-auto mb-3" />
        <p class="font-display text-lg font-semibold mb-1">Waiting to be let in…</p>
        <p class="text-sm text-base-content/60 mb-4">The host will admit you to <span class="font-medium">{{ roomTitle }}</span> shortly.</p>
        <button class="btn btn-ghost btn-sm" @click="leaveRoom">Cancel</button>
      </div>
    </div>

    <!-- ── Live ── -->
    <template v-else-if="room.status.value === 'live'">
      <!-- header -->
      <header class="flex items-center gap-3 px-4 py-3 border-b border-base-300 bg-base-100">
        <Users class="w-5 h-5 text-primary" :stroke-width="1.75" />
        <span class="font-display font-semibold truncate">{{ roomTitle }}</span>
        <span class="text-xs text-base-content/50">{{ room.admittedPeople.value.length }} in call</span>
        <div class="flex-1" />
        <button class="btn btn-sm btn-ghost gap-1.5" @click="copyLink">
          <component :is="copied ? Check : Copy" class="w-4 h-4" :stroke-width="1.75" />
          {{ copied ? 'Copied' : 'Copy link' }}
        </button>
      </header>

      <div class="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
        <!-- screen share -->
        <div v-if="activeScreen || room.sharingScreen.value" class="rounded-xl border border-base-300 overflow-hidden bg-black/90">
          <div class="flex items-center gap-2 px-3 py-1.5 bg-base-200/60 text-xs">
            <MonitorUp class="w-3.5 h-3.5 text-primary" :stroke-width="1.75" />
            <span class="font-medium">
              <template v-if="activeScreen">{{ activeScreen.name }} is sharing</template>
              <template v-else>You're sharing your screen</template>
            </span>
            <div class="flex-1" />
            <button v-if="activeScreen" class="inline-flex items-center gap-1 text-base-content/60 hover:text-primary font-medium" @click="fullscreenScreen">
              <Maximize2 class="w-3.5 h-3.5" :stroke-width="1.75" /> Fullscreen
            </button>
          </div>
          <video v-if="activeScreen" ref="screenVideo" autoplay playsinline muted class="w-full max-h-[60vh] bg-black object-contain" />
          <div v-else class="px-3 py-5 text-center text-xs text-base-content/50">Your screen is visible to everyone here.</div>
        </div>

        <!-- participant tiles -->
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          <div
            v-for="p in room.admittedPeople.value"
            :key="p.userId"
            class="relative rounded-2xl border bg-base-100 p-4 flex flex-col items-center justify-center gap-2 aspect-video transition-colors"
            :class="room.speaking.value.has(p.userId) ? 'border-success ring-2 ring-success/40' : 'border-base-300'"
          >
            <HexAvatar :name="p.name" :color-key="p.userId" :size="56" />
            <div class="flex items-center gap-1.5">
              <span class="text-sm font-medium truncate max-w-[8rem]">{{ p.name }}{{ p.userId === room.myId.value ? ' (you)' : '' }}</span>
              <Crown v-if="p.role === 'host'" class="w-3.5 h-3.5 text-warning" :stroke-width="2" />
              <MicOff v-if="p.muted" class="w-3.5 h-3.5 text-error" :stroke-width="2" />
            </div>
          </div>
        </div>
      </div>

      <!-- controls -->
      <footer class="flex items-center justify-center gap-2 px-4 py-3 border-t border-base-300 bg-base-100">
        <button class="w-11 h-11 rounded-full flex items-center justify-center" :class="room.muted.value ? 'bg-error/15 text-error' : 'bg-base-200 text-base-content/70'" :title="room.muted.value ? 'Unmute' : 'Mute'" @click="room.toggleMute()">
          <component :is="room.muted.value ? MicOff : Mic" class="w-5 h-5" :stroke-width="1.75" />
        </button>
        <button class="w-11 h-11 rounded-full flex items-center justify-center" :class="room.noiseSuppression.value ? 'bg-primary/15 text-primary' : 'bg-base-200 text-base-content/70'" :title="room.rnnoiseActive.value ? 'AI noise cancellation' : 'Noise cancellation'" @click="room.toggleNoise()">
          <Wand2 class="w-5 h-5" :stroke-width="1.75" />
        </button>
        <button class="w-11 h-11 rounded-full flex items-center justify-center" :class="room.sharingScreen.value ? 'bg-primary/15 text-primary' : 'bg-base-200 text-base-content/70'" title="Share screen" @click="room.toggleScreenShare()">
          <MonitorUp class="w-5 h-5" :stroke-width="1.75" />
        </button>
        <button v-if="room.isHost.value" class="h-11 px-4 rounded-full bg-error text-white text-sm font-semibold" @click="room.endMeeting()">End</button>
        <button class="w-11 h-11 rounded-full bg-error text-white flex items-center justify-center" title="Leave" @click="leaveRoom">
          <PhoneOff class="w-5 h-5" :stroke-width="1.75" />
        </button>
      </footer>

      <!-- admit panel (host / members) -->
      <div v-if="room.canAdmit.value && room.waiting.value.length" class="fixed top-4 right-4 z-40 w-72 rounded-2xl border border-base-300 bg-base-100 shadow-2xl overflow-hidden">
        <div class="px-3 py-2 border-b border-base-300 text-xs font-semibold uppercase tracking-wider text-base-content/50">Waiting to join</div>
        <div class="max-h-64 overflow-y-auto p-2 flex flex-col gap-1.5">
          <div v-for="p in room.waiting.value" :key="p.userId" class="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-base-200">
            <HexAvatar :name="p.name" :color-key="p.userId" :size="28" />
            <span class="flex-1 min-w-0 text-sm font-medium truncate">{{ p.name }}</span>
            <button class="btn btn-xs btn-primary" @click="room.admit(p.userId)">Admit</button>
            <button class="btn btn-xs btn-ghost" @click="room.deny(p.userId)">Deny</button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
