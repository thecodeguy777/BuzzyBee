/// <reference types="vite/client" />

import type { TranscriptChunk, CoachingPromptData, SummaryChunkData, AppSettings, AuthSession } from '../shared/ipc-channels'

export interface ActionItem {
  id: string
  task: string
  assignee: 'VA' | 'Client'
  deadline: string | null
  status: 'new' | 'expanded' | 'simplified' | 'done'
}
export interface OpenQuestion {
  id: string
  question: string
  asked_by: 'VA' | 'Client'
  context: string
}
export interface Decision { id: string; decision: string }
export interface MeetingIntelligenceState {
  actionItems: ActionItem[]
  openQuestions: OpenQuestion[]
  decisions: Decision[]
  clientPreferences: string[]
  redFlags: string[]
}
export interface CoachingCardData {
  trigger: string
  category: string
  scripts: { safe: string; sharp: string; bold: string }
  capture: string | null
  timestamp: number
}

declare global {
  interface Window {
    electronAPI: {
      meeting: {
        retrySummary: () => Promise<{ success: boolean }>
        start: (payload?: { captureMode?: 'mic' | 'system' | 'both' }) => Promise<{ success: boolean }>
        end: () => Promise<{ success: boolean; durationSeconds?: number }>
        sendTranscriptChunk: (chunk: TranscriptChunk) => Promise<void>
        onCoachingPrompt: (cb: (data: CoachingPromptData) => void) => void
        onCoachingCard: (cb: (data: CoachingCardData) => void) => void
        onStateUpdate: (cb: (data: MeetingIntelligenceState) => void) => void
        onSummaryChunk: (cb: (data: SummaryChunkData) => void) => void
      }
      settings: {
        get: () => Promise<AppSettings>
        set: (settings: Partial<AppSettings>) => Promise<void>
      }
      overlay: {
        toggle: () => Promise<void>
      }
      dialer: {
        open: () => Promise<void>
      }
      auth: {
        signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string; session?: AuthSession }>
        signOut: () => Promise<{ success: boolean }>
        getSession: () => Promise<AuthSession | null>
      }
      history: {
        list: () => Promise<Array<{
          id: string
          title: string | null
          startedAt: string
          endedAt: string | null
          durationSeconds: number | null
          summaryText: string | null
          clientId: string | null
          clientName: string | null
        }>>
        detail: (id: string) => Promise<any | null>
        exportPdf: (id: string) => Promise<{ success: boolean; path?: string; error?: string }>
        regenerateSummary: (id: string) => Promise<{ success: boolean; summaryText?: string; parsed?: any; error?: string }>
      }
      clients: {
        list: () => Promise<Array<{ id: string; name: string; status: string | null }>>
        setActive: (clientId: string | null) => Promise<void>
      }
      onSyncStatus: (cb: (data: { status: 'syncing' | 'synced' | 'error'; error?: string }) => void) => void
      transcribe: (payload: { base64: string; mimeType: string }) => Promise<string | null>
      getDesktopSources: () => Promise<{ id: string; name: string }[]>
      // Overlay-only APIs
      onTranscriptLine: (cb: (data: TranscriptChunk) => void) => void
      onCoachingPrompt: (cb: (data: CoachingPromptData) => void) => void
      onMeetingStatus: (cb: (data: { status: 'active' | 'ended' }) => void) => void
    }
  }
}

export {}
