import { ref, onMounted, onBeforeUnmount } from 'vue'

export type PermState = 'granted' | 'denied' | 'prompt' | 'unknown'

// Reads — and live-watches — the browser's microphone + camera permission
// state so the meeting can tell people *before* they join whether they need to
// unblock anything. Support for querying 'camera'/'microphone' varies
// (Safari/older Firefox don't expose it); when unavailable we report 'unknown'
// and callers degrade to a neutral "we'll ask when you join" hint instead of
// scary reset steps. The onchange hooks let the UI update the instant someone
// flips the permission in their address bar — no reload needed.
export function useMediaPermissions() {
  const mic = ref<PermState>('unknown')
  const cam = ref<PermState>('unknown')
  const supported = ref(true)
  let micStatus: PermissionStatus | null = null
  let camStatus: PermissionStatus | null = null

  async function probe(name: 'camera' | 'microphone'): Promise<PermissionStatus | null> {
    try {
      return await navigator.permissions.query({ name: name as PermissionName })
    } catch {
      return null
    }
  }

  async function refresh() {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
      supported.value = false
      return
    }
    micStatus = await probe('microphone')
    camStatus = await probe('camera')
    if (!micStatus && !camStatus) {
      supported.value = false
      return
    }
    if (micStatus) {
      mic.value = micStatus.state as PermState
      micStatus.onchange = () => (mic.value = micStatus!.state as PermState)
    }
    if (camStatus) {
      cam.value = camStatus.state as PermState
      camStatus.onchange = () => (cam.value = camStatus!.state as PermState)
    }
  }

  onMounted(refresh)
  onBeforeUnmount(() => {
    if (micStatus) micStatus.onchange = null
    if (camStatus) camStatus.onchange = null
  })

  return { mic, cam, supported, refresh }
}
