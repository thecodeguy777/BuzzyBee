// Real-time background blur for the meeting camera, mirroring the shape of
// src/lib/noiseSuppressor.ts: take the raw camera MediaStream, return a
// processed one (+ setMode/destroy), or null on failure so the caller falls
// back to the raw camera.
//
// Pipeline (all main-thread — Web Workers + OffscreenCanvas WebGL are
// unreliable on iOS Safari): rawStream → hidden <video> → MediaPipe
// ImageSegmenter person mask → composite (cheap-blurred background + sharp
// masked person) onto an opaque <canvas> → canvas.captureStream(). Both the
// source <video> and the canvas are kept attached to the DOM (offscreen, not
// display:none) because iOS Safari won't emit captureStream frames otherwise.
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

export async function createVideoBackground(
  rawStream: MediaStream,
  startMode: BgMode,
): Promise<VideoBackground | null> {
  try {
    const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision')
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
    const ios = isIOS()
    const segmenter: ImageSegmenterT = await ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: ios ? 'CPU' : 'GPU' },
      runningMode: 'VIDEO',
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    })

    const settings = rawStream.getVideoTracks()[0]?.getSettings() ?? {}
    const W = settings.width ?? 640
    const H = settings.height ?? 480

    // Source video — must be DOM-attached (not display:none) for iOS capture.
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.autoplay = true
    video.srcObject = rawStream
    offscreen(video)
    document.body.appendChild(video)
    await video.play().catch(() => {})

    // Opaque output canvas (alpha must be off; iOS mishandles transparency).
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    offscreen(canvas)
    document.body.appendChild(canvas)
    const ctx = canvas.getContext('2d', { alpha: false })!

    // Scratch canvases: person cut-out, mask alpha, and a tiny blur buffer.
    const person = document.createElement('canvas')
    person.width = W
    person.height = H
    const pctx = person.getContext('2d', { alpha: true })!

    const maskC = document.createElement('canvas')
    const mctx = maskC.getContext('2d', { alpha: true })!

    // Cheap, universal background blur: draw the frame tiny then scale it back
    // up (works on every browser incl. older iOS, unlike ctx.filter:blur).
    const bw = Math.max(2, Math.round(W / 14))
    const bh = Math.max(2, Math.round(H / 14))
    const blurC = document.createElement('canvas')
    blurC.width = bw
    blurC.height = bh
    const bctx = blurC.getContext('2d', { alpha: false })!

    const fps = ios ? 20 : 30
    const frameMs = 1000 / fps
    let mode: BgMode = startMode
    let last = 0
    let raf = 0
    let stopped = false

    function paintBlurredBg() {
      bctx.drawImage(video, 0, 0, bw, bh)
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(blurC, 0, 0, bw, bh, 0, 0, W, H)
    }

    function paintPerson(mask: { width: number; height: number; getAsFloat32Array(): Float32Array }) {
      const mw = mask.width
      const mh = mask.height
      const data = mask.getAsFloat32Array()
      maskC.width = mw
      maskC.height = mh
      const img = mctx.createImageData(mw, mh)
      for (let i = 0; i < data.length; i++) {
        const a = data[i]
        img.data[i * 4] = 255
        img.data[i * 4 + 1] = 255
        img.data[i * 4 + 2] = 255
        img.data[i * 4 + 3] = a >= 0.999 ? 255 : Math.round(a * 255) // soft edge
      }
      mctx.putImageData(img, 0, 0)
      // Sharp frame, then keep only the person via the mask (scaled, smoothed).
      pctx.clearRect(0, 0, W, H)
      pctx.drawImage(video, 0, 0, W, H)
      pctx.globalCompositeOperation = 'destination-in'
      pctx.imageSmoothingEnabled = true
      pctx.drawImage(maskC, 0, 0, mw, mh, 0, 0, W, H)
      pctx.globalCompositeOperation = 'source-over'
      ctx.drawImage(person, 0, 0, W, H)
    }

    function loop(now: number) {
      raf = requestAnimationFrame(loop)
      if (stopped || now - last < frameMs) return
      last = now
      if (video.readyState < 2) return
      if (mode === 'none') {
        ctx.drawImage(video, 0, 0, W, H)
        return
      }
      try {
        const res = segmenter.segmentForVideo(video, now)
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

    // Re-init the segmenter when returning to a backgrounded iOS tab (WebGL
    // context is lost on background — segmentForVideo would throw otherwise).
    const onVisible = () => {
      if (document.visibilityState === 'visible') void video.play().catch(() => {})
    }
    document.addEventListener('visibilitychange', onVisible)

    const out = (canvas as HTMLCanvasElement).captureStream(fps)

    return {
      stream: out,
      track: out.getVideoTracks()[0],
      mode: () => mode,
      setMode: (m) => (mode = m),
      setSource(s) {
        video.srcObject = s
        void video.play().catch(() => {})
      },
      destroy() {
        stopped = true
        cancelAnimationFrame(raf)
        document.removeEventListener('visibilitychange', onVisible)
        try { segmenter.close() } catch { /* ignore */ }
        try { out.getTracks().forEach((t) => t.stop()) } catch { /* ignore */ }
        video.srcObject = null
        video.remove()
        canvas.remove()
      },
    }
  } catch (e) {
    console.warn('[meet] background blur init failed, using raw camera:', (e as Error).message)
    return null
  }
}
