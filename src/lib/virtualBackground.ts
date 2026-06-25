// Real-time background blur / replacement for the meeting camera. Mirrors the
// shape of src/lib/noiseSuppressor.ts: take the raw camera MediaStream, return
// a processed one (+ setMode/destroy), or null on failure so the caller falls
// back to the raw camera.
//
// Engine: a WebGL2 fragment-shader pipeline (ported from the webcam-bg-removal
// v2 experiment) — separable Gaussian blur, temporal-EMA matte (ping-pong),
// soft-edge alpha with a mask cutoff, a GUIDED FILTER (He et al.) that snaps the
// matte onto real image edges (hair/fingers) using camera luminance as a guide,
// optional LIGHT WRAP, and a zoom/framing crop. MediaPipe ImageSegmenter
// produces the person mask; everything else runs on the GPU.
//
// Hardcoded to the "comfortable" config dialed in the sandbox (2026-06-22):
// blur 14, guided refine 10 / snap 0.6, feather 2, soft 0.10, cutoff 0.50,
// light wrap off, gentle temporal smoothing 0.2. The guided filter needs
// half-float render targets (most desktops); where unavailable (often iOS) it
// falls back to plain feather automatically.
//
// Model is ADAPTIVE: the Quality multiclass selfie model (real hair/skin class,
// ~16 MB) on desktops with headroom; the Fast 250 KB selfie model on phones/iOS
// (and as the universal fallback). Segmentation runs on the MAIN THREAD — the
// MediaPipe worker path hangs on iOS Safari, so we don't use a worker.
//
// Output is canvas.captureStream(); the source <video> and the WebGL <canvas>
// stay DOM-attached (offscreen, not display:none) so iOS Safari emits frames.
// We render UN-mirrored (remote peers must see true orientation; the local
// self-preview mirrors via CSS), with a Y-flip so the captured frame is upright.
//
// The MediaPipe runtime + WASM is dynamic-imported the first time a background
// is enabled, so users who never use it pay nothing at app load.
import type { ImageSegmenter as ImageSegmenterT } from '@mediapipe/tasks-vision'

export type BgMode = 'none' | 'blur' | 'image' | 'color'

export interface VideoBackground {
  stream: MediaStream
  track: MediaStreamTrack
  mode(): BgMode
  setMode(mode: BgMode): void
  setImage(img: CanvasImageSource | null): void
  setColor(hex: string): void
  setSource(rawStream: MediaStream): void
  destroy(): void
}

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
// Fast = self-hosted 250 KB single-class selfie segmenter (person confidence).
// Quality = Google-hosted multiclass (~16 MB); channel 0 is BACKGROUND → invert.
const MODEL_FAST = '/mediapipe/selfie_segmenter.tflite'
const MODEL_QUALITY =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite'

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

// ── Shaders ──────────────────────────────────────────────────────────────────
const VS = `#version 300 es
out vec2 vUv;
void main(){
  int id = gl_VertexID;
  vec2 pos = vec2(float((id << 1) & 2), float(id & 2));
  vUv = pos;
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}`
const HEAD = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
`
// Separable Gaussian, fixed tap count (constant cost). radius=0 => copy.
const FS_BLUR = HEAD + `
uniform sampler2D uSrc; uniform vec2 uTexel; uniform vec2 uDir; uniform float uRadius;
void main(){
  const int N = 8;
  vec4 s = vec4(0.0); float wsum = 0.0;
  for (int i = -N; i <= N; i++){
    float t = float(i) / float(N);
    float w = exp(-3.0 * t * t);
    s += texture(uSrc, vUv + uDir * uTexel * (t * uRadius)) * w;
    wsum += w;
  }
  o = s / max(wsum, 1e-5);
}`
// Temporal EMA on the raw mask + polarity invert.
const FS_MATTE = HEAD + `
uniform sampler2D uMask; uniform sampler2D uPrev; uniform float uSmooth; uniform float uInvert;
void main(){
  float p = texture(uMask, vUv).r;
  if (uInvert > 0.5) p = 1.0 - p;
  o = vec4(mix(p, texture(uPrev, vUv).r, uSmooth), 0.0, 0.0, 1.0);
}`
// Soft-edge matte -> coarse alpha (smoothstep around the cutoff/threshold).
const FS_EDGE = HEAD + `
uniform sampler2D uMatte; uniform float uSoft; uniform float uThreshold;
void main(){
  float m = texture(uMatte, vUv).r;
  float lo = uThreshold - uSoft, hi = uThreshold + uSoft;
  o = vec4((hi <= lo) ? step(uThreshold, m) : smoothstep(lo, hi, m), 0.0, 0.0, 1.0);
}`
const FS_COPY = HEAD + `
uniform sampler2D uSrc;
void main(){ o = texture(uSrc, vUv); }`
// Center crop / zoom: sample a sub-rectangle of the source.
const FS_CROP = HEAD + `
uniform sampler2D uSrc; uniform vec2 uCropOrigin; uniform vec2 uCropSize;
void main(){ o = texture(uSrc, uCropOrigin + vUv * uCropSize); }`
// Show a source with Y-flip (+ optional mirror). Used for 'none'.
const FS_SHOW = HEAD + `
uniform sampler2D uSrc; uniform float uMirror;
void main(){ o = texture(uSrc, vec2(uMirror > 0.5 ? 1.0 - vUv.x : vUv.x, 1.0 - vUv.y)); }`
// ── Guided filter (He et al.): refine alpha p using camera luminance I as guide ──
// Pass 1: pack (I, p, I*I, I*p) so one separable blur yields all four means.
const FS_GF_PACK = HEAD + `
uniform sampler2D uVideo; uniform sampler2D uAlpha;
void main(){
  float I = dot(texture(uVideo, vUv).rgb, vec3(0.299, 0.587, 0.114));
  float p = texture(uAlpha, vUv).r;
  o = vec4(I, p, I * I, I * p);
}`
// Pass 2 (after blurring the pack): linear coefficients a, b.
const FS_GF_COEFF = HEAD + `
uniform sampler2D uMeans; uniform float uEps;
void main(){
  vec4 m = texture(uMeans, vUv);
  float varI  = max(m.b - m.r * m.r, 0.0);
  float covIp = m.a - m.r * m.g;
  float a = covIp / (varI + uEps);
  float b = m.g - a * m.r;
  o = vec4(a, b, 0.0, 0.0);
}`
// Pass 3 (after blurring a,b): q = mean_a * I + mean_b -> refined alpha.
const FS_GF_APPLY = HEAD + `
uniform sampler2D uAB; uniform sampler2D uVideo;
void main(){
  float I = dot(texture(uVideo, vUv).rgb, vec3(0.299, 0.587, 0.114));
  vec2 ab = texture(uAB, vUv).rg;
  o = vec4(clamp(ab.x * I + ab.y, 0.0, 1.0), 0.0, 0.0, 1.0);
}`
// Final composite: light wrap + matte cut + Y-flip (+ optional mirror).
const FS_COMP = HEAD + `
uniform sampler2D uVideo; uniform sampler2D uBg; uniform sampler2D uWrapBg;
uniform sampler2D uAlpha; uniform sampler2D uAlphaWide;
uniform float uWrapStrength; uniform float uMirror;
void main(){
  vec2 uv = vec2(uMirror > 0.5 ? 1.0 - vUv.x : vUv.x, 1.0 - vUv.y);
  float a  = texture(uAlpha, uv).r;
  float aW = texture(uAlphaWide, uv).r;
  vec3 bg   = texture(uBg, uv).rgb;
  vec3 wrap = texture(uWrapBg, uv).rgb;
  vec3 fg   = texture(uVideo, uv).rgb;
  float rim = clamp(a * (1.0 - aW), 0.0, 1.0);
  fg += wrap * (rim * uWrapStrength * 2.0);
  o = vec4(mix(bg, fg, a), 1.0);
}`

type Tex = { tex: WebGLTexture }
type Target = { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number }

export async function createVideoBackground(
  rawStream: MediaStream,
  startMode: BgMode,
): Promise<VideoBackground | null> {
  let video: HTMLVideoElement | null = null
  let canvas: HTMLCanvasElement | null = null
  let gl!: WebGL2RenderingContext
  let segmenter: ImageSegmenterT | null = null
  let out: MediaStream | null = null
  let rafId = 0
  let stopped = false
  let onLost: ((e: Event) => void) | null = null
  let onRestored: (() => void) | null = null

  const ios = isIOS()
  const coarse = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches
  // Quality (multiclass, ~16 MB) only where there's headroom; Fast on phones/iOS.
  const modelKind: 'fast' | 'quality' = !ios && !coarse ? 'quality' : 'fast'
  const mirror = 0 // sent stream is NOT mirrored; self-preview mirrors via CSS

  // Hardcoded comfortable config (see file header).
  const settings = {
    mode: startMode, blur: 14, color: '#1e8e3e',
    refine: 10, snap: 0.6, feather: 2, soft: 0.10, threshold: 0.5,
    wrap: 0, wrapw: 0, smooth: 0.2, invert: false, zoom: 1,
  }

  let progBlur: WebGLProgram, progMatte: WebGLProgram, progEdge: WebGLProgram, progCopy: WebGLProgram
  let progCrop: WebGLProgram, progShow: WebGLProgram, progComp: WebGLProgram
  let progGfPack: WebGLProgram, progGfCoeff: WebGLProgram, progGfApply: WebGLProgram
  let emptyVAO: WebGLVertexArrayObject
  const T: Record<string, Target> = {}
  let srcTex: Tex, videoTex: Target, maskTex: Tex
  let mattePrev: Target, matteCur: Target
  let W = 0, H = 0, lastVideoTime = -1, contextLost = false
  let floatOK = false
  let autoPolarity = true, polFrames = 0, polCenter = 0, polCorner = 0
  let pendingBgImg: CanvasImageSource | null = null, bgReady = false, lastBgImg: CanvasImageSource | null = null
  const uCache = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>()

  function compile(type: number, src: string) {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s))
    return s
  }
  function program(fs: string) {
    const p = gl.createProgram()!
    const vs = compile(gl.VERTEX_SHADER, VS)
    const fsh = compile(gl.FRAGMENT_SHADER, fs)
    gl.attachShader(p, vs); gl.attachShader(p, fsh); gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p))
    gl.deleteShader(vs); gl.deleteShader(fsh)
    return p
  }
  function initPrograms() {
    progBlur = program(FS_BLUR); progMatte = program(FS_MATTE); progEdge = program(FS_EDGE); progCopy = program(FS_COPY)
    progCrop = program(FS_CROP); progShow = program(FS_SHOW); progComp = program(FS_COMP)
    progGfPack = program(FS_GF_PACK); progGfCoeff = program(FS_GF_COEFF); progGfApply = program(FS_GF_APPLY)
    emptyVAO = gl.createVertexArray()!
  }
  function uloc(p: WebGLProgram, name: string) {
    let m = uCache.get(p)
    if (!m) { m = new Map(); uCache.set(p, m) }
    if (!m.has(name)) m.set(name, gl.getUniformLocation(p, name))
    return m.get(name) ?? null
  }
  function setU(p: WebGLProgram, name: string, v: number | number[]) {
    const l = uloc(p, name)
    if (l === null) return
    if (typeof v === 'number') gl.uniform1f(l, v)
    else if (v.length === 2) gl.uniform2f(l, v[0], v[1])
    else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2])
  }
  function run(p: WebGLProgram, target: Target | null, uniforms: Record<string, number | number[]> | null, samplers?: { name: string; tex: Tex }[]) {
    gl.useProgram(p)
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null)
    gl.viewport(0, 0, target ? target.w : canvas!.width, target ? target.h : canvas!.height)
    if (samplers) samplers.forEach((s, i) => {
      gl.activeTexture(gl.TEXTURE0 + i)
      gl.bindTexture(gl.TEXTURE_2D, s.tex.tex)
      gl.uniform1i(uloc(p, s.name), i)
    })
    if (uniforms) for (const k in uniforms) setU(p, k, uniforms[k])
    gl.bindVertexArray(emptyVAO)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
  function mkTex(filter: number): Tex {
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return { tex }
  }
  function mkTarget(w: number, h: number, internalFormat: number, format: number, type: number, filter: number): Target {
    const t = mkTex(filter)
    gl.bindTexture(gl.TEXTURE_2D, t.tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null)
    const fbo = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0)
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('framebuffer incomplete')
    return { tex: t.tex, fbo, w, h }
  }
  function clearTarget(t: Target, r: number, g: number, b: number) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo)
    gl.viewport(0, 0, t.w, t.h)
    gl.clearColor(r, g, b, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }
  function freeTargets() {
    for (const k in T) {
      if (T[k].fbo) gl.deleteFramebuffer(T[k].fbo)
      if (T[k].tex) gl.deleteTexture(T[k].tex)
      delete T[k]
    }
  }
  function createTargets(w: number, h: number) {
    freeTargets()
    const R8: [number, number, number] = [gl.R8, gl.RED, gl.UNSIGNED_BYTE]
    const RGBA: [number, number, number] = [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE]
    T.matteA = mkTarget(w, h, ...R8, gl.LINEAR); T.matteB = mkTarget(w, h, ...R8, gl.LINEAR)
    T.alpha0 = mkTarget(w, h, ...R8, gl.LINEAR); T.tmpR = mkTarget(w, h, ...R8, gl.LINEAR)
    T.alpha = mkTarget(w, h, ...R8, gl.LINEAR); T.alphaW = mkTarget(w, h, ...R8, gl.LINEAR)
    T.bg = mkTarget(w, h, ...RGBA, gl.LINEAR); T.tmpRGBA = mkTarget(w, h, ...RGBA, gl.LINEAR)
    T.wrapBg = mkTarget(w, h, ...RGBA, gl.LINEAR); T.bgImg = mkTarget(w, h, ...RGBA, gl.LINEAR)
    if (floatOK) { // guided-filter scratch (needs signed/HDR range)
      const F16: [number, number, number] = [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT]
      T.gfA = mkTarget(w, h, ...F16, gl.LINEAR); T.gfMeans = mkTarget(w, h, ...F16, gl.LINEAR); T.gfTmp = mkTarget(w, h, ...F16, gl.LINEAR)
    }
    clearTarget(T.matteA, 0, 0, 0); clearTarget(T.matteB, 0, 0, 0)
    mattePrev = T.matteB; matteCur = T.matteA
  }
  function resize(w: number, h: number) {
    W = w; H = h
    canvas!.width = w; canvas!.height = h
    if (!contextLost) {
      if (videoTex) { gl.deleteTexture(videoTex.tex); gl.deleteFramebuffer(videoTex.fbo) }
      if (srcTex) gl.deleteTexture(srcTex.tex)
      if (maskTex) gl.deleteTexture(maskTex.tex)
    }
    srcTex = mkTex(gl.LINEAR)
    videoTex = mkTarget(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR) // crop pass renders here
    maskTex = mkTex(gl.NEAREST) // R32F not linearly filterable without extensions
    createTargets(w, h)
    autoPolarity = true; polFrames = 0; polCenter = 0; polCorner = 0
    if (pendingBgImg) uploadBgImage(pendingBgImg)
  }
  function hexToRgb(hex: string): [number, number, number] {
    const n = parseInt(hex.slice(1), 16)
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
  }
  function uploadBgImage(img: CanvasImageSource) {
    if (!W || !H) { pendingBgImg = img; return }
    const cc = document.createElement('canvas'); cc.width = W; cc.height = H
    const cx = cc.getContext('2d')!
    const iw = (img as any).width || W, ih = (img as any).height || H
    const ir = iw / ih, cr = W / H
    let dw, dh, dx, dy
    if (ir > cr) { dh = H; dw = H * ir; dx = (W - dw) / 2; dy = 0 } else { dw = W; dh = W / ir; dx = 0; dy = (H - dh) / 2 }
    cx.drawImage(img, dx, dy, dw, dh)
    gl.bindTexture(gl.TEXTURE_2D, T.bgImg.tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, cc)
    bgReady = true; lastBgImg = img; pendingBgImg = null
  }
  function sampleAvg(arr: Float32Array, w: number, h: number, x0: number, x1: number, y0: number, y1: number) {
    const ax0 = (x0 * w) | 0, ax1 = (x1 * w) | 0, ay0 = (y0 * h) | 0, ay1 = (y1 * h) | 0
    let s = 0, c = 0
    for (let y = ay0; y < ay1; y += 4) for (let x = ax0; x < ax1; x += 4) { s += arr[y * w + x]; c++ }
    return c ? s / c : 0
  }
  // Upload the live frame, then crop it (zoom) into videoTex — the working frame.
  function uploadVideoTex() {
    gl.bindTexture(gl.TEXTURE_2D, srcTex.tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, video!)
    const cs = 1 / settings.zoom, co = (1 - cs) / 2
    run(progCrop, videoTex, { uCropOrigin: [co, co], uCropSize: [cs, cs] }, [{ name: 'uSrc', tex: srcTex }])
  }
  function onResult(result: any) {
    if (stopped || contextLost) return
    const mask = result.confidenceMasks?.[0]
    if (!mask) return
    const data = mask.getAsFloat32Array() as Float32Array
    const mw = mask.width, mh = mask.height
    // Multiclass: channel 0 is background → person probability.
    if (modelKind === 'quality') for (let i = 0; i < data.length; i++) data[i] = 1 - data[i]
    if (autoPolarity) {
      polCenter += sampleAvg(data, mw, mh, 0.4, 0.6, 0.35, 0.65)
      polCorner += (sampleAvg(data, mw, mh, 0, 0.15, 0, 0.12) + sampleAvg(data, mw, mh, 0.85, 1, 0, 0.12)) / 2
      const need = modelKind === 'quality' ? 24 : 12, margin = modelKind === 'quality' ? 0.2 : 0.05
      if (++polFrames >= need) { autoPolarity = false; if (polCorner / need > polCenter / need + margin) settings.invert = !settings.invert }
    }
    gl.bindTexture(gl.TEXTURE_2D, maskTex.tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, mw, mh, 0, gl.RED, gl.FLOAT, data)
    uploadVideoTex()
    render()
    result.confidenceMasks?.forEach((m: any) => m.close())
    result.categoryMask?.close()
  }
  function render() {
    const texel: [number, number] = [1 / W, 1 / H]
    if (settings.mode === 'none') { run(progShow, null, { uMirror: mirror }, [{ name: 'uSrc', tex: videoTex }]); return }
    // 1) temporal smoothing (ping-pong)
    run(progMatte, matteCur, { uSmooth: settings.smooth, uInvert: settings.invert ? 1 : 0 }, [{ name: 'uMask', tex: maskTex }, { name: 'uPrev', tex: mattePrev }])
    // 2) soft edge -> coarse alpha
    run(progEdge, T.alpha0, { uSoft: settings.soft, uThreshold: settings.threshold }, [{ name: 'uMatte', tex: matteCur }])
    // 3) refine — guided filter (edge-aware) if supported, else plain feather
    if (floatOK && settings.refine > 0) {
      const eps = Math.max(Math.pow(10, -1 - 3 * settings.snap), 1e-3)
      const r = settings.refine
      run(progGfPack, T.gfA, null, [{ name: 'uVideo', tex: videoTex }, { name: 'uAlpha', tex: T.alpha0 }])
      run(progBlur, T.gfTmp, { uTexel: texel, uDir: [1, 0], uRadius: r }, [{ name: 'uSrc', tex: T.gfA }])
      run(progBlur, T.gfMeans, { uTexel: texel, uDir: [0, 1], uRadius: r }, [{ name: 'uSrc', tex: T.gfTmp }])
      run(progGfCoeff, T.gfA, { uEps: eps }, [{ name: 'uMeans', tex: T.gfMeans }])
      run(progBlur, T.gfTmp, { uTexel: texel, uDir: [1, 0], uRadius: r }, [{ name: 'uSrc', tex: T.gfA }])
      run(progBlur, T.gfMeans, { uTexel: texel, uDir: [0, 1], uRadius: r }, [{ name: 'uSrc', tex: T.gfTmp }])
      run(progGfApply, T.alpha, null, [{ name: 'uAB', tex: T.gfMeans }, { name: 'uVideo', tex: videoTex }])
      if (settings.feather > 0) {
        run(progBlur, T.tmpR, { uTexel: texel, uDir: [1, 0], uRadius: settings.feather }, [{ name: 'uSrc', tex: T.alpha }])
        run(progBlur, T.alpha, { uTexel: texel, uDir: [0, 1], uRadius: settings.feather }, [{ name: 'uSrc', tex: T.tmpR }])
      }
    } else {
      run(progBlur, T.tmpR, { uTexel: texel, uDir: [1, 0], uRadius: settings.feather }, [{ name: 'uSrc', tex: T.alpha0 }])
      run(progBlur, T.alpha, { uTexel: texel, uDir: [0, 1], uRadius: settings.feather }, [{ name: 'uSrc', tex: T.tmpR }])
    }
    // 4) wider matte blur -> light-wrap band
    run(progBlur, T.tmpR, { uTexel: texel, uDir: [1, 0], uRadius: settings.wrapw }, [{ name: 'uSrc', tex: T.alpha }])
    run(progBlur, T.alphaW, { uTexel: texel, uDir: [0, 1], uRadius: settings.wrapw }, [{ name: 'uSrc', tex: T.tmpR }])
    // 5) display background
    if (settings.mode === 'blur') {
      run(progBlur, T.tmpRGBA, { uTexel: texel, uDir: [1, 0], uRadius: settings.blur }, [{ name: 'uSrc', tex: videoTex }])
      run(progBlur, T.bg, { uTexel: texel, uDir: [0, 1], uRadius: settings.blur }, [{ name: 'uSrc', tex: T.tmpRGBA }])
    } else if (settings.mode === 'image' && bgReady) {
      run(progCopy, T.bg, null, [{ name: 'uSrc', tex: T.bgImg }])
    } else {
      const c = settings.mode === 'color' ? hexToRgb(settings.color) : [0, 0, 0]
      clearTarget(T.bg, c[0], c[1], c[2])
    }
    // 6) blurred background = wrap light source
    run(progBlur, T.tmpRGBA, { uTexel: texel, uDir: [1, 0], uRadius: settings.wrapw }, [{ name: 'uSrc', tex: T.bg }])
    run(progBlur, T.wrapBg, { uTexel: texel, uDir: [0, 1], uRadius: settings.wrapw }, [{ name: 'uSrc', tex: T.tmpRGBA }])
    // 7) composite to screen
    run(progComp, null, { uWrapStrength: settings.wrap, uMirror: mirror }, [
      { name: 'uVideo', tex: videoTex }, { name: 'uBg', tex: T.bg }, { name: 'uWrapBg', tex: T.wrapBg },
      { name: 'uAlpha', tex: T.alpha }, { name: 'uAlphaWide', tex: T.alphaW },
    ])
    const tmp = mattePrev; mattePrev = matteCur; matteCur = tmp
  }
  function loop() {
    if (stopped) return
    rafId = requestAnimationFrame(loop)
    if (contextLost || !video || !segmenter) return
    if (video.currentTime !== lastVideoTime && video.readyState >= 2) {
      lastVideoTime = video.currentTime
      try { segmenter.segmentForVideo(video, performance.now(), onResult) } catch { /* skip frame */ }
    }
  }

  function cleanup() {
    stopped = true
    if (rafId) cancelAnimationFrame(rafId)
    if (canvas && onLost) canvas.removeEventListener('webglcontextlost', onLost)
    if (canvas && onRestored) canvas.removeEventListener('webglcontextrestored', onRestored)
    try { segmenter?.close() } catch { /* ignore */ }
    try { out?.getTracks().forEach((t) => t.stop()) } catch { /* ignore */ }
    // Free GL resources deterministically + drop the context. Relying on GC of
    // the removed canvas can exhaust the browser's ~16 live-WebGL-context cap
    // when blur / camera is toggled repeatedly in one session, after which
    // getContext('webgl2') returns null and the effect silently fails.
    try {
      if (gl && !contextLost) {
        freeTargets()
        if (videoTex) { gl.deleteTexture(videoTex.tex); gl.deleteFramebuffer(videoTex.fbo) }
        if (srcTex) gl.deleteTexture(srcTex.tex)
        if (maskTex) gl.deleteTexture(maskTex.tex)
        gl.getExtension('WEBGL_lose_context')?.loseContext()
      }
    } catch { /* ignore */ }
    if (video) { video.srcObject = null; video.remove() }
    if (canvas) canvas.remove()
  }

  try {
    // Source video (DOM-attached, offscreen).
    video = document.createElement('video')
    video.muted = true; video.playsInline = true; video.autoplay = true
    video.srcObject = rawStream
    offscreen(video); document.body.appendChild(video)
    await video.play().catch(() => {})

    // WebGL2 output canvas (DOM-attached, offscreen).
    canvas = document.createElement('canvas')
    offscreen(canvas); document.body.appendChild(canvas)
    const ctx = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: false })
    if (!ctx) throw new Error('WebGL2 unavailable')
    gl = ctx
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    // Half-float render targets enable the guided filter; without them we fall
    // back to plain feather (common on iOS).
    floatOK = !!gl.getExtension('EXT_color_buffer_float') && !!gl.getExtension('OES_texture_half_float_linear')
    initPrograms()

    // Segmenter (iOS: GPU delegate masks are buggy → CPU).
    const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision')
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
    const opts: any = {
      baseOptions: { modelAssetPath: modelKind === 'quality' ? MODEL_QUALITY : MODEL_FAST, delegate: ios ? 'CPU' : 'GPU' },
      runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false,
    }
    try {
      segmenter = await ImageSegmenter.createFromOptions(fileset, opts)
    } catch {
      opts.baseOptions.delegate = 'CPU'
      segmenter = await ImageSegmenter.createFromOptions(fileset, opts)
    }

    const st = rawStream.getVideoTracks()[0]?.getSettings() ?? {}
    resize(st.width ?? 640, st.height ?? 480)

    onLost = (e: Event) => { e.preventDefault(); contextLost = true }
    onRestored = () => {
      try {
        uCache.clear(); initPrograms(); if (W && H) resize(W, H)
        bgReady = false; if (lastBgImg) uploadBgImage(lastBgImg)
        contextLost = false
      } catch { /* leave paused */ }
    }
    canvas.addEventListener('webglcontextlost', onLost, false)
    canvas.addEventListener('webglcontextrestored', onRestored, false)

    rafId = requestAnimationFrame(loop)
    out = canvas.captureStream(ios ? 24 : 30)

    return {
      stream: out,
      track: out.getVideoTracks()[0],
      mode: () => settings.mode,
      setMode: (m) => { settings.mode = m },
      setImage: (img) => { if (img) uploadBgImage(img); else { bgReady = false; lastBgImg = null } },
      setColor: (hex) => { settings.color = hex },
      setSource(s) {
        if (!video) return
        video.srcObject = s
        lastVideoTime = -1
        const ns = s.getVideoTracks()[0]?.getSettings()
        if (ns?.width && ns?.height && (ns.width !== W || ns.height !== H)) resize(ns.width, ns.height)
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
