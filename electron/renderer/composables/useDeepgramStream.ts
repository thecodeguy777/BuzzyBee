import { ref } from 'vue'
import type { TranscriptChunk } from '../../shared/ipc-channels'

const DEEPGRAM_WS_URL = 'wss://api.deepgram.com/v1/listen'

interface SourceContext {
  stream: MediaStream
  recorder: MediaRecorder | null
  ws: WebSocket | null
  sourceLabel: 'You' | 'Client'    // which side of the call
  keyPrefix: 'mic' | 'sys'         // for speakerKey stable id
}

export function useDeepgramStream() {
  const isListening = ref(false)
  const error = ref<string | null>(null)

  let sources: SourceContext[] = []
  let onChunkCallback: ((chunk: TranscriptChunk) => void) | null = null

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

  function openWebSocket(apiKey: string, src: SourceContext) {
    // Pick a mime type the recorder can produce
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
    const mimeType = candidates.find(t => MediaRecorder.isTypeSupported(t)) || 'audio/webm'

    // Deepgram needs to know the encoding — use ?encoding=opus&container=webm for browser MediaRecorder webm/opus
    const params = new URLSearchParams({
      model: 'nova-3',
      language: 'en-US',
      smart_format: 'true',
      interim_results: 'true',
      utterance_end_ms: '1000',
      punctuate: 'true',
      encoding: 'opus',
      diarize: 'true',
      multichannel: 'false',
    })

    const ws = new WebSocket(`${DEEPGRAM_WS_URL}?${params}`, ['token', apiKey])
    src.ws = ws

    ws.onopen = () => {
      console.log(`[Deepgram] ${src.sourceLabel} (${src.keyPrefix}) connected`)

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

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'Results') {
          const alt = msg.channel?.alternatives?.[0]
          const transcript = alt?.transcript?.trim()
          if (!transcript) return

          // Determine dominant speaker for this chunk by counting word-level speaker IDs
          const words: any[] = alt?.words ?? []
          const counts = new Map<number, number>()
          for (const w of words) {
            const sp = typeof w.speaker === 'number' ? w.speaker : 0
            counts.set(sp, (counts.get(sp) ?? 0) + 1)
          }
          let dominantSpeaker = 0
          let max = -1
          for (const [sp, n] of counts) {
            if (n > max) { max = n; dominantSpeaker = sp }
          }

          const speakerKey = `${src.keyPrefix}:${dominantSpeaker}`
          // Display label is resolved by the consumer (so renames apply live)
          const chunk: TranscriptChunk = {
            speaker: src.sourceLabel,    // initial label, may be remapped to a custom name in UI
            speakerKey,
            text: transcript,
            timestamp: Date.now(),
            isFinal: msg.is_final === true,
          }
          onChunkCallback?.(chunk)
        }
      } catch (err) {
        console.error('[Deepgram] Parse error:', err)
      }
    }

    ws.onerror = (e) => {
      console.error(`[Deepgram] ${src.sourceLabel} WS error:`, e)
      error.value = 'Deepgram connection error'
    }

    ws.onclose = (e) => {
      console.log(`[Deepgram] ${src.sourceLabel} WS closed (${e.code})`)
    }
  }

  async function start(mode: 'mic' | 'system' | 'both' = 'mic', deviceId?: string) {
    try {
      error.value = null
      const settings = await window.electronAPI.settings.get()
      const apiKey = settings.deepgramApiKey
      if (!apiKey) throw new Error('No Deepgram API key configured')

      sources = []

      if (mode === 'mic' || mode === 'both') {
        const stream = await getMicStream(deviceId)
        const src: SourceContext = { stream, recorder: null, ws: null, sourceLabel: 'You', keyPrefix: 'mic' }
        sources.push(src)
        openWebSocket(apiKey, src)
      }

      if (mode === 'system' || mode === 'both') {
        const stream = await getSystemAudioStream()
        const src: SourceContext = { stream, recorder: null, ws: null, sourceLabel: 'Client', keyPrefix: 'sys' }
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
    sources.forEach(src => {
      if (src.recorder && src.recorder.state !== 'inactive') src.recorder.stop()
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

  return { isListening, error, start, stop, onChunk }
}
