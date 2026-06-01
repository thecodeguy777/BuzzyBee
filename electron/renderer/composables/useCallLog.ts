import { ref, computed, watch } from 'vue'
import { getSupabase, supabaseSession } from '../lib/supabase-client'
import type { DispositionOutcome } from './useLeads'

// Per-call history backed by buzzybee.dialer_calls with realtime subscription.
// Mirrors the shape of useLeads — singleton state, optimistic mutations,
// realtime listener keeps every client in sync.

export type CallEndStatus =
  | 'completed'   // answered + hung up normally
  | 'no-answer'   // never picked up
  | 'busy'        // recipient busy
  | 'failed'      // network/carrier error
  | 'canceled'    // hung up before answer

/** Schema status (lifecycle) — superset of CallEndStatus. */
type CallLifecycleStatus = 'initiated' | 'ringing' | 'answered' | CallEndStatus

export interface CallLogEntry {
  id: string
  leadId: string | null
  leadName: string | null       // denormalized client-side from useLeads
  agentUserId: string | null
  toE164: string
  fromE164: string | null
  direction: 'outbound' | 'inbound'
  startedAt: string
  answeredAt: string | null
  endedAt: string | null
  durationSec: number | null
  status: CallLifecycleStatus | null
  disposition: DispositionOutcome | null
  dispositionNotes: string | null
  callbackAt: string | null
  recordingUrl: string | null
  createdAt: string
}

const PLACEHOLDER_FROM_NUMBER = '+0000000000'   // until carrier (SignalWire) provides a real DID

// ── Singleton state ─────────────────────────────────────────────
const calls = ref<CallLogEntry[]>([])
const isLoading = ref(false)

function uuid(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function nowIso(): string {
  return new Date().toISOString()
}

function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function startOfWeek(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d.getTime()
}

function rowToEntry(r: any): CallLogEntry {
  return {
    id: r.id,
    leadId: r.lead_id ?? null,
    leadName: null,                  // populated on read by joining with useLeads ref
    agentUserId: r.agent_user_id ?? null,
    toE164: r.to_e164,
    fromE164: r.from_e164 ?? null,
    direction: r.direction,
    startedAt: r.started_at,
    answeredAt: r.answered_at ?? null,
    endedAt: r.ended_at ?? null,
    durationSec: r.duration_sec ?? null,
    status: r.status ?? null,
    disposition: r.disposition ?? null,
    dispositionNotes: r.disposition_notes ?? null,
    callbackAt: r.callback_at ?? null,
    recordingUrl: r.recording_url ?? null,
    createdAt: r.created_at,
  }
}

let initialized = false
async function initCalls() {
  if (initialized) return
  initialized = true

  const client = await getSupabase()
  if (!client) {
    console.warn('[useCallLog] No Supabase client — call log disabled until sign-in.')
    return
  }

  isLoading.value = true
  try {
    const { data, error } = await client
      .from('dialer_calls')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(2000)
    if (error) {
      console.error('[useCallLog] Initial fetch failed:', error)
    } else {
      calls.value = (data ?? []).map(rowToEntry)
    }
  } finally {
    isLoading.value = false
  }

  client
    .channel('dialer_calls_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'buzzybee', table: 'dialer_calls' },
      (payload: any) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const entry = rowToEntry(payload.new)
          const idx = calls.value.findIndex(c => c.id === entry.id)
          if (idx === -1) calls.value = [entry, ...calls.value]
          else calls.value = calls.value.map(c => c.id === entry.id ? entry : c)
        } else if (payload.eventType === 'DELETE') {
          calls.value = calls.value.filter(c => c.id !== payload.old?.id)
        }
      },
    )
    .subscribe()
}

watch(supabaseSession, (s) => {
  if (s && !initialized) initCalls()
}, { immediate: true })

export function useCallLog() {
  function currentActorId(): string | null {
    return supabaseSession.value?.userId ?? null
  }

  const recent = computed(() =>
    [...calls.value].sort((a, b) =>
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    ),
  )

  function inRange(c: CallLogEntry, sinceMs: number): boolean {
    return new Date(c.startedAt).getTime() >= sinceMs
  }

  const todayStats = computed(() => {
    const since = startOfToday()
    const today = calls.value.filter(c => inRange(c, since))
    const contacted = today.filter(c => c.disposition === 'contacted').length
    const voicemails = today.filter(c => c.disposition === 'voicemail').length
    const noAnswer = today.filter(c => c.disposition === 'no-answer').length
    const dnc = today.filter(c => c.disposition === 'dnc').length
    const totalDuration = today.reduce((sum, c) => sum + (c.durationSec ?? 0), 0)
    return {
      total: today.length,
      contacted,
      voicemails,
      noAnswer,
      dnc,
      totalDurationSec: totalDuration,
      avgDurationSec: today.length > 0 ? Math.round(totalDuration / today.length) : 0,
    }
  })

  const weekStats = computed(() => {
    const since = startOfWeek()
    const w = calls.value.filter(c => inRange(c, since))
    return {
      total: w.length,
      contacted: w.filter(c => c.disposition === 'contacted').length,
      voicemails: w.filter(c => c.disposition === 'voicemail').length,
    }
  })

  const callbacksDue = computed(() => {
    const now = Date.now()
    return calls.value
      .filter(c => c.callbackAt && new Date(c.callbackAt).getTime() >= now)
      .sort((a, b) => new Date(a.callbackAt!).getTime() - new Date(b.callbackAt!).getTime())
  })

  async function startCall(input: {
    leadId: string | null
    leadName: string | null
    toE164: string
    fromE164?: string | null
    direction?: 'outbound' | 'inbound'
  }): Promise<string> {
    const client = await getSupabase()
    const actorId = currentActorId()
    const id = uuid()

    // Schema requires agent_user_id NOT NULL. If we're not signed in, fall
    // back to a local-only entry that won't be persisted (used in dev / mock).
    if (!client || !actorId) {
      const entry: CallLogEntry = {
        id,
        leadId: input.leadId,
        leadName: input.leadName,
        agentUserId: null,
        toE164: input.toE164,
        fromE164: input.fromE164 ?? PLACEHOLDER_FROM_NUMBER,
        direction: input.direction ?? 'outbound',
        startedAt: nowIso(),
        answeredAt: null, endedAt: null, durationSec: null,
        status: 'initiated', disposition: null, dispositionNotes: null,
        callbackAt: null, recordingUrl: null, createdAt: nowIso(),
      }
      calls.value = [entry, ...calls.value]
      return id
    }

    const startedAt = nowIso()
    const entry: CallLogEntry = {
      id,
      leadId: input.leadId,
      leadName: input.leadName,
      agentUserId: actorId,
      toE164: input.toE164,
      fromE164: input.fromE164 ?? PLACEHOLDER_FROM_NUMBER,
      direction: input.direction ?? 'outbound',
      startedAt,
      answeredAt: null, endedAt: null, durationSec: null,
      status: 'initiated', disposition: null, dispositionNotes: null,
      callbackAt: null, recordingUrl: null, createdAt: startedAt,
    }
    // Optimistic
    calls.value = [entry, ...calls.value]

    const { error } = await client.from('dialer_calls').insert({
      id,
      agent_user_id: actorId,
      lead_id: input.leadId,
      direction: input.direction ?? 'outbound',
      from_e164: entry.fromE164,
      to_e164: input.toE164,
      status: 'initiated',
      started_at: startedAt,
      updated_by_user_id: actorId,
    })
    if (error) {
      console.error('[useCallLog] startCall insert failed:', error)
      calls.value = calls.value.filter(c => c.id !== id)
    }
    return id
  }

  async function markAnswered(callId: string) {
    const client = await getSupabase()
    if (!client) return
    const actorId = currentActorId()
    const answeredAt = nowIso()
    calls.value = calls.value.map(c =>
      c.id === callId ? { ...c, answeredAt, status: 'answered' } : c,
    )
    const { error } = await client.from('dialer_calls').update({
      answered_at: answeredAt,
      status: 'answered',
      updated_by_user_id: actorId,
    }).eq('id', callId)
    if (error) console.error('[useCallLog] markAnswered failed:', error)
  }

  async function endCall(callId: string, status: CallEndStatus, durationSec?: number) {
    const client = await getSupabase()
    if (!client) return
    const actorId = currentActorId()
    const entry = calls.value.find(c => c.id === callId)
    const endedAt = nowIso()
    const computedDuration = durationSec ?? (
      entry?.answeredAt
        ? Math.max(0, Math.round((Date.now() - new Date(entry.answeredAt).getTime()) / 1000))
        : 0
    )
    calls.value = calls.value.map(c =>
      c.id === callId ? { ...c, endedAt, status, durationSec: computedDuration } : c,
    )
    const { error } = await client.from('dialer_calls').update({
      ended_at: endedAt,
      status,
      duration_sec: computedDuration,
      updated_by_user_id: actorId,
    }).eq('id', callId)
    if (error) console.error('[useCallLog] endCall failed:', error)
  }

  async function applyDisposition(callId: string, outcome: DispositionOutcome, opts?: { notes?: string; callbackAt?: string }) {
    const client = await getSupabase()
    if (!client) return
    const actorId = currentActorId()
    calls.value = calls.value.map(c =>
      c.id === callId
        ? { ...c, disposition: outcome, dispositionNotes: opts?.notes ?? null, callbackAt: opts?.callbackAt ?? null }
        : c,
    )
    const { error } = await client.from('dialer_calls').update({
      disposition: outcome,
      disposition_notes: opts?.notes ?? null,
      callback_at: opts?.callbackAt ?? null,
      updated_by_user_id: actorId,
    }).eq('id', callId)
    if (error) console.error('[useCallLog] applyDisposition failed:', error)
  }

  async function deleteCall(callId: string) {
    const client = await getSupabase()
    if (!client) return
    const before = calls.value
    calls.value = calls.value.filter(c => c.id !== callId)
    const { error } = await client.from('dialer_calls').delete().eq('id', callId)
    if (error) {
      console.error('[useCallLog] deleteCall failed:', error)
      calls.value = before
    }
  }

  async function clearAll() {
    const client = await getSupabase()
    if (!client) return
    const before = calls.value
    const ids = before.map(c => c.id)
    calls.value = []
    if (ids.length === 0) return
    const { error } = await client.from('dialer_calls').delete().in('id', ids)
    if (error) {
      console.error('[useCallLog] clearAll failed:', error)
      calls.value = before
    }
  }

  function callsForLead(leadId: string): CallLogEntry[] {
    return calls.value
      .filter(c => c.leadId === leadId)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
  }

  return {
    calls,
    recent,
    isLoading,
    todayStats,
    weekStats,
    callbacksDue,
    startCall,
    markAnswered,
    endCall,
    applyDisposition,
    deleteCall,
    clearAll,
    callsForLead,
  }
}
