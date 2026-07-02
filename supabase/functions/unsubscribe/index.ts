// unsubscribe: public opt-out endpoint for campaign emails.
//
// Every campaign email carries a per-recipient link + RFC 8058 one-click
// List-Unsubscribe headers pointing here. Deployed with verify_jwt OFF —
// recipients are not Supabase users; authenticity comes from the HMAC token
// minted by send-campaign:
//   token = "<recipientId>.<base64url(HMAC-SHA256(UNSUBSCRIBE_SECRET, recipientId))>"
//
// GET  → confirmation page with a button (mail scanners prefetch GET links;
//        unsubscribing on GET would cause false opt-outs)
// POST → performs the opt-out (the form button, and Gmail/Yahoo one-click
//        which POSTs directly to the List-Unsubscribe URL)
//
// Secrets required: UNSUBSCRIBE_SECRET (same value as send-campaign).

import { createClient } from 'npm:@supabase/supabase-js@2'

const ACCENT = '#611f69'

function page(title: string, message: string, withButton = false) {
  return `<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title}</title></head>
<body style="margin:0;background:#f4f3f6;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:48px 16px">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:440px;max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #eceaee">
<tr><td style="background:${ACCENT};padding:14px 28px"><span style="color:#ffffff;font-size:15px;font-weight:bold;letter-spacing:.2px">BuzzyHive</span></td></tr>
<tr><td style="padding:32px 28px">
<h1 style="margin:0 0 10px;font-size:18px;color:#33313a">${title}</h1>
<p style="margin:0;font-size:14px;line-height:1.6;color:#5c5966">${message}</p>
${withButton ? `<form method="post" style="margin:22px 0 0"><button type="submit" style="background:${ACCENT};color:#ffffff;border:none;border-radius:8px;padding:11px 20px;font-size:14px;font-weight:bold;cursor:pointer">Unsubscribe</button></form>` : ''}
</td></tr>
</table>
</td></tr></table>
</body></html>`
}

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function b64urlToBytes(s: string): Uint8Array | null {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

/** Returns the recipient id if the token's HMAC checks out, else null. */
async function verifyToken(secret: string, token: string): Promise<string | null> {
  const dot = token.indexOf('.')
  if (dot === -1) return null
  const id = token.slice(0, dot)
  const sig = b64urlToBytes(token.slice(dot + 1))
  if (!sig || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
  )
  // subtle.verify is constant-time, unlike comparing base64 strings ourselves.
  const ok = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(id))
  return ok ? id : null
}

// ilike pattern-escape — emails legitimately contain '_'.
const escapeLike = (s: string) => s.replace(/([%_\\])/g, '\\$1')

Deno.serve(async (req) => {
  try {
    const secret = Deno.env.get('UNSUBSCRIBE_SECRET')
    if (!secret) return html(page('Something went wrong', 'This unsubscribe service is not configured yet. Please reply to the email instead.'), 500)

    const token = new URL(req.url).searchParams.get('t') ?? ''
    const recipientId = token ? await verifyToken(secret, token) : null
    if (!recipientId) {
      return html(page('Link not valid', 'This unsubscribe link is incomplete or has been altered. Please use the link from your email, or reply to it directly.'), 400)
    }

    if (req.method === 'GET') {
      return html(page('Unsubscribe from these emails?', 'You will stop receiving campaign emails from this sender. This takes effect immediately.', true))
    }
    if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      db: { schema: 'buzzybee' },
    })

    const { data: rec } = await admin
      .from('crm_campaign_recipients')
      .select('id,contact_id,email,unsubscribed_at')
      .eq('id', recipientId)
      .maybeSingle()
    if (!rec) {
      return html(page('Link not valid', 'This unsubscribe link no longer matches an email we sent. If you keep receiving mail, reply to it directly.'), 400)
    }

    const now = new Date().toISOString()
    if (!rec.unsubscribed_at) {
      await admin.from('crm_campaign_recipients').update({ unsubscribed_at: now }).eq('id', rec.id)
    }
    // Suppress the contact — first opt-out wins. Recipients added by hand may
    // have no contact link; fall back to matching the address.
    if (rec.contact_id) {
      await admin
        .from('crm_contacts')
        .update({ unsubscribed_at: now })
        .eq('id', rec.contact_id)
        .is('unsubscribed_at', null)
    } else if (rec.email) {
      await admin
        .from('crm_contacts')
        .update({ unsubscribed_at: now })
        .ilike('email', escapeLike(rec.email))
        .is('unsubscribed_at', null)
    }

    return html(page("You're unsubscribed", 'You will no longer receive campaign emails from this sender. If this was a mistake, reply to any previous email and ask to be re-added.'))
  } catch (e) {
    console.warn('[unsubscribe]', (e as Error).message)
    return html(page('Something went wrong', 'We could not process this right now. Please try the link again in a minute, or reply to the email directly.'), 500)
  }
})
