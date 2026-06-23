import { ref, computed, onUnmounted } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { broadcast } from '@/lib/realtime'
import { useAuthStore } from '@/stores/auth'
import { iceServers } from '@/lib/iceServers'
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
  since?: number
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

function guestId(): string {
  const KEY = 'buzzybee.meet.guest-id'
  let id = typeof window !== 'undefined' ? window.sessionStorage.getItem(KEY) : null
  if (!id) {
    id = (crypto.randomUUID?.() ?? `guest-${Math.random().toString(36).slice(2)}-${Date.now()}`)
    window.sessionStorage.setItem(KEY, id)
  }
  return id
}

export function useMeetingRoom() {
  const auth = useAuthStore()

  const status = ref<RoomStatus>('idle')
  const error = ref<string | null>(null)
  const room = ref<RoomMeta | null>(null)
  const token = ref('')
  const online = ref<Participant[]>([])

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

  const myId = ref('')
  const myName = ref('')
  const myRole = ref<Role>('guest')
  const amAdmitted = ref(false)

  const ICE = iceServers()
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
    /** ICE candidates that raced ahead of the remote description — flushed after it lands. */
    pendingIce: RTCIceCandidateInit[]
    /** True once presence has confirmed this user admitted (see reconcilePeers). */
    confirmed: boolean
    makingOffer: boolean
    ignoreOffer: boolean
    polite: boolean
  }
  const peers = new Map<string, PeerEntry>()
  let channel: RealtimeChannel | null = null

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
    }

    await subscribe(tk)
    if (amAdmitted.value) await goLive()
    else status.value = 'lobby'
  }

  async function subscribe(tk: string) {
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
    await ch.subscribe((s) => {
      if (s === 'SUBSCRIBED') trackPresence()
    })
    channel = ch
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
      since: undefined,
    } satisfies Participant)
  }

  function onPresence() {
    if (!channel) return
    const state = channel.presenceState<Participant>()
    const seen = new Map<string, Participant>()
    for (const metas of Object.values(state)) {
      for (const m of metas as unknown as Participant[]) if (m?.userId) seen.set(m.userId, m)
    }
    online.value = [...seen.values()]
    const sharers = new Set(online.value.filter((p) => p.sharing).map((p) => p.userId))
    for (const uid of Object.keys(remoteScreens.value)) if (!sharers.has(uid)) removeRemoteScreen(uid)
    const cammers = new Set(online.value.filter((p) => p.cam).map((p) => p.userId))
    for (const uid of Object.keys(remoteCameras.value)) if (!cammers.has(uid)) removeRemoteCamera(uid)
    if (amAdmitted.value) {
      playPresenceSounds()
      reconcilePeers()
    }
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
    if (p.type === 'ended') {
      status.value = 'ended'
      teardownMedia()
      return
    }
    if (p.to !== myId.value) return
    if (p.type === 'admit' && !amAdmitted.value) { meetSounds.admitted(); void goLive() }
    else if (p.type === 'deny') {
      status.value = 'denied'
      leave()
    } else if (p.type === 'kick') {
      leave()
      status.value = 'ended'
    }
  }
  function admit(userId: string) {
    if (!canAdmit.value) return
    sendCtrl('admit', userId)
  }
  function deny(userId: string) {
    if (!canAdmit.value) return
    sendCtrl('deny', userId)
  }

  async function goLive() {
    amAdmitted.value = true
    status.value = 'live'
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
    pc.onnegotiationneeded = async () => {
      if (pc.signalingState !== 'stable') return
      try {
        entry.makingOffer = true
        await pc.setLocalDescription()
        sendRtc(userId, 'desc', pc.localDescription)
      } catch { /* ignore */ } finally {
        entry.makingOffer = false
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
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') closePeer(userId)
    }
    return entry
  }
  function reconcilePeers() {
    if (!amAdmitted.value) return
    const wanted = new Set(admittedPeople.value.map((p) => p.userId).filter((u) => u !== myId.value))
    let addedPeer = false
    for (const uid of wanted) {
      if (!peers.has(uid)) addedPeer = true
      getPeer(uid).confirmed = true
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

  async function leave() {
    soundsArmed = false
    prevAdmittedIds = new Set()
    prevWaitingIds = new Set()
    prevHandIds = new Set()
    teardownMedia()
    if (channel) {
      try {
        await channel.untrack()
        await supabase.removeChannel(channel)
      } catch { /* ignore */ }
      channel = null
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
