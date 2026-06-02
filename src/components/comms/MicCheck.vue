<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { Mic, Volume2, X } from 'lucide-vue-next'

defineEmits<{ (e: 'close'): void }>()

const MIC_DEVICE_KEY = 'buzzybee.comms.mic-device'

const devices = ref<MediaDeviceInfo[]>([])
const selected = ref<string>(
  typeof window !== 'undefined' ? window.localStorage.getItem(MIC_DEVICE_KEY) || '' : '',
)
const level = ref(0) // 0..1, smoothed
const error = ref<string | null>(null)
const ready = ref(false)

let stream: MediaStream | null = null
let ctx: AudioContext | null = null
let raf = 0

async function start(deviceId?: string) {
  stop()
  error.value = null
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    })
    ready.value = true
    // Device labels are only populated once mic permission is granted.
    const all = await navigator.mediaDevices.enumerateDevices()
    devices.value = all.filter((d) => d.kind === 'audioinput')
    if (!selected.value) {
      const active = stream.getAudioTracks()[0]?.getSettings().deviceId
      selected.value = active || devices.value[0]?.deviceId || ''
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext
    ctx = new AC()
    const src = ctx.createMediaStreamSource(stream)
    const an = ctx.createAnalyser()
    an.fftSize = 512
    src.connect(an)
    const buf = new Uint8Array(an.fftSize)
    const tick = () => {
      raf = requestAnimationFrame(tick)
      an.getByteTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128
        sum += v * v
      }
      const rms = Math.min(1, Math.sqrt(sum / buf.length) * 3)
      level.value = Math.max(rms, level.value * 0.85) // quick attack, smooth decay
    }
    tick()
  } catch {
    error.value = 'Microphone blocked or unavailable. Allow mic access in your browser, then retry.'
    ready.value = false
  }
}

function stop() {
  if (raf) {
    cancelAnimationFrame(raf)
    raf = 0
  }
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  ctx?.close().catch(() => {})
  ctx = null
  level.value = 0
}

function onSelect() {
  if (typeof window !== 'undefined') window.localStorage.setItem(MIC_DEVICE_KEY, selected.value)
  void start(selected.value || undefined)
}

// A short, gentle test tone so you can confirm your speakers/headset output.
function playTest() {
  const AC = window.AudioContext || (window as any).webkitAudioContext
  const c = new AC()
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = 'sine'
  o.frequency.value = 523.25 // C5
  g.gain.setValueAtTime(0.0001, c.currentTime)
  g.gain.exponentialRampToValueAtTime(0.18, c.currentTime + 0.04)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.55)
  o.connect(g)
  g.connect(c.destination)
  o.start()
  o.stop(c.currentTime + 0.6)
  o.onended = () => c.close().catch(() => {})
}

onMounted(() => start(selected.value || undefined))
onBeforeUnmount(stop)
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" @click.self="$emit('close')">
      <div class="w-full max-w-sm rounded-2xl bg-base-100 border border-base-300 shadow-xl overflow-hidden">
        <header class="flex items-center gap-2 px-4 py-3 border-b border-base-300">
          <Mic class="w-4 h-4 text-primary" :stroke-width="1.75" />
          <span class="text-sm font-semibold">Mic &amp; sound check</span>
          <div class="flex-1" />
          <button class="w-7 h-7 rounded-md hover:bg-base-200 flex items-center justify-center text-base-content/50" @click="$emit('close')">
            <X class="w-4 h-4" :stroke-width="1.75" />
          </button>
        </header>

        <div class="p-4 space-y-4">
          <p v-if="error" class="text-xs text-error">{{ error }}</p>

          <div>
            <label class="block text-[0.7rem] font-medium uppercase tracking-wider text-base-content/50 mb-1">Microphone</label>
            <select
              v-model="selected"
              class="select select-bordered select-sm w-full"
              :disabled="!ready || devices.length === 0"
              @change="onSelect"
            >
              <option v-if="devices.length === 0" value="">Default microphone</option>
              <option v-for="d in devices" :key="d.deviceId" :value="d.deviceId">
                {{ d.label || 'Microphone' }}
              </option>
            </select>
          </div>

          <div>
            <div class="flex items-center justify-between text-[0.7rem] text-base-content/50 mb-1">
              <span>Input level — say something</span>
              <span v-if="ready && level > 0.05" class="text-success font-medium">picking up ✓</span>
            </div>
            <div class="h-3 rounded-full bg-base-200 overflow-hidden">
              <div
                class="h-full rounded-full transition-[width] duration-75"
                :class="level > 0.6 ? 'bg-warning' : 'bg-success'"
                :style="{ width: Math.round(level * 100) + '%' }"
              />
            </div>
          </div>

          <button class="btn btn-sm btn-block gap-2" @click="playTest">
            <Volume2 class="w-4 h-4" :stroke-width="1.75" /> Play test sound
          </button>

          <p class="text-[0.7rem] text-base-content/50 leading-relaxed">
            Your selected mic is used when you join a huddle. If you hear the test tone and the bar moves when you talk, you're good to go.
          </p>
        </div>

        <div class="px-4 py-3 bg-base-200/50 border-t border-base-300 flex justify-end">
          <button class="btn btn-primary btn-sm" @click="$emit('close')">Done</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
