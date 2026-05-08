<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { Mic, MicOff } from 'lucide-vue-next'

const devices = ref<MediaDeviceInfo[]>([])
const selectedDevice = ref<string>('default')
const permissionState = ref<'unknown' | 'granted' | 'denied'>('unknown')
const audioLevel = ref(0)
const isListening = ref(false)
const error = ref<string | null>(null)

let stream: MediaStream | null = null
let audioContext: AudioContext | null = null
let analyser: AnalyserNode | null = null
let rafId: number | null = null

async function loadDevices() {
  try {
    const list = await navigator.mediaDevices.enumerateDevices()
    devices.value = list.filter(d => d.kind === 'audioinput')
    if (devices.value.length === 0) {
      error.value = 'No microphones found'
    }
  } catch (err) {
    error.value = `Failed to list devices: ${err}`
  }
}

async function requestPermission() {
  try {
    error.value = null
    const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    tempStream.getTracks().forEach(t => t.stop())
    permissionState.value = 'granted'
    await loadDevices()
  } catch (err) {
    permissionState.value = 'denied'
    error.value = `Permission denied: ${err}`
  }
}

async function startMonitoring() {
  if (isListening.value) {
    stopMonitoring()
    return
  }

  try {
    error.value = null
    const constraints: MediaStreamConstraints = {
      audio: selectedDevice.value === 'default'
        ? true
        : { deviceId: { exact: selectedDevice.value } }
    }

    stream = await navigator.mediaDevices.getUserMedia(constraints)
    audioContext = new AudioContext()
    const source = audioContext.createMediaStreamSource(stream)
    analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)

    isListening.value = true
    permissionState.value = 'granted'

    const dataArray = new Uint8Array(analyser.frequencyBinCount)

    function tick() {
      if (!analyser) return
      analyser.getByteFrequencyData(dataArray)
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
      audioLevel.value = Math.min(100, (avg / 128) * 100)
      rafId = requestAnimationFrame(tick)
    }
    tick()
  } catch (err) {
    error.value = `Failed to access mic: ${err}`
    isListening.value = false
  }
}

function stopMonitoring() {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = null
  if (stream) {
    stream.getTracks().forEach(t => t.stop())
    stream = null
  }
  if (audioContext) {
    audioContext.close()
    audioContext = null
  }
  analyser = null
  isListening.value = false
  audioLevel.value = 0
}

onMounted(async () => {
  await loadDevices()
  // Check permission status
  try {
    const result = await (navigator.permissions as any).query({ name: 'microphone' })
    permissionState.value = result.state === 'granted' ? 'granted' : result.state === 'denied' ? 'denied' : 'unknown'
  } catch {
    // Permissions API not available, leave as unknown
  }
})

onBeforeUnmount(() => {
  stopMonitoring()
})
</script>

<template>
  <div class="border border-base-300 rounded-lg p-4">
    <div class="flex items-center gap-2 mb-3">
      <component :is="isListening ? Mic : MicOff" class="w-3.5 h-3.5" :class="isListening ? 'text-primary' : 'text-base-content/40'" />
      <span class="text-[11px] uppercase tracking-wider text-base-content/50">Microphone Setup</span>
    </div>

    <!-- Permission state -->
    <div v-if="permissionState === 'unknown' && devices.length === 0" class="mb-3">
      <button
        class="text-xs bg-primary text-primary-content px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity"
        @click="requestPermission"
      >
        Grant Microphone Access
      </button>
    </div>

    <div v-else-if="permissionState === 'denied'" class="mb-3 text-xs text-red-600">
      Microphone access denied. Open Windows Settings → Privacy → Microphone to enable.
    </div>

    <!-- Device picker -->
    <div v-if="devices.length > 0" class="mb-3">
      <label class="block text-[10px] uppercase tracking-wider text-base-content/40 mb-1">Input device</label>
      <select
        v-model="selectedDevice"
        class="w-full border border-base-300 rounded-md px-3 py-1.5 text-xs bg-base-100 focus:border-primary focus:outline-none"
      >
        <option value="default">System default</option>
        <option v-for="d in devices" :key="d.deviceId" :value="d.deviceId">
          {{ d.label || `Microphone ${d.deviceId.slice(0, 8)}` }}
        </option>
      </select>
    </div>

    <!-- Test button + level meter -->
    <div v-if="devices.length > 0">
      <button
        class="w-full text-xs border rounded-md py-2 px-3 transition-all"
        :class="isListening
          ? 'border-primary bg-primary/5 text-primary'
          : 'border-base-300 text-base-content/70 hover:border-primary'"
        @click="startMonitoring"
      >
        {{ isListening ? 'Stop test' : 'Test microphone' }}
      </button>

      <!-- Audio level meter -->
      <div v-if="isListening" class="mt-3">
        <div class="text-[10px] text-base-content/40 mb-1">
          Audio level — speak into your microphone
        </div>
        <div class="h-2 bg-base-200 rounded-full overflow-hidden">
          <div
            class="h-full transition-all duration-75 rounded-full"
            :style="{
              width: `${audioLevel}%`,
              background: audioLevel > 5
                ? 'linear-gradient(90deg, #2563eb, #a855f7)'
                : '#cbd5e1'
            }"
          ></div>
        </div>
        <div class="mt-1.5 text-[10px]" :class="audioLevel > 5 ? 'text-primary font-medium' : 'text-base-content/30'">
          {{ audioLevel > 30 ? 'Loud and clear' : audioLevel > 5 ? 'Detected' : 'Silent — speak louder or check your mic' }}
        </div>
      </div>
    </div>

    <!-- Errors -->
    <div v-if="error" class="mt-3 text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
      {{ error }}
    </div>
  </div>
</template>
