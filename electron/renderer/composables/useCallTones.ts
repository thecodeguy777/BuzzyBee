// Call-progress tone generator.
//
// SignalWire forwards the destination carrier's ringback to us via SIP 183
// Session Progress (early media). That covers ringback during the destination
// ringing phase. What it does NOT cover:
//   - The first ~1s of silence between REST accept and SIP session up
//   - Failure / busy / no-answer tones (SignalWire just BYEs with status)
//   - Connect chirp / hangup click for user-facing UX confirmation
//
// We synthesize all of those with the Web Audio API using NA-standard
// frequencies. No audio files needed.

const RINGBACK_FREQS: [number, number] = [440, 480]   // 2s on / 4s off
const BUSY_FREQS:     [number, number] = [480, 620]   // 0.5s on / 0.5s off
const REORDER_FREQS:  [number, number] = [480, 620]   // 0.25s on / 0.25s off — "fast busy" = unreachable
const CONNECT_FREQ = 800                              // single short chirp
const HANGUP_FROM = 350                               // descending click
const HANGUP_TO = 280

const VOLUME = 0.12

let ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!ctx) {
    // AudioContext can't be created until a user gesture in modern browsers,
    // but Electron is usually lenient. If construction fails we just degrade
    // to silent — no thrown errors crashing the dialer.
    try {
      ctx = new ((window as any).AudioContext || (window as any).webkitAudioContext)()
    } catch {
      ctx = null as any
    }
  }
  // Resume context if it was auto-suspended (some browsers auto-suspend
  // contexts that haven't received user gestures).
  if (ctx?.state === 'suspended') ctx.resume().catch(() => {})
  return ctx!
}

interface ToneSession { stop: () => void }

// Play a dual-tone for a fixed duration. Returns immediately.
function blip(freqs: [number, number] | number, durationMs: number, when = 0): void {
  const c = getCtx()
  if (!c) return
  const start = c.currentTime + when / 1000
  const end = start + durationMs / 1000

  const g = c.createGain()
  // Quick attack/release so the tone doesn't click on edges
  g.gain.setValueAtTime(0, start)
  g.gain.linearRampToValueAtTime(VOLUME, start + 0.01)
  g.gain.setValueAtTime(VOLUME, end - 0.01)
  g.gain.linearRampToValueAtTime(0, end)
  g.connect(c.destination)

  const fa = Array.isArray(freqs) ? freqs : [freqs]
  for (const f of fa) {
    const o = c.createOscillator()
    o.frequency.value = f
    o.type = 'sine'
    o.connect(g)
    o.start(start)
    o.stop(end + 0.02)
  }
}

// Start a pulsed dual-tone loop until stop() is called.
function pulseLoop(freqs: [number, number], onMs: number, offMs: number): ToneSession {
  let stopped = false
  const cycle = onMs + offMs
  function schedule(cycleStartMs: number) {
    if (stopped) return
    blip(freqs, onMs, cycleStartMs)
    setTimeout(() => schedule(0), cycle)
  }
  schedule(0)
  return {
    stop() { stopped = true },
  }
}

// ── Public API ─────────────────────────────────────────────────────

let ringbackSession: ToneSession | null = null

export function startRingback(): void {
  if (ringbackSession) return
  ringbackSession = pulseLoop(RINGBACK_FREQS, 2000, 4000)
}

export function stopRingback(): void {
  ringbackSession?.stop()
  ringbackSession = null
}

let busySession: ToneSession | null = null
export function playBusy(durationMs = 3000): void {
  // Slow busy: 0.5s on / 0.5s off, ~3 cycles
  busySession?.stop()
  busySession = pulseLoop(BUSY_FREQS, 500, 500)
  setTimeout(() => { busySession?.stop(); busySession = null }, durationMs)
}

let reorderSession: ToneSession | null = null
export function playReorder(durationMs = 2000): void {
  // Fast busy / SIT: 0.25s on / 0.25s off — "the number you have dialed…"
  reorderSession?.stop()
  reorderSession = pulseLoop(REORDER_FREQS, 250, 250)
  setTimeout(() => { reorderSession?.stop(); reorderSession = null }, durationMs)
}

export function playConnect(): void {
  // Tiny upward chirp to confirm bridge — 800Hz for 60ms
  blip(CONNECT_FREQ, 60)
}

export function playHangup(): void {
  // Brief descending click — 350Hz to 280Hz over 80ms
  const c = getCtx()
  if (!c) return
  const start = c.currentTime
  const end = start + 0.08
  const g = c.createGain()
  g.gain.setValueAtTime(0, start)
  g.gain.linearRampToValueAtTime(VOLUME * 0.7, start + 0.01)
  g.gain.linearRampToValueAtTime(0, end)
  g.connect(c.destination)
  const o = c.createOscillator()
  o.frequency.setValueAtTime(HANGUP_FROM, start)
  o.frequency.linearRampToValueAtTime(HANGUP_TO, end)
  o.type = 'sine'
  o.connect(g)
  o.start(start)
  o.stop(end + 0.02)
}

// Convenience: stop everything (called on hard reset / unmount).
export function stopAllTones(): void {
  stopRingback()
  busySession?.stop(); busySession = null
  reorderSession?.stop(); reorderSession = null
}
