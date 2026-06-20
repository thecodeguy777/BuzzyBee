<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { Play } from 'lucide-vue-next'

// Binds a live MediaStream to a <video>. Vue can't set srcObject from a
// template (it's a property), so we wire it via a ref. Muted because remote
// audio plays through separate <audio> elements in useMeetingRoom.
//
// iOS Safari is the reason this is more than a one-liner: it does NOT reliably
// honor the `autoplay` attribute for a remote MediaStream assigned after mount
// (or while a track is still 'muted' with no frames yet), and Low Power Mode
// blocks muted autoplay outright. So we drive playback explicitly — call play()
// after binding, again as frames start flowing (loadedmetadata/canplay/unmute),
// and fall back to a tap-to-play overlay if the browser refuses.
const props = defineProps<{ stream: MediaStream | null; mirror?: boolean }>()
const el = ref<HTMLVideoElement | null>(null)
const blocked = ref(false)
let tracked: MediaStreamTrack[] = []

function tryPlay() {
  const v = el.value
  if (!v || !v.srcObject) return
  const p = v.play()
  if (p && typeof p.then === 'function') {
    p.then(() => (blocked.value = false)).catch(() => (blocked.value = true))
  }
}

function untrack() {
  for (const t of tracked) t.removeEventListener('unmute', tryPlay)
  tracked = []
}

function bind() {
  const v = el.value
  if (!v) return
  untrack()
  v.srcObject = props.stream ?? null
  if (!props.stream) {
    blocked.value = false
    return
  }
  tryPlay()
  tracked = props.stream.getVideoTracks()
  for (const t of tracked) t.addEventListener('unmute', tryPlay)
}

onMounted(() => {
  bind()
  el.value?.addEventListener('loadedmetadata', tryPlay)
  el.value?.addEventListener('canplay', tryPlay)
})
watch(() => props.stream, bind)
onBeforeUnmount(() => {
  untrack()
  el.value?.removeEventListener('loadedmetadata', tryPlay)
  el.value?.removeEventListener('canplay', tryPlay)
})
</script>

<template>
  <div class="w-full h-full" @click="tryPlay">
    <video
      ref="el"
      autoplay
      playsinline
      muted
      class="w-full h-full object-cover bg-black"
      :class="mirror ? 'scale-x-[-1]' : ''"
    />
    <!-- Autoplay refused (e.g. iOS Low Power Mode): a tap is a user gesture. -->
    <button
      v-if="blocked"
      type="button"
      class="absolute inset-0 grid place-items-center bg-black/55 text-white"
      title="Tap to play"
      @click.stop="tryPlay"
    >
      <Play class="w-7 h-7" :stroke-width="1.75" />
    </button>
  </div>
</template>
