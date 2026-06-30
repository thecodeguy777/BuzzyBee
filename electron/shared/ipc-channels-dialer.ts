// BuzzyHive Dialer — IPC channel names + type contracts.
// Kept in a separate file from ipc-channels.ts so the dialer work doesn't
// conflict with the in-flight meeting/coaching changes.
//
// Wire-up (Phase 1): in preload/control.ts add a `dialer` namespace alongside
// the existing `meeting`/`history`/etc. namespaces; in main/ipc-handlers.ts
// register `dialer:*` handlers backed by main/dialer/telnyx-token.ts and
// main/dialer/call-log-service.ts.

export const DIALER_IPC = {
  // renderer → main (invoke)
  GET_TOKEN: 'dialer:get-token',           // returns { token: string, identity: string, expiresAt: number }
  LOG_CALL: 'dialer:log-call',             // upserts a row in buzzybee.dialer_calls
  LIST_CALLS: 'dialer:list-calls',         // fetch recent calls for current agent
  GET_OUTBOUND_DID: 'dialer:get-outbound-did',  // which E.164 to use as caller-ID
  PLAY_RECORDING: 'dialer:play-recording', // returns a signed URL for a recording

  // main → renderer (send)  — used in Phase 4 (inbound)
  INCOMING_CALL: 'dialer:incoming-call',
  CALL_STATE: 'dialer:call-state',         // optional: surface main-side state to UI
} as const

// Floating-dialer window-control channels.
// Lives in its own const so the floating window's preload (preload/dialer.ts)
// can import only what it needs without pulling in carrier-side types.
export const DIALER_WINDOW_IPC = {
  WINDOW_TOGGLE: 'dialer-window:toggle',                  // show if hidden, hide if shown (called from global hotkey or main app)
  WINDOW_SHOW: 'dialer-window:show',                      // ensure visible + focused (e.g. after click-to-call from CRM)
  WINDOW_HIDE: 'dialer-window:hide',                      // hide (X button)
  WINDOW_MINIMIZE: 'dialer-window:minimize',              // minimize (— button)
  WINDOW_SET_ALWAYS_ON_TOP: 'dialer-window:set-always-on-top',  // pin/unpin
  SIGNALWIRE_GET_JWT: 'dialer:signalwire-get-jwt',        // mint a fresh JWT for the SignalWire SDK (legacy / unused in REST path)
  SIGNALWIRE_GET_FROM: 'dialer:signalwire-get-from',      // outbound caller-ID DID from env
  SIGNALWIRE_CREATE_CALL: 'dialer:signalwire-create-call',// POST /Calls — kicks off click-to-call bridge
  SIGNALWIRE_GET_CALL: 'dialer:signalwire-get-call',      // GET /Calls/<sid> — polled by renderer for status
  SIGNALWIRE_HANGUP: 'dialer:signalwire-hangup',          // POST /Calls/<sid> Status=completed
  SIGNALWIRE_GET_SIP_CREDS: 'dialer:signalwire-get-sip-creds', // SIP creds for the embedded softphone
} as const

export interface CarrierJWT {
  jwt: string
  refreshToken: string
  expiresInSec: number
}

export type CarrierJWTResult = CarrierJWT | { error: string }

// ── Type contracts ──

export type DialerCallStatus =
  | 'idle'
  | 'connecting'
  | 'ringing'
  | 'in-call'
  | 'ended'
  | 'failed'

export type DialerCallDirection = 'outbound' | 'inbound'

export type DialerHangupCause =
  | 'normal'
  | 'busy'
  | 'no-answer'
  | 'rejected'
  | 'failed'
  | 'canceled'

export interface DialerToken {
  /** JWT for the WebRTC SDK (Telnyx or Twilio — provider abstracted). */
  token: string
  /** SIP identity / login the renderer should connect as. */
  identity: string
  /** Unix ms — renderer should refresh before this. */
  expiresAt: number
}

export interface DialerLogCallInput {
  /** Set on call start, allows main to thread the same row across lifecycle updates. */
  localId: string
  direction: DialerCallDirection
  fromE164: string
  toE164: string
  status: 'initiated' | 'ringing' | 'answered' | 'completed' | 'failed' | 'no-answer' | 'busy' | 'canceled'
  startedAt: string
  answeredAt?: string
  endedAt?: string
  durationSec?: number
  hangupCause?: DialerHangupCause
  /** Provider-side call id (Telnyx call_control_id / Twilio CallSid). */
  providerCallId?: string
  clientId?: string
  ticketId?: string
  notes?: string
}

export interface DialerCallRow {
  id: string
  agentUserId: string
  direction: DialerCallDirection
  fromE164: string
  toE164: string
  status: string
  startedAt: string
  answeredAt: string | null
  endedAt: string | null
  durationSec: number | null
  hangupCause: string | null
  recordingUrl: string | null
  recordingDurationSec: number | null
  clientId: string | null
  ticketId: string | null
  notes: string | null
}

export interface DialerOutboundDID {
  e164: string
  label: string | null
}
