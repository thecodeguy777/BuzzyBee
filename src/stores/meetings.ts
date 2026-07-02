import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { randomToken } from '@/lib/meetingRoom'

// Scheduled meetings (GMeet/Zoom-style): rows in meeting_rooms with a
// scheduled_at, listed on /app/meetings. RLS scopes reads to the host, so
// "my meetings" is just a plain select. Instant rooms (scheduled_at null,
// created from CRM/Comms) don't appear here.

export interface MeetingInvite {
  id: string
  email: string
  name: string | null
  sentAt: string | null
}

export interface Meeting {
  id: string
  token: string
  title: string
  /** null = instant room (started from CRM/Comms) — shows in history only. */
  scheduledAt: string | null
  durationMinutes: number
  /** Optional client link — invite emails render times in that client's timezone. */
  clientId: string | null
  createdAt: string
  expiresAt: string
  endedAt: string | null
  invites: MeetingInvite[]
}

/** A durable meeting_messages row — chat + join/leave system lines. */
export interface MeetingMessage {
  id: string
  userId: string | null
  name: string | null
  kind: 'text' | 'file' | 'system'
  body: string | null
  file: { filename?: string } | null
  createdAt: string
}

const COLS = 'id,token,title,scheduled_at,duration_minutes,client_id,created_at,expires_at,ended_at, invites:meeting_invites(id,email,name,sent_at)'

function mapMeeting(r: any): Meeting {
  return {
    id: r.id,
    token: r.token,
    title: r.title ?? 'Meeting',
    scheduledAt: r.scheduled_at,
    durationMinutes: r.duration_minutes ?? 60,
    clientId: r.client_id ?? null,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    endedAt: r.ended_at ?? null,
    invites: ((r.invites ?? []) as any[]).map((i) => ({
      id: i.id, email: i.email, name: i.name ?? null, sentAt: i.sent_at ?? null
    }))
  }
}

export const useMeetingsStore = defineStore('meetings', () => {
  const auth = useAuthStore()
  const meetings = ref<Meeting[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref<string | null>(null)

  // Scheduled + still-live rooms, soonest first.
  const upcoming = computed(() => {
    const now = Date.now()
    return meetings.value
      .filter((m) => m.scheduledAt && !m.endedAt && new Date(m.expiresAt).getTime() > now)
      .sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''))
  })
  // History: everything ended/expired — including instant rooms, whose
  // transcript/participants are just as reviewable as scheduled ones.
  const past = computed(() => {
    const now = Date.now()
    const sortKey = (m: Meeting) => m.scheduledAt ?? m.createdAt
    return meetings.value
      .filter((m) => m.endedAt || new Date(m.expiresAt).getTime() <= now)
      .sort((a, b) => sortKey(b).localeCompare(sortKey(a)))
  })

  async function load() {
    if (!auth.user) return
    loading.value = true
    error.value = null
    try {
      // Explicit host filter: admins can read every room (oversight policy),
      // but the Meetings page is "MY meetings".
      const { data, error: err } = await supabase
        .from('meeting_rooms')
        .select(COLS)
        .eq('host_id', auth.user.id)
        .order('created_at', { ascending: false })
        .limit(100)
      if (err) throw err
      meetings.value = ((data ?? []) as any[]).map(mapMeeting)
      loaded.value = true
    } catch (e) {
      error.value = "Couldn't load meetings — " + (e as Error).message
    } finally {
      loading.value = false
    }
  }

  /** Durable message stream for one room (host-readable after it ends). */
  async function fetchTranscript(roomId: string): Promise<MeetingMessage[]> {
    const { data, error: err } = await supabase
      .from('meeting_messages')
      .select('id,user_id,name,kind,body,file,created_at')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .limit(500)
    if (err) throw err
    return ((data ?? []) as any[]).map((r) => ({
      id: r.id,
      userId: r.user_id ?? null,
      name: r.name ?? null,
      kind: r.kind,
      body: r.body ?? null,
      file: r.file ?? null,
      createdAt: r.created_at
    }))
  }

  /** Create the room now; the /meet link is valid immediately and expires 24h
   *  after the scheduled start (early joiners just wait in the room). */
  async function schedule(input: {
    title: string
    scheduledAt: Date
    durationMinutes: number
    clientId?: string | null
  }) {
    if (!auth.user) throw new Error('Not authenticated')
    const token = randomToken()
    const expiresAt = new Date(input.scheduledAt.getTime() + 24 * 3600_000)
    const { data, error: err } = await supabase
      .from('meeting_rooms')
      .insert({
        token,
        host_id: auth.user.id,
        title: input.title.trim() || null,
        scheduled_at: input.scheduledAt.toISOString(),
        duration_minutes: input.durationMinutes,
        client_id: input.clientId ?? null,
        expires_at: expiresAt.toISOString()
      })
      .select(COLS)
      .single()
    if (err) throw err
    const row = mapMeeting(data)
    meetings.value = [row, ...meetings.value]
    return row
  }

  /** Cancel = end the room; the link stops resolving for everyone. */
  async function cancel(id: string) {
    const { error: err } = await supabase
      .from('meeting_rooms')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', id)
    if (err) throw err
    const m = meetings.value.find((x) => x.id === id)
    if (m) m.endedAt = new Date().toISOString()
  }

  /** Email the join link (+ .ics) via the send-meeting-invite edge function. */
  async function sendInvites(
    roomId: string,
    recipients: { email: string; name?: string | null }[],
    whenText: string,
    note?: string
  ) {
    const { data, error: err } = await supabase.functions.invoke('send-meeting-invite', {
      body: { roomId, recipients, whenText, note: note || null }
    })
    if (err) {
      // supabase-js buries the function's JSON error body — surface it.
      const ctx = (err as { context?: Response }).context
      let msg = err.message
      if (ctx) {
        try { msg = (await ctx.json())?.error ?? msg } catch { /* keep msg */ }
      }
      throw new Error(msg)
    }
    if (data?.error) throw new Error(data.error)
    // Refresh invite chips on the affected meeting.
    await load()
    return data as { sent: number; failed: number }
  }

  return { meetings, upcoming, past, loading, loaded, error, load, fetchTranscript, schedule, cancel, sendInvites }
})
