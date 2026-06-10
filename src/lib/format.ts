/** "1h 05m" / "45m" from a duration in seconds. */
export function formatHours(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h === 0 ? `${m}m` : `${h}h ${String(m).padStart(2, '0')}m`
}

/** Best display name for a profile-ish object: full name → email local-part → fallback. */
export function displayName(
  p: { full_name?: string | null; email?: string | null } | null | undefined,
  fallback = 'Unknown'
): string {
  if (!p) return fallback
  return p.full_name || p.email?.split('@')[0] || fallback
}

/** First word of a display name, for compact labels. */
export function firstName(name: string | null | undefined, fallback = ''): string {
  return name?.trim().split(' ')[0] || fallback
}
