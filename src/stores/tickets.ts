import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

export type TicketType = 'bug' | 'feature_request' | 'question' | 'feedback'
export type TicketSeverity = 'low' | 'medium' | 'high' | 'critical'
export type TicketStatus =
  | 'open'
  | 'in_review'
  | 'in_progress'
  | 'resolved'
  | 'wont_fix'
  | 'duplicate'

export interface TicketAttachment {
  id: string
  path: string
  name: string
  size: number
  mime_type: string
  uploaded_at: string
  uploaded_by: string | null
}

export interface Ticket {
  id: string
  reference_number: string
  reporter_id: string | null
  reporter_name: string | null
  type: TicketType
  severity: TicketSeverity
  status: TicketStatus
  title: string
  description: string | null
  page_url: string | null
  user_agent: string | null
  viewport: string | null
  context: Record<string, unknown>
  attachments: TicketAttachment[]
  assigned_to: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export interface TicketComment {
  id: string
  ticket_id: string
  user_id: string
  user_name: string | null
  message: string
  is_internal: boolean
  attachments: TicketAttachment[]
  created_at: string
  updated_at: string
}

// RLS + the column-guard trigger turn unauthorized writes into permission
// errors — surface those as humans, not Postgres codes.
function permMsg(err: { code?: string; message: string }) {
  if (err.code === '42501' || /row-level security|permission denied/i.test(err.message)) {
    return "you don't have permission to do that"
  }
  return err.message
}

export const useTicketsStore = defineStore('tickets', () => {
  const auth = useAuthStore()

  const tickets = ref<Ticket[]>([])
  const commentsByTicket = ref<Record<string, TicketComment[]>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)
  const selectedTicketId = ref<string | null>(null)

  let channel: RealtimeChannel | null = null

  const isAdmin = computed(() => auth.isAdmin)
  // Triage (status/severity/assignee/internal notes) = pm + admin + superadmin,
  // matching the tickets_triage_all RLS policy.
  const canTriage = computed(() => auth.isAdmin || auth.role === 'pm')

  const myTickets = computed(() =>
    tickets.value.filter((t) => t.reporter_id === auth.user?.id)
  )

  const visibleTickets = computed(() =>
    canTriage.value ? tickets.value : myTickets.value
  )

  const openCount = computed(
    () => visibleTickets.value.filter((t) => t.status === 'open' || t.status === 'in_review' || t.status === 'in_progress').length
  )

  const selectedTicket = computed(
    () => tickets.value.find((t) => t.id === selectedTicketId.value) ?? null
  )

  async function fetchAll() {
    if (!auth.isAuthenticated) return
    loading.value = true
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      tickets.value = (data ?? []) as Ticket[]
    } catch (e) {
      console.warn('[tickets] fetchAll:', (e as Error).message)
    } finally {
      loading.value = false
    }
  }

  async function fetchComments(ticketId: string) {
    const { data, error } = await supabase
      .from('ticket_comments')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true })
    if (error) {
      console.warn('[tickets] fetchComments:', error.message)
      return
    }
    commentsByTicket.value = {
      ...commentsByTicket.value,
      [ticketId]: (data ?? []) as TicketComment[]
    }
  }

  async function createTicket(input: {
    title: string
    description?: string
    type?: TicketType
    severity?: TicketSeverity
    page_url?: string | null
    user_agent?: string | null
    viewport?: string | null
    context?: Record<string, unknown>
  }) {
    if (!auth.user) throw new Error('Not authenticated')
    const payload = {
      reporter_id: auth.user.id,
      reporter_name: auth.fullName || auth.user.email || null,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      type: input.type ?? 'bug',
      severity: input.severity ?? 'medium',
      page_url: input.page_url ?? null,
      user_agent: input.user_agent ?? null,
      viewport: input.viewport ?? null,
      context: input.context ?? {}
    }
    const { data, error } = await supabase
      .from('tickets')
      .insert(payload)
      .select('*')
      .single()
    if (error) throw error
    const row = data as Ticket
    if (!tickets.value.some((t) => t.id === row.id)) tickets.value.unshift(row)
    return row
  }

  async function updateTicket(id: string, patch: Partial<Ticket>) {
    // Optimistic with rollback — selects in the detail pane feel instant.
    const idx = tickets.value.findIndex((t) => t.id === id)
    const prev = idx !== -1 ? { ...tickets.value[idx] } : null
    if (idx !== -1) tickets.value[idx] = { ...tickets.value[idx], ...patch }
    const { data, error: err } = await supabase
      .from('tickets')
      .update(patch as Record<string, unknown>)
      .eq('id', id)
      .select('*')
      .single()
    if (err) {
      if (idx !== -1 && prev) tickets.value[idx] = prev
      error.value = "Couldn't update the ticket — " + permMsg(err)
      return null
    }
    const row = data as Ticket
    const i = tickets.value.findIndex((t) => t.id === row.id)
    if (i !== -1) tickets.value[i] = row
    return row
  }

  async function setStatus(id: string, status: TicketStatus) {
    return updateTicket(id, { status })
  }

  async function addComment(ticketId: string, message: string, isInternal = false) {
    if (!auth.user) throw new Error('Not authenticated')
    const { data, error: err } = await supabase
      .from('ticket_comments')
      .insert({
        ticket_id: ticketId,
        user_id: auth.user.id,
        user_name: auth.fullName || auth.user.email || null,
        message: message.trim(),
        is_internal: isInternal
      })
      .select('*')
      .single()
    if (err) {
      error.value = "Couldn't post the comment — " + permMsg(err)
      return null
    }
    const row = data as TicketComment
    const list = commentsByTicket.value[ticketId] ? [...commentsByTicket.value[ticketId]] : []
    if (!list.some((c) => c.id === row.id)) list.push(row)
    commentsByTicket.value = { ...commentsByTicket.value, [ticketId]: list }
    return row
  }

  // ── Attachments (ticket-attachments bucket, path {ticket_id}/…) ────────────
  async function addAttachment(ticketId: string, file: File): Promise<boolean> {
    if (!auth.user) throw new Error('Not authenticated')
    if (file.size > 25 * 1024 * 1024) {
      error.value = 'Attachments are capped at 25 MB.'
      return false
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_')
    const path = `${ticketId}/${crypto.randomUUID().slice(0, 8)}-${safeName}`
    const { error: upErr } = await supabase.storage
      .from('ticket-attachments')
      .upload(path, file, { contentType: file.type || 'application/octet-stream' })
    if (upErr) {
      error.value = "Couldn't upload the file — " + upErr.message
      return false
    }
    const t = tickets.value.find((x) => x.id === ticketId)
    const meta: TicketAttachment = {
      id: crypto.randomUUID(),
      path,
      name: file.name,
      size: file.size,
      mime_type: file.type || 'application/octet-stream',
      uploaded_at: new Date().toISOString(),
      uploaded_by: auth.user.id,
    }
    const next = [...(t?.attachments ?? []), meta]
    const updated = await updateTicket(ticketId, { attachments: next })
    return !!updated
  }

  async function removeAttachment(ticketId: string, attachmentId: string): Promise<boolean> {
    const t = tickets.value.find((x) => x.id === ticketId)
    if (!t) return false
    const target = t.attachments.find((a) => a.id === attachmentId)
    if (!target) return false
    const updated = await updateTicket(ticketId, {
      attachments: t.attachments.filter((a) => a.id !== attachmentId),
    })
    if (!updated) return false
    // Best-effort blob cleanup — metadata is already gone.
    void supabase.storage.from('ticket-attachments').remove([target.path])
    return true
  }

  /** Short-lived signed URL for viewing/downloading (private bucket). */
  async function attachmentUrl(path: string): Promise<string | null> {
    const { data, error: err } = await supabase.storage
      .from('ticket-attachments')
      .createSignedUrl(path, 60 * 10)
    if (err) {
      error.value = "Couldn't open the attachment — " + err.message
      return null
    }
    return data.signedUrl
  }

  function applyTicketRealtime(payload: any) {
    const ev = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
    if (ev === 'INSERT') {
      const row = payload.new as Ticket
      if (!tickets.value.some((t) => t.id === row.id)) tickets.value.unshift(row)
    } else if (ev === 'UPDATE') {
      const row = payload.new as Ticket
      const idx = tickets.value.findIndex((t) => t.id === row.id)
      if (idx !== -1) tickets.value[idx] = row
    } else if (ev === 'DELETE') {
      const row = payload.old as Ticket
      tickets.value = tickets.value.filter((t) => t.id !== row.id)
    }
  }

  function applyCommentRealtime(payload: any) {
    const ev = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
    const row = (ev === 'DELETE' ? payload.old : payload.new) as TicketComment
    const tid = row.ticket_id
    const list = commentsByTicket.value[tid] ? [...commentsByTicket.value[tid]] : []
    if (ev === 'INSERT') {
      if (!list.some((c) => c.id === row.id)) list.push(row)
    } else if (ev === 'UPDATE') {
      const idx = list.findIndex((c) => c.id === row.id)
      if (idx !== -1) list[idx] = row
    } else if (ev === 'DELETE') {
      const idx = list.findIndex((c) => c.id === row.id)
      if (idx !== -1) list.splice(idx, 1)
    }
    commentsByTicket.value = { ...commentsByTicket.value, [tid]: list }
  }

  function startRealtime() {
    if (channel) return
    channel = supabase
      .channel('bb-tickets')
      .on(
        'postgres_changes',
        { event: '*', schema: 'buzzybee', table: 'tickets' },
        applyTicketRealtime
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'buzzybee', table: 'ticket_comments' },
        applyCommentRealtime
      )
      .subscribe()
  }
  async function stopRealtime() {
    if (channel) {
      try {
        await supabase.removeChannel(channel)
      } catch {
        /* ignore */
      }
      channel = null
    }
  }

  function selectTicket(id: string | null) {
    selectedTicketId.value = id
    if (id && !commentsByTicket.value[id]) void fetchComments(id)
  }

  watch(
    () => auth.isAuthenticated,
    (isAuthed) => {
      if (isAuthed) {
        void fetchAll()
        startRealtime()
      } else {
        tickets.value = []
        commentsByTicket.value = {}
        void stopRealtime()
      }
    },
    { immediate: true }
  )

  return {
    tickets,
    commentsByTicket,
    visibleTickets,
    myTickets,
    openCount,
    selectedTicket,
    selectedTicketId,
    isAdmin,
    canTriage,
    loading,
    error,
    fetchAll,
    fetchComments,
    createTicket,
    updateTicket,
    setStatus,
    addComment,
    addAttachment,
    removeAttachment,
    attachmentUrl,
    selectTicket
  }
})
