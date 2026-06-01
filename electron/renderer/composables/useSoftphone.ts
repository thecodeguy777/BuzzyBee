import { ref, computed } from 'vue'
import { UserAgent, Registerer, Invitation, SessionState, RegistererState } from 'sip.js'

// Embedded softphone — replaces the external Zoiper dependency.
//
// We register a SIP client to SignalWire over secure WebSocket and auto-answer
// incoming INVITEs. This is the rep-leg endpoint that SignalWire bridges to
// when HiveMind kicks off a click-to-call REST request.
//
// Architecture:
//   • UserAgent: long-lived SIP stack, registered for the session
//   • Registerer: keeps the registration alive (re-registers periodically)
//   • Invitation: ephemeral, created when an INVITE comes in; we accept() it
//   • Audio: SIP.js wires the remote MediaStream through; we just attach it
//     to a hidden <audio> element so the laptop speakers play it.
//
// Singleton state (module scope) — one softphone per renderer.

type SoftphoneStatus =
  | 'idle'           // not yet started
  | 'connecting'     // WebSocket / TLS handshake in progress
  | 'registering'    // WS open, sending REGISTER
  | 'registered'     // ready to accept calls
  | 'unregistering'  // tearing down
  | 'failed'         // registration error
  | 'ringing'        // incoming INVITE, not yet accepted
  | 'in-call'        // call accepted, media flowing

const status = ref<SoftphoneStatus>('idle')
const error = ref<string | null>(null)
const lastEventAt = ref<number | null>(null)

let userAgent: UserAgent | null = null
let registerer: Registerer | null = null
let currentInvitation: Invitation | null = null
let audioElement: HTMLAudioElement | null = null

const isRegistered = computed(() => status.value === 'registered' || status.value === 'ringing' || status.value === 'in-call')

function getAudioSink(): HTMLAudioElement {
  if (audioElement) return audioElement
  const existing = document.getElementById('sw-softphone-audio') as HTMLAudioElement | null
  if (existing) {
    audioElement = existing
    return existing
  }
  const el = document.createElement('audio')
  el.id = 'sw-softphone-audio'
  el.autoplay = true
  el.style.display = 'none'
  document.body.appendChild(el)
  audioElement = el
  return el
}

function attachRemoteMedia(invitation: Invitation): void {
  // SIP.js exposes the SessionDescriptionHandler which holds the peer connection.
  const sdh: any = invitation.sessionDescriptionHandler
  const pc: RTCPeerConnection | undefined = sdh?.peerConnection
  if (!pc) {
    console.warn('[softphone] no peer connection on invitation — audio will not route')
    return
  }
  const remoteStream = new MediaStream()
  pc.getReceivers().forEach((receiver) => {
    if (receiver.track) remoteStream.addTrack(receiver.track)
  })
  pc.ontrack = (evt) => {
    evt.streams.forEach((s) => s.getTracks().forEach((t) => remoteStream.addTrack(t)))
  }
  const sink = getAudioSink()
  sink.srcObject = remoteStream
  sink.play().catch((err) => console.warn('[softphone] audio play() failed:', err))
}

function detachRemoteMedia(): void {
  if (audioElement) {
    audioElement.srcObject = null
  }
}

function onInvitation(invitation: Invitation): void {
  lastEventAt.value = Date.now()
  currentInvitation = invitation
  status.value = 'ringing'
  console.log('[softphone] incoming INVITE from', invitation.remoteIdentity?.uri?.toString?.())

  invitation.stateChange.addListener((state: SessionState) => {
    console.log('[softphone] session state:', state)
    if (state === SessionState.Established) {
      status.value = 'in-call'
      attachRemoteMedia(invitation)
    } else if (state === SessionState.Terminated) {
      detachRemoteMedia()
      currentInvitation = null
      status.value = isRegisteredAfterCall() ? 'registered' : 'idle'
    }
  })

  // Auto-answer: HiveMind initiated the click-to-call, so the rep is already
  // expecting this leg to come in. No user prompt needed.
  invitation.accept({
    sessionDescriptionHandlerOptions: {
      constraints: { audio: true, video: false },
    },
  }).catch((err) => {
    console.error('[softphone] accept failed:', err)
    error.value = err?.message ?? 'Failed to accept incoming call'
  })
}

function isRegisteredAfterCall(): boolean {
  return registerer?.state === 'Registered'
}

export async function startSoftphone(): Promise<void> {
  if (userAgent) {
    console.log('[softphone] already started, skipping')
    return
  }
  error.value = null
  status.value = 'connecting'

  const api: any = (window as any).dialerAPI?.signalwire
  if (!api?.getSipCreds) {
    error.value = 'Dialer preload missing getSipCreds — restart npm run dev.'
    status.value = 'failed'
    return
  }
  const creds = await api.getSipCreds()
  if (!creds || creds.error) {
    error.value = creds?.error ?? 'No SIP credentials available'
    status.value = 'failed'
    return
  }

  try {
    const uri = UserAgent.makeURI(creds.uri)
    if (!uri) throw new Error(`Invalid SIP URI: ${creds.uri}`)

    userAgent = new UserAgent({
      uri,
      authorizationUsername: creds.username,
      authorizationPassword: creds.password,
      transportOptions: {
        server: creds.wsUrl,
        traceSip: false,
      },
      delegate: {
        onInvite: (invitation) => onInvitation(invitation),
        onDisconnect: (err) => {
          if (err) {
            console.warn('[softphone] transport disconnected:', err)
            error.value = err.message
          }
        },
      },
    })

    status.value = 'registering'
    await userAgent.start()
    registerer = new Registerer(userAgent)
    // Listen for the REAL registration outcome — register() only sends the
    // REGISTER request; the 200 OK (or 401, 403, etc.) arrives async.
    registerer.stateChange.addListener((s: RegistererState) => {
      console.log('[softphone] registerer state:', s)
      lastEventAt.value = Date.now()
      if (s === RegistererState.Registered) {
        if (status.value !== 'in-call' && status.value !== 'ringing') {
          status.value = 'registered'
          error.value = null
          console.log(`[softphone] registered as ${creds.uri}`)
        }
      } else if (s === RegistererState.Unregistered) {
        // Could be voluntary unregister OR a 401 rejection. If we never reached
        // registered first, treat it as a failure.
        if (status.value === 'registering') {
          status.value = 'failed'
          error.value = 'Registration rejected (likely wrong password)'
        }
      }
    })
    await registerer.register()
  } catch (err: any) {
    console.error('[softphone] start failed:', err)
    error.value = err?.message ?? String(err)
    status.value = 'failed'
    userAgent = null
    registerer = null
  }
}

export async function stopSoftphone(): Promise<void> {
  status.value = 'unregistering'
  try {
    if (currentInvitation) {
      await currentInvitation.bye()
      currentInvitation = null
    }
    if (registerer) {
      await registerer.unregister()
      registerer = null
    }
    if (userAgent) {
      await userAgent.stop()
      userAgent = null
    }
  } catch (err) {
    console.warn('[softphone] stop error:', err)
  }
  detachRemoteMedia()
  status.value = 'idle'
}

export async function hangupCurrent(): Promise<void> {
  if (!currentInvitation) return
  try {
    if (currentInvitation.state === SessionState.Established) {
      await currentInvitation.bye()
    } else if (currentInvitation.state === SessionState.Initial || currentInvitation.state === SessionState.Establishing) {
      await currentInvitation.reject()
    }
  } catch (err) {
    console.warn('[softphone] hangup error:', err)
  }
  currentInvitation = null
}

export function useSoftphone() {
  return {
    status,
    isRegistered,
    error,
    lastEventAt,
    start: startSoftphone,
    stop: stopSoftphone,
    hangup: hangupCurrent,
  }
}
