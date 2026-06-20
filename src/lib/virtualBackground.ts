// Real-time background blur for the meeting camera, mirroring the shape of
// src/lib/noiseSuppressor.ts: take the raw camera MediaStream, return a
// processed one (+ setMode/destroy), or null on failure so the caller falls
// back to the raw camera.
//
// Pipeline (all main-thread — Web Workers + OffscreenCanvas WebGL are
// unreliable on iOS Safari): rawStream → hidden <video> → MediaPipe
// ImageSegmenter person mask → composite onto an opaque <canvas> →
// canvas.captureStream(). Both the source <video> and the canvas stay attached
// to the DOM (offscreen, not display:none) because iOS Safari won't emit
// captureStream frames otherwise.
//
// Quality (what separates this from a toy blur):
//   • Background: downsample + true Gaussian (ctx.filter blur), not a boxy
//     upscale — smooth, not pixelated. Falls back to heavy downscale where
//     ctx.filter is unsupported (older iOS).
//   • Edge: the raw person mask is firmed with a smoothstep curve and feathered
//     with an edge blur, so no gray halo / jagged cutout.
//   • Stability: each frame's mask is temporally blended (EMA) with the last,
//     which removes the shimmering edge that gives cheap blur away.
//
// The MediaPipe runtime + WASM is dynamic-imported the first time a background
// is enabled, so users who never use it pay nothing at app load.
import type { ImageSegmenter as ImageSegmenterT } from '@mediapipe/tasks-vision'

export type BgMode = 'none' | 'blur'

export interface VideoBackground {
  /** Output stream to send to peers — its track is the canvas capture. */
  stream: MediaStream
  track: MediaStreamTrack
  mode(): BgMode
  setMode(mode: BgMode): void
  /** Re-point the pipeline at a new raw camera (used by flip-camera). */
  setSource(rawStream: MediaStream): void
  destroy(): void
}

// Pin the WASM to the installed package version; the model is self-hosted.
const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const MODEL_URL = '/mediapipe/selfie_segmenter.tflite'

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1)
  )
}

function offscreen(el: HTMLElement) {
  el.style.cssText =
    'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;'
}

// Does this browser support canvas 2D ctx.filter (Gaussian blur)? Chrome/FF
// yes; Safari only from 17. Used to pick the blur path + edge feather.
function supportsCanvasFilter(): boolean {
  try {
    const c = document.createElement('canvas').getContext('2d') as any
    c.filter = 'blur(2px)'
    return c.filter === 'blur(2px)'
  } catch {
    return false
  }
}

export async function createVideoBackground(
  rawStream: MediaStream,
  startMode: BgMode,
): Promise<VideoBackground | null> {
  // Declared up front so a failure anywhere below can fully tear down whatever
  // was already created (notably if canvas.captureStream throws after the
  // segmenter/DOM nodes/rAF loop exist — otherwise a zombie pipeline leaks).
  let segmenter: ImageSegmenterT | null = null
  let video: HTMLVideoElement | null = null
  let canvas: HTMLCanvasElement | null = null
  let out: MediaStream | null = null
  let raf = 0
  let stopped = false
  let onVisible: (() => void) | null = null

  function cleanup() {
    stopped = true
    cancelAnimationFrame(raf)
    if (onVisible) document.removeEventListener('visibilitychange', onVisible)
    try { segmenter?.close() } catch { /* ignore */ }
    try { out?.getTracks().forEach((t) => t.stop()) } catch { /* ignore */ }
    if (video) { video.srcObject = null; video.remove() }
    if (canvas) canvas.remove()
  }

  try {
    const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision')
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
    const ios = isIOS()
    segmenter = await ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: ios ? 'CPU' : 'GPU' },
      runningMode: 'VIDEO',
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    })

    const settings = rawStream.getVideoTracks()[0]?.getSettings() ?? {}
    let W = settings.width ?? 640
    let H = settings.height ?? 480
    const canFilter = supportsCanvasFilter()

    // Source video — must be DOM-attached (not display:none) for iOS capture.
    video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.autoplay = true
    video.srcObject = rawStream
    offscreen(video)
    document.body.appendChild(video)
    await video.play().catch(() => {})

    // Opaque output canvas (alpha off; iOS mishandles transparency on capture).
    canvas = document.createElement('canvas')
    offscreen(canvas)
    document.body.appendChild(canvas)
    const ctx = canvas.getContext('2d', { alpha: false })!

    // Scratch: person cut-out + mask alpha + downsample buffer for the bg blur.
    const person = document.createElement('canvas')
    const pctx = person.getContext('2d', { alpha: true })!
    const maskC = document.createElement('canvas')
    const mctx = maskC.getContext('2d', { alpha: true })!
    const ds = canFilter ? 4 : 14 // light downsample when we can Gaussian; heavy otherwise
    let bw = 2
    let bh = 2
    const blurC = document.createElement('canvas')
    const bctx = blurC.getContext('2d', { alpha: false })!

    // Size (and re-size, on camera flip) every buffer to the source dimensions.
    function resize(w: number, h: number) {
      W = w
      H = h
      canvas!.width = W
      canvas!.height = H
      person.width = W
      person.height = H
      bw = Math.max(2, Math.round(W / ds))
      bh = Math.max(2, Math.round(H / ds))
      blurC.width = bw
      blurC.height = bh
    }
    resize(W, H)

    const fps = ios ? 20 : 30
    const frameMs = 1000 / fps
    let mode: BgMode = startMode
    let last = 0
    let prevMask: Float32Array | null = null // temporal EMA of the mask

    function paintBlurredBg() {
      bctx.drawImage(video!, 0, 0, bw, bh)
      ctx.imageSmoothingEnabled = true
      if (canFilter) {
        ctx.filter = 'blur(6px)'
        ctx.drawImage(blurC, 0, 0, bw, bh, 0, 0, W, H)
        ctx.filter = 'none'
      } else {
        ctx.drawImage(blurC, 0, 0, bw, bh, 0, 0, W, H)
      }
    }

    function paintPerson(mask: { width: number; height: number; getAsFloat32Array(): Float32Array }) {
      const mw = mask.width
      const mh = mask.height
      const data = mask.getAsFloat32Array()
      if (!prevMask || prevMask.length !== data.length) prevMask = new Float32Array(data)

      maskC.width = mw
      maskC.height = mh
      const img = mctx.createImageData(mw, mh)
      const lo = 0.35
      const hi = 0.65
      const span = hi - lo
      for (let i = 0; i < data.length; i++) {
        const v = prevMask[i] * 0.5 + data[i] * 0.5
        prevMask[i] = v
        const t = v <= lo ? 0 : v >= hi ? 1 : (v - lo) / span
        const s = t * t * (3 - 2 * t)
        const o = i * 4
        img.data[o] = 255
        img.data[o + 1] = 255
        img.data[o + 2] = 255
        img.data[o + 3] = (s * 255) | 0
      }
      mctx.putImageData(img, 0, 0)

      pctx.filter = 'none'
      pctx.globalCompositeOperation = 'source-over'
      pctx.clearRect(0, 0, W, H)
      pctx.drawImage(video!, 0, 0, W, H)
      pctx.globalCompositeOperation = 'destination-in'
      pctx.imageSmoothingEnabled = true
      if (canFilter) pctx.filter = 'blur(3px)' // feather the cutout edge
      pctx.drawImage(maskC, 0, 0, mw, mh, 0, 0, W, H)
      pctx.filter = 'none'
      pctx.globalCompositeOperation = 'source-over'

      ctx.drawImage(person, 0, 0, W, H)
    }

    function loop(now: number) {
      raf = requestAnimationFrame(loop)
      if (stopped || now - last < frameMs) return
      last = now
      if (!video || video.readyState < 2) return
      if (mode === 'none') {
        ctx.drawImage(video, 0, 0, W, H)
        return
      }
      try {
        const res = segmenter!.segmentForVideo(video, now)
        const mask = res.confidenceMasks?.[0] as any
        if (mask) {
          paintBlurredBg()
          paintPerson(mask)
        } else {
          ctx.drawImage(video, 0, 0, W, H)
        }
        res.close?.()
      } catch {
        ctx.drawImage(video, 0, 0, W, H) // never freeze the tile on a bad frame
      }
    }
    raf = requestAnimationFrame(loop)

    onVisible = () => {
      if (document.visibilityState === 'visible') void video?.play().catch(() => {})
    }
    document.addEventListener('visibilitychange', onVisible)

    out = canvas.captureStream(fps)

    return {
      stream: out,
      track: out.getVideoTracks()[0],
      mode: () => mode,
      setMode: (m) => {
        mode = m
        if (m === 'none') prevMask = null
      },
      setSource(s) {
        if (!video) return
        video.srcObject = s
        prevMask = null
        const st = s.getVideoTracks()[0]?.getSettings()
        if (st?.width && st?.height && (st.width !== W || st.height !== H)) resize(st.width, st.height)
        void video.play().catch(() => {})
      },
      destroy: cleanup,
    }
  } catch (e) {
    cleanup()
    console.warn('[meet] background blur init failed, using raw camera:', (e as Error).message)
    return null
  }
}
