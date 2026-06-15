import { ref, computed, watch, onUnmounted, type Ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { broadcast } from '@/lib/realtime'
import { useAuthStore } from '@/stores/auth'
import { useTeamStore } from '@/stores/team'

// Per-task chat backed by buzzybee.task_comments, delivered live over a private
// Realtime channel `task:{id}`:
//   • messages  → Broadcast-from-Database (AFTER trigger → realtime.broadcast_changes)
//   • viewers   → Presence (who has this task open)
//   • typing    → debounced Broadcast event (Presence is too heavy for this)
// Reads are tracked in buzzybee.task_comment_reads for unread badges.

export interface TaskComment {
  id: string
  task_id: string
  parent_id: string | null
  user_id: string
  user_name: string | null
  message: string
  attachments: unknown[]
  mentioned_user_ids: string[]
  created_at: string
  updated_at: string
}

export interface Viewer {
  userId: string
  name: string
  avatarUrl: string | null
}

const TYPING_TTL = 3500

export function useTaskChat(taskId: Ref<string | null | undefined>) {
  const auth = useAuthStore()
  const team = useTeamStore()

  const messages = ref<TaskComment[]>([])
  const loading = ref(false)
  const sending = ref(false)
  const viewers = ref<Viewer[]>([])
  const typingUsers = ref<{ userId: string; name: string }[]>([])
  const lastReadAt = ref<string | null>(null)

  let channel: RealtimeChannel | null = null
  let activeId: string | null = null
  // Monotonic token: guards against races when the open task switches faster
  // than an async setup() can finish wiring up.
  let setupToken = 0
  const typingTimers = new Map<string, ReturnType<typeof setTimeout>>()
  let lastTypingSent = 0

  const me = () => auth.user?.id ?? null

  // Unread = messages newer than my last read, authored by someone else.
  const unreadCount = computed(() => {
    if (!lastReadAt.value) return 0
    const cutoff = new Date(lastReadAt.value).getTime()
    return messages.value.filter(
      (m) => m.user_id !== me() && new Date(m.created_at).getTime() > cutoff,
    ).length
  })

  function authorProfile(userId: string) {
    return team.profiles[userId] ?? null
  }

  async function loadHistory(id: string, opts: { silent?: boolean } = {}) {
    // `silent` = a reconnect catch-up: refresh in place without flashing the
    // "Loading…" state. upsertRow-style replace keeps it idempotent.
    if (!opts.silent) loading.value = true
    try {
      const { data, error } = await supabase
        .from('task_comments')
        .select('*')
        .eq('task_id', id)
        .order('created_at', { ascending: true })
      if (error) throw error
      // Stale guard: if the open task changed while this request was in
      // flight, don't overwrite the new task's conversation.
      if (activeId !== id) return
      messages.value = (data ?? []) as TaskComment[]
      void hydrateProfiles()
    } catch (e) {
      console.warn('[task chat] loadHistory:', (e as Error).message)
      if (!opts.silent && activeId === id) messages.value = []
    } finally {
      if (!opts.silent && activeId === id) loading.value = false
    }
  }

  function hydrateProfiles() {
    const ids = [...new Set(messages.value.map((m) => m.user_id))].filter(
      (id) => !team.profiles[id],
    )
    if (ids.length) void team.fetchProfiles(ids)
  }

  // Merge a row from a broadcast/insert without duplicating (keyed by id).
  function upsertRow(row: TaskComment | null | undefined) {
    if (!row?.id) return
    const i = messages.value.findIndex((m) => m.id === row.id)
    if (i === -1) {
      messages.value = [...messages.value, row].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )
      if (!team.profiles[row.user_id]) void team.fetchProfiles([row.user_id])
    } else {
      messages.value[i] = row
    }
  }

  function removeRow(id: string | null | undefined) {
    if (!id) return
    messages.value = messages.value.filter((m) => m.id !== id)
  }

  function noteTyping(userId: string, name: string) {
    if (userId === me()) return
    const existing = typingTimers.get(userId)
    if (existing) clearTimeout(existing)
    if (!typingUsers.value.some((u) => u.userId === userId)) {
      typingUsers.value = [...typingUsers.value, { userId, name }]
    }
    typingTimers.set(
      userId,
      setTimeout(() => {
        typingUsers.value = typingUsers.value.filter((u) => u.userId !== userId)
        typingTimers.delete(userId)
      }, TYPING_TTL),
    )
  }

  function syncViewers() {
    if (!channel) return
    const state = channel.presenceState<Viewer>()
    const seen = new Map<string, Viewer>()
    for (const metas of Object.values(state)) {
      for (const m of metas as unknown as Viewer[]) {
        if (m?.userId && m.userId !== me()) seen.set(m.userId, m)
      }
    }
    viewers.value = [...seen.values()]
  }

  async function teardown() {
    for (const t of typingTimers.values()) clearTimeout(t)
    typingTimers.clear()
    typingUsers.value = []
    viewers.value = []
    if (channel) {
      try {
        await channel.untrack()
        await supabase.removeChannel(channel)
      } catch {
        /* ignore */
      }
      channel = null
    }
  }

  async function setup(id: string, token: number) {
    activeId = id
    await loadHistory(id)
    await fetchLastRead(id)
    if (token !== setupToken) return // task switched while we were loading

    // Private channels carry the user's JWT so realtime.messages RLS can authorize.
    try {
      await supabase.realtime.setAuth()
    } catch {
      /* token may already be set */
    }
    if (token !== setupToken) return

    const uid = me()
    let subscribedOnce = false
    const ch = supabase.channel(`task:${id}`, {
      config: {
        private: true,
        broadcast: { self: false },
        presence: { key: uid ?? `anon-${id}` },
      },
    })

    // Messages — emitted by the DB trigger via realtime.broadcast_changes.
    const onChange = (m: { payload?: any }) => {
      // Stale guard: ignore events that arrive after we've switched tasks.
      if (activeId !== id) return
      const p = m.payload ?? {}
      upsertRow((p.record ?? p.new) as TaskComment)
    }
    ch.on('broadcast', { event: 'INSERT' }, onChange)
    ch.on('broadcast', { event: 'UPDATE' }, onChange)
    ch.on('broadcast', { event: 'DELETE' }, (m: { payload?: any }) => {
      if (activeId !== id) return
      const p = m.payload ?? {}
      removeRow((p.old_record ?? p.old)?.id)
    })

    // Typing — client-to-client broadcast.
    ch.on('broadcast', { event: 'typing' }, (m: { payload?: any }) => {
      const p = m.payload ?? {}
      if (p.userId) noteTyping(p.userId, p.name ?? 'Someone')
    })

    // Presence — who's viewing this task.
    ch.on('presence', { event: 'sync' }, syncViewers)
    ch.on('presence', { event: 'join' }, syncViewers)
    ch.on('presence', { event: 'leave' }, syncViewers)

    ch.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return
      if (uid) {
        void ch.track({
          userId: uid,
          name: auth.fullName,
          avatarUrl: auth.profile?.avatar_url ?? null,
        } satisfies Viewer)
      }
      // SUBSCRIBED fires again after a dropped socket reconnects. Broadcast is
      // fire-and-forget, so anything sent while we were offline was missed —
      // refetch (silently) to catch up. Skipped on the very first subscribe
      // because setup() already loaded history.
      if (subscribedOnce) {
        if (activeId === id) void loadHistory(id, { silent: true })
      } else {
        subscribedOnce = true
      }
    })

    // If the task switched while we were subscribing, discard this channel.
    if (token !== setupToken) {
      try {
        await ch.untrack()
        await supabase.removeChannel(ch)
      } catch {
        /* ignore */
      }
      return
    }

    channel = ch
  }

  async function fetchLastRead(id: string) {
    const uid = me()
    if (!uid) return
    const { data } = await supabase
      .from('task_comment_reads')
      .select('last_read_at')
      .eq('task_id', id)
      .eq('user_id', uid)
      .maybeSingle()
    if (activeId !== id) return // task switched while the request was in flight
    lastReadAt.value = (data as { last_read_at: string } | null)?.last_read_at ?? null
  }

  async function markRead() {
    const id = activeId
    const uid = me()
    if (!id || !uid) return
    const now = new Date().toISOString()
    lastReadAt.value = now
    const { error } = await supabase
      .from('task_comment_reads')
      .upsert({ task_id: id, user_id: uid, last_read_at: now }, { onConflict: 'user_id,task_id' })
    if (error) console.warn('[task chat] markRead:', error.message)
  }

  async function sendMessage(text: string, opts: { mentions?: string[] } = {}) {
    const body = text.trim()
    const id = activeId
    const uid = me()
    if (!body || !id || !uid || sending.value) return
    sending.value = true
    try {
      const { data, error } = await supabase
        .from('task_comments')
        .insert({
          task_id: id,
          user_id: uid,
          user_name: auth.fullName || null,
          message: body,
          // NULL (not []) when empty — the notify trigger guards on `is not null`.
          mentioned_user_ids: opts.mentions?.length ? opts.mentions : null,
        })
        .select('*')
        .single()
      if (error) throw error
      // Show it immediately for the sender (self:false means no echo to us).
      upsertRow(data as TaskComment)
      void markRead()
    } catch (e) {
      console.warn('[task chat] send:', (e as Error).message)
      throw e
    } finally {
      sending.value = false
    }
  }

  // Debounced "I'm typing" ping (≤ ~1/sec) so we don't flood the channel.
  function notifyTyping() {
    const uid = me()
    if (!channel || !uid) return
    const now = Date.now()
    if (now - lastTypingSent < 1200) return
    lastTypingSent = now
    broadcast(channel, 'typing', { userId: uid, name: auth.fullName })
  }

  // React to the open task changing: tear the old channel down, set the new up.
  watch(
    taskId,
    async (id) => {
      const token = ++setupToken
      await teardown()
      messages.value = []
      lastReadAt.value = null
      loading.value = false
      activeId = null
      // Bail if an even-newer switch arrived during teardown.
      if (id && token === setupToken) await setup(id, token)
    },
    { immediate: true },
  )

  onUnmounted(teardown)

  return {
    messages,
    loading,
    sending,
    viewers,
    typingUsers,
    unreadCount,
    authorProfile,
    sendMessage,
    notifyTyping,
    markRead,
  }
}
