import { ref } from 'vue'

export function useAudioCapture() {
  const stream = ref<MediaStream | null>(null)
  const isCapturing = ref(false)
  const error = ref<string | null>(null)

  async function startCapture(): Promise<MediaStream | null> {
    try {
      error.value = null

      // On Electron/Windows, we request screen capture with audio
      // The video track is needed to get system audio but we discard it
      const capturedStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // @ts-expect-error Electron-specific constraint for system audio
          mandatory: {
            chromeMediaSource: 'desktop',
          },
        },
        video: {
          // @ts-expect-error Electron-specific constraint
          mandatory: {
            chromeMediaSource: 'desktop',
          },
        },
      })

      // Stop the video track immediately, we only need audio
      capturedStream.getVideoTracks().forEach(track => track.stop())

      stream.value = capturedStream
      isCapturing.value = true
      return capturedStream
    } catch (err) {
      error.value = `Audio capture failed: ${err}`
      console.error('[AudioCapture]', err)
      return null
    }
  }

  function stopCapture() {
    if (stream.value) {
      stream.value.getTracks().forEach(track => track.stop())
      stream.value = null
    }
    isCapturing.value = false
  }

  return { stream, isCapturing, error, startCapture, stopCapture }
}
