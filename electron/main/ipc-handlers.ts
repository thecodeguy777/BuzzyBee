import { ipcMain, desktopCapturer } from 'electron'
import Store from 'electron-store'
import { IPC, TranscriptChunk, AppSettings } from '../shared/ipc-channels'
import { getControlWindow, getOverlayWindow, createOverlayWindow, toggleOverlay } from './windows'
import { transcribeAudioElevenLabs } from './elevenlabs-service'
import { signIn, signOut, getCurrentSession, pushMeeting, fetchMeetings, fetchMeetingDetail, fetchClients } from './supabase-sync'
import { exportMeetingPdf } from './pdf-export'
import { updateMeetingState, EMPTY_STATE, type MeetingState } from './agents/action-items-agent'
import { generateCoachingCard, type CoachingCard } from './agents/coach-agent'
import { generateFinalSummary } from './agents/summary-agent'

const BUFFER_TRIGGER_CHARS = 500

// Phrases (lowercased) that strongly indicate a client question — fire coach immediately
const QUESTION_TRIGGERS = [
  '?',
  ' do you ', ' did you ', ' have you ', ' would you ', ' could you ',
  ' can you ', ' will you ', ' are you ',
  'how do', 'how does', 'how did', 'how would', 'how can',
  'what do', 'what is', 'what are', 'what would', 'what about',
  'when do', 'when did', 'when will',
  'why do', 'why did', 'why is',
  'which one', 'which is',
  'tell me about', 'tell me how', 'walk me through',
]

function looksLikeQuestion(text: string): boolean {
  const t = ' ' + text.toLowerCase() + ' '
  return QUESTION_TRIGGERS.some(trigger => t.includes(trigger))
}

const store = new Store()

// In-memory meeting state
let transcript: TranscriptChunk[] = []
let coachingPromptsLog: { text: string; timestamp: number; category?: string }[] = []
let meetingActive = false
let meetingStartTime = 0
let captureMode: 'mic' | 'system' | 'both' = 'mic'
let selectedClientId: string | null = null
let intelligenceState: MeetingState = { ...EMPTY_STATE }
let bufferSinceLastUpdate = ''
let actionItemsRunning = false

function getRecentTranscript(seconds: number): string {
  const cutoff = Date.now() - seconds * 1000
  return transcript
    .filter(t => t.timestamp >= cutoff && t.isFinal)
    .map(t => `${t.speaker}: ${t.text}`)
    .join('\n')
}

function runAgents(newChunk: string): void {
  const recent = getRecentTranscript(120)

  // Coach: always run — questions can't wait. Parallel runs are OK (each is independent).
  generateCoachingCard(recent, newChunk)
    .then(card => {
      if (!card) return
      const data = {
        text: card.scripts.safe,
        timestamp: Date.now(),
        category: card.category,
      }
      coachingPromptsLog.push(data)
      console.log('[Coach] Card surfaced:', card.category, '-', card.trigger.slice(0, 80))
      const control = getControlWindow()
      control?.webContents.send(IPC.COACHING_CARD, { ...card, timestamp: Date.now() })
      getOverlayWindow()?.webContents.send(IPC.OVERLAY_COACHING, data)
    })
    .catch(err => console.error('[Coach] error:', err))

  // Action Items: serialize — state mutations must apply in order
  if (actionItemsRunning) return
  actionItemsRunning = true
  updateMeetingState(intelligenceState, newChunk)
    .then(updatedState => {
      const prevJson = JSON.stringify(intelligenceState)
      const nextJson = JSON.stringify(updatedState)
      if (prevJson !== nextJson) {
        intelligenceState = updatedState
        getControlWindow()?.webContents.send(IPC.STATE_UPDATE, updatedState)
      }
    })
    .catch(err => console.error('[ActionItems] error:', err))
    .finally(() => { actionItemsRunning = false })
}

function getFullTranscript(): string {
  return transcript
    .filter(t => t.isFinal)
    .map(t => `${t.speaker}: ${t.text}`)
    .join('\n')
}

export function registerIpcHandlers(): void {
  // ── Meeting Controls ──

  ipcMain.handle(IPC.MEETING_START, async (_e, payload?: { captureMode?: 'mic' | 'system' | 'both' }) => {
    transcript = []
    coachingPromptsLog = []
    meetingActive = true
    meetingStartTime = Date.now()
    if (payload?.captureMode) captureMode = payload.captureMode

    // Open overlay
    if (!getOverlayWindow()) {
      createOverlayWindow()
    }
    const overlay = getOverlayWindow()
    overlay?.webContents.send(IPC.OVERLAY_STATUS, { status: 'active' })

    // Reset intelligence state for the new meeting
    intelligenceState = { ...EMPTY_STATE, actionItems: [], openQuestions: [], decisions: [], clientPreferences: [], redFlags: [] }
    bufferSinceLastUpdate = ''

    return { success: true }
  })

  ipcMain.handle(IPC.MEETING_END, async () => {
    meetingActive = false

    // Notify overlay
    getOverlayWindow()?.webContents.send(IPC.OVERLAY_STATUS, { status: 'ended' })

    const control = getControlWindow()
    const fullText = getFullTranscript()

    console.log('[Meeting] Ending. Transcript length:', fullText.length)

    if (fullText.length < 20) {
      console.log('[Meeting] Transcript too short, skipping summary')
      control?.webContents.send(IPC.SUMMARY_CHUNK, {
        chunk: JSON.stringify({
          summary: 'Transcript too short to generate a meaningful summary. Speak more during your next meeting.',
          keyDecisions: [],
          actionItems: [],
          followUps: [],
        }),
        done: true,
      })
    } else {
      try {
        let accumulated = ''
        for await (const chunk of generateFinalSummary(fullText, intelligenceState)) {
          accumulated += chunk
          control?.webContents.send(IPC.SUMMARY_CHUNK, { chunk, done: false })
        }
        console.log('[Meeting] Summary stream complete')
        ;(control as any).__lastSummary = accumulated
        control?.webContents.send(IPC.SUMMARY_CHUNK, { chunk: '', done: true })
      } catch (err) {
        console.error('[Meeting] Summary error:', err)
        control?.webContents.send(IPC.SUMMARY_CHUNK, {
          chunk: JSON.stringify({
            summary: `Summary generation failed: ${err}`,
            keyDecisions: [],
            actionItems: [],
            followUps: [],
          }),
          done: true,
        })
      }
    }

    // Sync meeting to Supabase (best-effort)
    try {
      const startedAt = new Date(meetingStartTime).toISOString()
      const endedAt = new Date().toISOString()
      const durationSeconds = Math.round((Date.now() - meetingStartTime) / 1000)

      // Try to parse the summary for structured fields
      const accumulated: string = (control as any).__lastSummary || ''
      let parsed: any = null
      try {
        const m = accumulated.match(/\{[\s\S]*\}/)
        if (m) parsed = JSON.parse(m[0])
      } catch { /* ignore */ }

      const result = await pushMeeting({
        startedAt,
        endedAt,
        durationSeconds,
        captureMode,
        clientId: selectedClientId,
        transcript,
        summaryText: accumulated || null,
        parsedSummary: parsed,
        coachingPrompts: coachingPromptsLog,
      })

      control?.webContents.send(IPC.SYNC_STATUS, {
        status: result.success ? 'synced' : 'error',
        error: result.error,
      })
    } catch (err) {
      console.error('[Meeting] Supabase sync error:', err)
      control?.webContents.send(IPC.SYNC_STATUS, { status: 'error', error: String(err) })
    }

    // Close overlay after a brief delay
    setTimeout(() => {
      const overlay = getOverlayWindow()
      if (overlay && !overlay.isDestroyed()) {
        overlay.close()
      }
    }, 2000)

    return { success: true, durationSeconds: Math.round((Date.now() - meetingStartTime) / 1000) }
  })

  // ── Transcript Chunks (from renderer speech recognition) ──

  ipcMain.handle(IPC.MEETING_TRANSCRIPT_CHUNK, (_event, chunk: TranscriptChunk) => {
    transcript.push(chunk)

    // Forward to overlay
    getOverlayWindow()?.webContents.send(IPC.OVERLAY_TRANSCRIPT, chunk)

    if (!chunk.isFinal || !chunk.text || !meetingActive) return

    bufferSinceLastUpdate += `${chunk.speaker}: ${chunk.text}\n`

    // IMMEDIATE TRIGGER: if a client (or any non-VA) line looks like a question,
    // fire agents right now without waiting for the buffer to fill.
    const isClientLike = !/(^|\W)you(\W|:|$)/i.test(chunk.speaker)
    const isQuestion = looksLikeQuestion(chunk.text)
    if (isClientLike && isQuestion) {
      const newChunk = bufferSinceLastUpdate
      bufferSinceLastUpdate = ''
      console.log('[Agents] Question trigger fired:', chunk.text.slice(0, 60))
      runAgents(newChunk)
      return
    }

    // FALLBACK TRIGGER: buffer-based for everything else
    if (bufferSinceLastUpdate.length >= BUFFER_TRIGGER_CHARS) {
      const newChunk = bufferSinceLastUpdate
      bufferSinceLastUpdate = ''
      runAgents(newChunk)
    }
  })

  // ── Settings ──

  ipcMain.handle(IPC.SETTINGS_GET, () => {
    return {
      geminiApiKey: (store.get('geminiApiKey') as string) || '',
      groqApiKey: (store.get('groqApiKey') as string) || '',
      elevenLabsApiKey: (store.get('elevenLabsApiKey') as string) || '',
      deepgramApiKey: (store.get('deepgramApiKey') as string) || '',
      transcriptionProvider: (store.get('transcriptionProvider') as 'elevenlabs' | 'deepgram') || 'deepgram',
      llmProvider: (store.get('llmProvider') as 'gemini' | 'groq') || 'groq',
      overlayPosition: (store.get('overlayPosition') as { x: number; y: number }) || { x: 0, y: 0 },
      overlayOpacity: (store.get('overlayOpacity') as number) || 0.9,
      coachingEnabled: (store.get('coachingEnabled') as boolean) ?? true,
      coachingIntervalSeconds: (store.get('coachingIntervalSeconds') as number) || 60,
    } as AppSettings
  })

  ipcMain.handle(IPC.SETTINGS_SET, (_event, settings: Partial<AppSettings>) => {
    for (const [key, value] of Object.entries(settings)) {
      store.set(key, value)
    }
  })

  // ── Desktop sources for system audio capture ──

  ipcMain.handle(IPC.GET_DESKTOP_SOURCES, async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] })
    return sources.map(s => ({ id: s.id, name: s.name }))
  })

  // ── Audio Transcription via ElevenLabs Scribe v2 ──

  ipcMain.handle(IPC.TRANSCRIBE_AUDIO, async (_event, payload: { base64: string; mimeType: string }) => {
    return await transcribeAudioElevenLabs(payload.base64, payload.mimeType)
  })

  // ── Overlay ──

  ipcMain.handle(IPC.OVERLAY_TOGGLE, () => {
    toggleOverlay()
  })

  // ── Auth ──

  ipcMain.handle(IPC.AUTH_SIGN_IN, async (_e, payload: { email: string; password: string }) => {
    return await signIn(payload.email, payload.password)
  })

  ipcMain.handle(IPC.AUTH_SIGN_OUT, async () => {
    await signOut()
    return { success: true }
  })

  ipcMain.handle(IPC.AUTH_GET_SESSION, async () => {
    return await getCurrentSession()
  })

  // ── Meeting history ──

  ipcMain.handle(IPC.MEETING_FETCH_HISTORY, async () => {
    return await fetchMeetings()
  })

  ipcMain.handle(IPC.MEETING_FETCH_DETAIL, async (_e, id: string) => {
    return await fetchMeetingDetail(id)
  })

  ipcMain.handle(IPC.CLIENTS_LIST, async () => {
    return await fetchClients()
  })

  ipcMain.handle(IPC.MEETING_SET_CLIENT, (_e, clientId: string | null) => {
    selectedClientId = clientId
  })

  ipcMain.handle(IPC.MEETING_EXPORT_PDF, async (_e, meetingId: string) => {
    const meeting = await fetchMeetingDetail(meetingId)
    if (!meeting) return { success: false, error: 'Meeting not found' }

    let clientName: string | null = null
    if (meeting.client_id) {
      const clients = await fetchClients()
      clientName = clients.find(c => c.id === meeting.client_id)?.name ?? null
    }

    return await exportMeetingPdf(meeting, clientName)
  })

  ipcMain.handle(IPC.MEETING_RETRY_SUMMARY, async () => {
    const control = getControlWindow()
    const fullText = getFullTranscript()
    if (fullText.length < 20) return { success: false }

    try {
      let accumulated = ''
      for await (const chunk of generateFinalSummary(fullText, intelligenceState)) {
        accumulated += chunk
        control?.webContents.send(IPC.SUMMARY_CHUNK, { chunk, done: false })
      }
      ;(control as any).__lastSummary = accumulated
      control?.webContents.send(IPC.SUMMARY_CHUNK, { chunk: '', done: true })
      return { success: true }
    } catch (err) {
      control?.webContents.send(IPC.SUMMARY_CHUNK, {
        chunk: JSON.stringify({ error: String(err) }),
        done: true,
      })
      return { success: false }
    }
  })
}
