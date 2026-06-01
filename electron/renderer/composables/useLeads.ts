import { ref, computed, watch } from 'vue'
import { getSupabase, supabaseSession } from '../lib/supabase-client'

export type LeadStatus =
  | 'new'
  | 'calling'
  | 'contacted'
  | 'callback'
  | 'voicemail'
  | 'no-answer'
  | 'not-interested'
  | 'wrong-number'
  | 'dnc'
  | 'invalid'
  | 'done'

/** Pipeline stage = where in the sales funnel. Distinct from `status` which
 *  reflects the most recent call outcome. */
export type LeadStage =
  | 'lead'
  | 'contacted'
  | 'qualified'
  | 'discovery'
  | 'proposal'
  | 'negotiation'
  | 'closed-won'
  | 'closed-lost'

export const STAGE_ORDER: LeadStage[] = [
  'lead', 'contacted', 'qualified', 'discovery',
  'proposal', 'negotiation', 'closed-won', 'closed-lost',
]

export const STAGE_LABEL: Record<LeadStage, string> = {
  'lead': 'Lead',
  'contacted': 'Contacted',
  'qualified': 'Qualified',
  'discovery': 'Discovery',
  'proposal': 'Proposal',
  'negotiation': 'Negotiation',
  'closed-won': 'Won',
  'closed-lost': 'Lost',
}

export interface Lead {
  id: string
  fullName: string
  phoneE164: string
  email?: string
  company?: string
  status: LeadStatus
  stage: LeadStage
  lastCalledAt?: string
  callCount: number
  nextCallbackAt?: string
  nextActionAt?: string
  nextActionNote?: string
  dealValueCents?: number
  dealCurrency?: string
  closeProbability?: number
  stageChangedAt?: string
  wonLostReason?: string
  notes?: string
  source?: string
  timezone?: string
  customFields?: Record<string, string>
  createdAt: string
  updatedAt: string
}

export type DispositionOutcome = Exclude<LeadStatus, 'new' | 'calling' | 'invalid' | 'done'>

export const DISPOSITION_STAGE_ADVANCE: Partial<Record<DispositionOutcome, LeadStage>> = {
  contacted: 'contacted',
}

const LOCAL_STORAGE_KEY = 'hivemind.dialer.leads'   // legacy — used only for one-shot migration

// ── Singleton state at module scope ──
const leads = ref<Lead[]>([])
const isLoading = ref(false)
const isLoadingMore = ref(false)
const lastError = ref<string | null>(null)
// Total rows in dialer_leads (exact count from the DB) — drives the
// "X of Y" UI. We keep a per-request cap (Supabase max-rows) and page
// through it with .range() instead of raising the cap.
const totalCount = ref(0)
const hasMore = ref(false)
const PAGE_SIZE = 300

// True, DB-wide aggregates (NOT derived from the loaded/paginated rows).
// All count + pipeline UI must read from here so numbers don't grow as
// you scroll. Sourced from the buzzybee.dialer_lead_stats() RPC.
const leadStats = ref<{
  total: number
  byStage: Record<string, number>
  pipelineTotalCents: number
  pipelineWeightedCents: number
  wonCents: number
}>({ total: 0, byStage: {}, pipelineTotalCents: 0, pipelineWeightedCents: 0, wonCents: 0 })

// Active stage filter. Filtering happens SERVER-SIDE (a DB query per stage),
// not by filtering loaded rows — otherwise stages whose rows haven't been
// paginated in yet would show empty even though the chip count is non-zero.
const stageFilter = ref<string>('all')

// True row count for whatever stage is currently filtered (from the RPC),
// used to decide if there are more pages to load.
function currentFilterTotal(): number {
  return stageFilter.value === 'all'
    ? leadStats.value.total
    : (leadStats.value.byStage[stageFilter.value] ?? 0)
}

function uuid(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function nowIso(): string {
  return new Date().toISOString()
}

function toE164(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('+')) return '+' + trimmed.slice(1).replace(/\D/g, '')
  return '+' + trimmed.replace(/\D/g, '')
}

// ── Row ↔ Lead mapping ──────────────────────────────────────────
// Database is snake_case, JS is camelCase. Single point of translation.

function rowToLead(r: any): Lead {
  return {
    id: r.id,
    fullName: r.full_name,
    phoneE164: r.phone_e164,
    email: r.email ?? undefined,
    company: r.company ?? undefined,
    status: r.status,
    stage: r.stage ?? 'lead',
    lastCalledAt: r.last_called_at ?? undefined,
    callCount: r.call_count ?? 0,
    nextCallbackAt: r.next_callback_at ?? undefined,
    nextActionAt: r.next_action_at ?? undefined,
    nextActionNote: r.next_action_note ?? undefined,
    dealValueCents: r.deal_value_cents ?? undefined,
    dealCurrency: r.deal_currency ?? undefined,
    closeProbability: r.close_probability ?? undefined,
    stageChangedAt: r.stage_changed_at ?? undefined,
    wonLostReason: r.won_lost_reason ?? undefined,
    notes: r.notes ?? undefined,
    source: r.source ?? undefined,
    timezone: r.timezone ?? undefined,
    customFields: r.custom_fields ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function leadToRow(l: Partial<Lead>, actorId: string | null): Record<string, any> {
  const row: Record<string, any> = {}
  if (l.id != null) row.id = l.id
  if (l.fullName != null) row.full_name = l.fullName
  if (l.phoneE164 != null) row.phone_e164 = l.phoneE164
  if ('email' in l) row.email = l.email ?? null
  if ('company' in l) row.company = l.company ?? null
  if (l.status != null) row.status = l.status
  if (l.stage != null) row.stage = l.stage
  if ('lastCalledAt' in l) row.last_called_at = l.lastCalledAt ?? null
  if (l.callCount != null) row.call_count = l.callCount
  if ('nextCallbackAt' in l) row.next_callback_at = l.nextCallbackAt ?? null
  if ('nextActionAt' in l) row.next_action_at = l.nextActionAt ?? null
  if ('nextActionNote' in l) row.next_action_note = l.nextActionNote ?? null
  if ('dealValueCents' in l) row.deal_value_cents = l.dealValueCents ?? null
  if ('dealCurrency' in l) row.deal_currency = l.dealCurrency ?? null
  if ('closeProbability' in l) row.close_probability = l.closeProbability ?? null
  if ('stageChangedAt' in l) row.stage_changed_at = l.stageChangedAt ?? null
  if ('wonLostReason' in l) row.won_lost_reason = l.wonLostReason ?? null
  if ('notes' in l) row.notes = l.notes ?? null
  if ('source' in l) row.source = l.source ?? null
  if ('timezone' in l) row.timezone = l.timezone ?? null
  if ('customFields' in l) row.custom_fields = l.customFields ?? {}
  if (actorId) row.updated_by_user_id = actorId
  return row
}

// ── Supabase initialization + realtime subscription ────────────

let initialized = false
async function initLeads() {
  if (initialized) return
  initialized = true

  const client = await getSupabase()
  if (!client) {
    console.warn('[useLeads] No Supabase client — features disabled until sign-in.')
    return
  }

  isLoading.value = true
  try {
    // Stable ordering for pagination: the bulk-imported leads share a
    // near-identical created_at, so we add id as a deterministic tiebreaker
    // — otherwise .range() pages would overlap or skip rows.
    const { data, error, count } = await client
      .from('dialer_leads')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(0, PAGE_SIZE - 1)
    if (error) {
      lastError.value = error.message
      console.error('[useLeads] Initial fetch failed:', error)
    } else {
      leads.value = (data ?? []).map(rowToLead)
      totalCount.value = count ?? leads.value.length
      hasMore.value = leads.value.length < totalCount.value
    }
  } finally {
    isLoading.value = false
  }

  // True DB-wide totals for all count/pipeline UI (independent of paging).
  fetchLeadStats()

  // Realtime subscription — keeps the ref in sync with every change in
  // dialer_leads, whether from this client or another one.
  client
    .channel('dialer_leads_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'buzzybee', table: 'dialer_leads' },
      (payload: any) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const lead = rowToLead(payload.new)
          const idx = leads.value.findIndex(l => l.id === lead.id)
          if (idx === -1) leads.value = [lead, ...leads.value]
          else leads.value = leads.value.map(l => l.id === lead.id ? lead : l)
        } else if (payload.eventType === 'DELETE') {
          leads.value = leads.value.filter(l => l.id !== payload.old?.id)
        }
        // Keep the true totals fresh when rows change (debounced so a bulk
        // import doesn't fire hundreds of RPC calls).
        scheduleStatsRefresh()
      },
    )
    .subscribe()
}

// Pull true DB-wide aggregates. Independent of pagination — this is the
// number the CEO demo flexes (6,330), and it never changes on scroll.
async function fetchLeadStats() {
  const client = await getSupabase()
  if (!client) return
  const { data, error } = await client.rpc('dialer_lead_stats')
  if (error) {
    console.error('[useLeads] fetchLeadStats failed:', error)
    return
  }
  if (data) {
    leadStats.value = data as any
    totalCount.value = leadStats.value.total
    hasMore.value = leads.value.length < leadStats.value.total
  }
}

let statsTimer: ReturnType<typeof setTimeout> | null = null
function scheduleStatsRefresh() {
  if (statsTimer) clearTimeout(statsTimer)
  statsTimer = setTimeout(() => { fetchLeadStats() }, 1500)
}

// Fetch the next page and append. Each request stays well under the
// Supabase per-request max-rows cap, so we can walk the full table in
// PAGE_SIZE chunks without raising the cap.
async function loadMore() {
  if (isLoadingMore.value || !hasMore.value) return
  const client = await getSupabase()
  if (!client) return
  isLoadingMore.value = true
  try {
    const from = leads.value.length
    const base = client
      .from('dialer_leads')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
    const q = stageFilter.value !== 'all' ? base.eq('stage', stageFilter.value) : base
    const { data, error } = await q.range(from, from + PAGE_SIZE - 1)
    if (error) {
      lastError.value = error.message
      console.error('[useLeads] loadMore failed:', error)
      return
    }
    const seen = new Set(leads.value.map(l => l.id))
    const next = (data ?? []).map(rowToLead).filter(l => !seen.has(l.id))
    leads.value = [...leads.value, ...next]
    hasMore.value = leads.value.length < currentFilterTotal() && next.length > 0
  } finally {
    isLoadingMore.value = false
  }
}

// Switch the stage filter and refetch page 1 from the server for that
// stage. This is what makes clicking "Won" actually show the 3 Won leads
// even though they were never paginated into the loaded set.
async function applyStageFilter(stage: string) {
  if (stage === stageFilter.value) return
  stageFilter.value = stage
  const client = await getSupabase()
  if (!client) return
  isLoading.value = true
  try {
    const base = client
      .from('dialer_leads')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
    const q = stage !== 'all' ? base.eq('stage', stage) : base
    const { data, error } = await q.range(0, PAGE_SIZE - 1)
    if (error) {
      lastError.value = error.message
      console.error('[useLeads] applyStageFilter failed:', error)
      return
    }
    leads.value = (data ?? []).map(rowToLead)
    hasMore.value = leads.value.length < currentFilterTotal()
  } finally {
    isLoading.value = false
  }
}

// Kick off init the moment the session resolves (or immediately if already)
watch(supabaseSession, (s) => {
  if (s && !initialized) initLeads()
}, { immediate: true })

export function useLeads() {
  const sortedLeads = computed(() => {
    const now = Date.now()
    return [...leads.value].sort((a, b) => {
      const aCallback = a.nextCallbackAt ? new Date(a.nextCallbackAt).getTime() : Infinity
      const bCallback = b.nextCallbackAt ? new Date(b.nextCallbackAt).getTime() : Infinity
      const aDue = aCallback <= now
      const bDue = bCallback <= now
      if (aDue !== bDue) return aDue ? -1 : 1
      if (aDue && bDue) return aCallback - bCallback

      const aLast = a.lastCalledAt ? new Date(a.lastCalledAt).getTime() : 0
      const bLast = b.lastCalledAt ? new Date(b.lastCalledAt).getTime() : 0
      return aLast - bLast
    })
  })

  const dialableLeads = computed(() =>
    sortedLeads.value.filter(
      l =>
        l.status !== 'dnc'
        && l.status !== 'invalid'
        && l.status !== 'done'
        && l.stage !== 'closed-won'
        && l.stage !== 'closed-lost',
    ),
  )

  const stats = computed(() => {
    const total = leads.value.length
    const dialable = dialableLeads.value.length
    const dnc = leads.value.filter(l => l.status === 'dnc').length
    const contacted = leads.value.filter(l => l.status === 'contacted').length
    const callbacks = leads.value.filter(
      l => l.nextCallbackAt && new Date(l.nextCallbackAt) <= new Date()
    ).length
    return { total, dialable, dnc, contacted, callbacks }
  })

  function currentActorId(): string | null {
    return supabaseSession.value?.userId ?? null
  }

  async function addLead(input: { fullName: string; phoneE164: string; email?: string; company?: string; notes?: string; source?: string }): Promise<Lead | null> {
    const client = await getSupabase()
    if (!client) return null

    const actorId = currentActorId()
    const lead: Lead = {
      id: uuid(),
      fullName: input.fullName.trim(),
      phoneE164: toE164(input.phoneE164),
      email: input.email?.trim() || undefined,
      company: input.company?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      source: input.source?.trim() || 'manual',
      status: 'new',
      stage: 'lead',
      callCount: 0,
      stageChangedAt: nowIso(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    // Optimistic
    leads.value = [lead, ...leads.value]

    const row = leadToRow(lead, actorId)
    if (actorId) row.created_by_user_id = actorId
    const { error } = await client.from('dialer_leads').insert(row)
    if (error) {
      console.error('[useLeads] addLead insert failed:', error)
      leads.value = leads.value.filter(l => l.id !== lead.id)
      lastError.value = error.message
      return null
    }
    return lead
  }

  async function updateLead(id: string, patch: Partial<Lead>) {
    const client = await getSupabase()
    if (!client) return
    const actorId = currentActorId()

    // Optimistic
    const idx = leads.value.findIndex(l => l.id === id)
    if (idx === -1) return
    const next = { ...leads.value[idx], ...patch, updatedAt: nowIso() }
    leads.value = leads.value.map(l => l.id === id ? next : l)

    const row = leadToRow(patch, actorId)
    const { error } = await client.from('dialer_leads').update(row).eq('id', id)
    if (error) {
      console.error('[useLeads] updateLead failed:', error)
      lastError.value = error.message
    }
  }

  async function removeLead(id: string) {
    const client = await getSupabase()
    if (!client) return
    const before = leads.value
    leads.value = leads.value.filter(l => l.id !== id)
    const { error } = await client.from('dialer_leads').delete().eq('id', id)
    if (error) {
      console.error('[useLeads] removeLead failed:', error)
      leads.value = before
      lastError.value = error.message
    }
  }

  async function clearAll() {
    const client = await getSupabase()
    if (!client) return
    const before = leads.value
    leads.value = []
    // Bulk delete all leads visible to this user
    const ids = before.map(l => l.id)
    if (ids.length === 0) return
    const { error } = await client.from('dialer_leads').delete().in('id', ids)
    if (error) {
      console.error('[useLeads] clearAll failed:', error)
      leads.value = before
      lastError.value = error.message
    }
  }

  function dispositionLead(
    id: string,
    outcome: DispositionOutcome,
    opts?: { callbackAt?: string },
  ): { stageAdvancedTo: LeadStage | null } {
    const lead = leads.value.find(l => l.id === id)
    if (!lead) return { stageAdvancedTo: null }

    const patch: Partial<Lead> = {
      status: outcome,
      lastCalledAt: nowIso(),
      callCount: lead.callCount + 1,
      nextCallbackAt: outcome === 'callback' ? opts?.callbackAt : undefined,
    }
    updateLead(id, patch)

    const target = DISPOSITION_STAGE_ADVANCE[outcome]
    if (!target) return { stageAdvancedTo: null }
    const currentIdx = STAGE_ORDER.indexOf(lead.stage)
    const targetIdx = STAGE_ORDER.indexOf(target)
    if (currentIdx >= 0 && targetIdx > currentIdx) {
      setStage(id, target)
      return { stageAdvancedTo: target }
    }
    return { stageAdvancedTo: null }
  }

  function setStage(id: string, stage: LeadStage, opts?: { wonLostReason?: string }) {
    const lead = leads.value.find(l => l.id === id)
    if (!lead || lead.stage === stage) return
    updateLead(id, {
      stage,
      stageChangedAt: nowIso(),
      wonLostReason: stage === 'closed-won' || stage === 'closed-lost' ? opts?.wonLostReason : undefined,
    })
  }

  function setNextAction(id: string, at: string | undefined, note?: string) {
    updateLead(id, {
      nextActionAt: at,
      nextActionNote: note,
    })
  }

  function parseCsv(csv: string): { leads: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>[]; errors: string[] } {
    const errors: string[] = []
    const out: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>[] = []

    const rows = splitCsvRows(csv).filter(r => r.some(c => c?.trim()))
    if (rows.length < 2) {
      errors.push(
        rows.length === 0
          ? 'CSV looks empty.'
          : 'CSV only has one row — make sure your file has a header row AND at least one data row, separated by newlines (not just commas).',
      )
      return { leads: out, errors }
    }

    const header = rows[0].map(h => h.trim().toLowerCase())
    const findCol = (...candidates: string[]): number => {
      for (const c of candidates) {
        const i = header.indexOf(c.toLowerCase())
        if (i !== -1) return i
      }
      return -1
    }

    const nameIdx = findCol('full name', 'full_name', 'name', 'contact', 'contact name')
    const phoneIdx = findCol('phone', 'phone_e164', 'phone number', 'mobile', 'tel', 'telephone')
    const emailIdx = findCol('email', 'email_address', 'e-mail')
    const companyIdx = findCol('company', 'organization', 'business')
    const notesIdx = findCol('notes', 'note', 'comments')
    const sourceIdx = findCol('source', 'list')

    if (nameIdx === -1) { errors.push('Missing required column: full_name (or name)'); return { leads: out, errors } }
    if (phoneIdx === -1) { errors.push('Missing required column: phone (or phone_e164 / mobile)'); return { leads: out, errors } }

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r]
      if (row.every(c => !c?.trim())) continue
      const name = row[nameIdx]?.trim()
      const rawPhone = row[phoneIdx]?.trim()
      if (!name || !rawPhone) {
        errors.push(`Row ${r + 1}: missing name or phone, skipping.`)
        continue
      }
      const phoneE164 = toE164(rawPhone)
      if (phoneE164.replace(/\D/g, '').length < 7) {
        errors.push(`Row ${r + 1}: phone "${rawPhone}" looks invalid, skipping.`)
        continue
      }
      out.push({
        fullName: name,
        phoneE164,
        email: emailIdx >= 0 ? row[emailIdx]?.trim() || undefined : undefined,
        company: companyIdx >= 0 ? row[companyIdx]?.trim() || undefined : undefined,
        notes: notesIdx >= 0 ? row[notesIdx]?.trim() || undefined : undefined,
        source: sourceIdx >= 0 ? row[sourceIdx]?.trim() || 'csv' : 'csv',
        status: 'new',
        stage: 'lead',
        callCount: 0,
      })
    }

    return { leads: out, errors }
  }

  async function importParsed(parsed: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<{ added: number; skippedDuplicates: number }> {
    const client = await getSupabase()
    if (!client) return { added: 0, skippedDuplicates: 0 }
    const actorId = currentActorId()

    const existingPhones = new Set(leads.value.map(l => l.phoneE164))
    let added = 0
    let skippedDuplicates = 0
    const now = nowIso()
    const rowsToInsert: any[] = []
    const optimisticLeads: Lead[] = []

    for (const p of parsed) {
      if (existingPhones.has(p.phoneE164)) {
        skippedDuplicates++
        continue
      }
      const lead: Lead = {
        ...p,
        id: uuid(),
        createdAt: now,
        updatedAt: now,
        stageChangedAt: now,
      }
      const row = leadToRow(lead, actorId)
      if (actorId) row.created_by_user_id = actorId
      rowsToInsert.push(row)
      optimisticLeads.push(lead)
      existingPhones.add(p.phoneE164)
      added++
    }

    if (rowsToInsert.length === 0) return { added, skippedDuplicates }

    // Optimistic
    leads.value = [...optimisticLeads, ...leads.value]

    const { error } = await client.from('dialer_leads').insert(rowsToInsert)
    if (error) {
      console.error('[useLeads] importParsed failed:', error)
      const ids = new Set(optimisticLeads.map(l => l.id))
      leads.value = leads.value.filter(l => !ids.has(l.id))
      lastError.value = error.message
      return { added: 0, skippedDuplicates }
    }
    return { added, skippedDuplicates }
  }

  function findByPhone(phoneE164: string): Lead | undefined {
    return leads.value.find(l => l.phoneE164 === phoneE164)
  }

  /** Seed demo leads — inserts the demo dataset into Supabase. */
  async function seedDemoLeads(): Promise<number> {
    const parsed = DEMO_SEEDS
      .filter(s => !leads.value.some(l => l.phoneE164 === s.phoneE164))
      .map(s => ({
        fullName: s.fullName,
        phoneE164: s.phoneE164,
        email: s.email,
        company: s.company,
        notes: s.notes,
        source: s.source ?? 'demo-seed',
        status: s.status,
        stage: s.stage,
        callCount: s.callCount ?? 0,
        lastCalledAt: s.lastCalledAtOffsetH != null
          ? new Date(Date.now() + s.lastCalledAtOffsetH * 3600 * 1000).toISOString()
          : undefined,
        nextCallbackAt: s.nextCallbackOffsetH != null
          ? new Date(Date.now() + s.nextCallbackOffsetH * 3600 * 1000).toISOString()
          : undefined,
        nextActionAt: s.nextActionOffsetH != null
          ? new Date(Date.now() + s.nextActionOffsetH * 3600 * 1000).toISOString()
          : undefined,
        nextActionNote: s.nextActionNote,
        dealValueCents: s.dealValueCents,
        dealCurrency: s.dealValueCents ? 'USD' : undefined,
        closeProbability: s.closeProbability,
        wonLostReason: s.wonLostReason,
      }))
    const { added } = await importParsed(parsed as any)
    return added
  }

  /** One-shot migration: upload any leads from legacy localStorage to Supabase. */
  async function migrateFromLocalStorage(): Promise<{ added: number; skipped: number }> {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
      if (!raw) return { added: 0, skipped: 0 }
      const legacy = JSON.parse(raw)
      if (!Array.isArray(legacy) || legacy.length === 0) return { added: 0, skipped: 0 }
      const parsed = legacy.map((l: any) => ({
        fullName: l.fullName,
        phoneE164: l.phoneE164,
        email: l.email,
        company: l.company,
        notes: l.notes,
        source: l.source ?? 'localstorage-migration',
        status: (l.status ?? 'new') as LeadStatus,
        stage: (l.stage ?? 'lead') as LeadStage,
        callCount: l.callCount ?? 0,
        lastCalledAt: l.lastCalledAt,
        nextCallbackAt: l.nextCallbackAt,
        nextActionAt: l.nextActionAt,
        nextActionNote: l.nextActionNote,
        dealValueCents: l.dealValueCents,
        dealCurrency: l.dealCurrency,
        closeProbability: l.closeProbability,
        wonLostReason: l.wonLostReason,
      }))
      const result = await importParsed(parsed as any)
      // Clear the legacy data so we don't re-migrate on next load
      localStorage.removeItem(LOCAL_STORAGE_KEY)
      return { added: result.added, skipped: result.skippedDuplicates }
    } catch (err) {
      console.error('[useLeads] migrateFromLocalStorage failed:', err)
      return { added: 0, skipped: 0 }
    }
  }

  return {
    leads,
    isLoading,
    isLoadingMore,
    lastError,
    totalCount,
    hasMore,
    loadMore,
    leadStats,
    fetchLeadStats,
    stageFilter,
    applyStageFilter,
    sortedLeads,
    dialableLeads,
    stats,
    addLead,
    updateLead,
    removeLead,
    clearAll,
    dispositionLead,
    setStage,
    setNextAction,
    parseCsv,
    importParsed,
    findByPhone,
    seedDemoLeads,
    migrateFromLocalStorage,
  }
}

// ── Minimal CSV parser ─────────────────────────────────────────
function splitCsvRows(csv: string): string[][] {
  if (csv.charCodeAt(0) === 0xFEFF) csv = csv.slice(1)
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  while (i < csv.length) {
    const c = csv[i]
    if (inQuotes) {
      if (c === '"') {
        if (csv[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false; i++; continue
      }
      field += c; i++; continue
    }
    if (c === '"') { inQuotes = true; i++; continue }
    if (c === ',') { cur.push(field); field = ''; i++; continue }
    if (c === '\r') {
      if (csv[i + 1] === '\n') { i++; continue }
      cur.push(field); rows.push(cur); cur = []; field = ''; i++; continue
    }
    if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; i++; continue }
    field += c; i++
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field); rows.push(cur)
  }
  return rows
}

// ── Demo dataset ─────────────────────────────────────────────
interface DemoSeed {
  fullName: string
  phoneE164: string
  email?: string
  company?: string
  notes?: string
  source?: string
  status: LeadStatus
  stage: LeadStage
  callCount?: number
  lastCalledAtOffsetH?: number
  nextCallbackOffsetH?: number
  nextActionOffsetH?: number
  nextActionNote?: string
  dealValueCents?: number
  closeProbability?: number
  wonLostReason?: string
}

const DEMO_SEEDS: DemoSeed[] = [
  { fullName: 'Marcus Chen',        phoneE164: '+12125550101', email: 'marcus.chen@gmail.com',     company: 'Brooklyn Brownstone',     notes: 'Inquiry on 3-bed walkup in Park Slope. Open weekends.', source: 'realtor.com',     status: 'new', stage: 'lead' },
  { fullName: 'Priya Sharma',       phoneE164: '+13055550102', email: 'priya@coastalmiami.com',    company: '',                        notes: 'Looking at condos in Brickell, $800k-1.2M range.',     source: 'realtor.com',     status: 'new', stage: 'lead' },
  { fullName: 'Jake Williams',      phoneE164: '+13125550103', email: 'jakew@northwestern.edu',    company: '',                        notes: 'First-time buyer, pre-approved $450k. Wicker Park.',   source: 'realtor.com',     status: 'new', stage: 'lead' },
  { fullName: 'Sofia Rodriguez',    phoneE164: '+17135550104', email: 'sofia.r@houstonre.com',     company: 'Heights Family Homes',    notes: 'Selling current home, upsizing. Has 2 kids, needs schools.', source: 'realtor.com', status: 'new', stage: 'lead' },
  { fullName: 'Henry Beaumont',     phoneE164: '+13035550105', email: 'henry@beaumontco.com',      company: 'Beaumont Properties',     notes: 'Investor — buys 2-4 single-fam per year. Denver suburbs.', source: 'referral',  status: 'new', stage: 'lead' },
  { fullName: 'Amelia Park',        phoneE164: '+16025550106', email: 'a.park@desertsun.com',      company: '',                        notes: 'Relocating from SF to Phoenix, $1.5M budget.',          source: 'realtor.com',    status: 'new', stage: 'lead' },
  { fullName: 'Dmitri Volkov',      phoneE164: '+14155550107', email: 'd.volkov@protonmail.com',   company: '',                        notes: 'Tech buyer, looking at Mission/Noe Valley, urgent.',    source: 'zillow',          status: 'new', stage: 'lead' },
  { fullName: 'Olivia Tanaka',      phoneE164: '+18085550108', email: 'olivia.t@kauairealty.com',  company: 'Kauai Sunset Realty',     notes: 'Beach property buyer, $2M+, second home.',              source: 'referral',        status: 'new', stage: 'lead' },
  { fullName: 'Raymond Foster',     phoneE164: '+12135550201', email: 'ray.foster@gmail.com',      company: '',                        notes: 'Said he\'ll think about it. Send neighborhood comps.',  source: 'realtor.com',  status: 'contacted', stage: 'contacted', callCount: 1, lastCalledAtOffsetH: -6 },
  { fullName: 'Isabella Greene',    phoneE164: '+15105550202', email: 'isabella@greenedesign.com', company: 'Greene Interiors',        notes: 'Liked the Berkeley listing, wants Sunday showing.',     source: 'realtor.com',  status: 'contacted', stage: 'contacted', callCount: 1, lastCalledAtOffsetH: -24, nextActionOffsetH: 18, nextActionNote: 'Confirm Sunday 2pm showing' },
  { fullName: 'Tomás Herrera',      phoneE164: '+17185550203', email: 'tomas.h@bx-realty.com',     company: 'BX Realty Group',         notes: 'B2B — refers buyers. Wants partnership terms.',          source: 'linkedin',     status: 'contacted', stage: 'contacted', callCount: 2, lastCalledAtOffsetH: -48 },
  { fullName: 'Chloe Bennett',      phoneE164: '+17735550204', email: 'chloe.b@uchicago.edu',      company: '',                        notes: 'Grad student + spouse, Hyde Park condos.',              source: 'realtor.com',  status: 'voicemail', stage: 'contacted', callCount: 1, lastCalledAtOffsetH: -3 },
  { fullName: 'Walter Cho',         phoneE164: '+12065550205', email: 'walter.cho@amazon.com',     company: 'Amazon (rel package)',    notes: 'Amazon L7 relocating. Big budget, fast timeline.',       source: 'corporate',    status: 'contacted', stage: 'contacted', callCount: 1, lastCalledAtOffsetH: -12, nextActionOffsetH: 24, nextActionNote: 'Send 5 Bellevue listings' },
  { fullName: 'Rachel Lindqvist',   phoneE164: '+12125550301', email: 'rachel.l@finance.com',      company: 'Lindqvist Capital',       notes: 'Pre-approved $2.4M. Wants Tribeca loft.',                source: 'referral',      status: 'contacted', stage: 'qualified', callCount: 2, lastCalledAtOffsetH: -72, dealValueCents: 240000_00, closeProbability: 40, nextActionOffsetH: 26, nextActionNote: 'Schedule discovery call' },
  { fullName: 'Brandon Mireles',    phoneE164: '+12135550302', email: 'b.mireles@latu.com',        company: '',                        notes: 'Cash buyer, $1.8M, Los Feliz.',                          source: 'realtor.com',   status: 'contacted', stage: 'qualified', callCount: 1, lastCalledAtOffsetH: -48, dealValueCents: 180000_00, closeProbability: 50 },
  { fullName: 'Yuki Nakamura',      phoneE164: '+14155550303', email: 'yuki@nakamuralaw.com',      company: 'Nakamura & Associates',   notes: 'Law partner, wants Pacific Heights single-fam.',         source: 'referral',      status: 'callback', stage: 'qualified', callCount: 2, lastCalledAtOffsetH: -120, dealValueCents: 320000_00, closeProbability: 55, nextCallbackOffsetH: 6 },
  { fullName: 'Connor Patel',       phoneE164: '+13125550304', email: 'connor.p@gmail.com',        company: '',                        notes: 'Engaged couple, combined $250k income, $700k budget.',   source: 'realtor.com',   status: 'contacted', stage: 'qualified', callCount: 3, lastCalledAtOffsetH: -96, dealValueCents: 70000_00, closeProbability: 35 },
  { fullName: 'Eliana Khoury',      phoneE164: '+13055550401', email: 'eliana@khouryconsulting.com', company: 'Khoury Consulting',    notes: 'Discovery call went well. Pain: kids changing schools.', source: 'referral',     status: 'contacted', stage: 'discovery', callCount: 3, lastCalledAtOffsetH: -36, dealValueCents: 95000_00, closeProbability: 60, nextActionOffsetH: 48, nextActionNote: 'Email school district matrix' },
  { fullName: 'Marcus Achterberg',  phoneE164: '+13035550402', email: 'marcus@achterberg.io',      company: 'Achterberg Ventures',     notes: 'VC partner, wants Cherry Creek single-fam, $3M cap.',    source: 'linkedin',      status: 'contacted', stage: 'discovery', callCount: 2, lastCalledAtOffsetH: -48, dealValueCents: 280000_00, closeProbability: 65 },
  { fullName: 'Naomi Okafor',       phoneE164: '+18085550403', email: 'naomi.o@kpa-hawaii.com',    company: 'Kapa Holdings',           notes: 'Investor, wants Kauai vacation rental property.',        source: 'referral',      status: 'voicemail', stage: 'discovery', callCount: 3, lastCalledAtOffsetH: -24, dealValueCents: 175000_00, closeProbability: 45 },
  { fullName: 'Felix Castellanos',  phoneE164: '+17135550501', email: 'felix.c@texasenergy.com',   company: 'Castellanos Oil & Gas',   notes: 'Proposal sent Mon. Buying Houston Memorial $1.4M.',      source: 'referral',      status: 'contacted', stage: 'proposal', callCount: 4, lastCalledAtOffsetH: -72, dealValueCents: 140000_00, closeProbability: 75, nextActionOffsetH: 24, nextActionNote: 'Follow up on signed offer' },
  { fullName: 'Penelope Ashford',   phoneE164: '+12125550502', email: 'penny.a@ashfordpr.com',     company: 'Ashford PR',              notes: 'UWS co-op, $1.9M. Negotiating on price.',                source: 'realtor.com',   status: 'callback', stage: 'proposal', callCount: 5, lastCalledAtOffsetH: -12, dealValueCents: 190000_00, closeProbability: 70, nextCallbackOffsetH: 2 },
  { fullName: 'Gabriel Mendez',     phoneE164: '+16025550601', email: 'g.mendez@phx-prop.com',     company: 'Mendez Properties',       notes: 'Counter-offer pending. $2.1M Paradise Valley.',          source: 'referral',      status: 'contacted', stage: 'negotiation', callCount: 6, lastCalledAtOffsetH: -8, dealValueCents: 210000_00, closeProbability: 80, nextActionOffsetH: 4, nextActionNote: 'Counter on inspection contingency' },
  { fullName: 'Astrid Lindgren',    phoneE164: '+15105550602', email: 'astrid@lindgrenco.com',     company: 'Lindgren Design',         notes: 'Berkeley craftsman, $1.6M. Final inspection items.',     source: 'realtor.com',   status: 'contacted', stage: 'negotiation', callCount: 5, lastCalledAtOffsetH: -36, dealValueCents: 160000_00, closeProbability: 85 },
  { fullName: 'Jordan Mitchell',    phoneE164: '+12135550701', email: 'jordan.m@gmail.com',        company: '',                        notes: 'Closed last week. Silver Lake bungalow $1.1M.',          source: 'realtor.com',   status: 'contacted', stage: 'closed-won', callCount: 7, lastCalledAtOffsetH: -168, dealValueCents: 110000_00, closeProbability: 100 },
  { fullName: 'Margot Wallenberg',  phoneE164: '+13125550702', email: 'margot.w@nordtech.com',     company: 'Nord Tech Group',         notes: 'Lincoln Park penthouse $2.8M. Closed Friday.',           source: 'referral',      status: 'contacted', stage: 'closed-won', callCount: 9, lastCalledAtOffsetH: -240, dealValueCents: 280000_00, closeProbability: 100 },
  { fullName: 'Devon Ashworth',     phoneE164: '+17185550801', email: 'devon.a@bk-tech.com',       company: '',                        notes: 'Went with competing offer. Same neighborhood.',          source: 'realtor.com',   status: 'not-interested', stage: 'closed-lost', callCount: 4, lastCalledAtOffsetH: -120, wonLostReason: 'Lost to competing agent (Compass)' },
  { fullName: 'Vincent Drago',      phoneE164: '+12125550901', email: '',                          company: '',                        notes: 'Asked not to be contacted again.',                       source: 'realtor.com',   status: 'dnc', stage: 'lead', callCount: 2, lastCalledAtOffsetH: -48 },
  { fullName: 'Margaret O\'Sullivan', phoneE164: '+13125550902', email: '',                        company: '',                        notes: 'Filed FTC complaint last month. Permanent DNC.',         source: 'realtor.com',   status: 'dnc', stage: 'lead', callCount: 1, lastCalledAtOffsetH: -720 },
]
