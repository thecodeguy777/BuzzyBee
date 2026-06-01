import { ref } from 'vue'
import type { TranscriptChunk } from '../../shared/ipc-channels'

const DEEPGRAM_WS_URL = 'wss://api.deepgram.com/v1/listen'

// Reconnect backoff: 1s, 2s, 4s, 8s, capped at 10s. After this many
// consecutive failures we give up and surface an error rather than
// hammering Deepgram forever.
const MAX_RECONNECT_ATTEMPTS = 10
const RECONNECT_BASE_MS = 1000
const RECONNECT_CAP_MS = 10000

interface SourceContext {
  stream: MediaStream
  recorder: MediaRecorder | null
  ws: WebSocket | null
  sourceLabel: 'You' | 'Client'    // which side of the call
  keyPrefix: 'mic' | 'sys'         // for speakerKey stable id
  diarize: boolean                 // only the client side needs speaker splitting
  reconnectAttempts: number
  reconnectTimer: ReturnType<typeof setTimeout> | null
}

export function useDeepgramStream() {
  const isListening = ref(false)
  const error = ref<string | null>(null)
  // Surfaced so the UI can show a subtle "reconnecting…" hint instead of
  // silently going dead.
  const isReconnecting = ref(false)

  let sources: SourceContext[] = []
  let onChunkCallback: ((chunk: TranscriptChunk) => void) | null = null
  // Set true only by stop() — distinguishes an intentional close (don't
  // reconnect) from a network drop (do reconnect).
  let stopping = false

  function onChunk(cb: (chunk: TranscriptChunk) => void) {
    onChunkCallback = cb
  }

  async function getMicStream(deviceId?: string): Promise<MediaStream> {
    return await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    })
  }

  async function getSystemAudioStream(): Promise<MediaStream> {
    const desktopSources = await window.electronAPI.getDesktopSources()
    if (desktopSources.length === 0) throw new Error('No screen sources available')
    const source = desktopSources[0]

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // @ts-expect-error Electron desktop audio capture
        mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: source.id },
      },
      video: {
        // @ts-expect-error Required to get desktop audio on Windows
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: source.id,
          minWidth: 1, maxWidth: 1, minHeight: 1, maxHeight: 1,
        },
      },
    })
    stream.getVideoTracks().forEach(t => t.stop())
    return new MediaStream(stream.getAudioTracks())
  }

  // Split a final result into one chunk per contiguous speaker run, so a
  // client and (say) their spouse on the same audio channel become two
  // distinct labeled lines instead of being collapsed to whoever spoke most.
  // Interim results keep the cheap dominant-speaker pick — they're transient
  // and get replaced by the final anyway.
  function emitFromResult(alt: any, src: SourceContext, isFinal: boolean) {
    const transcript: string = alt?.transcript?.trim() ?? ''
    if (!transcript) return
    const words: any[] = Array.isArray(alt?.words) ? alt.words : []

    // Mic side isn't diarized (always one person) or no word-level speakers
    // available → single chunk under speaker 0.
    if (!src.diarize || words.length === 0) {
      onChunkCallback?.({
        speaker: src.sourceLabel,
        speakerKey: `${src.keyPrefix}:0`,
        text: transcript,
        timestamp: Date.now(),
        isFinal,
      })
      return
    }

    if (!isFinal) {
      // Interim: dominant speaker only (cheap, transient).
      const counts = new Map<number, number>()
      for (const w of words) {
        const sp = typeof w.speaker === 'number' ? w.speaker : 0
        counts.set(sp, (counts.get(sp) ?? 0) + 1)
      }
      let dominant = 0
      let max = -1
      for (const [sp, n] of counts) if (n > max) { max = n; dominant = sp }
      onChunkCallback?.({
        speaker: src.sourceLabel,
        speakerKey: `${src.keyPrefix}:${dominant}`,
        text: transcript,
        timestamp: Date.now(),
        isFinal,
      })
      return
    }

    // Final: walk words, emit a chunk whenever the speaker id changes.
    let runSpeaker = typeof words[0].speaker === 'number' ? words[0].speaker : 0
    let runWords: string[] = []
    const flush = (sp: number) => {
      const text = runWords.join(' ').trim()
      if (!text) return
      onChunkCallback?.({
        speaker: src.sourceLabel,
        speakerKey: `${src.keyPrefix}:${sp}`,
        text,
        timestamp: Date.now(),
        isFinal: true,
      })
    }
    for (const w of words) {
      const sp = typeof w.speaker === 'number' ? w.speaker : 0
      if (sp !== runSpeaker) {
        flush(runSpeaker)
        runSpeaker = sp
        runWords = []
      }
      // Prefer punctuated form when smart_format/punctuate is on.
      runWords.push(w.punctuated_word ?? w.word ?? '')
    }
    flush(runSpeaker)
  }

  function attachRecorder(src: SourceContext, ws: WebSocket) {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
    const mimeType = candidates.find(t => MediaRecorder.isTypeSupported(t)) || 'audio/webm'

    const recorder = new MediaRecorder(src.stream, { mimeType })
    src.recorder = recorder

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
        ws.send(e.data)
      }
    }
    // Stream audio chunks every 250ms — true real-time
    recorder.start(250)
  }

  function scheduleReconnect(apiKey: string, src: SourceContext) {
    if (stopping) return

    // Stream gone (device unplugged / capture revoked) — can't recover.
    if (src.stream.getTracks().every(t => t.readyState === 'ended')) {
      error.value = `${src.sourceLabel} audio source ended — cannot reconnect`
      return
    }

    if (src.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      error.value = `${src.sourceLabel} transcription lost — Deepgram unreachable after ${MAX_RECONNECT_ATTEMPTS} retries`
      isReconnecting.value = false
      return
    }

    const delay = Math.min(RECONNECT_CAP_MS, RECONNECT_BASE_MS * 2 ** src.reconnectAttempts)
    src.reconnectAttempts++
    isReconnecting.value = true
    console.warn(`[Deepgram] ${src.sourceLabel} reconnecting in ${delay}ms (attempt ${src.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`)

    src.reconnectTimer = setTimeout(() => {
      if (stopping) return
      openWebSocket(apiKey, src)
    }, delay)
  }

  function openWebSocket(apiKey: string, src: SourceContext) {
    // Tear down any stale recorder bound to a previous (dead) socket before
    // we open a new one.
    if (src.recorder && src.recorder.state !== 'inactive') {
      try { src.recorder.stop() } catch { /* already stopped */ }
    }
    src.recorder = null

    const params = new URLSearchParams({
      model: 'nova-3',
      language: 'en-US',
      smart_format: 'true',
      interim_results: 'true',
      utterance_end_ms: '1000',
      punctuate: 'true',
      encoding: 'opus',
      // Only the client side carries multiple people; the VA mic is always
      // one person and diarizing it just invents phantom "You · 2" speakers.
      diarize: src.diarize ? 'true' : 'false',
      multichannel: 'false',
    })

    const ws = new WebSocket(`${DEEPGRAM_WS_URL}?${params}`, ['token', apiKey])
    src.ws = ws

    ws.onopen = () => {
      console.log(`[Deepgram] ${src.sourceLabel} (${src.keyPrefix}) connected`)
      if (src.reconnectAttempts > 0) {
        // Recovered — clear the reconnecting hint (attempts reset on first
        // successful Results message, so a flapping socket still backs off).
        isReconnecting.value = false
      }
      attachRecorder(src, ws)
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'Results') {
          // First good result since (re)connect → connection is healthy,
          // reset the backoff counter.
          src.reconnectAttempts = 0
          const alt = msg.channel?.alternatives?.[0]
          if (!alt) return
          emitFromResult(alt, src, msg.is_final === true)
        }
      } catch (err) {
        console.error('[Deepgram] Parse error:', err)
      }
    }

    ws.onerror = (e) => {
      console.error(`[Deepgram] ${src.sourceLabel} WS error:`, e)
    }

    ws.onclose = (e) => {
      console.log(`[Deepgram] ${src.sourceLabel} WS closed (${e.code})`)
      if (stopping) return
      // Unexpected drop while a meeting is live — recover instead of dying.
      scheduleReconnect(apiKey, src)
    }
  }

  async function start(mode: 'mic' | 'system' | 'both' = 'mic', deviceId?: string) {
    try {
      error.value = null
      stopping = false
      isReconnecting.value = false
      const settings = await window.electronAPI.settings.get()
      const apiKey = settings.deepgramApiKey
      if (!apiKey) throw new Error('No Deepgram API key configured')

      sources = []

      if (mode === 'mic' || mode === 'both') {
        const stream = await getMicStream(deviceId)
        const src: SourceContext = {
          stream, recorder: null, ws: null,
          sourceLabel: 'You', keyPrefix: 'mic',
          diarize: false,                 // VA side = always one person
          reconnectAttempts: 0, reconnectTimer: null,
        }
        sources.push(src)
        openWebSocket(apiKey, src)
      }

      if (mode === 'system' || mode === 'both') {
        const stream = await getSystemAudioStream()
        const src: SourceContext = {
          stream, recorder: null, ws: null,
          sourceLabel: 'Client', keyPrefix: 'sys',
          diarize: true,                  // client side = may be 2+ people
          reconnectAttempts: 0, reconnectTimer: null,
        }
        sources.push(src)
        openWebSocket(apiKey, src)
      }

      isListening.value = true
      console.log('[Deepgram] Streaming started, sources:', sources.length)
    } catch (err) {
      error.value = `Failed to start: ${err}`
      console.error('[Deepgram] Start error:', err)
      stop()
    }
  }

  function stop() {
    console.log('[Deepgram] Stopping')
    stopping = true
    isReconnecting.value = false
    sources.forEach(src => {
      if (src.reconnectTimer) { clearTimeout(src.reconnectTimer); src.reconnectTimer = null }
      if (src.recorder && src.recorder.state !== 'inactive') {
        try { src.recorder.stop() } catch { /* already stopped */ }
      }
      if (src.ws) {
        if (src.ws.readyState === WebSocket.OPEN) {
          // Send close message per Deepgram protocol
          src.ws.send(JSON.stringify({ type: 'CloseStream' }))
        }
        src.ws.close()
      }
      src.stream.getTracks().forEach(t => t.stop())
    })
    sources = []
    isListening.value = false
  }

  return { isListening, error, isReconnecting, start, stop, onChunk }
}
