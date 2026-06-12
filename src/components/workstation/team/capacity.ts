// Capacity/utilization helpers for the Team page. Profiles carry no per-member
// capacity column yet, so everyone is measured against the same weekly target.
export const WEEKLY_CAPACITY_HOURS = 40

/** seconds worked this week → 0..n utilization against weekly capacity */
export const utilOf = (seconds: number, capacityHours = WEEKLY_CAPACITY_HOURS) =>
  seconds / (capacityHours * 3600)

export function utilColor(u: number) {
  if (u >= 0.95) return '#c2253c'
  if (u >= 0.75) return '#15803d'
  if (u >= 0.4) return '#2f6fed'
  return '#c2700c'
}

export function utilLabel(u: number) {
  if (u >= 0.95) return 'At capacity'
  if (u >= 0.75) return 'On track'
  if (u >= 0.4) return 'Light'
  return 'Available'
}

export function formatHours(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${String(m).padStart(2, '0')}m`
}

export interface TeamClientRef {
  id: string
  name: string
}

/** One roster row — everything the table/cards need, computed once in TeamView. */
export interface TeamMemberRow {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  role: string
  timezone: string | null
  inactive: boolean
  online: boolean
  seconds: number
  util: number
  open: number
  overdue: number
  done: number
  clients: TeamClientRef[]
}
