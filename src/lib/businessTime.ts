// Timezone-aware day/week boundaries for the dashboard.
//
// The team is PH-based (ops handle ~90% of work) while the viewer (a US rep or
// PM) may be in another zone. "Today" and "this week" must mean the *business*
// day, not the viewer's browser-local day, or hours/overdue/completed counts
// drift by 12-15h around the boundary. All boundary math here is anchored to a
// single canonical business timezone.

export const BUSINESS_TZ = 'Asia/Manila'

interface Parts {
  year: number
  month: number // 1-12
  day: number
  hour: number
  minute: number
  second: number
}

const DAY_MS = 86_400_000

/** Wall-clock parts of `date` as seen in `tz`. */
function partsInTz(date: Date, tz: string): Parts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  const map: Record<string, number> = {}
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') map[p.type] = Number(p.value)
  }
  // Intl can emit hour "24" at midnight for hour12:false — normalize to 0.
  const hour = map.hour === 24 ? 0 : map.hour
  return { year: map.year, month: map.month, day: map.day, hour, minute: map.minute, second: map.second }
}

/** Offset (ms) of `tz` from UTC at the given instant. UTC+8 → +28_800_000. */
function tzOffsetMs(date: Date, tz: string): number {
  const p = partsInTz(date, tz)
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asIfUtc - date.getTime()
}

/** 0=Sun … 6=Sat, for the calendar day `date` falls on in `tz`. */
function weekdayInTz(date: Date, tz: string): number {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(date)
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd)
}

/** Epoch ms of midnight (start of day) in `tz` for the day `date` falls on. */
export function startOfDayInTz(date: Date, tz: string = BUSINESS_TZ): number {
  const p = partsInTz(date, tz)
  const midnightAsUtc = Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0)
  return midnightAsUtc - tzOffsetMs(date, tz)
}

/** Epoch ms of the most recent Monday 00:00 in `tz` (Monday-start week). */
export function startOfWeekInTz(date: Date, tz: string = BUSINESS_TZ): number {
  const mondayOffset = (weekdayInTz(date, tz) + 6) % 7 // days since Monday
  return startOfDayInTz(date, tz) - mondayOffset * DAY_MS
}

/** 'YYYY-MM-DD' for the calendar day `date` falls on in `tz`. */
export function dateStrInTz(date: Date, tz: string = BUSINESS_TZ): string {
  const p = partsInTz(date, tz)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

export { DAY_MS }
