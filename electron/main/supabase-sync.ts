import type { SupabaseClient } from '@supabase/supabase-js'
import type { TranscriptChunk, CoachingPromptData } from '../shared/ipc-channels'
import { getMainSupabaseClient } from './supabase-bridge'

// Use the SINGLE main-process client owned by supabase-bridge.ts.
// (Previously this file had its own client, which meant signIn/signOut
//  didn't fire onAuthStateChange on the bridge's separate client and
//  the renderer kept showing the previous user's identity.)
function getClient(): SupabaseClient {
  return getMainSupabaseClient()
}

// ── Auth ──

export async function signIn(email: string, password: string): Promise<{ success: boolean; error?: string; session?: { userId: string; email: string | null; fullName: string | null; role: string | null } }> {
  try {
    const client = getClient()
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    if (error) return { success: false, error: error.message }
    if (!data.session) return { success: false, error: 'No session returned' }

    // Try to fetch the profile for full name + role (role gates the UI)
    let fullName: string | null = null
    let role: string | null = null
    try {
      const { data: profile } = await client
        .from('profiles')
        .select('full_name, role')
        .eq('id', data.session.user.id)
        .maybeSingle()
      fullName = (profile as any)?.full_name ?? null
      role = (profile as any)?.role ?? null
    } catch {
      // ignore profile lookup failures
    }

    return {
      success: true,
      session: {
        userId: data.session.user.id,
        email: data.session.user.email ?? null,
        fullName,
        role,
      },
    }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function signOut(): Promise<void> {
  const client = getClient()
  await client.auth.signOut()
}

export async function getCurrentSession(): Promise<{ userId: string; email: string | null; fullName: string | null; role: string | null } | null> {
  try {
    const client = getClient()
    const { data } = await client.auth.getSession()
    if (!data.session) return null

    let fullName: string | null = null
    let role: string | null = null
    try {
      const { data: profile } = await client
        .from('profiles')
        .select('full_name, role')
        .eq('id', data.session.user.id)
        .maybeSingle()
      fullName = (profile as any)?.full_name ?? null
      role = (profile as any)?.role ?? null
    } catch {
      // ignore
    }

    return {
      userId: data.session.user.id,
      email: data.session.user.email ?? null,
      fullName,
      role,
    }
  } catch (err) {
    console.error('[Supabase] getCurrentSession error:', err)
    return null
  }
}

// ── Clients ──

export interface ClientRow {
  id: string
  name: string
  status: string | null
}

export async function fetchClients(): Promise<ClientRow[]> {
  try {
    const client = getClient()
    const { data, error } = await client
      .from('clients')
      .select('id, name, status')
      .order('name', { ascending: true })

    if (error) {
      console.error('[Supabase] fetchClients error:', error)
      return []
    }
    return (data ?? []) as ClientRow[]
  } catch (err) {
    console.error('[Supabase] fetchClients failed:', err)
    return []
  }
}

// ── Meeting sync ──

export interface MeetingPayload {
  startedAt: string
  endedAt: string
  durationSeconds: number
  captureMode: 'mic' | 'system' | 'both'
  clientId: string | null
  transcript: TranscriptChunk[]
  summaryText: string | null
  parsedSummary: {
    summary?: string
    keyDecisions?: string[]
    actionItems?: { task: string; assignee?: string; deadline?: string }[]
    followUps?: string[]
  } | null
  coachingPrompts: CoachingPromptData[]
}

export async function pushMeeting(payload: MeetingPayload): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const client = getClient()
    const { data: session } = await client.auth.getSession()

    const finals = payload.transcript.filter(t => t.isFinal)
    const rawText = finals.map(t => `${t.speaker}: ${t.text}`).join('\n')

    const insert = {
      user_id: session.session?.user.id ?? null,
      client_id: payload.clientId,
      title: `Meeting ${new Date(payload.startedAt).toLocaleString()}`,
      capture_mode: payload.captureMode,
      started_at: payload.startedAt,
      ended_at: payload.endedAt,
      duration_seconds: payload.durationSeconds,
      transcript: finals,
      raw_text: rawText,
      summary_text: payload.summaryText,
      key_decisions: payload.parsedSummary?.keyDecisions ?? [],
      action_items: payload.parsedSummary?.actionItems ?? [],
      follow_ups: payload.parsedSummary?.followUps ?? [],
      coaching_prompts: payload.coachingPrompts,
      model_used: 'gemini-2.5-flash-lite',
    }

    const { data, error } = await client
      .from('meetings')
      .insert(insert)
      .select('id')
      .single()

    if (error) {
      console.error('[Supabase] Insert error:', error)
      return { success: false, error: error.message }
    }

    console.log('[Supabase] Meeting saved:', data.id)
    return { success: true, id: data.id }
  } catch (err) {
    console.error('[Supabase] Sync error:', err)
    return { success: false, error: String(err) }
  }
}

export async function fetchMeetings(): Promise<Array<{
  id: string
  title: string | null
  startedAt: string
  endedAt: string | null
  durationSeconds: number | null
  summaryText: string | null
}>> {
  try {
    const client = getClient()
    const { data, error } = await client
      .from('meetings')
      .select('id, title, started_at, ended_at, duration_seconds, summary_text, client_id')
      .order('started_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('[Supabase] Fetch meetings error:', error)
      return []
    }

    // Build a lookup of client_id → client name for display
    const clientIds = Array.from(new Set((data ?? []).map((r: any) => r.client_id).filter(Boolean)))
    let clientMap: Record<string, string> = {}
    if (clientIds.length > 0) {
      const { data: clientsData } = await client
        .from('clients')
        .select('id, name')
        .in('id', clientIds)
      ;(clientsData ?? []).forEach((c: any) => { clientMap[c.id] = c.name })
    }

    return (data ?? []).map((row: any) => ({
      id: row.id,
      title: row.title,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      durationSeconds: row.duration_seconds,
      summaryText: row.summary_text,
      clientId: row.client_id,
      clientName: row.client_id ? (clientMap[row.client_id] ?? null) : null,
    }))
  } catch (err) {
    console.error('[Supabase] Fetch error:', err)
    return []
  }
}

export async function updateMeetingSummary(
  id: string,
  summaryText: string,
  parsed: any
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = getClient()
    const { error } = await client
      .from('meetings')
      .update({
        summary_text: summaryText,
        key_decisions: parsed?.keyDecisions ?? [],
        action_items: parsed?.actionItems ?? [],
        follow_ups: parsed?.followUps ?? [],
      })
      .eq('id', id)

    if (error) {
      console.error('[Supabase] updateMeetingSummary error:', error)
      return { success: false, error: error.message }
    }
    return { success: true }
  } catch (err) {
    console.error('[Supabase] updateMeetingSummary failed:', err)
    return { success: false, error: String(err) }
  }
}

export async function fetchMeetingDetail(id: string): Promise<any | null> {
  try {
    const client = getClient()
    const { data, error } = await client
      .from('meetings')
      .select('*')
      .eq('id', id)
      .single()
    if (error) {
      console.error('[Supabase] Fetch detail error:', error)
      return null
    }
    return data
  } catch (err) {
    console.error('[Supabase] Detail fetch error:', err)
    return null
  }
}
