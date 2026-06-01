import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type { TranscriptChunk, CoachingPromptData, SummaryChunkData, AppSettings } from '../shared/ipc-channels'
import { SUPABASE_IPC, type SupabaseTokens } from '../shared/ipc-channels-supabase'
import { DIALER_WINDOW_IPC } from '../shared/ipc-channels-dialer'

console.log('[Preload] Control preload loaded')

try {
contextBridge.exposeInMainWorld('electronAPI', {
  meeting: {
    retrySummary: () => ipcRenderer.invoke(IPC.MEETING_RETRY_SUMMARY),
    start: (payload?: { captureMode?: 'mic' | 'system' | 'both' }) => ipcRenderer.invoke(IPC.MEETING_START, payload),
    end: () => ipcRenderer.invoke(IPC.MEETING_END),
    sendTranscriptChunk: (chunk: TranscriptChunk) => ipcRenderer.invoke(IPC.MEETING_TRANSCRIPT_CHUNK, chunk),
    onCoachingPrompt: (cb: (data: CoachingPromptData) => void) => {
      ipcRenderer.removeAllListeners(IPC.COACHING_PROMPT)
      ipcRenderer.on(IPC.COACHING_PROMPT, (_e, data) => cb(data))
    },
    onCoachingCard: (cb: (data: any) => void) => {
      ipcRenderer.removeAllListeners(IPC.COACHING_CARD)
      ipcRenderer.on(IPC.COACHING_CARD, (_e, data) => cb(data))
    },
    onStateUpdate: (cb: (data: any) => void) => {
      ipcRenderer.removeAllListeners(IPC.STATE_UPDATE)
      ipcRenderer.on(IPC.STATE_UPDATE, (_e, data) => cb(data))
    },
    onSummaryChunk: (cb: (data: SummaryChunkData) => void) => {
      ipcRenderer.removeAllListeners(IPC.SUMMARY_CHUNK)
      ipcRenderer.on(IPC.SUMMARY_CHUNK, (_e, data) => cb(data))
    },
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.SETTINGS_GET),
    set: (settings: Partial<AppSettings>) => ipcRenderer.invoke(IPC.SETTINGS_SET, settings),
  },
  overlay: {
    toggle: () => ipcRenderer.invoke(IPC.OVERLAY_TOGGLE),
  },
  dialer: {
    // Show + focus the floating dialer (same as the Ctrl+Shift+D hotkey,
    // but reachable by a button for users who don't use shortcuts).
    open: () => ipcRenderer.invoke(DIALER_WINDOW_IPC.WINDOW_SHOW),
  },
  transcribe: (payload: { base64: string; mimeType: string }) =>
    ipcRenderer.invoke(IPC.TRANSCRIBE_AUDIO, payload) as Promise<string | null>,
  getDesktopSources: () =>
    ipcRenderer.invoke(IPC.GET_DESKTOP_SOURCES) as Promise<{ id: string; name: string }[]>,
  auth: {
    signIn: (email: string, password: string) => ipcRenderer.invoke(IPC.AUTH_SIGN_IN, { email, password }),
    signOut: () => ipcRenderer.invoke(IPC.AUTH_SIGN_OUT),
    getSession: () => ipcRenderer.invoke(IPC.AUTH_GET_SESSION),
  },
  history: {
    list: () => ipcRenderer.invoke(IPC.MEETING_FETCH_HISTORY),
    detail: (id: string) => ipcRenderer.invoke(IPC.MEETING_FETCH_DETAIL, id),
    exportPdf: (id: string) => ipcRenderer.invoke(IPC.MEETING_EXPORT_PDF, id) as Promise<{ success: boolean; path?: string; error?: string }>,
    regenerateSummary: (id: string) => ipcRenderer.invoke(IPC.MEETING_REGENERATE_SUMMARY, id) as Promise<{ success: boolean; summaryText?: string; parsed?: any; error?: string }>,
  },
  clients: {
    list: () => ipcRenderer.invoke(IPC.CLIENTS_LIST),
    setActive: (clientId: string | null) => ipcRenderer.invoke(IPC.MEETING_SET_CLIENT, clientId),
  },
  onSyncStatus: (cb: (data: { status: 'syncing' | 'synced' | 'error'; error?: string }) => void) => {
    ipcRenderer.removeAllListeners(IPC.SYNC_STATUS)
    ipcRenderer.on(IPC.SYNC_STATUS, (_e, data) => cb(data))
  },
  supabase: {
    getConfig: () => ipcRenderer.invoke(SUPABASE_IPC.GET_CONFIG),
    getTokens: () => ipcRenderer.invoke(SUPABASE_IPC.GET_TOKENS),
    onTokensChanged: (cb: (tokens: SupabaseTokens | null) => void) => {
      ipcRenderer.removeAllListeners(SUPABASE_IPC.TOKENS_CHANGED)
      ipcRenderer.on(SUPABASE_IPC.TOKENS_CHANGED, (_e, tokens) => cb(tokens))
    },
  },
})
console.log('[Preload] electronAPI exposed')
} catch (err) {
  console.error('[Preload] Failed to expose electronAPI:', err)
}
