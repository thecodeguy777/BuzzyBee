// Deterministic per-user identity color. Same key (user id) → same color,
// always, for everyone — no storage needed. Phase 2 will let users override
// this with a saved `profiles.color`, falling back to this when unset.
//
// Palette = Radix "step 9" solids: vivid, distinct hues designed to carry white
// text (so they work as avatar fills) while still reading as names on light and
// dark backgrounds. Additive identity color only — it doesn't touch the theme.
const PALETTE = [
  '#E5484D', // red
  '#E54D2E', // tomato
  '#F76B15', // orange
  '#46A758', // grass
  '#12A594', // teal
  '#00A2C7', // cyan
  '#0090FF', // blue
  '#3E63DD', // indigo
  '#6E56CF', // violet
  '#8E4EC6', // purple
  '#D6409F', // pink
  '#E93D82', // crimson
] as const

export function userColor(key: string | null | undefined): string {
  const s = key || ''
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}
