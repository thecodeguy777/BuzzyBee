// SignalWire carrier adapter — main process.
//
// Holds the project credentials (PROJECT_ID + PT/PSK from electron/.env) and
// drives outbound calls via the LaML REST API.
//
// Call flow (click-to-call, two-legged):
//   1) renderer asks main to place a call to a lead
//   2) main POSTs /Calls — From = US DID, To = rep's verified phone
//   3) when rep answers, SignalWire fetches the inline TwiML we attached,
//      which <Dial>s the lead from the same US DID and bridges both legs
//   4) renderer polls /Calls/<sid> for status until completed
//
// Credentials never leave main process.

// Lazy env read so dotenv has time to load before this module is imported.
function env(name: string): string | undefined {
  return process.env[name]
}

export interface SignalWireJWT {
  jwt: string
  refreshToken: string
  expiresInSec: number
}

export function isSignalWireConfigured(): boolean {
  return !!(env('SIGNALWIRE_PROJECT_ID') && (env('SIGNALWIRE_SIGNING_KEY') || env('SIGNALWIRE_API_TOKEN')) && env('SIGNALWIRE_SPACE_URL'))
}

export function getFromNumber(): string | null {
  return env('SIGNALWIRE_FROM_NUMBER') ?? null
}

export function getRepNumber(): string | null {
  return env('SIGNALWIRE_REP_NUMBER') ?? null
}

export interface SignalWireSipCreds {
  username: string
  password: string
  domain: string
  wsUrl: string
  uri: string
}

// Credentials the renderer's embedded SIP client uses to register to
// SignalWire over secure WebSocket. Username and domain come out of the
// SIGNALWIRE_REP_NUMBER (sip:user@domain). Password lives in its own env
// var so it can be rotated independently.
export function getSipCredentials(): SignalWireSipCreds | { error: string } {
  const rep = env('SIGNALWIRE_REP_NUMBER') ?? ''
  const password = env('SIGNALWIRE_SIP_PASSWORD') ?? ''
  if (!rep.startsWith('sip:')) {
    return { error: 'SIGNALWIRE_REP_NUMBER must be a sip: URI to use the embedded softphone.' }
  }
  if (!password) {
    return { error: 'SIGNALWIRE_SIP_PASSWORD not set in electron/.env — paste the password you set in the SignalWire SIP credential.' }
  }
  const uri = rep.slice('sip:'.length)
  const at = uri.indexOf('@')
  if (at <= 0) return { error: 'SIGNALWIRE_REP_NUMBER must be of the form sip:user@domain' }
  const username = uri.slice(0, at)
  const domain = uri.slice(at + 1)
  return {
    username,
    password,
    domain,
    wsUrl: `wss://${domain}`,
    uri: rep,
  }
}

// ── LaML REST: click-to-call ───────────────────────────────────────────────

export type SignalWireCallStatus =
  | 'queued' | 'initiated' | 'ringing' | 'in-progress'
  | 'completed' | 'busy' | 'no-answer' | 'failed' | 'canceled'

export interface SignalWireCallInfo {
  sid: string
  status: SignalWireCallStatus
  durationSec: number | null
  from: string | null
  to: string | null
  startTime: string | null
  endTime: string | null
  answeredBy?: string | null
}

interface RestAuth {
  projectId: string
  credential: string
  spaceUrl: string
}

function getRestAuth(): RestAuth | { error: string } {
  const projectId = env('SIGNALWIRE_PROJECT_ID')
  // LaML REST auth uses Project ID + Project API Token (PT_*).
  // PSK is for Call Fabric SAT minting and won't authenticate here.
  const credential = env('SIGNALWIRE_API_TOKEN')
  const spaceUrl = env('SIGNALWIRE_SPACE_URL')
  if (!projectId || !credential || !spaceUrl) {
    return { error: 'SignalWire env missing: need SIGNALWIRE_PROJECT_ID, SIGNALWIRE_API_TOKEN (PT_*), SIGNALWIRE_SPACE_URL.' }
  }
  return { projectId, credential, spaceUrl }
}

function basicAuth(projectId: string, credential: string): string {
  return 'Basic ' + Buffer.from(`${projectId}:${credential}`).toString('base64')
}

function bridgeTwiml(callerId: string, toLead: string): string {
  // When the rep's leg answers, SignalWire fetches this inline TwiML and
  // <Dial>s the lead from our US DID. answerOnBridge=true keeps the rep
  // in "ringing" state on their phone screen until the lead picks up.
  // ringTone="us" forces consistent NA-standard ringback regardless of the
  // destination carrier — fills any silence the destination's network would
  // otherwise leave during the dialing phase.
  // Escape the lead E.164 in case it ever contains characters needing escape.
  const safe = String(toLead).replace(/[<>&]/g, '')
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Dial callerId="${callerId}" answerOnBridge="true" ringTone="us">${safe}</Dial></Response>`
}

function testTwiml(): string {
  // Single-leg test mode: SignalWire calls the lead directly and plays this
  // TTS message. Used to validate the SignalWire integration without needing
  // the PH rep leg (which requires international permissions on the project).
  //
  // The opening Pause gives the audio path time to fully connect before TTS
  // starts (otherwise the first second can be clipped). No voice attribute —
  // uses SignalWire's default TTS engine, which is enabled by default. Polly
  // voices require separate enabling on the project.
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Response>`,
    `<Pause length="1"/>`,
    `<Say>Hello. This is a test call from BuzzyHive. The SignalWire integration is working correctly.</Say>`,
    `<Pause length="1"/>`,
    `<Say>Goodbye.</Say>`,
    `<Pause length="1"/>`,
    `</Response>`,
  ].join('')
}

function isTestMode(): boolean {
  const v = env('SIGNALWIRE_TEST_MODE')
  return v === 'true' || v === '1' || v === 'yes'
}

export async function createOutboundCall(toLeadE164: string): Promise<{ sid: string } | { error: string }> {
  const auth = getRestAuth()
  if ('error' in auth) return auth
  const fromDid = getFromNumber()
  if (!fromDid) return { error: 'SIGNALWIRE_FROM_NUMBER (US DID) not set in electron/.env' }

  const testMode = isTestMode()
  let toNumber: string
  let twiml: string

  if (testMode) {
    // Single-leg: dial the lead directly, play TTS on answer.
    toNumber = toLeadE164
    twiml = testTwiml()
  } else {
    // Two-legged bridge: dial rep first, bridge to lead on answer.
    const repNumber = getRepNumber()
    if (!repNumber) return { error: 'SIGNALWIRE_REP_NUMBER (rep verified phone) not set in electron/.env' }
    toNumber = repNumber
    twiml = bridgeTwiml(fromDid, toLeadE164)
  }

  const url = `https://${auth.spaceUrl}/api/laml/2010-04-01/Accounts/${auth.projectId}/Calls.json`
  const body = new URLSearchParams({
    From: fromDid,
    To: toNumber,
    Twiml: twiml,
  })

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': basicAuth(auth.projectId, auth.credential),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    })
    if (!response.ok) {
      const txt = await response.text()
      console.warn(`[signalwire] createCall ${response.status}:`, txt.slice(0, 300))
      return { error: `SignalWire ${response.status}: ${txt.slice(0, 200)}` }
    }
    const data: any = await response.json()
    if (!data?.sid) return { error: `SignalWire response missing sid: ${JSON.stringify(data).slice(0, 200)}` }
    if (testMode) {
      console.log(`[signalwire] TEST MODE — created call ${data.sid} dialing ${toLeadE164} with TTS`)
    } else {
      console.log(`[signalwire] created call ${data.sid} — rep ${toNumber} bridging to ${toLeadE164}`)
    }
    return { sid: data.sid }
  } catch (err: any) {
    console.error('[signalwire] createCall threw:', err)
    return { error: err?.message ?? String(err) }
  }
}

export async function getCallInfo(sid: string): Promise<SignalWireCallInfo | { error: string }> {
  const auth = getRestAuth()
  if ('error' in auth) return auth
  const url = `https://${auth.spaceUrl}/api/laml/2010-04-01/Accounts/${auth.projectId}/Calls/${encodeURIComponent(sid)}.json`
  try {
    const response = await fetch(url, {
      headers: { 'Authorization': basicAuth(auth.projectId, auth.credential) },
    })
    if (!response.ok) return { error: `SignalWire ${response.status}` }
    const d: any = await response.json()
    return {
      sid: d.sid,
      status: d.status,
      durationSec: d.duration != null ? Number(d.duration) : null,
      from: d.from ?? null,
      to: d.to ?? null,
      startTime: d.start_time ?? null,
      endTime: d.end_time ?? null,
      answeredBy: d.answered_by ?? null,
    }
  } catch (err: any) {
    return { error: err?.message ?? String(err) }
  }
}

export async function hangupCall(sid: string): Promise<{ ok: true } | { error: string }> {
  const auth = getRestAuth()
  if ('error' in auth) return auth
  const url = `https://${auth.spaceUrl}/api/laml/2010-04-01/Accounts/${auth.projectId}/Calls/${encodeURIComponent(sid)}.json`
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': basicAuth(auth.projectId, auth.credential),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ Status: 'completed' }),
    })
    if (!response.ok) {
      const txt = await response.text()
      return { error: `SignalWire hangup ${response.status}: ${txt.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (err: any) {
    return { error: err?.message ?? String(err) }
  }
}

export async function generateSignalWireJWT(identity?: string): Promise<SignalWireJWT | { error: string } | null> {
  const projectId = env('SIGNALWIRE_PROJECT_ID')
  // Prefer Project API Token (PT_*) for the legacy Relay endpoint our SDK
  // uses; fall back to Signing Key (PSK_*) for Call Fabric endpoints.
  const apiToken = env('SIGNALWIRE_API_TOKEN')
  const signingKey = env('SIGNALWIRE_SIGNING_KEY')
  const credential = apiToken || signingKey
  const spaceUrl = env('SIGNALWIRE_SPACE_URL')

  if (!projectId || !credential || !spaceUrl) {
    return {
      error: `SignalWire env vars missing in electron/.env — need SIGNALWIRE_PROJECT_ID${projectId ? '' : ' (missing)'} SIGNALWIRE_API_TOKEN or SIGNALWIRE_SIGNING_KEY${credential ? '' : ' (missing)'} SIGNALWIRE_SPACE_URL${spaceUrl ? '' : ' (missing)'}`,
    }
  }

  const expiresIn = 3600
  const reference = identity ?? 'hivemind-dialer'
  const ptAuth = apiToken ? Buffer.from(`${projectId}:${apiToken}`).toString('base64') : null
  const pskAuth = signingKey ? Buffer.from(`${projectId}:${signingKey}`).toString('base64') : null

  // The renderer uses @signalwire/js v3 Call Fabric (`SignalWire(...)` factory),
  // which expects a SAT (Subscriber Access Token). Try Call Fabric endpoints
  // first with whichever credential we have, then fall back to legacy Relay.
  type Candidate = { label: string; url: string; auth: string; body: any }
  const candidates: Candidate[] = []
  if (pskAuth) {
    candidates.push({
      label: 'fabric-sat(PSK)',
      url: `https://${spaceUrl}/api/fabric/sat/tokens`,
      auth: pskAuth,
      body: { reference, expires_in: expiresIn },
    })
    candidates.push({
      label: 'fabric-resources(PSK)',
      url: `https://${spaceUrl}/api/fabric/resources/subscribers/tokens`,
      auth: pskAuth,
      body: { reference, expires_in: expiresIn },
    })
  }
  if (ptAuth) {
    candidates.push({
      label: 'fabric-sat(PT)',
      url: `https://${spaceUrl}/api/fabric/sat/tokens`,
      auth: ptAuth,
      body: { reference, expires_in: expiresIn },
    })
    candidates.push({
      label: 'fabric-resources(PT)',
      url: `https://${spaceUrl}/api/fabric/resources/subscribers/tokens`,
      auth: ptAuth,
      body: { reference, expires_in: expiresIn },
    })
    candidates.push({
      label: 'relay-jwt(PT)',
      url: `https://${spaceUrl}/api/relay/rest/jwt`,
      auth: ptAuth,
      body: { resource: reference, expires_in: expiresIn },
    })
  }

  const errors: string[] = []

  for (const c of candidates) {
    try {
      const response = await fetch(c.url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${c.auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(c.body),
      })

      if (response.ok) {
        const data: any = await response.json()
        const token = data.token ?? data.jwt_token ?? data.jwt ?? data.access_token
        if (!token) {
          errors.push(`${c.label}: 200 but no token field in response: ${JSON.stringify(data).slice(0, 150)}`)
          continue
        }
        console.log(`[signalwire] minted token via ${c.label}`)
        return {
          jwt: token,
          refreshToken: data.refresh_token ?? data.refreshToken ?? '',
          expiresInSec: data.expires_in ?? expiresIn,
        }
      }

      const body = await response.text()
      errors.push(`${c.label}: ${response.status} ${body.slice(0, 120)}`)
      console.warn(`[signalwire] ${c.label} returned ${response.status}:`, body.slice(0, 200))
    } catch (err: any) {
      const msg = err?.message || String(err)
      errors.push(`${c.label}: exception ${msg}`)
      console.error(`[signalwire] ${c.label} exception:`, err)
    }
  }

  return {
    error: `All SignalWire token endpoints rejected the credentials. Details:\n${errors.join('\n')}\n\nLikely cause: this project doesn't have a Subscriber resource created yet. In the SignalWire dashboard, go to Resources → New → Subscriber (or "Address") and give it the reference name "${reference}". Call Fabric needs a subscriber to mint SAT tokens against.`,
  }
}
