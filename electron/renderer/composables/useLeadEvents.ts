import { ref, computed, watch } from 'vue'
import { getSupabase, supabaseSession } from '../lib/supabase-client'

// Per-lead event timeline backed by buzzybee.dialer_lead_events.
//
// 95% of events are written by DB triggers (Phase 1 migration) when leads
// or calls mutate. This composable also provides `emit()` for the 5% of
// events the DB can't infer — manual notes, AI summaries, task hooks
// (Phase 4), etc.
//
// Subscribes to Postgres Changes on the events table — every new event
// streams into all clients in ~300ms.

export type LeadEventType =
  | 'imported'
  | 'assigned'
  | 'reassigned'
  | 'call_started'
  | 'call_completed'
  | 'disposition_set'
  | 'stage_changed'
  | 'deal_value_changed'
  | 'note_added'
  | 'note_edited'
  | 'task_created'
  | 'task_completed'
  | 'task_overdue'
  | 'callback_scheduled'
  | 'callback_cleared'
  | 'recording_ready'
  | 'recording_transcribed'
  | 'sla_breached'
  | 'ai_summary_generated'
  | 'manual_note'

export interface LeadEvent {
  id: string
  leadId: string
  callId: string | null
  taskId: string | null
  actorUserId: string | null
  eventType: LeadEventType
  payload: Record<string, any>
  createdAt: string
}

// Cap how many events we keep locally — older ones come from on-demand
// queries when a specific lead's full timeline is requested.
const RECENT_CAP = 1000

// ── Singleton state ─────────────────────────────────────────────
const events = ref<LeadEvent[]>([])
const isLoading = ref(false)

function rowToEvent(r: any): LeadEvent {
  return {
    id: r.id,
    leadId: r.lead_id,
    callId: r.call_id ?? null,
    taskId: r.task_id ?? null,
    actorUserId: r.actor_user_id ?? null,
    eventType: r.event_type,
    payload: r.payload ?? {},
    createdAt: r.created_at,
  }
}

let initialized = false
async function initEvents() {
  if (initialized) return
  initialized = true

  const client = await getSupabase()
  if (!client) {
    console.warn('[useLeadEvents] No Supabase client — timeline disabled.')
    return
  }

  isLoading.value = true
  try {
    // Pull the most recent N events across all visible leads to seed the
    // global activity feed. Per-lead full timelines fetch on demand.
    const { data, error } = await client
      .from('dialer_lead_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(RECENT_CAP)
    if (error) {
      console.error('[useLeadEvents] Initial fetch failed:', error)
    } else {
      events.value = (data ?? []).map(rowToEvent)
    }
  } finally {
    isLoading.value = false
  }

  client
    .channel('dialer_lead_events_changes')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'buzzybee', table: 'dialer_lead_events' },
      (payload: any) => {
        const ev = rowToEvent(payload.new)
        // Prepend + cap
        events.value = [ev, ...events.value].slice(0, RECENT_CAP)
      },
    )
    .subscribe()
}

watch(supabaseSession, (s) => {
  if (s && !initialized) initEvents()
}, { immediate: true })

export function useLeadEvents() {
  const recent = computed(() => events.value)

  function eventsForLead(leadId: string): LeadEvent[] {
    return events.value.filter(e => e.leadId === leadId)
  }

  /** Fetch the full timeline for a single lead — used when opening a lead's
   *  detail card. The seeded `recent` list might not include very old events. */
  async function fetchLeadTimeline(leadId: string, limit = 200): Promise<LeadEvent[]> {
    const client = await getSupabase()
    if (!client) return []
    const { data, error } = await client
      .from('dialer_lead_events')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) {
      console.error('[useLeadEvents] fetchLeadTimeline failed:', error)
      return []
    }
    return (data ?? []).map(rowToEvent)
  }

  /** Emit an ad-hoc event the DB triggers can't infer (e.g., manual_note,
   *  ai_summary_generated). Returns the inserted event's ID. */
  async function emit(
    leadId: string,
    eventType: LeadEventType,
    payload: Record<string, any> = {},
    opts?: { callId?: string; taskId?: string },
  ): Promise<string | null> {
    const client = await getSupabase()
    if (!client) return null
    const actorId = supabaseSession.value?.userId ?? null

    const insertPayload: Record<string, any> = {
      lead_id: leadId,
      actor_user_id: actorId,
      event_type: eventType,
      payload,
    }
    if (opts?.callId) insertPayload.call_id = opts.callId
    if (opts?.taskId) insertPayload.task_id = opts.taskId

    const { data, error } = await client
      .from('dialer_lead_events')
      .insert(insertPayload)
      .select('id')
      .single()
    if (error) {
      console.error('[useLeadEvents] emit failed:', error)
      return null
    }
    return (data as any)?.id ?? null
  }

  return {
    events,
    recent,
    isLoading,
    eventsForLead,
    fetchLeadTimeline,
    emit,
  }
}
