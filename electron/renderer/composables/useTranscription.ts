import { ref } from 'vue'
import type { TranscriptChunk } from '../../shared/ipc-channels'

const CHUNK_DURATION_MS = 5000

export type CaptureMode = 'mic' | 'system' | 'both'

interface SourceRecorder {
  stream: MediaStream
  recorder: MediaRecorder | null
  chunks: Blob[]
  sourceLabel: 'You' | 'Client'
  keyPrefix: 'mic' | 'sys'
  stopTimeout: ReturnType<typeof setTimeout> | null
}

export function useTranscription() {
  const isListening = ref(false)
  const interimText = ref('')
  const error = ref<string | null>(null)
  const isProcessing = ref(false)

  let sources: SourceRecorder[] = []
  let onChunkCallback: ((chunk: TranscriptChunk) => void) | null = null
  let mimeType = 'audio/webm;codecs=opus'
  let shouldKeepRecording = false

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
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: source.id,
        },
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
    // Drop video — only need audio
    stream.getVideoTracks().forEach(t => t.stop())
    return new MediaStream(stream.getAudioTracks())
  }

  async function start(mode: CaptureMode = 'mic', deviceId?: string) {
    try {
      error.value = null
      console.log('[Transcription] Starting, mode:', mode)

      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
      const supported = candidates.find(t => MediaRecorder.isTypeSupported(t))
      if (!supported) throw new Error('No supported audio mime type')
      mimeType = supported

      sources = []

      if (mode === 'mic' || mode === 'both') {
        const micStream = await getMicStream(deviceId)
        sources.push({
          stream: micStream,
          recorder: null,
          chunks: [],
          sourceLabel: 'You',
          keyPrefix: 'mic',
          stopTimeout: null,
        })
      }

      if (mode === 'system' || mode === 'both') {
        const sysStream = await getSystemAudioStream()
        sources.push({
          stream: sysStream,
          recorder: null,
          chunks: [],
          sourceLabel: 'Client',
          keyPrefix: 'sys',
          stopTimeout: null,
        })
      }

      isListening.value = true
      shouldKeepRecording = true

      // Start a recorder for each source
      sources.forEach(src => startNewChunk(src))

      console.log('[Transcription] Listening on', sources.length, 'source(s)')
    } catch (err) {
      error.value = `Failed to start: ${err}`
      console.error('[Transcription] Start error:', err)
      stop()
    }
  }

  function startNewChunk(src: SourceRecorder) {
    if (!shouldKeepRecording) return

    const recorder = new MediaRecorder(src.stream, { mimeType })
    src.chunks = []

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) src.chunks.push(e.data)
    }

    recorder.onstop = async () => {
      if (src.chunks.length === 0) return
      const blob = new Blob(src.chunks, { type: mimeType })
      transcribeChunk(blob, src.sourceLabel, src.keyPrefix).catch(err =>
        console.error('[Transcription] Transcribe failed:', err)
      )
    }

    recorder.start()
    src.recorder = recorder

    src.stopTimeout = setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop()
      if (shouldKeepRecording) startNewChunk(src)
    }, CHUNK_DURATION_MS)
  }

  async function transcribeChunk(blob: Blob, sourceLabel: 'You' | 'Client', keyPrefix: 'mic' | 'sys') {
    isProcessing.value = true
    try {
      const base64 = await blobToBase64(blob)
      const text = await window.electronAPI.transcribe({ base64, mimeType })

      if (text && text.trim()) {
        console.log(`[Transcription] ${sourceLabel}:`, text)
        const chunk: TranscriptChunk = {
          speaker: sourceLabel,
          speakerKey: `${keyPrefix}:0`, // ElevenLabs batch doesn't diarize; collapse to single speaker per side
          text: text.trim(),
          timestamp: Date.now(),
          isFinal: true,
        }
        onChunkCallback?.(chunk)
      }
    } catch (err) {
      console.error('[Transcription] Chunk error:', err)
    } finally {
      isProcessing.value = false
    }
  }

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve((reader.result as string).split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  function stop() {
    console.log('[Transcription] Stopping')
    shouldKeepRecording = false
    sources.forEach(src => {
      if (src.stopTimeout) clearTimeout(src.stopTimeout)
      if (src.recorder && src.recorder.state !== 'inactive') src.recorder.stop()
      src.stream.getTracks().forEach(t => t.stop())
    })
    sources = []
    isListening.value = false
    interimText.value = ''
  }

  return { isListening, interimText, error, isProcessing, start, stop, onChunk }
}
