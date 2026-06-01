// Rounded-hexagon (honeycomb-cell) path generator.
//
// Ported from the Honeycomb design bundle so the cell shape — the brand's
// core motif — matches the mock exactly. Used to clip person-avatars into
// honeycomb cells instead of circles. Colors are NOT defined here; callers
// keep their own fills/gradients, this only supplies the geometry.

/**
 * Build an SVG path string for a regular polygon (default: hexagon) with
 * rounded corners.
 *
 * @param cx       centre x
 * @param cy       centre y
 * @param R        circumradius (centre → vertex)
 * @param cornerR  corner rounding radius, in the same units as R
 * @param rotDeg   rotation in degrees (0 = a vertex points right → flat top/bottom)
 * @param sides    polygon sides (6 = hexagon)
 */
export function hexPath(
  cx: number,
  cy: number,
  R: number,
  cornerR: number,
  rotDeg = 0,
  sides = 6,
): string {
  const rot = (rotDeg * Math.PI) / 180
  const V: [number, number][] = []
  for (let i = 0; i < sides; i++) {
    const a = rot + (i * 2 * Math.PI) / sides
    V.push([cx + R * Math.cos(a), cy + R * Math.sin(a)])
  }
  const unit = (x: number, y: number): [number, number] => {
    const l = Math.hypot(x, y) || 1
    return [x / l, y / l]
  }
  const before: [number, number][] = []
  const after: [number, number][] = []
  for (let i = 0; i < sides; i++) {
    const cur = V[i]
    const prev = V[(i - 1 + sides) % sides]
    const next = V[(i + 1) % sides]
    const tp = unit(prev[0] - cur[0], prev[1] - cur[1])
    const tn = unit(next[0] - cur[0], next[1] - cur[1])
    before[i] = [cur[0] + tp[0] * cornerR, cur[1] + tp[1] * cornerR]
    after[i] = [cur[0] + tn[0] * cornerR, cur[1] + tn[1] * cornerR]
  }
  const f = (n: number) => n.toFixed(4)
  let d = `M ${f(after[0][0])} ${f(after[0][1])}`
  for (let i = 1; i <= sides; i++) {
    const k = i % sides
    d += ` L ${f(before[k][0])} ${f(before[k][1])} Q ${f(V[k][0])} ${f(V[k][1])} ${f(after[k][0])} ${f(after[k][1])}`
  }
  return d + ' Z'
}

// Shared clipPath id and a normalized (objectBoundingBox, 0..1) rounded-hex
// path. One <clipPath> with this id is enough per document; HexAvatar renders
// it and any div can clip to a honeycomb cell via `clip-path: url(#...)`.
export const HEX_CLIP_ID = 'hc-hex-clip'

// R = 0.5 fills the box; cornerR 0.13 ≈ the design's inR * 0.26 rounding.
export const HEX_CLIP_PATH = hexPath(0.5, 0.5, 0.5, 0.13, 0)
