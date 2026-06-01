<script setup lang="ts">
import { computed } from 'vue'
import { Mic, MicOff, PhoneOff, Hash } from 'lucide-vue-next'
import type { DialerCallStatus } from '../../../shared/ipc-channels-dialer'

const props = defineProps<{
  status: DialerCallStatus
  remoteE164: string | null
  elapsedMs: number
  muted: boolean
}>()

const emit = defineEmits<{
  (e: 'hangup'): void
  (e: 'toggle-mute'): void
  (e: 'toggle-dtmf'): void
}>()

const statusLabel = computed(() => {
  switch (props.status) {
    case 'connecting': return 'Connecting…'
    case 'ringing': return 'Ringing…'
    case 'in-call': return formatElapsed(props.elapsedMs)
    case 'ended': return 'Call ended'
    case 'failed': return 'Call failed'
    default: return ''
  }
})

const isLive = computed(() =>
  props.status === 'connecting' || props.status === 'ringing' || props.status === 'in-call',
)

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
</script>

<template>
  <div class="flex flex-col items-center justify-between flex-1 py-8">
    <!-- Caller info -->
    <div class="text-center">
      <div class="text-[10px] uppercase tracking-widest text-base-content/40 mb-2">
        {{ status === 'in-call' ? 'In call' : status === 'ended' ? 'Recently' : 'Calling' }}
      </div>
      <div class="text-2xl font-light text-base-content tracking-tight">
        {{ remoteE164 || '—' }}
      </div>
      <div class="mt-3 flex items-center justify-center gap-2 text-xs text-base-content/60">
        <span
          v-if="isLive"
          class="w-1.5 h-1.5 rounded-full bg-green-500"
          :class="{ 'animate-pulse': status !== 'in-call' }"
        />
        <span>{{ statusLabel }}</span>
      </div>
    </div>

    <!-- In-call controls -->
    <div v-if="status === 'in-call'" class="grid grid-cols-3 gap-6 w-56">
      <button
        class="flex flex-col items-center gap-1.5 group"
        @click="emit('toggle-mute')"
      >
        <span
          class="w-12 h-12 rounded-full flex items-center justify-center border transition-colors"
          :class="muted
            ? 'bg-base-content/10 border-base-content/20'
            : 'bg-base-200 border-base-300 group-hover:border-primary'"
        >
          <component :is="muted ? MicOff : Mic" class="w-5 h-5" :class="muted ? 'text-base-content' : 'text-base-content/70'" />
        </span>
        <span class="text-[10px] text-base-content/50">{{ muted ? 'Unmute' : 'Mute' }}</span>
      </button>

      <button
        class="flex flex-col items-center gap-1.5 group"
        @click="emit('toggle-dtmf')"
      >
        <span class="w-12 h-12 rounded-full flex items-center justify-center bg-base-200 border border-base-300 group-hover:border-primary transition-colors">
          <Hash class="w-5 h-5 text-base-content/70" />
        </span>
        <span class="text-[10px] text-base-content/50">Keypad</span>
      </button>

      <button
        class="flex flex-col items-center gap-1.5 group"
        @click="emit('hangup')"
      >
        <span class="w-12 h-12 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-600 transition-colors">
          <PhoneOff class="w-5 h-5 text-white" />
        </span>
        <span class="text-[10px] text-base-content/50">End</span>
      </button>
    </div>

    <!-- Pre-answer: only hangup -->
    <div v-else-if="isLive" class="flex justify-center">
      <button
        class="w-14 h-14 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-600 transition-colors"
        title="Cancel"
        @click="emit('hangup')"
      >
        <PhoneOff class="w-6 h-6 text-white" />
      </button>
    </div>

    <!-- After call: placeholder -->
    <div v-else class="text-xs text-base-content/40">
      Tap a number to start a new call
    </div>
  </div>
</template>
