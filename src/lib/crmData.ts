// CRM static config + types. Entity data now lives in Supabase (see stores/crm).

export type StageId = 'lead' | 'contacted' | 'proposal' | 'negotiation' | 'won' | 'lost'
export type Health = 'hot' | 'warm' | 'cold'
export type ActivityType =
  | 'message' | 'task' | 'email' | 'note' | 'stage' | 'call' | 'meeting' | 'won'

export interface Stage {
  id: StageId
  label: string
  dot: string
  tint: string
}
export interface Company {
  id: string
  name: string
  initials: string
  color: string
  industry: string
  isClient: boolean
  clientId: string | null
  channelId: string | null
  channelName: string | null
  site: string
}
export interface Contact {
  id: string
  companyId: string
  name: string
  initials: string
  role: string
  email: string
  phone: string
  color: string
  primary: boolean
}
export interface Deal {
  id: string
  title: string
  companyId: string
  stage: StageId
  value: number
  ownerId: string | null
  close: string
  source: string
  health: Health
  priority: string
  channelId: string | null
  channelName: string | null
  sort: number
}
export interface Activity {
  id: string
  dealId: string
  type: ActivityType
  actorId: string | null
  body: string
  meta: string | null
  createdAt: string
}
export interface LinkedTask {
  taskId: string
  ref: string
  title: string
  status: string
  dot: string
}

export const STAGES: Stage[] = [
  { id: 'lead', label: 'Lead', dot: '#8b8a93', tint: 'var(--st-todo-bg)' },
  { id: 'contacted', label: 'Contacted', dot: '#2f6fed', tint: 'var(--st-rev-bg)' },
  { id: 'proposal', label: 'Proposal', dot: '#c2700c', tint: 'var(--st-prog-bg)' },
  { id: 'negotiation', label: 'Negotiation', dot: '#7b2d86', tint: 'color-mix(in oklab, #7b2d86 12%, var(--color-base-100))' },
  { id: 'won', label: 'Won', dot: '#15803d', tint: 'var(--st-done-bg)' },
]
export const LOST: Stage = { id: 'lost', label: 'Lost', dot: '#c2253c', tint: 'var(--st-block-bg)' }

export const HEALTH: Record<Health, { label: string; color: string }> = {
  hot: { label: 'Hot', color: '#d6336c' },
  warm: { label: 'Warm', color: '#c2700c' },
  cold: { label: 'Cold', color: '#5b8da8' },
}

export const SOURCES = ['Referral', 'Web inquiry', 'Cold outreach', 'Existing client']

export const fmtMoney = (n: number) => '$' + n.toLocaleString()

export const ACT_COLOR: Record<ActivityType, string> = {
  message: 'var(--accent-fg)', task: '#2f6fed', email: '#c2700c', note: 'var(--color-base-content)',
  stage: '#7b2d86', call: '#0d9488', meeting: '#4f46e5', won: '#15803d',
}

// Compact relative time for the activity timeline.
export function relTime(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Math.max(0, Date.now() - then)
  const m = Math.round(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return m + 'm ago'
  const h = Math.round(m / 60)
  if (h < 24) return h + 'h ago'
  const d = Math.round(h / 24)
  if (d === 1) return 'Yesterday'
  if (d < 7) return d + 'd ago'
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
