/** Client-timezone helpers — IANA zones rendered with Intl, no dependency.
 *  All formatters return null on an invalid/unknown zone so callers can
 *  fall back gracefully instead of crashing on bad stored data. */

export interface TzOption {
  value: string
  label: string
}

// Search aliases: US state names (and a few territory terms) per zone, so a
// PM can type where the client IS ("pennsylvania") instead of knowing which
// timezone bucket that falls in. Split states (Texas, Kentucky, the Dakotas…)
// are listed under every zone they straddle — the search then shows both and
// the picker's per-option local time disambiguates.
export const TZ_SEARCH_ALIASES: Record<string, string> = {
  'America/New_York':
    'connecticut delaware florida georgia indiana kentucky maine maryland massachusetts ' +
    'michigan new hampshire new jersey new york north carolina ohio pennsylvania ' +
    'rhode island south carolina tennessee vermont virginia west virginia ' +
    'washington dc district of columbia',
  'America/Chicago':
    'alabama arkansas florida illinois iowa kansas kentucky louisiana minnesota ' +
    'mississippi missouri nebraska north dakota oklahoma south dakota tennessee texas wisconsin',
  'America/Denver':
    'colorado idaho kansas montana nebraska new mexico north dakota south dakota texas utah wyoming',
  'America/Phoenix': 'arizona',
  'America/Los_Angeles': 'california idaho nevada oregon washington',
  'America/Anchorage': 'alaska',
  'Pacific/Honolulu': 'hawaii',
  'Asia/Manila': 'philippines'
}

// The zones our clients actually live in — US business zones first, then the
// team's home zone. The picker shows these on top; everything else lives in
// the "All time zones" group.
export const COMMON_TIMEZONES: TzOption[] = [
  { value: 'America/New_York', label: 'US Eastern (New York)' },
  { value: 'America/Chicago', label: 'US Central (Chicago)' },
  { value: 'America/Denver', label: 'US Mountain (Denver)' },
  { value: 'America/Phoenix', label: 'US Arizona (Phoenix)' },
  { value: 'America/Los_Angeles', label: 'US Pacific (Los Angeles)' },
  { value: 'America/Anchorage', label: 'US Alaska (Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'US Hawaii (Honolulu)' },
  { value: 'Asia/Manila', label: 'Philippines (Manila)' }
]

/** Every zone the runtime knows minus the common ones (for the "All" group).
 *  Empty on engines without Intl.supportedValuesOf — the picker still works
 *  with the common list. */
export function allTimezones(): string[] {
  const common = new Set(COMMON_TIMEZONES.map((t) => t.value))
  const intl = Intl as unknown as { supportedValuesOf?: (key: 'timeZone') => string[] }
  if (typeof intl.supportedValuesOf !== 'function') return []
  try {
    return intl.supportedValuesOf('timeZone').filter((z) => !common.has(z))
  } catch {
    return []
  }
}

/** "3:42 PM" in the given zone. */
export function localTimeIn(tz: string, now: number): string | null {
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: tz
    }).format(now)
  } catch {
    return null
  }
}

/** Hour of day (0–23) in the given zone — for day/night and business-hours cues. */
export function hourIn(tz: string, now: number): number | null {
  try {
    const h = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: tz
    }).format(now)
    // Some engines render midnight as "24" with hour12:false.
    return Number(h) % 24
  } catch {
    return null
  }
}

/** Short zone label ("EDT", "GMT+8") for disambiguating similar times. */
export function tzShortName(tz: string, now: number): string | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZoneName: 'short',
      timeZone: tz
    }).formatToParts(now)
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? null
  } catch {
    return null
  }
}

/** Rough "are they awake / reachable" window: 8am–8pm local. */
export function isDaytime(tz: string, now: number): boolean {
  const h = hourIn(tz, now)
  return h !== null && h >= 8 && h < 20
}
