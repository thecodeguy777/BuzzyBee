import { ref, computed, onUnmounted, watch } from 'vue'
import { REALTIME_CHANNEL_STATES, type RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { broadcast } from '@/lib/realtime'
import { useAuthStore } from '@/stores/auth'
import { iceServers, hasTurn } from '@/lib/iceServers'
import { createNoisePipeline, type NoisePipeline } from '@/lib/noiseSuppressor'
import { createVideoBackground, type VideoBackground, type BgMode } from '@/lib/virtualBackground'
import { meetSounds } from '@/lib/meetingSounds'

// Gmeet-style guest meeting rooms. WebRTC audio + screen-share mesh signaled
// over a PUBLIC realtime channel `meet:<token>` — the unguessable token in the
// URL is the access key, so guests need no account. Logged-in members/host
// bypass the lobby; guests wait until an admitter lets them in (cooperative —
// the link is the real gate, the lobby is for host awareness/control).

export type Role = 'host' | 'member' | 'guest'
export type RoomStatus = 'idle' | 'joining' | 'lobby' | 'live' | 'denied' | 'ended' | 'error'

export interface RoomMeta {
  id: string
  title: string | null
  host_id: string
  expires_at: string
  ended_at: string | null
  valid: boolean
}
export interface Participant {
  userId: string
  name: string
  role: Role
  admitted: boolean
  muted: boolean
  sharing?: boolean
  /** Camera on — mirrors `sharing`; lets presence reconcile remote cameras. */
  cam?: boolean
  hand?: boolean
  /** Mic / camera permission blocked (denied) — surfaces a "!" on their tile. */
  micBlocked?: boolean
  camBlocked?: boolean
  /** Per-page-load session token — a change means the peer rejoined. */
  epoch?: string
  since?: number
  /** Host-only: screen-sharing locked to the host (others read it via the
   *  host's presence so late joiners inherit the policy). */
  shareLocked?: boolean
}

export interface MeetingChatMsg {
  from: string
  name: string
  text: string
  at: number
}

export interface FlyingReaction {
  id: string
  emoji: string
  /** Horizontal launch position, % of stage width. */
  x: number
}

const GUEST_ID_KEY = 'buzzybee.meet.guest-id'
function guestId(): string {
  // localStorage (not sessionStorage) so a guest keeps the SAME token across a
  // tab close/reopen + RELOAD — they come back as the same person (one tile, the
  // peer renegotiates the same key instead of stacking a dead connection). Only a
  // DELIBERATE leave/end clears it (forgetGuestId); a reload never does.
  let id = typeof window !== 'undefined' ? window.localStorage.getItem(GUEST_ID_KEY) : null
  if (!id) {
    id = (crypto.randomUUID?.() ?? `guest-${Math.random().toString(36).slice(2)}-${Date.now()}`)
    try { window.localStorage.setItem(GUEST_ID_KEY, id) } catch { /* ignore */ }
  }
  return id
}
const LAST_ROOM_KEY = 'buzzybee.meet.last-room'
// Remember which room a guest is in (token + name + when) so an accidental RELOAD
// can auto-rejoin instead of re-showing the green room. Cleared on a deliberate
// leave (forgetGuestId).
function rememberRoom(token: string, name: string) {
  try { window.localStorage.setItem(LAST_ROOM_KEY, JSON.stringify({ token, name, at: Date.now() })) } catch { /* ignore */ }
}
function forgetGuestId() {
  try {
    window.localStorage.removeItem(GUEST_ID_KEY)
    window.localStorage.removeItem(LAST_ROOM_KEY)
  } catch { /* ignore */ }
}

export function useMeetingRoom() {
  const auth = useAuthStore()

  const status = ref<RoomStatus>('idle')
  const error = ref<string | null>(null)
  const room = ref<RoomMeta | null>(null)
  const token = ref('')
  const online = ref<Participant[]>([])
  // userIds that broadcast an explicit 'bye' on leave — suppressed from the
  // roster until their presence untrack propagates (auto-cleared after ~3s in
  // case it was a spoof or the untrack never lands), so a leaver drops instantly
  // without a re-add flicker from a presence sync that still lists them.
  const byed = new Set<string>()
  // Presence drives WHO is shown (instant, robust); the DB only AUTHORITATIVELY
  // REMOVES. buzzybee.meeting_participants is server-reaped via pg_cron and
  // streamed here over postgres_changes — a DELETE (reap or clean leave) adds the
  // user to `reaped` so a presence resync can't resurrect them; an INSERT clears
  // it. A DB hiccup therefore can NEVER make a live participant invisible (the
  // earlier bug) — worst case a ghost lingers on presence's own timeout. Guests
  // are stored 'guest:<id>' server-side; dbId() strips the prefix to match the
  // presence userId.
  const reaped = new Set<string>()
  let rosterChannel: RealtimeChannel | null = null
  const dbId = (uid: string) => (uid.startsWith('guest:') ? uid.slice(6) : uid)

  const muted = ref(false)
  const handRaised = ref(false)
  const sharingScreen = ref(false)
  /** My own share stream — so the presenter sees what everyone else sees. */
  const localScreen = ref<MediaStream | null>(null)
  const remoteScreens = ref<Record<string, MediaStream>>({})
  /** Camera: off by default (opt-in). localCamera = my own preview. */
  const cameraOn = ref(false)
  const localCamera = ref<MediaStream | null>(null)
  const remoteCameras = ref<Record<string, MediaStream>>({})
  /** Mirror my own tile only for the front/selfie camera, not the rear. */
  const selfMirrored = ref(true)
  /** URL of the active background image (preset data-URL or uploaded blob). */
  const bgImageUrl = ref<string | null>(null)
  /** True while the segmentation pipeline is loading (the blur/bg apply delay). */
  const bgLoading = ref(false)
  /** Background effect (blur). Persists so it carries across sessions. */
  const bgMode = ref<BgMode>(
    typeof window !== 'undefined' && window.localStorage.getItem('buzzybee.comms.bg') === 'blur'
      ? 'blur'
      : 'none',
  )
  const speaking = ref<Set<string>>(new Set())
  // In-call chat + reactions are ephemeral by design — they live exactly as
  // long as the call does, so plain broadcast (no DB) is the right transport.
  const chat = ref<MeetingChatMsg[]>([])
  const reactions = ref<FlyingReaction[]>([])
  const noiseSuppression = ref(
    typeof window === 'undefined' || window.localStorage.getItem('buzzybee.comms.noise-suppression') !== '0',
  )
  const rnnoiseActive = ref(false)
  const soundsOn = ref(meetSounds.isEnabled())

  // Host moderation: the screen-share lock (only the host's presence carries it;
  // everyone else reads it via roomShareLocked), plus a transient notice shown to
  // a participant a host action just targeted ("The host muted you").
  const shareLocked = ref(false)
  const hostNotice = ref<string | null>(null)
  let noticeTimer: ReturnType<typeof setTimeout> | undefined

  const myId = ref('')
  const myName = ref('')
  const myRole = ref<Role>('guest')
  const amAdmitted = ref(false)
  // Stable per-page-load session token. A reload / rejoin gets a fresh epoch, so
  // peers know to discard the stale connection and rebuild (see reconcilePeers).
  // Generated ONCE per composable instance — never per trackPresence call.
  const myEpoch =
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)

  const ICE = iceServers()
  // Surfaced once a peer's connection has truly failed (after the ICE-restart
  // grace) so guests aren't left in a silent dead call. STUN-only can't cross
  // strict NATs, so hint at TURN when none is configured.
  function notePeerFailed() {
    error.value = hasTurn()
      ? 'A participant dropped off — their connection failed.'
      : 'A participant dropped off — strict networks need a TURN relay (set VITE_TURN_*).'
  }
  let localStream: MediaStream | null = null
  let rawStream: MediaStream | null = null
  let nsPipeline: NoisePipeline | null = null
  let screenStream: MediaStream | null = null
  let cameraStream: MediaStream | null = null
  // The unprocessed camera (feeds the blur pipeline as its source); cameraStream
  // is what we actually send (raw or processed). vbg = the blur pipeline or null.
  let rawCamStream: MediaStream | null = null
  let vbg: VideoBackground | null = null
  let bgImageEl: HTMLImageElement | null = null
  let cameraFacing: 'user' | 'environment' = 'user'
  // Concurrency guards for the async camera lifecycle — getUserMedia and the
  // blur-pipeline init are long awaits. The in-flight locks stop toggle-spam
  // from double-enabling (two streams / orphaned senders); camGen invalidates a
  // stale completion when the user leaves or toggles off mid-await.
  let camBusy = false
  let flipBusy = false
  let bgBusy = false
  let camGen = 0
  // Honoured once the call goes live — lets the green-room "join with camera on"
  // choice carry through (incl. guests who wait in the lobby first).
  let startCameraOnLive = false
  // Broadcast our own mic/cam permission trouble so others see a "!" on our tile.
  let myMicBlocked = false
  let myCamBlocked = false
  let audioCtx: AudioContext | null = null
  let speakingRaf = 0
  const analysers = new Map<string, AnalyserNode>()
  // Presence-driven sound cues: diff each presence update to fire join/leave/
  // knock/hand sounds. soundsArmed gates the initial roster (no blast on join).
  let prevAdmittedIds = new Set<string>()
  let prevWaitingIds = new Set<string>()
  let prevHandIds = new Set<string>()
  let soundsArmed = false

  interface PeerEntry {
    pc: RTCPeerConnection
    audioEl?: HTMLAudioElement
    screenSender?: RTCRtpSender
    camSender?: RTCRtpSender
    /** Sender's session token — a change means they rejoined; recycle the pc. */
    epoch?: string
    /** ICE candidates that raced ahead of the remote description — flushed after it lands. */
    pendingIce: RTCIceCandidateInit[]
    /** True once presence has confirmed this user admitted (see reconcilePeers). */
    confirmed: boolean
    makingOffer: boolean
    ignoreOffer: boolean
    polite: boolean
    /** A renegotiation became needed while non-stable — re-fire on return to stable. */
    renegotiatePending?: boolean
    /** ICE restart already attempted for this connection's current failure. */
    restartedIce?: boolean
  }
  const peers = new Map<string, PeerEntry>()
  let channel: RealtimeChannel | null = null
  let onPageHide: (() => void) | null = null

  // ── Reconnect / self-heal ───────────────────────────────────────────────────
  // The signaling+presence channel can error / time out / close (mobile blips,
  // tab resume, realtime outage). Without a restart the call goes silently
  // half-dead, so we mirror the postgres useRealtime harness for this channel:
  // backoff resubscribe, online/visibility/focus triggers, and a periodic
  // safety-net reconcile that rebuilds peers that died while presence stayed put.
  const reconnecting = ref(false)
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempts = 0
  let resubscribing = false
  let reconcileTimer: ReturnType<typeof setInterval> | null = null
  let reconnectListenersAdded = false
  // Mesh is full-mesh (O(n^2)); cap admissions so it doesn't brown out uplinks.
  // Best-effort on the client — authoritative enforcement belongs server-side.
  const MAX_PARTICIPANTS = 8

  // Camera-vs-screen disambiguation. A bare WebRTC video track is unlabelled —
  // the receiver can't tell a face from a shared screen. So each sender
  // broadcasts which MediaStream id is its camera vs its screen (stream ids
  // survive the round-trip via the SDP msid), and the receiver classifies
  // incoming video by id. `pendingVideo` parks tracks that arrive before their
  // announcement (broadcast vs SDP have no ordering guarantee).
  const mediaState = new Map<string, { cam: string | null; screen: string | null }>()
  const pendingVideo = new Map<string, { userId: string; stream: MediaStream }>()

  const admittedPeople = computed(() => online.value.filter((p) => p.admitted))
  const waiting = computed(() => online.value.filter((p) => !p.admitted && p.userId !== myId.value))
  const canAdmit = computed(() => myRole.value === 'host' || myRole.value === 'member')
  const isHost = computed(() => myRole.value === 'host')
  // The room's share policy lives in the host's presence, so late joiners inherit
  // it automatically without a replay handshake.
  const roomShareLocked = computed(() => online.value.find((p) => p.role === 'host')?.shareLocked ?? false)
  const roomFull = computed(() => admittedPeople.value.length >= MAX_PARTICIPANTS)
  const me = () => myId.value

  // ── Resolve + join ──────────────────────────────────────────────────────────
  async function resolve(tk: string): Promise<RoomMeta | null> {
    const { data, error: e } = await supabase.rpc('get_meeting_room', { p_token: tk })
    if (e) {
      error.value = e.message
      return null
    }
    const row = (Array.isArray(data) ? data[0] : data) as RoomMeta | undefined
    return row ?? null
  }

  /** Resolve room meta without joining — powers the guest landing portal
   *  (title + validity before we ask for a name). */
  async function peek(tk: string): Promise<RoomMeta | null> {
    const meta = await resolve(tk)
    if (meta) room.value = meta
    return meta
  }

  async function join(tk: string, displayName?: string, opts?: { startCamera?: boolean }) {
    token.value = tk
    status.value = 'joining'
    error.value = null
    meetSounds.unlock() // prime audio during the join gesture (guests)
    startCameraOnLive = !!opts?.startCamera
    const meta = await resolve(tk)
    if (!meta) {
      status.value = 'error'
      error.value = error.value || 'Meeting not found.'
      return
    }
    room.value = meta
    if (!meta.valid) {
      status.value = 'ended'
      return
    }

    const user = auth.user
    if (user) {
      myId.value = user.id
      myName.value = auth.fullName || 'Member'
      myRole.value = user.id === meta.host_id ? 'host' : 'member'
      amAdmitted.value = true // logged-in teammates bypass the lobby
    } else {
      myId.value = guestId()
      myName.value = displayName?.trim() || 'Guest'
      myRole.value = 'guest'
      amAdmitted.value = false
      rememberRoom(tk, myName.value) // enable auto-rejoin on an accidental reload
    }

    await subscribe(tk)
    await subscribeRoster(meta.id)
    // A guest who was already admitted in a prior session (e.g. just before a
    // reload) is still admitted in the DB — skip the lobby and go straight back.
    if (!amAdmitted.value && myRole.value === 'guest' && (await isAlreadyAdmitted(meta.id))) {
      amAdmitted.value = true
    }
    if (amAdmitted.value) await goLive()
    else { void rpcJoin(false); status.value = 'lobby' } // lobby guest joins the DB waiting list
  }

  async function subscribe(tk: string) {
    // supabase caches channels by topic and hands back the SAME (already-
    // subscribed) instance, so on a re-join / HMR reload / double-mount the
    // .on() calls below would throw "cannot add callbacks after subscribe()".
    // Remove any stale channel for this topic first so we always build fresh.
    const topic = `realtime:meet:${tk}`
    for (const c of supabase.getChannels()) {
      if (c.topic === topic) {
        try { await supabase.removeChannel(c) } catch { /* ignore */ }
      }
    }
    const ch = supabase.channel(`meet:${tk}`, {
      config: { broadcast: { self: false }, presence: { key: myId.value } },
    })
    ch.on('presence', { event: 'sync' }, onPresence)
    ch.on('presence', { event: 'join' }, onPresence)
    ch.on('presence', { event: 'leave' }, onPresence)
    ch.on('broadcast', { event: 'rtc' }, (m: { payload?: any }) => void handleSignal(m.payload))
    ch.on('broadcast', { event: 'ctrl' }, (m: { payload?: any }) => onCtrl(m.payload))
    ch.on('broadcast', { event: 'media' }, (m: { payload?: any }) => onMedia(m.payload))
    ch.on('broadcast', { event: 'media-req' }, (m: { payload?: any }) => onMediaReq(m.payload))
    ch.on('broadcast', { event: 'chat' }, (m: { payload?: any }) => {
      const p = m.payload as MeetingChatMsg | undefined
      if (p?.text) chat.value = [...chat.value, p]
    })
    ch.on('broadcast', { event: 'react' }, (m: { payload?: any }) => {
      const emoji = (m.payload as { emoji?: string } | undefined)?.emoji
      if (emoji) launchReaction(emoji)
    })
    channel = ch
    // Abrupt tab close / hide doesn't run onUnmounted, so the presence ghost
    // would linger until the server times it out. Fire-and-forget untrack on
    // pagehide (mobile-safe, unlike beforeunload). Add ONCE — resubscribe()
    // re-enters this function.
    if (typeof window !== 'undefined' && !onPageHide) {
      onPageHide = () => { try { void channel?.untrack() } catch { /* ignore */ } }
      window.addEventListener('pagehide', onPageHide)
    }
    addReconnectListeners()
    // Resolve only on a real SUBSCRIBED so callers don't go live on a channel
    // that never joined; on CHANNEL_ERROR/TIMED_OUT/CLOSED kick off a backoff
    // resubscribe. A timeout unblocks join() so a slow connect can't hang the
    // UI — the retry loop keeps healing, and a late SUBSCRIBED still re-tracks.
    await new Promise<void>((resolve) => {
      let settled = false
      const done = () => { if (!settled) { settled = true; resolve() } }
      ch.subscribe((s) => {
        // Ignore late callbacks from a channel a newer subscribe already
        // replaced — otherwise the OLD channel's teardown 'CLOSED' (fired when
        // resubscribe removes it) would schedule a resubscribe of the healthy
        // NEW channel, an endless refresh loop.
        if (ch !== channel) return
        if (s === 'SUBSCRIBED') {
          reconnecting.value = false
          reconnectAttempts = 0
          trackPresence()
          done()
        } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
          scheduleResubscribe()
        }
      })
      setTimeout(done, 8000)
    })
  }

  // Tear down the dead channel and rebuild it (handlers + presence) with backoff.
  function scheduleResubscribe() {
    if (reconnectTimer || resubscribing) return
    reconnecting.value = true
    const delay = Math.min(1000 * 2 ** reconnectAttempts, 15000)
    reconnectAttempts++
    reconnectTimer = setTimeout(() => { reconnectTimer = null; void resubscribe() }, delay)
  }
  async function resubscribe() {
    if (resubscribing || !token.value || status.value === 'ended' || status.value === 'denied') return
    resubscribing = true
    try {
      if (channel) {
        try { await supabase.removeChannel(channel) } catch { /* ignore */ }
        channel = null
      }
      await subscribe(token.value)
      // Push fresh ICE over the healed socket for every live peer, and rebuild
      // any that died while signaling was down.
      if (amAdmitted.value) {
        for (const entry of peers.values()) {
          entry.restartedIce = false
          try { entry.pc.restartIce() } catch { /* ignore */ }
        }
        reconcilePeers()
      }
    } finally {
      resubscribing = false
      // The error that fired during subscribe() above was suppressed by the
      // resubscribing guard, so if the rebuilt channel didn't actually join,
      // queue another attempt — otherwise it could stay dead until a user event.
      // (status.value can change across the awaits above; String() sidesteps the
      // early-return guard's stale narrowing so TS doesn't flag the compare.)
      const st = String(status.value)
      if (st !== 'ended' && st !== 'denied' &&
          (!channel || channel.state !== REALTIME_CHANNEL_STATES.joined)) {
        scheduleResubscribe()
      }
    }
  }
  function maybeReconnect() {
    if (!token.value || status.value === 'ended' || status.value === 'denied') return
    // Act ONLY on a genuinely dead channel. 'joining'/'leaving' are transient
    // and realtime-js runs its own socket reconnect, so don't pile on (that
    // turned tab-focus into a resubscribe storm).
    if (!channel || channel.state === REALTIME_CHANNEL_STATES.closed || channel.state === REALTIME_CHANNEL_STATES.errored) {
      scheduleResubscribe()
    }
  }
  function onVisReconnect() { if (typeof document !== 'undefined' && !document.hidden) maybeReconnect() }
  function addReconnectListeners() {
    if (reconnectListenersAdded || typeof window === 'undefined') return
    reconnectListenersAdded = true
    window.addEventListener('online', maybeReconnect)
    document.addEventListener('visibilitychange', onVisReconnect)
  }
  function removeReconnectListeners() {
    if (!reconnectListenersAdded || typeof window === 'undefined') return
    reconnectListenersAdded = false
    window.removeEventListener('online', maybeReconnect)
    document.removeEventListener('visibilitychange', onVisReconnect)
  }
  // Safety net for the case onPresence can't catch: a peer dies (NAT rebind,
  // blip) while everyone stays in presence, so no presence event fires to
  // rebuild it. Reconcile periodically while live.
  function startReconcileTimer() {
    if (reconcileTimer) return
    reconcileTimer = setInterval(() => {
      if (status.value !== 'live' || !amAdmitted.value) return
      void rpcHeartbeat() // keep my DB row fresh so the server reaper doesn't drop me
      reconcilePeers()    // safety-net rebuild of a peer that died but is still listed
    }, 10000)
  }

  function trackPresence() {
    if (!channel) return
    void channel.track({
      userId: myId.value,
      name: myName.value,
      role: myRole.value,
      admitted: amAdmitted.value,
      muted: muted.value,
      sharing: sharingScreen.value,
      cam: cameraOn.value,
      hand: handRaised.value,
      micBlocked: myMicBlocked,
      camBlocked: myCamBlocked,
      shareLocked: shareLocked.value,
      epoch: myEpoch,
      since: Date.now(), // heartbeat timestamp — powers freshness dedup + ghost reaping
    } satisfies Participant)
  }
  // Fed by the component's useMediaPermissions watcher. 'denied' = actively
  // blocked (not just an un-enabled optional camera), so it's worth flagging.
  function setPermissionState(mic: string, cam: string) {
    const micB = mic === 'denied'
    const camB = cam === 'denied'
    if (micB === myMicBlocked && camB === myCamBlocked) return
    myMicBlocked = micB
    myCamBlocked = camB
    if (channel) trackPresence()
  }

  function onPresence() {
    if (!channel) return
    const state = channel.presenceState<Participant>()
    const seen = new Map<string, Participant>()
    for (const metas of Object.values(state)) {
      for (const m of metas as unknown as Participant[]) {
        if (!m?.userId) continue
        const cur = seen.get(m.userId)
        // Keep the freshest presence per user (highest join time) so a same-id
        // rejoin resolves to the new session's epoch, not a lingering ghost meta.
        if (!cur || (m.since ?? 0) >= (cur.since ?? 0)) seen.set(m.userId, m)
      }
    }
    online.value = [...seen.values()].filter((p) => {
      if (byed.has(p.userId)) return false
      if (p.userId === myId.value) return true
      // Shown via presence; hidden only if the DB explicitly reaped them.
      return !reaped.has(p.userId)
    })
    // Remote cam/screen tiles are added/removed AUTHORITATIVELY by the 'media'
    // announcement (classifyVideo removes when ms.cam/screen turns null), the
    // track 'ended' event, and closePeer on leave. We deliberately do NOT reap
    // them off the presence cam/sharing flag: presence propagates slower than the
    // media broadcast + the track, so reaping on a momentarily-stale flag tore
    // down a just-enabled camera ("opens then immediately closes for the peer").
    if (amAdmitted.value) {
      playPresenceSounds()
      reconcilePeers()
    }
  }
  // ── Authoritative DB roster (presence ∩ dbMembers) ──────────────────────────
  function applyRosterRow(uid: string | undefined, present: boolean) {
    if (!uid) return
    const id = dbId(uid)
    // Only re-render when membership actually flips. A 10s heartbeat UPDATE that
    // doesn't change `reaped` must NOT churn onPresence (that was constantly
    // re-running and reaping live media). A new joiner appears via their presence
    // 'join' event, not here.
    if (present) { if (reaped.delete(id)) onPresence() }       // un-suppress a rejoiner
    else if (!reaped.has(id)) { reaped.add(id); onPresence() } // suppress a reaped/left peer
  }
  async function refreshRoster(roomId: string) {
    // On (re)subscribe, reconcile against the authoritative list: anyone present
    // but absent from the DB was reaped (possibly while we were offline) → hide;
    // anyone in the DB → show. postgres_changes streams only future deltas, so
    // this re-SELECT is what catches reaps missed during a blip.
    const { data } = await supabase
      .from('meeting_participants').select('user_id').eq('room_id', roomId)
    const dbSet = new Set((data ?? []).map((r: { user_id: string }) => dbId(r.user_id)))
    reaped.clear()
    if (channel) {
      const state = channel.presenceState<Participant>()
      for (const metas of Object.values(state)) {
        for (const m of metas as unknown as Participant[]) {
          if (m?.userId && m.userId !== myId.value && !dbSet.has(m.userId)) reaped.add(m.userId)
        }
      }
    }
    onPresence()
  }
  async function subscribeRoster(roomId: string) {
    if (rosterChannel) {
      try { await supabase.removeChannel(rosterChannel) } catch { /* ignore */ }
      rosterChannel = null
    }
    const ch = supabase.channel(`meet-roster:${roomId}`)
    ch.on(
      'postgres_changes',
      { event: '*', schema: 'buzzybee', table: 'meeting_participants', filter: `room_id=eq.${roomId}` } as any,
      (p: any) => {
        if (p.eventType === 'DELETE') applyRosterRow(p.old?.user_id, false)
        else applyRosterRow(p.new?.user_id, true)
      },
    )
    rosterChannel = ch
    // Re-sync the full set on every (re)join — postgres_changes only streams future
    // deltas, so a reconnect must re-SELECT to catch reaps missed while offline.
    ch.subscribe((s) => { if (s === 'SUBSCRIBED') void refreshRoster(roomId) })
  }
  // RPC wrappers (token-gated, guest-safe). Pass myId.value as the raw id; the RPC
  // namespaces guests to 'guest:<id>' and pins members to auth.uid().
  // NB: a Supabase rpc() builder is LAZY — it only fires the request when then()/
  // await runs. These wrappers .then() so callers can fire-and-forget AND so any
  // error surfaces (silent 'void rpc()' was the no-row bug).
  // Durable record (meeting_messages): chat + join lines survive the call so
  // the host can review the transcript + attendance from /app/meetings.
  // Fire-and-forget — a failed write must never break the live call.
  function persistMessage(kind: 'text' | 'system', body: string) {
    return supabase.rpc('meeting_post_message', {
      p_token: token.value, p_user_id: myId.value, p_name: myName.value,
      p_kind: kind, p_body: body, p_file: null,
    }).then(({ error }) => { if (error) console.warn('[meet] meeting_post_message', error.message) },
            (e: unknown) => console.warn('[meet] meeting_post_message', e))
  }
  // One join line per page session (a reload that rejoins logs again — true).
  let joinLogged = false
  function rpcJoin(admitted: boolean) {
    return supabase.rpc('meeting_join', {
      p_token: token.value, p_user_id: myId.value, p_name: myName.value, p_role: myRole.value, p_admitted: admitted,
    }).then(({ error }) => {
      if (error) console.error('[meet] meeting_join', error.message)
      else if (admitted && !joinLogged) {
        joinLogged = true
        void persistMessage('system', 'joined the meeting')
      }
    }, (e: unknown) => console.error('[meet] meeting_join', e))
  }
  function rpcHeartbeat() {
    return supabase.rpc('meeting_heartbeat', {
      p_token: token.value, p_user_id: myId.value,
      p_muted: muted.value, p_cam: cameraOn.value, p_sharing: sharingScreen.value, p_hand: handRaised.value,
    }).then(({ error }) => { if (error) console.error('[meet] meeting_heartbeat', error.message) },
            (e: unknown) => console.error('[meet] meeting_heartbeat', e))
  }
  function rpcLeave() {
    return supabase.rpc('meeting_leave', { p_token: token.value, p_user_id: myId.value })
      .then(({ error }) => { if (error) console.error('[meet] meeting_leave', error.message) },
            (e: unknown) => console.error('[meet] meeting_leave', e))
  }
  // Was this guest already admitted in a prior session? (Their DB row persists
  // across a reload; the host's admit set admitted=true.) Members never reach
  // this — they bypass the lobby.
  async function isAlreadyAdmitted(roomId: string): Promise<boolean> {
    try {
      const { data } = await supabase
        .from('meeting_participants').select('admitted')
        .eq('room_id', roomId).eq('user_id', `guest:${myId.value}`).maybeSingle()
      return !!(data as { admitted?: boolean } | null)?.admitted
    } catch { return false }
  }
  // Diff this presence update against the last to fire sound cues. One sound per
  // category per update (no overlap spam when several people change at once).
  function playPresenceSounds() {
    const admitted = new Set<string>()
    const waiting = new Set<string>()
    const hands = new Set<string>()
    for (const p of online.value) {
      if (p.userId === myId.value) continue
      if (p.admitted) { admitted.add(p.userId); if (p.hand) hands.add(p.userId) }
      else waiting.add(p.userId)
    }
    if (soundsArmed) {
      let joined = false, left = false, knocked = false, raised = false
      for (const id of admitted) if (!prevAdmittedIds.has(id)) joined = true
      for (const id of prevAdmittedIds) if (!admitted.has(id)) left = true
      if (canAdmit.value) for (const id of waiting) if (!prevWaitingIds.has(id)) knocked = true
      for (const id of hands) if (!prevHandIds.has(id)) raised = true
      if (knocked) meetSounds.knock()
      if (joined) meetSounds.join()
      if (left) meetSounds.leave()
      if (raised) meetSounds.hand()
    }
    prevAdmittedIds = admitted
    prevWaitingIds = waiting
    prevHandIds = hands
    soundsArmed = true
  }

  // ── Lobby control ─────────────────────────────────────────────────────────
  function sendCtrl(type: string, to?: string) {
    broadcast(channel, 'ctrl', { type, to, from: myId.value })
  }
  function onCtrl(p: any) {
    if (!p) return
    // Honor destructive host-authority commands ONLY from the verified room host
    // (host_id from the DB), so a tampered client can't impersonate the host to
    // end / mute / kick. admit/deny stay open to host + members (worst case a
    // griefer admits a waiting guest, which the host can then remove). Real
    // role enforcement is server-side and will land with the ERP's auth.
    const HOST_CMDS = new Set(['ended', 'mute-all', 'force-mute', 'force-cam-off', 'force-stop-share', 'kick', 'lower-hand'])
    if (HOST_CMDS.has(p.type) && p.from !== room.value?.host_id) return
    if (p.type === 'ended') {
      status.value = 'ended'
      if (myRole.value === 'guest') forgetGuestId() // meeting's over — fresh token next visit
      teardownMedia()
      return
    }
    // Global host command — applies to everyone but the host, no single target.
    if (p.type === 'mute-all') {
      if (!isHost.value) { forceMuteSelf(); notify('The host muted everyone') }
      return
    }
    // A participant announced they're leaving — drop them now (tile + peer)
    // instead of waiting on Supabase's presence-leave. Self-reported (the leaver
    // is p.from), so no host gating; if it's a spoof, the next presence sync
    // re-adds them once `byed` clears. The leave sound still fires via the
    // presence-leave that follows.
    if (p.type === 'bye') {
      const uid = p.from
      if (uid && uid !== myId.value) {
        byed.add(uid)
        closePeer(uid)
        online.value = online.value.filter((o) => o.userId !== uid)
        setTimeout(() => byed.delete(uid), 3000)
      }
      return
    }
    if (p.to !== myId.value) return
    if (p.type === 'admit' && !amAdmitted.value) { meetSounds.admitted(); void goLive() }
    else if (p.type === 'deny') {
      status.value = 'denied'
      leave(true) // removed by host — forget the token
    } else if (p.type === 'kick') {
      notify('The host removed you from the meeting')
      leave(true) // removed by host — forget the token
      status.value = 'ended'
    } else if (p.type === 'force-mute') {
      forceMuteSelf()
      notify('The host muted you')
    } else if (p.type === 'force-cam-off') {
      if (cameraOn.value) { disableCamera(); notify('The host turned your camera off') }
    } else if (p.type === 'force-stop-share') {
      if (sharingScreen.value) { stopScreenShare(); notify('The host stopped your screen share') }
    } else if (p.type === 'lower-hand') {
      if (handRaised.value) { handRaised.value = false; trackPresence() }
    }
  }
  function admit(userId: string) {
    if (!canAdmit.value) return
    if (roomFull.value) { notify(`Room is full (max ${MAX_PARTICIPANTS})`); return }
    sendCtrl('admit', userId)
  }
  function deny(userId: string) {
    if (!canAdmit.value) return
    sendCtrl('deny', userId)
  }

  // ── Host moderation ───────────────────────────────────────────────────────
  function notify(msg: string) {
    hostNotice.value = msg
    if (noticeTimer) clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => { hostNotice.value = null }, 4500)
  }
  // Force my own mic off because a host told me to. One-way: a host can mute you,
  // but only you can unmute yourself.
  function forceMuteSelf() {
    if (muted.value) return
    muted.value = true
    ;(rawStream ?? localStream)?.getAudioTracks().forEach((t) => (t.enabled = false))
    trackPresence()
  }
  // Host → one participant.
  function muteParticipant(uid: string) { if (isHost.value && uid !== myId.value) sendCtrl('force-mute', uid) }
  function turnOffParticipantCam(uid: string) { if (isHost.value && uid !== myId.value) sendCtrl('force-cam-off', uid) }
  function stopParticipantShare(uid: string) { if (isHost.value && uid !== myId.value) sendCtrl('force-stop-share', uid) }
  function lowerParticipantHand(uid: string) { if (isHost.value && uid !== myId.value) sendCtrl('lower-hand', uid) }
  function removeParticipant(uid: string) { if (isHost.value && uid !== myId.value) sendCtrl('kick', uid) }
  // Host → everyone but the host.
  function muteEveryone() { if (isHost.value) sendCtrl('mute-all') }
  function toggleShareLock() {
    if (!isHost.value) return
    shareLocked.value = !shareLocked.value
    trackPresence()
  }
  // A non-host presenting when the host locks sharing gets stopped.
  watch(roomShareLocked, (locked) => {
    if (locked && !isHost.value && sharingScreen.value) stopScreenShare()
  })

  async function goLive() {
    // Don't over-fill the mesh. Excludes me (I may not be in presence yet); only
    // blocks once presence actually shows a full room, so an empty-presence join
    // isn't falsely rejected. Best-effort — the host-side admit cap is the real
    // gate for guests; authoritative enforcement belongs server-side.
    if (admittedPeople.value.filter((p) => p.userId !== myId.value).length >= MAX_PARTICIPANTS) {
      status.value = 'denied'
      error.value = `This room is full (max ${MAX_PARTICIPANTS}).`
      return
    }
    amAdmitted.value = true
    status.value = 'live'
    startReconcileTimer()
    void rpcJoin(true) // record me as admitted in the authoritative DB roster
    meetSounds.unlock()
    try {
      await ensureLocalStream()
    } catch {
      error.value = 'Microphone access is needed to join.'
    }
    // amAdmitted flipped before the mic existed, so offers arriving while the
    // permission prompt was up minted peers with NO audio track — they
    // negotiate fine and carry silence ("muted but not muted"). Back-fill the
    // mic onto every trackless peer; addTrack renegotiates automatically.
    const mic = localStream?.getAudioTracks()[0]
    if (mic && localStream) {
      for (const entry of peers.values()) {
        const hasAudio = entry.pc.getSenders().some((s) => s.track?.kind === 'audio')
        if (!hasAudio) entry.pc.addTrack(mic, localStream)
      }
    }
    trackPresence()
    reconcilePeers()
    if (startCameraOnLive) {
      startCameraOnLive = false
      await enableCamera()
    }
  }

  async function endMeeting() {
    if (myRole.value !== 'host' || !room.value) return
    try {
      await supabase.from('meeting_rooms').update({ ended_at: new Date().toISOString() }).eq('id', room.value.id)
    } catch { /* best effort */ }
    sendCtrl('ended')
    status.value = 'ended'
    teardownMedia()
  }

  // ── Media (mic + RNNoise) ───────────────────────────────────────────────────
  async function ensureLocalStream() {
    if (localStream) return localStream
    const deviceId =
      typeof window !== 'undefined' ? window.localStorage.getItem('buzzybee.comms.mic-device') : null
    const audio: MediaTrackConstraints = { echoCancellation: true, autoGainControl: true, noiseSuppression: false }
    if (deviceId) audio.deviceId = { exact: deviceId }
    try {
      rawStream = await navigator.mediaDevices.getUserMedia({ audio, video: false })
    } catch {
      rawStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    }
    // Apply mute the instant the mic exists — before the (async) RNNoise build or
    // adding the track to any peer — so "join muted" never leaves a hot mic open
    // during the pipeline-build window. Re-applied below in case mute toggled mid-build.
    rawStream.getAudioTracks().forEach((t) => (t.enabled = !muted.value))
    nsPipeline = await createNoisePipeline(rawStream, noiseSuppression.value)
    rnnoiseActive.value = !!nsPipeline
    localStream = nsPipeline ? nsPipeline.stream : rawStream
    rawStream.getAudioTracks().forEach((t) => (t.enabled = !muted.value))
    setupAnalyser(myId.value, localStream)
    return localStream
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
    } catch { /* best effort */ }
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
        if (Math.sqrt(sum / buf.length) > 0.045 && !(uid === myId.value && muted.value)) next.add(uid)
      }
      const changed = next.size !== speaking.value.size || [...next].some((u) => !speaking.value.has(u))
      if (changed) speaking.value = next
    }
    speakingRaf = requestAnimationFrame(tick)
  }

  // ── WebRTC mesh (perfect negotiation) ────────────────────────────────────────
  function sendRtc(to: string, kind: string, data: unknown) {
    broadcast(channel, 'rtc', { from: myId.value, to, kind, data })
  }
  // Single offer path so the renegotiation re-arm has one place to flush from.
  // Argumentless setLocalDescription would build a wrong-type SDP mid-
  // negotiation, so if we're not stable we PARK the need and re-fire it from
  // onsignalingstatechange once the connection settles — a mid-call addTrack
  // (camera/screen/mic back-fill) can therefore never be silently dropped.
  async function makeOffer(userId: string) {
    const entry = peers.get(userId)
    if (!entry) return
    const pc = entry.pc
    if (pc.signalingState !== 'stable') { entry.renegotiatePending = true; return }
    try {
      entry.makingOffer = true
      await pc.setLocalDescription()
      sendRtc(userId, 'desc', pc.localDescription)
    } catch { /* ignore */ } finally {
      entry.makingOffer = false
    }
  }
  function getPeer(userId: string): PeerEntry {
    const existing = peers.get(userId)
    if (existing) return existing
    const pc = new RTCPeerConnection({ iceServers: ICE })
    const entry: PeerEntry = {
      pc,
      pendingIce: [],
      confirmed: false,
      makingOffer: false,
      ignoreOffer: false,
      polite: myId.value > userId,
    }
    peers.set(userId, entry)

    localStream?.getTracks().forEach((t) => pc.addTrack(t, localStream!))
    if (screenStream) {
      const vt = screenStream.getVideoTracks()[0]
      if (vt) {
        entry.screenSender = pc.addTrack(vt, screenStream)
        preferH264(pc, entry.screenSender)
        void tuneScreenSender(entry.screenSender)
      }
    }
    if (cameraStream) {
      const ct = cameraStream.getVideoTracks()[0]
      if (ct) {
        entry.camSender = pc.addTrack(ct, cameraStream)
        preferH264(pc, entry.camSender)
        void tuneCamSender(entry.camSender)
      }
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) sendRtc(userId, 'ice', e.candidate.toJSON())
    }
    pc.onnegotiationneeded = () => void makeOffer(userId)
    // Re-arm: flush a renegotiation that was parked while non-stable once the
    // connection settles back to stable.
    pc.onsignalingstatechange = () => {
      if (pc.signalingState === 'stable' && entry.renegotiatePending) {
        entry.renegotiatePending = false
        void makeOffer(userId)
      }
    }
    pc.ontrack = (e) => {
      if (e.track.kind === 'video') {
        const stream = e.streams[0]
        if (stream) {
          pendingVideo.set(stream.id, { userId, stream })
          e.track.addEventListener('ended', () => dropVideoStream(userId, stream.id))
          classifyVideo(userId)
          // Still parked → announcement missed/raced; ask the sender to resend.
          if (pendingVideo.has(stream.id)) requestMedia(userId)
        }
      } else {
        let el = entry.audioEl
        if (!el) {
          el = document.createElement('audio')
          el.autoplay = true
          ;(el as any).playsInline = true
          document.body.appendChild(el)
          entry.audioEl = el
        }
        el.srcObject = e.streams[0]
        void el.play().catch(() => {})
        if (!analysers.has(userId)) setupAnalyser(userId, e.streams[0])
      }
    }
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState
      if (st === 'connected') { entry.restartedIce = false; return }
      if (st === 'closed') { closePeer(userId); return }
      if (st === 'failed') {
        // Try one in-place ICE restart before tearing down — recovers NAT
        // rebinds / TURN hiccups without waiting for a roster change. If it
        // doesn't recover, drop it; the safety-net reconcile rebuilds a fresh pc.
        if (!entry.restartedIce) {
          entry.restartedIce = true
          try { pc.restartIce() } catch { /* unsupported */ }
          setTimeout(() => {
            if (peers.get(userId) === entry && pc.connectionState === 'failed') {
              notePeerFailed()
              closePeer(userId)
            }
          }, 4000)
        } else {
          notePeerFailed()
          closePeer(userId)
        }
      }
    }
    return entry
  }
  function reconcilePeers() {
    if (!amAdmitted.value) return
    const epochs = new Map(admittedPeople.value.map((p) => [p.userId, p.epoch]))
    const wanted = new Set(admittedPeople.value.map((p) => p.userId).filter((u) => u !== myId.value))
    let addedPeer = false
    for (const uid of wanted) {
      const ex = peers.get(uid)
      const ep = epochs.get(uid)
      // Recycle a stale connection so getPeer doesn't reuse a dead pc: the peer
      // rejoined (epoch changed) or the connection already died. This is what
      // makes a rejoin reconnect instantly instead of waiting out the ICE timeout.
      // Recycle a peer only on a rejoin (epoch changed) or a fully 'closed' pc.
      // 'failed' is handled by onconnectionstatechange (restartIce + grace), so
      // closing it here would race that recovery and cause reconnect churn.
      if (ex && ((ep && ex.epoch && ep !== ex.epoch) || ex.pc.connectionState === 'closed')) {
        closePeer(uid)
      }
      if (!peers.has(uid)) addedPeer = true
      const e = getPeer(uid)
      e.confirmed = true
      e.epoch = ep
    }
    // A new peer needs to learn which of my video streams is cam vs screen.
    if (addedPeer && (cameraOn.value || sharingScreen.value)) announceMedia()
    for (const uid of [...peers.keys()]) {
      if (wanted.has(uid)) continue
      // A joiner's offer can outrun their presence join — only reap peers
      // presence has CONFIRMED and then dropped, or a stray heartbeat sync
      // kills the connection mid-negotiation. Unconfirmed ghosts die via
      // connectionState 'failed' if their owner never shows.
      if (peers.get(uid)?.confirmed) closePeer(uid)
    }
  }
  async function handleSignal(p: any) {
    if (!p || p.to !== myId.value || !amAdmitted.value) return
    const entry = getPeer(p.from as string)
    const pc = entry.pc
    try {
      if (p.kind === 'desc') {
        const desc = p.data as RTCSessionDescriptionInit
        const collision = desc.type === 'offer' && (entry.makingOffer || pc.signalingState !== 'stable')
        entry.ignoreOffer = !entry.polite && collision
        if (entry.ignoreOffer) return
        // Accepting a COLLIDING offer (we're the polite peer here) implicitly
        // rolls back OUR in-flight offer, so our just-added tracks (e.g. a camera)
        // drop out of negotiation. Re-arm so onsignalingstatechange re-offers them
        // once we're stable again — some browsers don't re-fire negotiationneeded
        // after a rollback, which is what stranded a late-joiner's second camera.
        if (collision) entry.renegotiatePending = true
        await pc.setRemoteDescription(desc)
        // Flush candidates that raced ahead of the description — dropping them
        // is an intermittent one-way-audio generator on stricter NATs.
        while (entry.pendingIce.length) {
          const c = entry.pendingIce.shift()!
          try {
            await pc.addIceCandidate(c)
          } catch { /* aborted negotiation — harmless */ }
        }
        if (desc.type === 'offer') {
          await pc.setLocalDescription()
          sendRtc(p.from, 'desc', pc.localDescription)
        }
      } else if (p.kind === 'ice') {
        // Broadcast gives no ordering guarantee vs. 'desc' — park early
        // candidates instead of letting addIceCandidate throw them away.
        if (!pc.remoteDescription) {
          entry.pendingIce.push(p.data as RTCIceCandidateInit)
          return
        }
        try {
          await pc.addIceCandidate(p.data)
        } catch (e) {
          if (!entry.ignoreOffer) throw e
        }
      }
    } catch { /* ignore */ }
  }

  // ── Screen share ──────────────────────────────────────────────────────────
  async function tuneScreenSender(sender: RTCRtpSender) {
    try {
      const params = sender.getParameters()
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}]
      params.encodings[0].maxBitrate = 2_500_000
      params.encodings[0].scaleResolutionDownBy = 1
      await sender.setParameters(params)
    } catch { /* unsupported */ }
  }

  // iOS Safari decodes H.264 in hardware but VP8 only in software — under mesh
  // load that fails silently → black remote video while (Opus) audio is fine.
  // Chrome defaults to VP8, so force H.264 first on every video transceiver we
  // send, before negotiation, so Chrome↔iOS legs don't pick VP8.
  function preferH264(pc: RTCPeerConnection, sender?: RTCRtpSender) {
    try {
      const caps = (RTCRtpReceiver as any).getCapabilities?.('video') as RTCRtpCapabilities | undefined
      if (!caps?.codecs?.length) return
      const h264 = caps.codecs.filter((c) => /h264/i.test(c.mimeType))
      if (!h264.length) return
      const ordered = [...h264, ...caps.codecs.filter((c) => !/h264/i.test(c.mimeType))]
      const tr = pc.getTransceivers().find((t) => t.sender === sender)
      if (tr && 'setCodecPreferences' in tr) {
        try { (tr as any).setCodecPreferences(ordered) } catch { /* invalid order */ }
      }
    } catch { /* getCapabilities unsupported */ }
  }
  function removeRemoteScreen(userId: string) {
    if (!remoteScreens.value[userId]) return
    const next = { ...remoteScreens.value }
    delete next[userId]
    remoteScreens.value = next
  }
  async function startScreenShare() {
    if (!amAdmitted.value || sharingScreen.value) return
    if (!isHost.value && roomShareLocked.value) { notify('The host has locked screen sharing'); return }
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 30 } },
        audio: false,
      })
    } catch {
      return
    }
    const track = screenStream.getVideoTracks()[0]
    if (!track) return
    if ('contentHint' in track) (track as any).contentHint = 'detail'
    sharingScreen.value = true
    localScreen.value = screenStream
    for (const entry of peers.values()) {
      entry.screenSender = entry.pc.addTrack(track, screenStream)
      preferH264(entry.pc, entry.screenSender)
      void tuneScreenSender(entry.screenSender)
    }
    track.addEventListener('ended', () => stopScreenShare())
    announceMedia()
    trackPresence()
  }
  function stopScreenShare() {
    if (!sharingScreen.value && !screenStream) return
    for (const entry of peers.values()) {
      if (entry.screenSender) {
        try { entry.pc.removeTrack(entry.screenSender) } catch { /* ignore */ }
        entry.screenSender = undefined
      }
    }
    screenStream?.getTracks().forEach((t) => t.stop())
    screenStream = null
    localScreen.value = null
    sharingScreen.value = false
    announceMedia()
    trackPresence()
  }
  function toggleScreenShare() {
    if (sharingScreen.value) stopScreenShare()
    else void startScreenShare()
  }

  // ── Camera ────────────────────────────────────────────────────────────────
  function removeRemoteCamera(userId: string) {
    if (!remoteCameras.value[userId]) return
    const next = { ...remoteCameras.value }
    delete next[userId]
    remoteCameras.value = next
  }

  // Broadcast which of my stream ids is the camera vs the screen. Full state
  // (not deltas) so a single latest message is enough even if one is missed.
  function announceMedia() {
    broadcast(channel, 'media', {
      from: myId.value,
      cam: cameraStream?.id ?? null,
      screen: screenStream?.id ?? null,
    })
  }
  function onMedia(p: any) {
    if (!p || p.from === myId.value) return
    mediaState.set(p.from, { cam: p.cam ?? null, screen: p.screen ?? null })
    classifyVideo(p.from)
  }
  // Receiver asks a peer to (re)announce its cam/screen ids when it's holding
  // video it can't classify yet (the 'media' broadcast was missed or raced the
  // track). Makes classification self-healing instead of fire-and-forget.
  function requestMedia(userId: string) {
    broadcast(channel, 'media-req', { from: myId.value, to: userId })
  }
  function onMediaReq(p: any) {
    if (!p || p.to !== myId.value) return
    announceMedia()
  }
  // Match this user's parked video streams against their announced ids, and
  // drop any role they've turned off.
  function classifyVideo(userId: string) {
    const ms = mediaState.get(userId)
    for (const [sid, rec] of [...pendingVideo]) {
      if (rec.userId !== userId) continue
      if (ms?.cam === sid) {
        remoteCameras.value = { ...remoteCameras.value, [userId]: rec.stream }
        pendingVideo.delete(sid)
      } else if (ms?.screen === sid) {
        remoteScreens.value = { ...remoteScreens.value, [userId]: rec.stream }
        pendingVideo.delete(sid)
      }
    }
    if (ms && ms.cam == null && remoteCameras.value[userId]) removeRemoteCamera(userId)
    if (ms && ms.screen == null && remoteScreens.value[userId]) removeRemoteScreen(userId)
  }
  function dropVideoStream(userId: string, streamId: string) {
    pendingVideo.delete(streamId)
    if (remoteCameras.value[userId]?.id === streamId) removeRemoteCamera(userId)
    if (remoteScreens.value[userId]?.id === streamId) removeRemoteScreen(userId)
  }

  // Shrink capture + send bitrate as the call grows so the mesh upload stays
  // sane (each camera is sent once per other participant). Sized at enable
  // time — good enough for the 2–8 range this room targets.
  function camConstraints(): MediaTrackConstraints {
    const n = admittedPeople.value.length
    const base: MediaTrackConstraints =
      n >= 6 ? { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 20, max: 24 } }
      : n >= 4 ? { width: { ideal: 480 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 30 } }
      : { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } }
    // Default to the selfie cam on phones/tablets.
    base.facingMode = { ideal: cameraFacing }
    return base
  }
  async function tuneCamSender(sender: RTCRtpSender) {
    try {
      const params = sender.getParameters()
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}]
      const n = admittedPeople.value.length
      params.encodings[0].maxBitrate = n >= 6 ? 250_000 : n >= 4 ? 400_000 : 600_000
      await sender.setParameters(params)
    } catch { /* unsupported */ }
  }
  function persistBg(m: BgMode) {
    try { window.localStorage.setItem('buzzybee.comms.bg', m) } catch { /* ignore */ }
  }
  async function enableCamera() {
    if (!amAdmitted.value || cameraOn.value || camBusy) return
    camBusy = true
    const gen = camGen
    let raw: MediaStream | null = null
    let pipe: VideoBackground | null = null
    let committed = false
    try {
      try {
        const deviceId =
          typeof window !== 'undefined' ? window.localStorage.getItem('buzzybee.comms.cam-device') : null
        const video = camConstraints()
        if (deviceId) video.deviceId = { exact: deviceId }
        raw = await navigator.mediaDevices.getUserMedia({ video, audio: false })
      } catch {
        error.value = 'Camera access was blocked — allow it in your browser to turn your camera on.'
        return
      }
      // Cancelled (left / toggled off) during the permission prompt.
      if (gen !== camGen || !raw) return
      const rawTrack = raw.getVideoTracks()[0]
      if (!rawTrack) return
      // A previously-uploaded image can't survive a reload → fall back to blur.
      if (bgMode.value === 'image' && !bgImageEl) { bgMode.value = 'blur'; persistBg('blur') }
      // Route through the background pipeline if wanted. On failure the pipeline
      // returns null and we send the raw camera.
      let sendTrack = rawTrack
      if (bgMode.value !== 'none') {
        bgLoading.value = true
        pipe = await createVideoBackground(raw, bgMode.value)
        if (gen !== camGen) return // cancelled during init → finally cleans up
        if (pipe) {
          sendTrack = pipe.track
          if (bgMode.value === 'image' && bgImageEl) pipe.setImage(bgImageEl)
        } else { bgMode.value = 'none'; persistBg('none') }
      }
      // ── Commit (no awaits past here) ──
      rawCamStream = raw
      vbg = pipe
      const out = new MediaStream([sendTrack])
      cameraStream = out
      if ('contentHint' in sendTrack) (sendTrack as any).contentHint = 'motion'
      selfMirrored.value = cameraFacing === 'user'
      cameraOn.value = true
      localCamera.value = out
      committed = true
      for (const entry of peers.values()) {
        entry.camSender = entry.pc.addTrack(sendTrack, out)
        preferH264(entry.pc, entry.camSender)
        void tuneCamSender(entry.camSender)
      }
      // Device unplugged / OS revoked the camera → reflect it in the UI.
      rawTrack.addEventListener('ended', () => disableCamera())
      announceMedia()
      trackPresence()
    } finally {
      if (!committed) {
        pipe?.destroy()
        raw?.getTracks().forEach((t) => t.stop())
      }
      bgLoading.value = false
      camBusy = false
    }
  }
  function disableCamera() {
    camGen++ // cancel any in-flight enable / flip / blur-build
    const hadState = cameraOn.value || !!cameraStream || !!rawCamStream || !!vbg
    for (const entry of peers.values()) {
      if (entry.camSender) {
        try { entry.pc.removeTrack(entry.camSender) } catch { /* ignore */ }
        entry.camSender = undefined
      }
    }
    vbg?.destroy()
    vbg = null
    rawCamStream?.getTracks().forEach((t) => t.stop())
    rawCamStream = null
    cameraStream?.getTracks().forEach((t) => t.stop())
    cameraStream = null
    localCamera.value = null
    cameraOn.value = false
    if (hadState) {
      announceMedia()
      trackPresence()
    }
  }
  function toggleCamera() {
    // Treat a tap while an enable is mid-flight as "turn off" — disableCamera
    // bumps camGen so the in-flight enable aborts and stops its stream.
    if (cameraOn.value || camBusy) disableCamera()
    else void enableCamera()
  }
  // Swap the sent camera track on every peer without renegotiating (same msid),
  // and inside the stable cameraStream so the announced id holds. localCamera
  // gets a fresh object so the self-preview <video> re-binds to the new track.
  function swapCameraTrack(newTrack: MediaStreamTrack) {
    if (!cameraStream) return
    for (const entry of peers.values()) {
      if (entry.camSender) {
        try { void entry.camSender.replaceTrack(newTrack) } catch { /* ignore */ }
      }
    }
    const old = cameraStream.getVideoTracks()[0]
    if (old && old !== newTrack) cameraStream.removeTrack(old)
    if (!cameraStream.getVideoTracks().includes(newTrack)) cameraStream.addTrack(newTrack)
    if ('contentHint' in newTrack) (newTrack as any).contentHint = 'motion'
    localCamera.value = new MediaStream([newTrack])
  }
  // Toggle background blur live. Builds/destroys the segmentation pipeline and
  // swaps the sent track — the raw track keeps feeding the pipeline as its
  // source, so it's never stopped while blur is on.
  async function setBackground(mode: BgMode) {
    bgMode.value = mode
    persistBg(mode)
    if (!cameraOn.value || !rawCamStream || !cameraStream) return // applies next enable
    if (mode === 'none') {
      if (vbg) {
        const raw = rawCamStream.getVideoTracks()[0]
        if (raw) swapCameraTrack(raw)
        vbg.destroy()
        vbg = null
      }
      return
    }
    if (!vbg) {
      // Build the pipeline once; switching effects afterwards is just setMode.
      if (bgBusy) return
      bgBusy = true
      bgLoading.value = true
      const gen = camGen
      try {
        const pipe = await createVideoBackground(rawCamStream, mode)
        // Cancelled, camera turned off, or toggled back to none meanwhile.
        if (gen !== camGen || !cameraOn.value || bgMode.value === 'none' || !rawCamStream) {
          pipe?.destroy()
          return
        }
        if (!pipe) { bgMode.value = 'none'; persistBg('none'); return }
        vbg = pipe
        vbg.setMode(bgMode.value) // honour the latest mode if it changed mid-build
        if (bgMode.value === 'image' && bgImageEl) vbg.setImage(bgImageEl)
        swapCameraTrack(vbg.track)
      } finally {
        bgBusy = false
        bgLoading.value = false
      }
    } else {
      vbg.setMode(mode)
      if (mode === 'image' && bgImageEl) vbg.setImage(bgImageEl)
    }
  }
  // Load an image (preset data-URL or uploaded blob URL) and switch to image
  // mode. The decoded image is kept; the caller owns the blob URL's lifetime.
  async function setBackgroundImage(src: string) {
    const img = new Image()
    img.src = src
    try { await img.decode() } catch { return }
    bgImageEl = img
    bgImageUrl.value = src
    await setBackground('image')
  }
  // Flip front/back camera (mobile). With blur on, re-point the pipeline's
  // source (the sent processed track is unchanged). Without blur, swap the raw
  // track on every sender via replaceTrack (same msid — no renegotiation).
  async function flipCamera() {
    if (!cameraOn.value || !rawCamStream || flipBusy) return
    flipBusy = true
    const gen = camGen
    const next = cameraFacing === 'user' ? 'environment' : 'user'
    let stream: MediaStream | null = null
    try {
      try {
        const video = camConstraints()
        video.facingMode = { ideal: next }
        stream = await navigator.mediaDevices.getUserMedia({ video, audio: false })
      } catch {
        return
      }
      // Cancelled (left / camera off) during the prompt → finally stops stream.
      if (gen !== camGen || !cameraOn.value || !rawCamStream || !stream) return
      const newTrack = stream.getVideoTracks()[0]
      if (!newTrack) return
      if ('contentHint' in newTrack) (newTrack as any).contentHint = 'motion'
      cameraFacing = next
      selfMirrored.value = next === 'user'
      const oldRaw = rawCamStream
      if (vbg) vbg.setSource(stream)
      else swapCameraTrack(newTrack)
      rawCamStream = stream
      stream = null // committed — don't stop it in finally
      oldRaw.getTracks().forEach((t) => t.stop())
      newTrack.addEventListener('ended', () => disableCamera())
    } finally {
      stream?.getTracks().forEach((t) => t.stop())
      flipBusy = false
    }
  }

  // ── Controls ────────────────────────────────────────────────────────────────
  function toggleMute() {
    muted.value = !muted.value
    ;(rawStream ?? localStream)?.getAudioTracks().forEach((t) => (t.enabled = !muted.value))
    trackPresence()
  }
  function toggleHand() {
    handRaised.value = !handRaised.value
    if (handRaised.value) meetSounds.hand() // immediate feedback for the raiser
    trackPresence()
  }
  function toggleSounds() {
    soundsOn.value = !soundsOn.value
    meetSounds.setEnabled(soundsOn.value)
    meetSounds.unlock()
    if (soundsOn.value) meetSounds.hand() // confirm it's on
  }

  // ── In-call chat + reactions ──────────────────────────────────────────────
  // Broadcast is self:false, so the sender appends locally before sending.
  function sendChat(text: string) {
    const t = text.trim()
    if (!t || !channel) return
    const msg: MeetingChatMsg = { from: myId.value, name: myName.value, text: t, at: Date.now() }
    chat.value = [...chat.value, msg]
    broadcast(channel, 'chat', msg)
    // In-call chat stays broadcast-driven (ephemeral UX); the durable copy
    // feeds the post-meeting transcript.
    void persistMessage('text', t)
  }
  function launchReaction(emoji: string) {
    const id = Math.random().toString(36).slice(2)
    reactions.value = [...reactions.value, { id, emoji, x: 15 + Math.random() * 70 }]
    window.setTimeout(() => {
      reactions.value = reactions.value.filter((r) => r.id !== id)
    }, 2600)
  }
  function sendReaction(emoji: string) {
    launchReaction(emoji)
    broadcast(channel, 'react', { emoji })
  }
  function toggleNoise() {
    noiseSuppression.value = !noiseSuppression.value
    if (typeof window !== 'undefined')
      window.localStorage.setItem('buzzybee.comms.noise-suppression', noiseSuppression.value ? '1' : '0')
    nsPipeline?.setEnabled(noiseSuppression.value)
  }

  function closePeer(userId: string) {
    const e = peers.get(userId)
    if (!e) return
    try { e.pc.close() } catch { /* ignore */ }
    if (e.audioEl) {
      e.audioEl.srcObject = null
      e.audioEl.remove()
    }
    removeRemoteCamera(userId)
    removeRemoteScreen(userId)
    mediaState.delete(userId)
    for (const [sid, rec] of [...pendingVideo]) if (rec.userId === userId) pendingVideo.delete(sid)
    analysers.delete(userId)
    peers.delete(userId)
  }

  function teardownMedia() {
    camGen++ // abort any in-flight enable/flip/blur-build
    stopScreenShare()
    vbg?.destroy()
    vbg = null
    bgImageUrl.value = null
    bgImageEl = null
    rawCamStream?.getTracks().forEach((t) => t.stop())
    rawCamStream = null
    cameraStream?.getTracks().forEach((t) => t.stop())
    cameraStream = null
    localCamera.value = null
    cameraOn.value = false
    remoteScreens.value = {}
    remoteCameras.value = {}
    mediaState.clear()
    pendingVideo.clear()
    for (const uid of [...peers.keys()]) closePeer(uid)
    nsPipeline?.destroy()
    nsPipeline = null
    rnnoiseActive.value = false
    rawStream?.getTracks().forEach((t) => t.stop())
    rawStream = null
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
  }

  async function leave(forget = false) {
    soundsArmed = false
    prevAdmittedIds = new Set()
    prevWaitingIds = new Set()
    prevHandIds = new Set()
    // A DELIBERATE leave/end (forget=true) announces departure so peers drop me
    // instantly AND deletes my authoritative DB row; a guest also forgets its
    // token so the next visit is a fresh identity. An onUnmounted from a RELOAD
    // passes forget=false — we skip both, so the guest reconnects with the SAME
    // token + DB row (the reaper removes me only if I truly never return).
    if (forget) {
      sendCtrl('bye')
      void rpcLeave()
      if (myRole.value === 'guest') forgetGuestId()
    }
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    if (reconcileTimer) { clearInterval(reconcileTimer); reconcileTimer = null }
    reconnecting.value = false
    reaped.clear()
    removeReconnectListeners()
    if (rosterChannel) {
      try { await supabase.removeChannel(rosterChannel) } catch { /* ignore */ }
      rosterChannel = null
    }
    teardownMedia()
    if (onPageHide && typeof window !== 'undefined') {
      window.removeEventListener('pagehide', onPageHide)
      onPageHide = null
    }
    const ch = channel
    channel = null
    if (ch) {
      if (myRole.value === 'guest') {
        // A guest has no account — their entire Supabase session IS this meeting,
        // and removeChannel alone leaves the shared realtime SOCKET open (the
        // lingering "anonymous profile connected"). Close it outright.
        //
        // Gate on the JOIN-TIME role, NOT live auth.user: a member's session can
        // lapse mid-call (non-retryable token-refresh failure / server SIGNED_OUT
        // / deactivation), and keying off auth.user would then wrongly nuke that
        // member's notifications / presence / chat channels on the shared socket.
        //
        // untrack is fire-and-forget so a hung phx_leave can't strand us before
        // disconnect(); disconnect() flushes the buffered 'bye', fires a server
        // presence-leave on socket close, and clears the heartbeat timer so the
        // global heartbeatCallback won't silently reconnect. A later Rejoin
        // re-opens the socket via subscribe()'s realtime.connect().
        ch.untrack().catch(() => { /* ignore */ })
        supabase.realtime.disconnect()
      } else {
        // Member: keep the shared socket alive (chat / notifications / presence
        // all ride it). Clean per-channel leave only.
        try {
          await ch.untrack()
          await supabase.removeChannel(ch)
        } catch { /* ignore */ }
      }
    }
  }

  // Dev debug snapshot — surfaced by the meeting view's DBG overlay.
  function debugState() {
    return {
      status: status.value,
      myId: myId.value,
      myRole: myRole.value,
      myName: myName.value,
      amAdmitted: amAdmitted.value,
      epoch: myEpoch,
      token: token.value,
      roomId: room.value?.id ?? null,
      roster: online.value.map((p) => `${p.name}${p.admitted ? '' : ' (lobby)'}`),
      reaped: [...reaped],
      byed: [...byed],
      peers: peers.size,
      chan: channel?.state ?? '—',
      rosterChan: rosterChannel?.state ?? '—',
      reconnecting: reconnecting.value,
    }
  }

  onUnmounted(leave)

  return {
    status,
    error,
    room,
    online,
    admittedPeople,
    waiting,
    canAdmit,
    isHost,
    roomShareLocked,
    roomFull,
    reconnecting,
    debugState,
    shareLocked,
    hostNotice,
    muteParticipant,
    turnOffParticipantCam,
    stopParticipantShare,
    lowerParticipantHand,
    removeParticipant,
    muteEveryone,
    toggleShareLock,
    myId,
    muted,
    handRaised,
    sharingScreen,
    localScreen,
    remoteScreens,
    cameraOn,
    localCamera,
    remoteCameras,
    selfMirrored,
    bgMode,
    bgImageUrl,
    bgLoading,
    speaking,
    chat,
    reactions,
    noiseSuppression,
    rnnoiseActive,
    soundsOn,
    me,
    peek,
    join,
    admit,
    deny,
    setPermissionState,
    endMeeting,
    leave,
    toggleMute,
    toggleHand,
    toggleScreenShare,
    toggleCamera,
    flipCamera,
    setBackground,
    setBackgroundImage,
    toggleNoise,
    toggleSounds,
    sendChat,
    sendReaction,
  }
}
