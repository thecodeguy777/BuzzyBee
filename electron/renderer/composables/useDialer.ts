import { ref, computed } from 'vue'
import type { DialerCallStatus, DialerHangupCause } from '../../shared/ipc-channels-dialer'
import {
  startRingback, stopRingback, playConnect, playHangup, playReorder, playBusy, stopAllTones,
} from './useCallTones'

// SignalWire click-to-call dialer (REST-based).
//
// We don't use WebRTC in the renderer. Instead, main process POSTs to
// SignalWire LaML REST `/Calls`, which dials the rep's verified phone first
// and then bridges to the lead via inline TwiML. The rep talks via their
// actual phone — the dialer UI is a remote-control panel.
//
// Status updates come from polling `/Calls/<sid>` every 2 seconds until
// the call reaches a terminal state.

// Flip to true to fall back to the local simulation (no real call placed).
// Useful when developing UI without burning trial minutes.
const MOCK = false

type CallEvent =
  | { type: 'connecting' }
  | { type: 'ringing' }
  | { type: 'answered' }
  | { type: 'ended'; cause: DialerHangupCause }

// ── Singleton state (module scope) ──
// Shared across every useDialer() call so the dialpad UI and the auto-dialer
// orchestrator look at the same in-flight call.
const status = ref<DialerCallStatus>('idle')
const remoteE164 = ref<string | null>(null)
const startedAt = ref<number | null>(null)
const answeredAt = ref<number | null>(null)
const endedAt = ref<number | null>(null)
const muted = ref(false)
const error = ref<string | null>(null)
const elapsedMs = ref(0)

let elapsedTimer: ReturnType<typeof setInterval> | null = null
let mockTimer: ReturnType<typeof setTimeout> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let currentSid: string | null = null

const inCall = computed(() => status.value === 'in-call')
const isActive = computed(() => status.value !== 'idle' && status.value !== 'ended' && status.value !== 'failed')

function startElapsedTimer() {
  if (elapsedTimer) return
  elapsedTimer = setInterval(() => {
    if (answeredAt.value) elapsedMs.value = Date.now() - answeredAt.value
  }, 250)
}

function stopElapsedTimer() {
  if (elapsedTimer) {
    clearInterval(elapsedTimer)
    elapsedTimer = null
  }
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function handleEvent(e: CallEvent) {
  if (e.type === 'connecting') {
    // Bridge ours-local ringback. SignalWire's carrier ringback will take over
    // when status transitions to 'ringing' (via SIP 183 early media), so this
    // only fills the dead-air gap between REST accept and SIP session up.
    if (status.value !== 'connecting') startRingback()
    status.value = 'connecting'
  } else if (e.type === 'ringing') {
    // Hand off to SignalWire's carrier ringback (flowing in over the SIP RTP).
    stopRingback()
    status.value = 'ringing'
  } else if (e.type === 'answered') {
    if (status.value === 'in-call') return
    stopRingback()
    playConnect()
    status.value = 'in-call'
    answeredAt.value = Date.now()
    startElapsedTimer()
  } else if (e.type === 'ended') {
    stopRingback()
    // Cause-appropriate end tone. Helps the rep know what happened by ear
    // even before they look at the screen.
    if (e.cause === 'failed' || e.cause === 'no-answer' || e.cause === 'rejected') {
      playReorder()
    } else if (e.cause === 'busy') {
      playBusy()
    } else {
      playHangup() // 'normal' or 'canceled'
    }
    status.value = 'ended'
    endedAt.value = Date.now()
    stopElapsedTimer()
    stopPolling()
  }
}

// Map SignalWire LaML statuses to our internal state machine.
//   queued / initiated → connecting (REST accepted, not yet on the wire)
//   ringing            → ringing    (rep's phone is ringing)
//   in-progress        → in-call    (rep picked up; bridge to lead begins)
//   completed          → ended/normal
//   busy/no-answer/failed/canceled → ended with matching cause
function applyRemoteStatus(remote: string): void {
  switch (remote) {
    case 'queued':
    case 'initiated':
      if (status.value === 'idle' || status.value === 'connecting') handleEvent({ type: 'connecting' })
      return
    case 'ringing':
      handleEvent({ type: 'ringing' })
      return
    case 'in-progress':
      handleEvent({ type: 'answered' })
      return
    case 'completed':
      handleEvent({ type: 'ended', cause: answeredAt.value ? 'normal' : 'canceled' })
      return
    case 'busy':
      handleEvent({ type: 'ended', cause: 'busy' })
      return
    case 'no-answer':
      handleEvent({ type: 'ended', cause: 'no-answer' })
      return
    case 'canceled':
      handleEvent({ type: 'ended', cause: 'canceled' })
      return
    case 'failed':
      handleEvent({ type: 'ended', cause: 'failed' })
      return
  }
}

async function pollOnce() {
  const api: any = (window as any).dialerAPI?.signalwire
  if (!api || !currentSid) return
  try {
    const info = await api.getCall(currentSid)
    if (info?.error) {
      console.warn('[useDialer] poll error:', info.error)
      return
    }
    if (info?.status) {
      console.log(`[useDialer] poll status=${info.status} mappedUI=${status.value} answeredBy=${info.answeredBy ?? '-'}`)
      applyRemoteStatus(info.status)
    }
  } catch (err) {
    console.warn('[useDialer] poll threw:', err)
  }
}

function startPolling() {
  stopPolling()
  pollTimer = setInterval(() => {
    if (!currentSid) {
      stopPolling()
      return
    }
    pollOnce()
  }, 2000)
}

async function dial(toE164: string) {
  if (isActive.value) return
  error.value = null
  remoteE164.value = toE164
  startedAt.value = Date.now()
  answeredAt.value = null
  endedAt.value = null
  elapsedMs.value = 0
  muted.value = false
  currentSid = null

  if (MOCK) {
    handleEvent({ type: 'connecting' })
    mockTimer = setTimeout(() => {
      handleEvent({ type: 'ringing' })
      mockTimer = setTimeout(() => {
        handleEvent({ type: 'answered' })
      }, 2000)
    }, 800)
    return
  }

  const api: any = (window as any).dialerAPI?.signalwire
  if (!api?.createCall) {
    error.value = 'Dialer preload missing — restart npm run dev to pick up the SignalWire bridge.'
    handleEvent({ type: 'ended', cause: 'failed' })
    return
  }

  handleEvent({ type: 'connecting' })
  try {
    const result = await api.createCall(toE164)
    if (!result || result.error) {
      error.value = result?.error ?? 'Failed to place call'
      handleEvent({ type: 'ended', cause: 'failed' })
      return
    }
    currentSid = result.sid
    startPolling()
    // Optimistic first poll so the UI moves off "connecting" quickly.
    pollOnce()
  } catch (err: any) {
    console.error('[useDialer] dial failed:', err)
    error.value = err?.message || String(err)
    handleEvent({ type: 'ended', cause: 'failed' })
  }
}

async function hangup() {
  if (mockTimer) {
    clearTimeout(mockTimer)
    mockTimer = null
  }
  if (MOCK) {
    handleEvent({ type: 'ended', cause: 'normal' })
    return
  }
  const sid = currentSid
  if (!sid) return
  const api: any = (window as any).dialerAPI?.signalwire
  try {
    const res = await api?.hangup?.(sid)
    if (res?.error) console.warn('[useDialer] hangup error:', res.error)
  } catch (err) {
    console.warn('[useDialer] hangup threw:', err)
  }
  // Final status will arrive via polling; we don't force 'ended' here so
  // the cause reflects what SignalWire actually reports (completed vs canceled).
}

function reset() {
  status.value = 'idle'
  remoteE164.value = null
  startedAt.value = null
  answeredAt.value = null
  endedAt.value = null
  elapsedMs.value = 0
  muted.value = false
  error.value = null
  currentSid = null
  stopElapsedTimer()
  stopPolling()
  stopAllTones()
  if (mockTimer) {
    clearTimeout(mockTimer)
    mockTimer = null
  }
}

function toggleMute() {
  // REST/PSTN flow: the rep mutes on their own phone. UI state only.
  muted.value = !muted.value
}

function sendDTMF(_digit: string) {
  // Not supported via REST after bridge. Rep uses their phone's keypad.
  // Kept as a no-op so DialerPanel's onDigitDuringCall stays harmless.
}

export function useDialer() {
  // No per-instance state — the refs above are module-scoped singletons
  // shared across every consumer (DialerPanel, useAutoDialer, etc.).
  return {
    status,
    remoteE164,
    elapsedMs,
    muted,
    error,
    inCall,
    isActive,
    dial,
    hangup,
    reset,
    toggleMute,
    sendDTMF,
  }
}
