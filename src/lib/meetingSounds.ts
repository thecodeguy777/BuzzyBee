// Synthesized UI sounds for the meeting room — a doorbell knock when someone
// is at the lobby, join/leave chimes, an "admitted" fanfare, and a hand-raise
// ding. WebAudio oscillators (no asset files to source/license/bundle), short
// and tasteful. Same synth approach as the Electron dialer's call tones.
//
// Browsers gate audio until a user gesture: call `unlock()` from a click (the
// Join button / any control) to prime the context. Sounds triggered later by
// *other* people's events then play, because the context is already running.

const KEY = 'buzzybee.meet.sounds'
let ctx: AudioContext | null = null
let enabled = typeof window === 'undefined' ? true : window.localStorage.getItem(KEY) !== '0'

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext
      if (!AC) return null
      ctx = new AC()
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
    return ctx
  } catch {
    return null
  }
}

interface Note { f: number; t?: number; d?: number; g?: number; type?: OscillatorType }

function play(notes: Note[]) {
  if (!enabled) return
  const c = ac()
  if (!c || c.state !== 'running') return // suspended (no gesture yet) → skip silently
  const now = c.currentTime
  for (const n of notes) {
    const osc = c.createOscillator()
    osc.type = n.type ?? 'sine'
    osc.frequency.value = n.f
    const g = c.createGain()
    const t0 = now + (n.t ?? 0)
    const dur = n.d ?? 0.2
    const peak = n.g ?? 0.12
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012) // soft attack
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur) // exp decay
    osc.connect(g).connect(c.destination)
    osc.start(t0)
    osc.stop(t0 + dur + 0.03)
  }
}

// Notes (Hz)
const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, D6 = 1174.66

export const meetSounds = {
  isEnabled: () => enabled,
  setEnabled(v: boolean) {
    enabled = v
    try { window.localStorage.setItem(KEY, v ? '1' : '0') } catch { /* ignore */ }
  },
  /** Prime the audio context from a user gesture (join click / control tap). */
  unlock() { ac() },
  /** Someone joined the call — gentle two-note rise. */
  join() { play([{ f: C5, d: 0.16 }, { f: G5, t: 0.07, d: 0.22 }]) },
  /** Someone left — two-note fall. */
  leave() { play([{ f: G5, d: 0.16 }, { f: C5, t: 0.07, d: 0.26 }]) },
  /** Doorbell — someone's waiting in the lobby. Warmer, longer, a touch louder. */
  knock() { play([{ f: E5, d: 0.5, g: 0.18, type: 'triangle' }, { f: C5, t: 0.22, d: 0.78, g: 0.18, type: 'triangle' }]) },
  /** You were admitted — welcoming ascending arpeggio. */
  admitted() { play([{ f: C5, d: 0.16 }, { f: E5, t: 0.1, d: 0.16 }, { f: G5, t: 0.2, d: 0.18 }, { f: C6, t: 0.3, d: 0.3 }]) },
  /** A hand went up — single soft high ding. */
  hand() { play([{ f: D6, d: 0.28, g: 0.1 }]) },
}
