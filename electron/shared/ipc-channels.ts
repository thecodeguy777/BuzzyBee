// ── IPC Channel Names ──

export const IPC = {
  // Renderer → Main (invoke/handle)
  MEETING_START: 'meeting:start',
  MEETING_END: 'meeting:end',
  MEETING_TRANSCRIPT_CHUNK: 'meeting:send-transcript-chunk',
  MEETING_GET_HISTORY: 'meeting:get-history',
  MEETING_GET_SUMMARY: 'meeting:get-summary',

  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  OVERLAY_TOGGLE: 'overlay:toggle',

  TRANSCRIBE_AUDIO: 'transcribe:audio',
  GET_DESKTOP_SOURCES: 'desktop:get-sources',

  AUTH_SIGN_IN: 'auth:sign-in',
  AUTH_SIGN_OUT: 'auth:sign-out',
  AUTH_GET_SESSION: 'auth:get-session',

  MEETING_SYNC: 'meeting:sync',
  MEETING_FETCH_HISTORY: 'meeting:fetch-history',
  MEETING_FETCH_DETAIL: 'meeting:fetch-detail',
  MEETING_SET_CLIENT: 'meeting:set-client',
  MEETING_RETRY_SUMMARY: 'meeting:retry-summary',
  MEETING_EXPORT_PDF: 'meeting:export-pdf',
  CLIENTS_LIST: 'clients:list',

  // Main → Control Window
  COACHING_PROMPT: 'meeting:coaching-prompt',
  COACHING_CARD: 'meeting:coaching-card',
  STATE_UPDATE: 'meeting:state-update',
  SUMMARY_CHUNK: 'meeting:summary-chunk',
  SYNC_STATUS: 'meeting:sync-status',

  // Main → Overlay Window
  OVERLAY_TRANSCRIPT: 'overlay:transcript-line',
  OVERLAY_COACHING: 'overlay:coaching-prompt',
  OVERLAY_STATUS: 'overlay:meeting-status',
} as const

// ── Type Contracts ──

export interface TranscriptChunk {
  speaker: string         // display name e.g. "Mary", "Client", "VA · 1"
  speakerKey: string      // stable id for the underlying voice e.g. "mic:0", "sys:1"
  text: string
  timestamp: number
  isFinal: boolean
}

export interface CoachingPromptData {
  text: string
  timestamp: number
}

export interface SummaryChunkData {
  chunk: string
  done: boolean
}

export interface MeetingSummary {
  id: string
  summary: string
  keyDecisions: string[]
  actionItems: { task: string; assignee?: string; deadline?: string }[]
  createdAt: string
}

export interface MeetingRecord {
  id: string
  startedAt: string
  endedAt: string | null
  durationSeconds: number | null
  clientId: string | null
}

export interface AuthSession {
  userId: string
  email: string | null
  fullName: string | null
}

export interface AppSettings {
  geminiApiKey: string
  groqApiKey: string
  elevenLabsApiKey: string
  deepgramApiKey: string
  transcriptionProvider: 'elevenlabs' | 'deepgram'
  llmProvider: 'gemini' | 'groq'
  overlayPosition: { x: number; y: number }
  overlayOpacity: number
  coachingEnabled: boolean
  coachingIntervalSeconds: number
}
