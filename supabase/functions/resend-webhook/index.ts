// resend-webhook: Resend engagement events → crm_campaign_recipients stamps
// + contact-level suppression (bounces/complaints must stop future sends).
//
// Resend signs webhooks with the svix scheme: HMAC-SHA256 over
// "{id}.{timestamp}.{rawBody}" keyed with the base64-decoded secret. We verify
// that signature instead of a JWT (deployed with verify_jwt off — Resend can't
// send Supabase auth headers).
//
// Setup: Resend dashboard → Webhooks → add
//   https://<project-ref>.supabase.co/functions/v1/resend-webhook
// with events email.opened, email.clicked, email.bounced, email.complained —
// then put the signing secret (whsec_…) in the RESEND_WEBHOOK_SECRET secret.

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

    const event = JSON.parse(raw) as {
      type: string
      data?: { email_id?: string; bounce?: { type?: string } }
    }
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
    else if (event.type === 'email.complained') stamp.complained_at = now
    else return new Response('ok', { status: 200 }) // event type we don't track

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      db: { schema: 'buzzybee' },
    })

    // coalesce-style guard: only fill columns that are still null.
    const { data: rows } = await admin
      .from('crm_campaign_recipients')
      .select('id,contact_id,opened_at,clicked_at,bounced_at,complained_at')
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

    // ── Contact-level suppression ─────────────────────────────────────────────
    // A spam complaint is the loudest possible opt-out → unsubscribe the
    // contact. A bounce marks the address dead unless Resend says it's
    // transient (mailbox full etc.). The audience builder and send-campaign
    // both exclude contacts with these stamps.
    if (row.contact_id) {
      if (event.type === 'email.complained') {
        const { data: c } = await admin
          .from('crm_contacts')
          .select('unsubscribed_at,complained_at')
          .eq('id', row.contact_id)
          .maybeSingle()
        if (c) {
          const cPatch: Record<string, string> = {}
          if (!c.complained_at) cPatch.complained_at = now
          if (!c.unsubscribed_at) cPatch.unsubscribed_at = now
          if (Object.keys(cPatch).length) {
            await admin.from('crm_contacts').update(cPatch).eq('id', row.contact_id)
          }
        }
      } else if (event.type === 'email.bounced') {
        const transient = /transient/i.test(event.data?.bounce?.type ?? '')
        if (!transient) {
          await admin
            .from('crm_contacts')
            .update({ email_bounced_at: now })
            .eq('id', row.contact_id)
            .is('email_bounced_at', null)
        }
      }
    }

    return new Response('ok', { status: 200 })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 })
  }
})
