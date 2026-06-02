import { loadRnnoise, RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor'
import rnnoiseWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url'
import rnnoiseSimdWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url'
import rnnoiseWorkletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url'

// RNNoise WASM is the same for every pipeline — fetch/compile it once.
let wasmBinaryPromise: Promise<ArrayBuffer> | null = null
function getWasm() {
  wasmBinaryPromise ??= loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdWasmUrl })
  return wasmBinaryPromise
}

export interface NoisePipeline {
  /** The output track to send to peers — stable across on/off toggles. */
  stream: MediaStream
  enabled(): boolean
  /** Crossfade between the RNNoise-cleaned path and the raw path. */
  setEnabled(on: boolean): void
  destroy(): void
}

/**
 * Build a Web Audio graph that runs the mic through Xiph's RNNoise with a
 * click-free crossfade toggle, so we never have to swap (and renegotiate) the
 * WebRTC track when the user flips noise cancellation mid-call:
 *
 *   src ─┬─▶ rnnoise ─▶ nsGain ─┐
 *        └──────────────▶ rawGain ─┴─▶ destination(.stream → peers)
 *
 * RNNoise requires a 48 kHz context. Returns null if it can't initialise
 * (caller then falls back to the raw mic + the browser's native suppressor).
 */
export async function createNoisePipeline(
  rawStream: MediaStream,
  startEnabled: boolean,
): Promise<NoisePipeline | null> {
  try {
    const wasmBinary = await getWasm()
    const ctx = new AudioContext({ sampleRate: 48000 })
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
    await ctx.audioWorklet.addModule(rnnoiseWorkletUrl)
    const rnnoise = new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary })

    const src = ctx.createMediaStreamSource(rawStream)
    const nsGain = ctx.createGain()
    const rawGain = ctx.createGain()
    const dest = ctx.createMediaStreamDestination()

    src.connect(rnnoise)
    rnnoise.connect(nsGain).connect(dest)
    src.connect(rawGain).connect(dest)

    let on = startEnabled
    const apply = (immediate = false) => {
      const t = ctx.currentTime
      const ns = on ? 1 : 0
      const raw = on ? 0 : 1
      if (immediate) {
        nsGain.gain.setValueAtTime(ns, t)
        rawGain.gain.setValueAtTime(raw, t)
      } else {
        // ~20ms time-constant = smooth, pop-free crossfade.
        nsGain.gain.setTargetAtTime(ns, t, 0.02)
        rawGain.gain.setTargetAtTime(raw, t, 0.02)
      }
    }
    apply(true)

    return {
      stream: dest.stream,
      enabled: () => on,
      setEnabled(v: boolean) {
        on = v
        apply()
      },
      destroy() {
        try { rnnoise.destroy() } catch { /* ignore */ }
        try { src.disconnect() } catch { /* ignore */ }
        try { void ctx.close() } catch { /* ignore */ }
      },
    }
  } catch (e) {
    console.warn('[huddle] RNNoise init failed, falling back to raw mic:', (e as Error).message)
    return null
  }
}
