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

export const useTicketsStore = defineStore('tickets', () => {
  const auth = useAuthStore()

  const tickets = ref<Ticket[]>([])
  const commentsByTicket = ref<Record<string, TicketComment[]>>({})
  const loading = ref(false)
  const selectedTicketId = ref<string | null>(null)

  let channel: RealtimeChannel | null = null

  const isAdmin = computed(() => auth.isAdmin)

  const myTickets = computed(() =>
    tickets.value.filter((t) => t.reporter_id === auth.user?.id)
  )

  const visibleTickets = computed(() =>
    isAdmin.value ? tickets.value : myTickets.value
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
    const { data, error } = await supabase
      .from('tickets')
      .update(patch as Record<string, unknown>)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    const row = data as Ticket
    const idx = tickets.value.findIndex((t) => t.id === row.id)
    if (idx !== -1) tickets.value[idx] = row
    return row
  }

  async function setStatus(id: string, status: TicketStatus) {
    return updateTicket(id, { status })
  }

  async function addComment(ticketId: string, message: string, isInternal = false) {
    if (!auth.user) throw new Error('Not authenticated')
    const { data, error } = await supabase
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
    if (error) throw error
    const row = data as TicketComment
    const list = commentsByTicket.value[ticketId] ? [...commentsByTicket.value[ticketId]] : []
    if (!list.some((c) => c.id === row.id)) list.push(row)
    commentsByTicket.value = { ...commentsByTicket.value, [ticketId]: list }
    return row
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
    loading,
    fetchAll,
    fetchComments,
    createTicket,
    updateTicket,
    setStatus,
    addComment,
    selectTicket
  }
})
