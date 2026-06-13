export type Availability = 'active' | 'away' | 'sleep' | 'vacation'

/** Person-set status, layered over automatic presence: presence says whether
 *  the app is open, availability says whether to expect a response. */
export const AVAILABILITY: Record<
  Availability,
  { label: string; dot: string; desc: string }
> = {
  active: { label: 'Active', dot: '#16a34a', desc: 'Working as usual' },
  away: { label: 'Away', dot: '#d97706', desc: 'Stepped out for a bit' },
  sleep: { label: 'Sleeping', dot: '#4f46e5', desc: 'Off-hours — replies tomorrow' },
  vacation: { label: 'On vacation', dot: '#7b2d86', desc: 'Out for days, not hours' },
}

export function availabilityOf(v: string | null | undefined): Availability {
  return v && v in AVAILABILITY ? (v as Availability) : 'active'
}
