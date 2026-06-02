import { ref, computed, watch, onUnmounted, type Ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useTeamStore } from '@/stores/team'
import { useTasksStore } from '@/stores/tasks'
import { useProjectsStore } from '@/stores/projects'
import { useChannelsStore } from '@/stores/channels'

export interface Attachment {
  kind: 'image' | 'file' | 'link'
  name: string
  url?: string
  size?: number
  mime?: string
}

export interface CommsMessage {
  id: string
  channel_id: string
  parent_id: string | null
  user_id: string
  user_name: string | null
  body: string
  attachments: Attachment[]
  mentioned_user_ids: string[]
  is_pinned: boolean
  is_decision: boolean
  decision_done: boolean
  linked_task_id: string | null
  edited_at: string | null
  created_at: string
  updated_at: string
}

export interface HuddlePresence {
  userId: string
  name: string
  avatarUrl: string | null
  inHuddle: boolean
  muted: boolean
}

function stripHtml(s: string) {
  return s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}

export function useChannelStream(channelId: Ref<string | null | undefined>) {
  const auth = useAuthStore()
  const team = useTeamStore()
  const tasks = useTasksStore()
  const projects = useProjectsStore()
  const channelsStore = useChannelsStore()

  const allMessages = ref<CommsMessage[]>([])
  // reactions: messageId -> emoji -> Set<userId>. Tracking the actual user ids
  // (not a raw counter) makes applying a reaction idempotent — so the optimistic
  // update and the DB broadcast echo for the same (user, emoji) don't double up.
  const reactions = ref<Record<string, Record<string, Set<string>>>>({})
  const loading = ref(false)
  const sending = ref(false)
  const online = ref<HuddlePresence[]>([])

  // Huddle: WebRTC audio mesh, signaled over the channel's private broadcast.
  const inHuddle = ref(false)
  const muted = ref(false)
  const speaking = ref<Set<string>>(new Set())
  const huddleError = ref<string | null>(null)

  const ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
  let localStream: MediaStream | null = null
  let audioCtx: AudioContext | null = null
  const peers = new Map<string, { pc: RTCPeerConnection; audioEl?: HTMLAudioElement }>()
  const analysers = new Map<string, AnalyserNode>() // userId -> analyser (local keyed by me())
  let speakingRaf = 0

  let channel: RealtimeChannel | null = null
  let activeId: string | null = null
  let setupToken = 0

  const me = () => auth.user?.id ?? null

  const rootMessages = computed(() =>
    allMessages.value
      .filter((m) => !m.parent_id)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
  )
  const repliesByParent = computed(() => {
    const map: Record<string, CommsMessage[]> = {}
    for (const m of allMessages.value) {
      if (m.parent_id) (map[m.parent_id] ??= []).push(m)
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    }
    return map
  })
  const decisions = computed(() => rootMessages.value.filter((m) => m.is_decision))
  const pinned = computed(() => rootMessages.value.filter((m) => m.is_pinned))
  const huddlePeople = computed(() => online.value.filter((p) => p.inHuddle))

  function reactionList(messageId: string) {
    const r = reactions.value[messageId]
    const uid = me() ?? ''
    if (!r) return [] as { emoji: string; count: number; mine: boolean }[]
    return Object.entries(r)
      .map(([emoji, users]) => ({ emoji, count: users.size, mine: users.has(uid) }))
      .filter((x) => x.count > 0)
  }
  function profile(userId: string) {
    return team.profiles[userId] ?? null
  }

  function upsertMessage(row: CommsMessage | null | undefined) {
    if (!row?.id) return
    const i = allMessages.value.findIndex((m) => m.id === row.id)
    if (i === -1) {
      allMessages.value = [...allMessages.value, row]
      if (!team.profiles[row.user_id]) void team.fetchProfiles([row.user_id])
      // A fresh root message in the active channel → keep it marked read.
      if (!row.parent_id && row.channel_id === activeId) void channelsStore.markRead(row.channel_id)
    } else {
      allMessages.value[i] = row
    }
  }
  function removeMessage(id: string | undefined) {
    if (!id) return
    allMessages.value = allMessages.value.filter((m) => m.id !== id)
  }

  function applyReactionRow(row: any, removed: boolean) {
    const mid = row?.message_id
    const emoji = row?.emoji
    const uid = row?.user_id
    if (!mid || !emoji || !uid) return
    const byEmoji = reactions.value[mid] ?? (reactions.value[mid] = {})
    const set = byEmoji[emoji] ?? (byEmoji[emoji] = new Set<string>())
    if (removed) set.delete(uid)
    else set.add(uid) // idempotent: re-adding the same user is a no-op
    if (set.size === 0) delete byEmoji[emoji]
    // Reassign the message entry so the template's reactionList() recomputes.
    reactions.value = { ...reactions.value, [mid]: { ...byEmoji } }
  }

  async function loadHistory(id: string, opts: { silent?: boolean } = {}) {
    if (!opts.silent) loading.value = true
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('channel_id', id)
        .order('created_at', { ascending: true })
      if (error) throw error
      allMessages.value = (data ?? []) as CommsMessage[]
      const ids = [...new Set(allMessages.value.map((m) => m.user_id))].filter((u) => !team.profiles[u])
      if (ids.length) void team.fetchProfiles(ids)
      await loadReactions()
    } catch (e) {
      console.warn('[comms] loadHistory:', (e as Error).message)
      if (!opts.silent) allMessages.value = []
    } finally {
      if (!opts.silent) loading.value = false
    }
  }

  async function loadReactions() {
    const ids = allMessages.value.map((m) => m.id)
    if (!ids.length) {
      reactions.value = {}
      return
    }
    const { data, error } = await supabase
      .from('message_reactions')
      .select('message_id, user_id, emoji')
      .in('message_id', ids)
    if (error) {
      console.warn('[comms] loadReactions:', error.message)
      return
    }
    const map: Record<string, Record<string, Set<string>>> = {}
    for (const r of (data ?? []) as any[]) {
      const m = (map[r.message_id] ??= {})
      const s = (m[r.emoji] ??= new Set<string>())
      s.add(r.user_id)
    }
    reactions.value = map
  }

  async function teardown() {
    online.value = []
    if (inHuddle.value) stopHuddle()
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

  function trackPresence() {
    const uid = me()
    if (!channel || !uid) return
    void channel.track({
      userId: uid,
      name: auth.fullName,
      avatarUrl: auth.profile?.avatar_url ?? null,
      inHuddle: inHuddle.value,
      muted: muted.value,
    } satisfies HuddlePresence)
  }
  function syncPresence() {
    if (!channel) return
    const state = channel.presenceState<HuddlePresence>()
    const seen = new Map<string, HuddlePresence>()
    for (const metas of Object.values(state)) {
      for (const m of metas as unknown as HuddlePresence[]) {
        if (m?.userId) seen.set(m.userId, m)
      }
    }
    online.value = [...seen.values()]
  }

  async function setup(id: string, token: number) {
    activeId = id
    await loadHistory(id)
    if (token !== setupToken) return
    try { await supabase.realtime.setAuth() } catch { /* already set */ }
    if (token !== setupToken) return

    const uid = me()
    let subscribedOnce = false
    const ch = supabase.channel(`channel:${id}`, {
      config: { private: true, broadcast: { self: false }, presence: { key: uid ?? `anon-${id}` } },
    })

    const onChange = (m: { payload?: any; event?: string }) => {
      if (activeId !== id) return
      const p = m.payload ?? {}
      const table = p.table ?? p.schema_table
      const rec = p.record ?? p.new
      const old = p.old_record ?? p.old
      if (table === 'message_reactions') {
        if (p.operation === 'DELETE' || m.event === 'DELETE') applyReactionRow(old, true)
        else applyReactionRow(rec, false)
      } else {
        // messages
        if (p.operation === 'DELETE' || m.event === 'DELETE') removeMessage(old?.id)
        else upsertMessage(rec as CommsMessage)
      }
    }
    ch.on('broadcast', { event: 'INSERT' }, onChange)
    ch.on('broadcast', { event: 'UPDATE' }, onChange)
    ch.on('broadcast', { event: 'DELETE' }, onChange)

    const onPresence = () => {
      syncPresence()
      if (inHuddle.value) reconcilePeers()
    }
    ch.on('presence', { event: 'sync' }, onPresence)
    ch.on('presence', { event: 'join' }, onPresence)
    ch.on('presence', { event: 'leave' }, onPresence)

    // WebRTC signaling (offer/answer/ice) for the huddle audio mesh.
    ch.on('broadcast', { event: 'rtc' }, (m: { payload?: any }) => {
      if (activeId === id) void handleSignal(m.payload)
    })

    ch.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return
      trackPresence()
      if (subscribedOnce) {
        if (activeId === id) void loadHistory(id, { silent: true })
      } else {
        subscribedOnce = true
      }
    })

    if (token !== setupToken) {
      try { await ch.untrack(); await supabase.removeChannel(ch) } catch { /* ignore */ }
      return
    }
    channel = ch
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  async function send(body: string, opts: { attachments?: Attachment[]; parentId?: string | null } = {}) {
    const text = body.trim()
    const id = activeId
    const uid = me()
    if ((!text && !(opts.attachments?.length)) || !id || !uid || sending.value) return
    sending.value = true
    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          channel_id: id,
          parent_id: opts.parentId ?? null,
          user_id: uid,
          user_name: auth.fullName || null,
          body: text,
          attachments: opts.attachments ?? [],
        })
        .select('*')
        .single()
      if (error) throw error
      upsertMessage(data as CommsMessage)
    } catch (e) {
      console.warn('[comms] send:', (e as Error).message)
      throw e
    } finally {
      sending.value = false
    }
  }

  async function toggleReaction(messageId: string, emoji: string) {
    const uid = me()
    if (!uid) return
    const mine = reactions.value[messageId]?.[emoji]?.has(uid) ?? false
    // Optimistic (idempotent vs. the broadcast echo, since we key by user id)
    applyReactionRow({ message_id: messageId, user_id: uid, emoji }, mine)
    if (mine) {
      const { error } = await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', uid)
        .eq('emoji', emoji)
      if (error) console.warn('[comms] unreact:', error.message)
    } else {
      const { error } = await supabase
        .from('message_reactions')
        .insert({ message_id: messageId, user_id: uid, emoji })
      if (error) console.warn('[comms] react:', error.message)
    }
  }

  async function patchMessage(id: string, patch: Partial<CommsMessage>) {
    const i = allMessages.value.findIndex((m) => m.id === id)
    const prev = i !== -1 ? { ...allMessages.value[i] } : null
    if (i !== -1) allMessages.value[i] = { ...allMessages.value[i], ...patch }
    const { error } = await supabase.from('messages').update(patch).eq('id', id)
    if (error) {
      if (prev && i !== -1) allMessages.value[i] = prev
      console.warn('[comms] patchMessage:', error.message)
    }
  }
  const togglePin = (m: CommsMessage) => patchMessage(m.id, { is_pinned: !m.is_pinned })
  const markDecision = (m: CommsMessage) => patchMessage(m.id, { is_decision: !m.is_decision })
  const toggleDecisionDone = (m: CommsMessage) => patchMessage(m.id, { decision_done: !m.decision_done })

  /** Turn a message into a tracked task (in the channel client's first project). */
  async function createTaskFromMessage(m: CommsMessage): Promise<string | null> {
    const channelObj = channelsStore.channels.find((c) => c.id === m.channel_id)
    const clientId = channelObj?.client_id
    if (!clientId) return null
    const project =
      (projects.projectsByClient[clientId] ?? [])[0] ?? projects.projects.find((p) => p.client_id === clientId)
    if (!project) throw new Error('Create a project for this client before turning messages into tasks.')
    const title = stripHtml(m.body).slice(0, 140) || 'Task from message'
    const task = await tasks.createTask({ title, project_id: project.id, client_id: clientId })
    // Best-effort back-link (works for the author / managers per RLS).
    void patchMessage(m.id, { linked_task_id: task.id })
    return task.id
  }

  // ── Huddle: WebRTC audio mesh ───────────────────────────────────────────────
  function sendRtc(to: string, kind: string, data: unknown) {
    void channel?.send({ type: 'broadcast', event: 'rtc', payload: { from: me(), to, kind, data } })
  }

  function setupAnalyser(userId: string, stream: MediaStream) {
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext
      audioCtx ??= new AC()
      const src = audioCtx.createMediaStreamSource(stream)
      const an = audioCtx.createAnalyser()
      an.fftSize = 512
      src.connect(an)
      analysers.set(userId, an)
      ensureSpeakingLoop()
    } catch {
      /* analyser is best-effort (just powers the speaking glow) */
    }
  }

  function ensureSpeakingLoop() {
    if (speakingRaf) return
    let last = 0
    const tick = (ts: number) => {
      speakingRaf = requestAnimationFrame(tick)
      if (ts - last < 120) return
      last = ts
      const next = new Set<string>()
      for (const [uid, an] of analysers) {
        const buf = new Uint8Array(an.fftSize)
        an.getByteTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / buf.length)
        if (rms > 0.045 && !(uid === me() && muted.value)) next.add(uid)
      }
      const changed = next.size !== speaking.value.size || [...next].some((u) => !speaking.value.has(u))
      if (changed) speaking.value = next
    }
    speakingRaf = requestAnimationFrame(tick)
  }

  async function ensureLocalStream() {
    if (localStream) return localStream
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    localStream.getAudioTracks().forEach((t) => (t.enabled = !muted.value))
    const uid = me()
    if (uid) setupAnalyser(uid, localStream)
    return localStream
  }

  function getPeer(userId: string): RTCPeerConnection {
    const existing = peers.get(userId)
    if (existing) return existing.pc
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    localStream?.getTracks().forEach((t) => pc.addTrack(t, localStream!))
    pc.onicecandidate = (e) => {
      if (e.candidate) sendRtc(userId, 'ice', e.candidate.toJSON())
    }
    pc.ontrack = (e) => {
      const entry = peers.get(userId)
      let el = entry?.audioEl
      if (!el) {
        el = document.createElement('audio')
        el.autoplay = true
        ;(el as any).playsInline = true
        document.body.appendChild(el)
        if (entry) entry.audioEl = el
      }
      el.srcObject = e.streams[0]
      void el.play().catch(() => {})
      if (!analysers.has(userId)) setupAnalyser(userId, e.streams[0])
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') closePeer(userId)
    }
    peers.set(userId, { pc })
    return pc
  }

  async function makeOffer(userId: string) {
    const pc = getPeer(userId)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    sendRtc(userId, 'offer', pc.localDescription)
  }

  // Connect to / disconnect from huddle participants. The lower userId in each
  // pair is the offerer, so exactly one side initiates.
  function reconcilePeers() {
    const myId = me()
    if (!inHuddle.value || !myId) return
    const wanted = new Set(huddlePeople.value.map((p) => p.userId).filter((u) => u !== myId))
    for (const uid of wanted) {
      if (!peers.has(uid) && myId < uid) void makeOffer(uid)
    }
    for (const uid of [...peers.keys()]) {
      if (!wanted.has(uid)) closePeer(uid)
    }
  }

  async function handleSignal(p: any) {
    if (!p || p.to !== me()) return
    const from = p.from as string
    try {
      if (p.kind === 'offer') {
        const pc = getPeer(from)
        await pc.setRemoteDescription(p.data)
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        sendRtc(from, 'answer', pc.localDescription)
      } else if (p.kind === 'answer') {
        const pc = peers.get(from)?.pc
        if (pc) await pc.setRemoteDescription(p.data)
      } else if (p.kind === 'ice') {
        const pc = peers.get(from)?.pc ?? getPeer(from)
        await pc.addIceCandidate(p.data).catch(() => {})
      }
    } catch (e) {
      console.warn('[huddle] signal:', (e as Error).message)
    }
  }

  function closePeer(userId: string) {
    const e = peers.get(userId)
    if (!e) return
    try { e.pc.close() } catch { /* ignore */ }
    if (e.audioEl) {
      e.audioEl.srcObject = null
      e.audioEl.remove()
    }
    analysers.delete(userId)
    peers.delete(userId)
  }

  async function startHuddle() {
    huddleError.value = null
    try {
      await ensureLocalStream()
      inHuddle.value = true
      trackPresence()
      reconcilePeers()
    } catch {
      huddleError.value = 'Microphone access is needed to join the huddle.'
      inHuddle.value = false
    }
  }

  function stopHuddle() {
    inHuddle.value = false
    muted.value = false
    for (const uid of [...peers.keys()]) closePeer(uid)
    localStream?.getTracks().forEach((t) => t.stop())
    localStream = null
    analysers.clear()
    speaking.value = new Set()
    if (speakingRaf) {
      cancelAnimationFrame(speakingRaf)
      speakingRaf = 0
    }
    audioCtx?.close().catch(() => {})
    audioCtx = null
    trackPresence()
  }

  function toggleHuddle() {
    if (inHuddle.value) stopHuddle()
    else void startHuddle()
  }
  function toggleMute() {
    muted.value = !muted.value
    localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted.value))
    trackPresence()
  }

  watch(
    channelId,
    async (id) => {
      const token = ++setupToken
      await teardown()
      allMessages.value = []
      reactions.value = {}
      activeId = null
      if (id && token === setupToken) await setup(id, token)
    },
    { immediate: true },
  )

  onUnmounted(teardown)

  return {
    rootMessages,
    repliesByParent,
    decisions,
    pinned,
    loading,
    sending,
    online,
    huddlePeople,
    inHuddle,
    muted,
    speaking,
    huddleError,
    reactionList,
    profile,
    send,
    toggleReaction,
    togglePin,
    markDecision,
    toggleDecisionDone,
    createTaskFromMessage,
    toggleHuddle,
    toggleMute,
  }
}
