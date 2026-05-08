<script setup lang="ts">
import { onMounted, ref, computed, watch, nextTick } from 'vue'
import { Mic, Square, Radio, Headphones, Volume2 } from 'lucide-vue-next'
import { useMeetingStore } from '../stores/meeting'
import { useTranscription, type CaptureMode } from '../composables/useTranscription'
import { useDeepgramStream } from '../composables/useDeepgramStream'
import { useSettingsStore } from '../stores/settings'
import ClientPicker from './ClientPicker.vue'
import LiveIntelligence from './LiveIntelligence.vue'
import CoachingCardLive from './CoachingCardLive.vue'
import SpeakerChip from './SpeakerChip.vue'

const selectedClientId = ref<string | null>(null)
const activeClientName = ref<string | null>(null)

async function refreshActiveClientName() {
  if (!selectedClientId.value) {
    activeClientName.value = null
    return
  }
  const list = await window.electronAPI.clients.list()
  activeClientName.value = list.find(c => c.id === selectedClientId.value)?.name ?? null
}

watch(selectedClientId, () => { refreshActiveClientName() })

const meeting = useMeetingStore()
const settingsStore = useSettingsStore()
const transcription = useTranscription()
const deepgram = useDeepgramStream()

// Active transcription engine (chosen at start)
const activeEngine = ref<'deepgram' | 'elevenlabs'>('deepgram')

const audioPermissionRequested = ref(false)
const micError = ref<string | null>(null)
const captureMode = ref<CaptureMode>('both')

const captureModes: { value: CaptureMode; label: string; description: string; icon: any }[] = [
  { value: 'mic', label: 'Microphone only', description: 'Just your voice. Use for solo testing.', icon: Mic },
  { value: 'system', label: 'System audio only', description: 'Just what\'s playing through speakers (the client side of a Meet/Zoom call).', icon: Volume2 },
  { value: 'both', label: 'Both (recommended)', description: 'Mic + system audio mixed. Captures both sides of the conversation.', icon: Headphones },
]

// Wire transcription chunks (both engines feed the same store)
transcription.onChunk((chunk) => {
  meeting.addTranscriptChunk(chunk)
})
deepgram.onChunk((chunk) => {
  meeting.addTranscriptChunk(chunk)
})

async function ensureMicAccess(): Promise<boolean> {
  if (audioPermissionRequested.value) return true
  try {
    // Request mic permission first — Web Speech API needs this granted
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach(t => t.stop()) // immediately release
    audioPermissionRequested.value = true
    micError.value = null
    return true
  } catch (err) {
    micError.value = `Microphone access denied: ${err}`
    return false
  }
}

async function handleStart() {
  if (captureMode.value !== 'system') {
    const hasMic = await ensureMicAccess()
    if (!hasMic) return
  }

  // Pick engine based on settings: Deepgram if key present, else ElevenLabs
  await settingsStore.load()
  const useDeepgram = settingsStore.settings.deepgramApiKey?.trim().length > 0
    && settingsStore.settings.transcriptionProvider !== 'elevenlabs'
  activeEngine.value = useDeepgram ? 'deepgram' : 'elevenlabs'

  meeting.startMeeting(captureMode.value)
  if (activeEngine.value === 'deepgram') {
    deepgram.start(captureMode.value)
  } else {
    transcription.start(captureMode.value)
  }
}

async function handleEnd() {
  if (activeEngine.value === 'deepgram') {
    deepgram.stop()
  } else {
    transcription.stop()
  }
  await meeting.endMeeting()
}

const liveTranscript = computed(() => {
  return meeting.transcript.filter(t => t.isFinal)
})

// Auto-scroll to bottom only when user is already at (or near) the bottom
const transcriptScroll = ref<HTMLElement | null>(null)
const autoScroll = ref(true)

function onTranscriptScroll() {
  if (!transcriptScroll.value) return
  const el = transcriptScroll.value
  const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  autoScroll.value = distFromBottom < 40
}

watch(() => meeting.transcript.length, () => {
  if (!autoScroll.value) return
  nextTick(() => {
    if (transcriptScroll.value) {
      transcriptScroll.value.scrollTop = transcriptScroll.value.scrollHeight
    }
  })
})

// Merge consecutive same-speaker (by speakerKey) chunks for display
const groupedTranscript = computed(() => {
  const groups: { speakerKey: string; fallbackLabel: string; text: string; timestamp: number }[] = []
  for (const line of liveTranscript.value) {
    const last = groups[groups.length - 1]
    if (last && last.speakerKey === line.speakerKey) {
      last.text += ' ' + line.text
    } else {
      groups.push({
        speakerKey: line.speakerKey,
        fallbackLabel: line.speaker,
        text: line.text,
        timestamp: line.timestamp,
      })
    }
  }
  return groups
})

const currentInterim = computed(() => transcription.interimText.value)

onMounted(() => {
  window.electronAPI.meeting.onCoachingPrompt((data) => {
    meeting.addCoachingPrompt(data)
  })
  window.electronAPI.meeting.onCoachingCard((data) => {
    meeting.addCoachingCard(data)
  })
  window.electronAPI.meeting.onStateUpdate((data) => {
    meeting.setIntelligence(data)
  })
  window.electronAPI.meeting.onSummaryChunk((data) => {
    meeting.appendSummary(data.chunk, data.done)
  })
})

function dismissCard(timestamp: number) {
  meeting.coachingCards = meeting.coachingCards.filter(c => c.timestamp !== timestamp)
}
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-[280px_1fr] h-full overflow-hidden">
    <!-- Live Intelligence sidebar -->
    <LiveIntelligence class="hidden lg:flex lg:h-[calc(100vh-9.5rem)]" />

    <!-- Main content area -->
    <div class="p-6 overflow-y-auto">
    <!-- Status bar -->
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <div
          class="w-3 h-3 rounded-full"
          :class="meeting.isActive ? 'bg-red-500 rec-blink' : meeting.status === 'processing' ? 'bg-yellow-500' : 'bg-base-300'"
        ></div>
        <span class="text-sm font-medium text-base-content/70">
          {{
            meeting.isActive ? 'Listening (using microphone)'
            : meeting.status === 'processing' ? 'Generating summary...'
            : 'Ready'
          }}
        </span>
      </div>
      <span v-if="meeting.isActive" class="font-mono text-xs text-base-content/50 bg-base-200 px-2 py-1 rounded">
        {{ meeting.formatElapsed(meeting.elapsed) }}
      </span>
    </div>

    <!-- Active client banner during a meeting -->
    <div v-if="meeting.isActive && selectedClientId" class="mb-4 px-3 py-2 rounded-md border border-primary/20 bg-primary/5 text-xs text-primary/80">
      Recording for: <span class="font-semibold">{{ activeClientName }}</span>
    </div>

    <!-- Client picker (hidden during meeting) -->
    <div v-if="!meeting.isActive && meeting.status !== 'processing'" class="mb-5">
      <ClientPicker v-model="selectedClientId" />
    </div>

    <!-- Capture mode picker (hidden during meeting) -->
    <div v-if="!meeting.isActive && meeting.status !== 'processing'" class="mb-5">
      <div class="text-[11px] uppercase tracking-wider text-base-content/40 mb-2">Audio Source</div>
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="m in captureModes"
          :key="m.value"
          class="border rounded-lg p-3 text-left transition-all"
          :class="captureMode === m.value
            ? 'border-primary bg-primary/5'
            : 'border-base-300 hover:border-primary/50'"
          @click="captureMode = m.value"
        >
          <component :is="m.icon" class="w-3.5 h-3.5 mb-1.5" :class="captureMode === m.value ? 'text-primary' : 'text-base-content/50'" />
          <div class="text-[11px] font-semibold leading-tight" :class="captureMode === m.value ? 'text-primary' : 'text-base-content/80'">{{ m.label }}</div>
          <div class="text-[10px] text-base-content/50 mt-1 leading-tight">{{ m.description }}</div>
        </button>
      </div>
    </div>

    <!-- Main action button -->
    <div class="flex gap-3">
      <button
        v-if="!meeting.isActive && meeting.status !== 'processing'"
        class="flex-1 inline-flex items-center justify-center gap-2 bg-hivemind text-white font-medium py-3 px-6 rounded-lg hover:opacity-90 transition-opacity text-sm"
        @click="handleStart"
      >
        <Mic class="w-4 h-4" />
        Start Meeting
      </button>

      <button
        v-if="meeting.status === 'processing'"
        class="flex-1 inline-flex items-center justify-center gap-2 border border-base-300 text-base-content/70 py-3 px-6 rounded-lg hover:bg-base-200 transition-colors text-sm"
        @click="meeting.resetMeeting()"
      >
        Cancel / Reset
      </button>

      <button
        v-if="meeting.isActive"
        class="flex-1 inline-flex items-center justify-center gap-2 bg-red-500 text-white font-medium py-3 px-6 rounded-lg hover:bg-red-600 transition-colors text-sm"
        @click="handleEnd"
      >
        <Square class="w-4 h-4" />
        End Meeting
      </button>

      <button
        v-if="meeting.isActive"
        class="inline-flex items-center justify-center gap-2 border border-base-300 text-base-content/70 py-3 px-4 rounded-lg hover:bg-base-200 transition-colors text-sm"
        @click="window.electronAPI.overlay.toggle()"
      >
        <Radio class="w-4 h-4" />
        Overlay
      </button>
    </div>

    <!-- Errors -->
    <div v-if="micError" class="mt-4 p-3 border border-red-300 bg-red-50 rounded-lg text-xs text-red-700">
      {{ micError }}
    </div>
    <div v-if="transcription.error.value" class="mt-4 p-3 border border-red-300 bg-red-50 rounded-lg text-xs text-red-700">
      {{ transcription.error.value }}
    </div>

    <!-- Live transcript area -->
    <div v-if="meeting.isActive" class="mt-6">
      <div class="flex items-center justify-between mb-2">
        <span class="text-[11px] uppercase tracking-wider text-base-content/40">Live Transcript</span>
        <div class="flex items-center gap-2">
          <span class="text-[10px] text-base-content/40">{{ liveTranscript.length }} lines</span>
          <button
            v-if="!autoScroll"
            class="text-[10px] text-primary hover:underline"
            @click="autoScroll = true; nextTick(() => transcriptScroll && (transcriptScroll.scrollTop = transcriptScroll.scrollHeight))"
          >
            Jump to live ↓
          </button>
        </div>
      </div>
      <div
        ref="transcriptScroll"
        class="border border-base-300 rounded-lg p-4 h-96 overflow-y-auto bg-gradient-to-br from-base-200/50 to-primary/[0.02]"
        @scroll="onTranscriptScroll"
      >
        <!-- No content state -->
        <div v-if="liveTranscript.length === 0 && !currentInterim" class="text-center py-8">
          <div class="inline-flex items-center gap-2 text-xs text-base-content/40">
            <span class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
            Waiting for speech...
          </div>
        </div>

        <!-- Grouped transcript: consecutive same-speaker chunks merged -->
        <div class="space-y-3">
          <div
            v-for="(group, i) in groupedTranscript"
            :key="`${group.timestamp}-${i}`"
            class="text-sm leading-relaxed animate-fade-in flex gap-2 items-start"
          >
            <SpeakerChip
              :speaker-key="group.speakerKey"
              :fallback-label="group.fallbackLabel"
              class="mt-0.5"
            />
            <span class="text-base-content/85">{{ group.text }}</span>
          </div>
        </div>

        <!-- Interim (in-progress) text -->
        <div v-if="currentInterim" class="mt-1.5 text-sm text-base-content/40 italic leading-relaxed">
          <span class="font-medium text-primary/40 mr-1">You:</span>
          {{ currentInterim }}
        </div>
      </div>
    </div>

    <!-- Coaching cards (newest first) -->
    <div v-if="meeting.coachingCards.length > 0" class="mt-6 space-y-3">
      <CoachingCardLive
        v-for="card in [...meeting.coachingCards].slice(-3).reverse()"
        :key="card.timestamp"
        :card="card"
        @dismiss="dismissCard(card.timestamp)"
      />
    </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes fade-in {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in {
  animation: fade-in 0.3s ease-out;
}
</style>
