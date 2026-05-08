import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TranscriptChunk, CoachingPromptData } from '../../shared/ipc-channels'
import type { MeetingIntelligenceState, CoachingCardData } from '../env'

const EMPTY_STATE: MeetingIntelligenceState = {
  actionItems: [],
  openQuestions: [],
  decisions: [],
  clientPreferences: [],
  redFlags: [],
}

export const useMeetingStore = defineStore('meeting', () => {
  const status = ref<'idle' | 'active' | 'processing'>('idle')
  const transcript = ref<TranscriptChunk[]>([])
  const coachingPrompts = ref<CoachingPromptData[]>([])
  const coachingCards = ref<CoachingCardData[]>([])
  const intelligence = ref<MeetingIntelligenceState>({ ...EMPTY_STATE })
  // speakerKey ('mic:0', 'sys:1', ...) → custom display name
  const speakerNames = ref<Record<string, string>>({})

  function speakerLabel(chunk: TranscriptChunk): string {
    const named = speakerNames.value[chunk.speakerKey]
    if (named) return named
    // Auto-suffix based on key tail
    const tail = chunk.speakerKey.split(':')[1]
    return tail === '0' ? chunk.speaker : `${chunk.speaker} · ${parseInt(tail, 10) + 1}`
  }

  function renameSpeaker(speakerKey: string, name: string) {
    if (!name.trim()) {
      delete speakerNames.value[speakerKey]
      speakerNames.value = { ...speakerNames.value }
    } else {
      speakerNames.value = { ...speakerNames.value, [speakerKey]: name.trim() }
    }
  }
  const summaryText = ref('')
  const summaryDone = ref(false)
  const startTime = ref(0)
  const elapsed = ref(0)

  let timerInterval: ReturnType<typeof setInterval> | null = null

  const isActive = computed(() => status.value === 'active')

  function startMeeting(captureMode: 'mic' | 'system' | 'both' = 'mic') {
    status.value = 'active'
    transcript.value = []
    coachingPrompts.value = []
    coachingCards.value = []
    intelligence.value = { ...EMPTY_STATE, actionItems: [], openQuestions: [], decisions: [], clientPreferences: [], redFlags: [] }
    speakerNames.value = {}
    summaryText.value = ''
    summaryDone.value = false
    startTime.value = Date.now()
    elapsed.value = 0

    timerInterval = setInterval(() => {
      elapsed.value = Math.floor((Date.now() - startTime.value) / 1000)
    }, 1000)

    window.electronAPI.meeting.start({ captureMode })
  }

  async function endMeeting() {
    status.value = 'processing'
    summaryText.value = ''
    summaryDone.value = false
    if (timerInterval) {
      clearInterval(timerInterval)
      timerInterval = null
    }

    // 3 minutes — long enough for full Groq retry backoff sequence
    const safetyTimer = setTimeout(() => {
      if (status.value === 'processing') {
        console.warn('[Meeting] Summary timeout, force-resetting')
        status.value = 'idle'
        summaryDone.value = true
      }
    }, 180000)

    try {
      await window.electronAPI.meeting.end()
    } catch (err) {
      console.error('[Meeting] End meeting error:', err)
      status.value = 'idle'
    } finally {
      const watchInterval = setInterval(() => {
        if (status.value !== 'processing') {
          clearTimeout(safetyTimer)
          clearInterval(watchInterval)
        }
      }, 500)
    }
  }

  function resetMeeting() {
    status.value = 'idle'
    transcript.value = []
    coachingPrompts.value = []
    coachingCards.value = []
    intelligence.value = { ...EMPTY_STATE, actionItems: [], openQuestions: [], decisions: [], clientPreferences: [], redFlags: [] }
    summaryText.value = ''
    summaryDone.value = false
    elapsed.value = 0
  }

  function addTranscriptChunk(chunk: TranscriptChunk) {
    transcript.value.push(chunk)
    // Send a name-resolved version to main so AI agents see "Mary" not "You · 2"
    window.electronAPI.meeting.sendTranscriptChunk({
      ...chunk,
      speaker: speakerLabel(chunk),
    })
  }

  function addCoachingPrompt(data: CoachingPromptData) {
    coachingPrompts.value.push(data)
  }

  function addCoachingCard(data: CoachingCardData) {
    coachingCards.value.push(data)
    if (coachingCards.value.length > 8) {
      coachingCards.value = coachingCards.value.slice(-8)
    }
  }

  function setIntelligence(state: MeetingIntelligenceState) {
    intelligence.value = state
  }

  function appendSummary(chunk: string, done: boolean) {
    summaryText.value += chunk
    if (done) {
      summaryDone.value = true
      status.value = 'idle'
    }
  }

  function formatElapsed(secs: number): string {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  return {
    status,
    transcript,
    coachingPrompts,
    coachingCards,
    intelligence,
    speakerNames,
    speakerLabel,
    renameSpeaker,
    summaryText,
    summaryDone,
    elapsed,
    isActive,
    startMeeting,
    endMeeting,
    addTranscriptChunk,
    addCoachingPrompt,
    addCoachingCard,
    setIntelligence,
    appendSummary,
    formatElapsed,
    resetMeeting,
  }
})
