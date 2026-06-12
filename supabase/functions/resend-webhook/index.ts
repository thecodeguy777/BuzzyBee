// resend-webhook: Resend engagement events → crm_campaign_recipients stamps.
//
// Resend signs webhooks with the svix scheme: HMAC-SHA256 over
// "{id}.{timestamp}.{rawBody}" keyed with the base64-decoded secret. We verify
// that signature instead of a JWT (deployed with verify_jwt off — Resend can't
// send Supabase auth headers).
//
// Setup: Resend dashboard → Webhooks → add
//   https://<project-ref>.supabase.co/functions/v1/resend-webhook
// with events email.opened, email.clicked, email.bounced — then put the
// signing secret (whsec_…) in the RESEND_WEBHOOK_SECRET function secret.

import { createClient } from 'npm:@supabase/supabase-js@2'

const TOLERANCE_S = 5 * 60 // reject replays older than 5 minutes

async function verifySignature(secret: string, id: string, timestamp: string, payload: string, signatures: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    Uint8Array.from(atob(secret.replace(/^whsec_/, '')), (c) => c.charCodeAt(0)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${payload}`))
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)))
  // Header carries space-separated "v1,<base64>" entries.
  return signatures.split(' ').some((s) => s.split(',')[1] === expected)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  try {
    const secret = Deno.env.get('RESEND_WEBHOOK_SECRET')
    if (!secret) {
      return new Response(JSON.stringify({ error: 'RESEND_WEBHOOK_SECRET is not configured' }), { status: 500 })
    }

    const svixId = req.headers.get('svix-id') ?? ''
    const svixTimestamp = req.headers.get('svix-timestamp') ?? ''
    const svixSignature = req.headers.get('svix-signature') ?? ''
    const raw = await req.text()

    if (!svixId || !svixTimestamp || !svixSignature) return new Response('missing signature', { status: 401 })
    if (Math.abs(Date.now() / 1000 - Number(svixTimestamp)) > TOLERANCE_S) {
      return new Response('stale timestamp', { status: 401 })
    }
    if (!(await verifySignature(secret, svixId, svixTimestamp, raw, svixSignature))) {
      return new Response('bad signature', { status: 401 })
    }

    const event = JSON.parse(raw) as { type: string; data?: { email_id?: string } }
    const emailId = event.data?.email_id
    if (!emailId) return new Response('ok', { status: 200 })

    // First event wins for opened/clicked — repeat opens shouldn't move the
    // timestamp. A click implies an open even if the open pixel was blocked.
    const stamp: Record<string, string> = {}
    const now = new Date().toISOString()
    if (event.type === 'email.opened') stamp.opened_at = now
    else if (event.type === 'email.clicked') {
      stamp.clicked_at = now
      stamp.opened_at = now
    } else if (event.type === 'email.bounced') stamp.bounced_at = now
    else return new Response('ok', { status: 200 }) // event type we don't track

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      db: { schema: 'buzzybee' },
    })

    // coalesce-style guard: only fill columns that are still null.
    const { data: rows } = await admin
      .from('crm_campaign_recipients')
      .select('id,opened_at,clicked_at,bounced_at')
      .eq('provider_id', emailId)
      .limit(1)
    const row = rows?.[0]
    if (!row) return new Response('ok', { status: 200 }) // not one of ours (e.g. a test send)

    const patch: Record<string, string> = {}
    for (const [k, v] of Object.entries(stamp)) {
      if (!(row as Record<string, unknown>)[k]) patch[k] = v
    }
    if (Object.keys(patch).length) {
      await admin.from('crm_campaign_recipients').update(patch).eq('id', row.id)
    }

    return new Response('ok', { status: 200 })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 })
  }
})
