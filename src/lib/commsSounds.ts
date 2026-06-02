// Synthesized UI cues for the comms huddle — no asset files, just Web Audio
// (same approach as the test tone in MicCheck.vue). Short, polite chimes so
// people notice join / leave / screen-share without a wall of notifications.

let ctx: AudioContext | null = null
let muted = false

const MUTE_KEY = 'buzzybee.comms.sounds-muted'
if (typeof window !== 'undefined') {
  muted = window.localStorage.getItem(MUTE_KEY) === '1'
}

export function soundsMuted() {
  return muted
}
export function setSoundsMuted(v: boolean) {
  muted = v
  if (typeof window !== 'undefined') window.localStorage.setItem(MUTE_KEY, v ? '1' : '0')
}

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || (window as any).webkitAudioContext
  if (!AC) return null
  ctx ??= new AC()
  // Autoplay policies can leave the context suspended until a user gesture.
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  return ctx
}

interface Note {
  freq: number
  start: number
  dur: number
  type?: OscillatorType
  gain?: number
}

// One note = an oscillator with a quick attack and a smooth exponential decay.
function tone(c: AudioContext, n: Note) {
  const { freq, start, dur, type = 'sine', gain = 0.13 } = n
  const t0 = c.currentTime + start
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t0)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(g)
  g.connect(c.destination)
  o.start(t0)
  o.stop(t0 + dur + 0.02)
}

function play(seq: Note[]) {
  if (muted) return
  const c = ac()
  if (!c) return
  for (const n of seq) tone(c, n)
}

// You joined a huddle — confident rising two-note (C5 → G5).
export function playSelfJoin() {
  play([
    { freq: 523.25, start: 0, dur: 0.18 },
    { freq: 783.99, start: 0.085, dur: 0.24 },
  ])
}

// You left the huddle — gentle descending (D5 → G4).
export function playSelfLeave() {
  play([
    { freq: 587.33, start: 0, dur: 0.16 },
    { freq: 392.0, start: 0.085, dur: 0.22 },
  ])
}

// Someone else joined while you're in — soft little blip up (quieter than self).
export function playPeerJoin() {
  play([
    { freq: 659.25, start: 0, dur: 0.11, gain: 0.09 },
    { freq: 880.0, start: 0.07, dur: 0.16, gain: 0.09 },
  ])
}

// Someone left while you're in — soft blip down.
export function playPeerLeave() {
  play([
    { freq: 587.33, start: 0, dur: 0.11, gain: 0.08 },
    { freq: 440.0, start: 0.07, dur: 0.16, gain: 0.08 },
  ])
}

// A new, unseen message from someone else — soft friendly two-note pop.
export function playMessage() {
  play([
    { freq: 880.0, start: 0, dur: 0.08, gain: 0.07 },
    { freq: 1174.66, start: 0.05, dur: 0.13, gain: 0.07 },
  ])
}

// Someone started sharing their screen — distinct triangle three-note rise.
export function playScreenShare() {
  play([
    { freq: 659.25, start: 0, dur: 0.1, type: 'triangle', gain: 0.1 },
    { freq: 880.0, start: 0.08, dur: 0.1, type: 'triangle', gain: 0.1 },
    { freq: 1046.5, start: 0.16, dur: 0.2, type: 'triangle', gain: 0.1 },
  ])
}
