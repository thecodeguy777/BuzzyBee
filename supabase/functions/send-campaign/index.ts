// send-campaign: deliver a crm_campaigns blast through Resend.
//
// The browser never sees the provider key — the client invokes this with the
// user's JWT, we verify pm/admin, then send with the service role. Batches of
// 100 per Resend batch call, throttled under their rate limit. Recipient rows
// are updated per batch; the campaign row carries the overall status.
//
// Compliance (CAN-SPAM + Gmail/Yahoo bulk-sender rules):
//  * every email carries a per-recipient unsubscribe link ({{unsubscribe_url}})
//    pointing at the public `unsubscribe` edge function, plus RFC 8058
//    one-click List-Unsubscribe headers
//  * recipients whose contact is unsubscribed / bounced / complained are
//    skipped server-side (belt to the audience builder's suspenders)
//  * a plain-text alternative part is generated from the HTML
//
// Secrets required (Project Settings → Edge Functions → Secrets):
//  * RESEND_API_KEY        — provider key
//  * UNSUBSCRIBE_SECRET    — HMAC key for unsubscribe tokens (any long random
//                            string; must match the `unsubscribe` function)
//  * SENDER_POSTAL_ADDRESS — optional; rendered in the footer (CAN-SPAM wants
//                            a physical address — set it once the LLC exists)
//
// Until a sending domain is verified with Resend, from_email must be
// onboarding@resend.dev and delivery is limited to the Resend account owner.

import { createClient } from 'npm:@supabase/supabase-js@2'

const BATCH_SIZE = 100
const BATCH_PAUSE_MS = 600 // Resend default rate limit is 2 req/s
const DEFAULT_FROM = 'onboarding@resend.dev'
// A campaign stuck in 'sending' longer than this is a crashed run — allow a
// new invocation to take over and finish the pending recipients.
const STALE_SENDING_MS = 15 * 60 * 1000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ── Unsubscribe tokens — mirror of supabase/functions/unsubscribe ────────────
// token = "<recipientId>.<base64url(HMAC-SHA256(secret, recipientId))>"
const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function importHmacKey(secret: string) {
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
}
async function unsubToken(key: CryptoKey, recipientId: string) {
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(recipientId))
  return `${recipientId}.${b64url(mac)}`
}

// Layout wrappers — mirror of src/lib/emailLayouts.ts (functions bundle
// separately from the app). Table-based + inline styles for Outlook safety.
const FONT = 'Arial, Helvetica, sans-serif'
const DEFAULT_ACCENT = '#611f69'

function footerHtml(fromName: string | null, postalAddress: string | null) {
  const sender = fromName ? `${fromName} via BuzzyHive` : 'BuzzyHive'
  return `<p style="font-size:11px;color:#a3a1a9;line-height:1.6;margin:0;text-align:center">`
    + `You're receiving this email from ${sender}. `
    + `<a href="{{unsubscribe_url}}" style="color:#a3a1a9;text-decoration:underline">Unsubscribe</a>`
    + (postalAddress ? `<br />${postalAddress}` : '')
    + `</p>`
}

function renderEmailHtml(opts: {
  layout: string; accent: string | null; bodyHtml: string; fromName: string | null
  postalAddress: string | null
}) {
  const accent = opts.accent || DEFAULT_ACCENT
  const content = `<div style="font-family:${FONT};font-size:14px;line-height:1.65;color:#33313a">${opts.bodyHtml}</div>`

  // 'doc' = a complete designer-built body (own background, card, footer
  // block) — send it untouched.
  if (opts.layout === 'doc') return opts.bodyHtml

  if (opts.layout !== 'clean' && opts.layout !== 'branded') {
    return content
      + `<hr style="border:none;border-top:1px solid #e5e5e5;margin:28px 0 12px" />`
      + footerHtml(opts.fromName, opts.postalAddress)
  }

  const header = opts.layout === 'branded'
    ? `<tr><td style="background:${accent};padding:18px 32px">`
      + `<span style="font-family:${FONT};font-size:17px;font-weight:bold;color:#ffffff;letter-spacing:.2px">${opts.fromName || 'BuzzyHive'}</span>`
      + `</td></tr>`
    : ''

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3f6;padding:28px 12px">`
    + `<tr><td align="center">`
    + `<table role="presentation" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #eceaee">`
    + header
    + `<tr><td style="padding:32px">${content}</td></tr>`
    + `<tr><td style="padding:16px 32px;border-top:1px solid #f0eef2">${footerHtml(opts.fromName, opts.postalAddress)}</td></tr>`
    + `</table>`
    + `</td></tr></table>`
}

// Every outgoing email must carry the unsubscribe link. Old stored 'doc'
// designs may predate the {{unsubscribe_url}} tag (or carry the legacy dead
// href="#") — patch the legacy anchor, else append a minimal footer.
function ensureUnsubLink(html: string, postalAddress: string | null) {
  if (html.includes('{{unsubscribe_url}}')) return html
  const legacy = html.replace(
    /(<a\s[^>]*href=")#("[^>]*>\s*Unsubscribe\s*<\/a>)/i,
    '$1{{unsubscribe_url}}$2',
  )
  if (legacy.includes('{{unsubscribe_url}}')) return legacy
  return html
    + `<p style="font-family:${FONT};font-size:11px;color:#a3a1a9;line-height:1.6;margin:16px 0 0;text-align:center">`
    + `<a href="{{unsubscribe_url}}" style="color:#a3a1a9;text-decoration:underline">Unsubscribe</a>`
    + (postalAddress ? `<br />${postalAddress}` : '')
    + `</p>`
}

// {{first_name}} + {{unsubscribe_url}} merge tags — per recipient at send time.
function firstNameOf(name: string | null | undefined) {
  return (name ?? '').trim().split(/\s+/)[0] || 'there'
}
function applyMergeTags(s: string, first: string, unsubUrl: string) {
  return s
    .replace(/\{\{\s*first_name\s*\}\}/g, first)
    .replace(/\{\{\s*unsubscribe_url\s*\}\}/g, unsubUrl)
}

// Plain-text alternative — crude but honest tag strip. Multipart emails with
// a text part score measurably better with spam filters than HTML-only.
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li|table)>/gi, '\n')
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => {
      const text = label.replace(/<[^>]+>/g, '').trim()
      return href && href !== text ? `${text} (${href})` : text
    })
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&ldquo;|&rdquo;|&quot;/g, '"')
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const apiKey = Deno.env.get('RESEND_API_KEY')
    if (!apiKey) {
      return json({ error: 'RESEND_API_KEY is not configured — add it under Project Settings → Edge Functions → Secrets.' }, 500)
    }
    const postalAddress = Deno.env.get('SENDER_POSTAL_ADDRESS') || null

    const url = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      db: { schema: 'buzzybee' },
    })

    // ── Caller must be an authenticated pm/admin ─────────────────────────────
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Not authenticated' }, 401)
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
    if (!profile || !['admin', 'superadmin', 'pm'].includes(profile.role)) {
      return json({ error: 'Only PMs and admins can send campaigns' }, 403)
    }

    const body_ = await req.json()

    // Test mode: one email to the requester, no campaign rows touched.
    if (body_.test) {
      const t = body_.test as {
        subject: string; fromName?: string; fromEmail?: string; bodyHtml: string; to: string
        layout?: string; accent?: string
      }
      if (!t.to || !t.subject || !t.bodyHtml) return json({ error: 'test needs to, subject and bodyHtml' }, 400)
      const from = t.fromName ? `${t.fromName} <${t.fromEmail || DEFAULT_FROM}>` : (t.fromEmail || DEFAULT_FROM)
      const html = ensureUnsubLink(renderEmailHtml({
        layout: t.layout ?? 'plain', accent: t.accent ?? null,
        bodyHtml: t.bodyHtml, fromName: t.fromName ?? null, postalAddress,
      }), postalAddress)
      // No recipient row exists for a test — the link is decorative here.
      const merged = applyMergeTags(html, 'there', '#')
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [t.to],
          subject: '[Test] ' + applyMergeTags(t.subject, 'there', '#'),
          html: merged,
          text: htmlToText(merged),
        }),
      })
      if (!resp.ok) return json({ error: `Resend ${resp.status}: ${(await resp.text()).slice(0, 300)}` }, 502)
      return json({ sent: 1, failed: 0, test: true })
    }

    const { campaignId } = body_
    if (!campaignId) return json({ error: 'campaignId is required' }, 400)

    const unsubSecret = Deno.env.get('UNSUBSCRIBE_SECRET')
    if (!unsubSecret) {
      return json({ error: 'UNSUBSCRIBE_SECRET is not configured — campaigns cannot send without working unsubscribe links. Add it under Project Settings → Edge Functions → Secrets (same value as the unsubscribe function).' }, 500)
    }
    const hmacKey = await importHmacKey(unsubSecret)
    const unsubBase = `${url}/functions/v1/unsubscribe`

    const CAMPAIGN_COLS = 'id,subject,from_name,from_email,body_html,status,layout,accent'

    // ── Claim the campaign atomically ─────────────────────────────────────────
    // The status flip doubles as a lock: draft/failed → sending claims it, so
    // two concurrent invocations (double-click, two admins) can't both send.
    const { data: claimed } = await admin
      .from('crm_campaigns')
      .update({ status: 'sending' })
      .eq('id', campaignId)
      .in('status', ['draft', 'failed'])
      .select(CAMPAIGN_COLS)
    let campaign = claimed?.[0] ?? null

    if (!campaign) {
      const { data: current } = await admin
        .from('crm_campaigns')
        .select(CAMPAIGN_COLS + ',updated_at')
        .eq('id', campaignId)
        .single()
      if (!current) return json({ error: 'Campaign not found' }, 404)
      if (current.status === 'sent') return json({ error: 'Campaign was already sent' }, 409)
      if (current.status === 'sending') {
        // A crashed run leaves 'sending' behind forever. If it's stale, take
        // over and finish the pending recipients; if fresh, it's a live send.
        const staleBefore = new Date(Date.now() - STALE_SENDING_MS).toISOString()
        const { data: takeover } = await admin
          .from('crm_campaigns')
          .update({ status: 'sending' }) // touch trigger renews updated_at = our claim
          .eq('id', campaignId)
          .eq('status', 'sending')
          .lt('updated_at', staleBefore)
          .select(CAMPAIGN_COLS)
        campaign = takeover?.[0] ?? null
        if (!campaign) return json({ error: 'Campaign is already sending' }, 409)
      } else {
        return json({ error: `Campaign is in unexpected state '${current.status}'` }, 409)
      }
    }

    // ── Recipients + server-side suppression ──────────────────────────────────
    // The audience builder already excludes unsubscribed contacts, but people
    // opt out (and mailboxes die) between draft and send — re-check here.
    const { data: recipients, error: rErr } = await admin
      .from('crm_campaign_recipients')
      .select('id,contact_id,email,name,contact:crm_contacts(unsubscribed_at,email_bounced_at,complained_at)')
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')
    if (rErr) return json({ error: rErr.message }, 500)
    if (!recipients?.length) {
      await admin.from('crm_campaigns').update({ status: 'failed' }).eq('id', campaignId)
      return json({ error: 'No pending recipients on this campaign' }, 400)
    }

    type Row = {
      id: string; contact_id: string | null; email: string; name: string | null
      contact: { unsubscribed_at: string | null; email_bounced_at: string | null; complained_at: string | null } | null
    }
    const sendable: Row[] = []
    const skipped: { id: string; reason: string }[] = []
    for (const r of recipients as unknown as Row[]) {
      const c = r.contact
      if (c?.unsubscribed_at) skipped.push({ id: r.id, reason: 'suppressed: unsubscribed' })
      else if (c?.complained_at) skipped.push({ id: r.id, reason: 'suppressed: spam complaint' })
      else if (c?.email_bounced_at) skipped.push({ id: r.id, reason: 'suppressed: previous hard bounce' })
      else if (!EMAIL_RE.test(r.email)) skipped.push({ id: r.id, reason: 'invalid email address' })
      else sendable.push(r)
    }
    // Mark suppressions before sending so a crash mid-send can't lose them.
    for (let i = 0; i < skipped.length; i += 500) {
      const chunk = skipped.slice(i, i + 500)
      // Reasons differ per row; group by reason to keep it to a few UPDATEs.
      const byReason: Record<string, string[]> = {}
      for (const s of chunk) (byReason[s.reason] ??= []).push(s.id)
      for (const [reason, ids] of Object.entries(byReason)) {
        await admin
          .from('crm_campaign_recipients')
          .update({ status: 'skipped', error: reason })
          .in('id', ids)
      }
    }

    if (!sendable.length) {
      await admin.from('crm_campaigns').update({ status: 'failed' }).eq('id', campaignId)
      return json({ sent: 0, failed: 0, skipped: skipped.length, error: 'All pending recipients were suppressed or invalid' })
    }

    const fromEmail = campaign.from_email || DEFAULT_FROM
    const from = campaign.from_name ? `${campaign.from_name} <${fromEmail}>` : fromEmail
    const htmlTemplate = ensureUnsubLink(renderEmailHtml({
      layout: campaign.layout ?? 'plain', accent: campaign.accent ?? null,
      bodyHtml: campaign.body_html, fromName: campaign.from_name, postalAddress,
    }), postalAddress)

    let sent = 0
    let failed = 0
    let lastError: string | null = null
    const sentRecipientIds = new Set<string>()

    for (let i = 0; i < sendable.length; i += BATCH_SIZE) {
      const batch = sendable.slice(i, i + BATCH_SIZE)
      const ids = batch.map((r) => r.id)
      try {
        const emails = await Promise.all(batch.map(async (r) => {
          const unsubUrl = `${unsubBase}?t=${await unsubToken(hmacKey, r.id)}`
          const first = firstNameOf(r.name)
          const html = applyMergeTags(htmlTemplate, first, unsubUrl)
          return {
            from,
            to: [r.email],
            subject: applyMergeTags(campaign.subject, first, unsubUrl),
            html,
            text: htmlToText(html),
            headers: {
              // RFC 8058 one-click — Gmail/Yahoo require this from bulk senders.
              'List-Unsubscribe': `<${unsubUrl}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          }
        }))
        const resp = await fetch('https://api.resend.com/emails/batch', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(emails),
        })
        if (!resp.ok) {
          const body = await resp.text()
          throw new Error(`Resend ${resp.status}: ${body.slice(0, 300)}`)
        }
        // Resend's batch response returns ids in request order — stamp them so
        // webhook events (opened/clicked/bounced) can find their recipient.
        const result = await resp.json().catch(() => null)
        const providerIds: string[] = batch.map((_, i) => result?.data?.[i]?.id ?? '')
        const { error: markErr } = await admin.rpc('bb_mark_campaign_batch_sent', {
          p_ids: ids,
          p_provider_ids: providerIds,
        })
        if (markErr) {
          // Fall back to the plain status flip — emails are already out.
          await admin
            .from('crm_campaign_recipients')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .in('id', ids)
        }
        sent += batch.length
        for (const id of ids) sentRecipientIds.add(id)
      } catch (e) {
        lastError = (e as Error).message
        await admin
          .from('crm_campaign_recipients')
          .update({ status: 'failed', error: lastError.slice(0, 500) })
          .in('id', ids)
        failed += batch.length
      }
      if (i + BATCH_SIZE < sendable.length) await sleep(BATCH_PAUSE_MS)
    }

    await admin
      .from('crm_campaigns')
      .update({
        status: sent > 0 ? 'sent' : 'failed',
        sent_at: sent > 0 ? new Date().toISOString() : null,
      })
      .eq('id', campaignId)

    // CRM timeline: one 'email' activity per delivered contact. company_id is
    // filled from the contact (the campaign isn't deal-scoped), and the
    // existing crm_activity_touch trigger bumps last-activity for free.
    try {
      const sentContactIds = sendable
        .filter((r) => r.contact_id && sentRecipientIds.has(r.id))
        .map((r) => r.contact_id as string)
      if (sentContactIds.length) {
        // Chunked .in() — thousands of ids would overflow the PostgREST URL.
        const contacts: { id: string; company_id: string }[] = []
        for (let i = 0; i < sentContactIds.length; i += 500) {
          const { data } = await admin
            .from('crm_contacts')
            .select('id,company_id')
            .in('id', sentContactIds.slice(i, i + 500))
          if (data) contacts.push(...data)
        }
        const rows = contacts
          .map((c) => ({
            company_id: c.company_id,
            contact_id: c.id,
            type: 'email',
            actor_id: user.id,
            body: `emailed blast “${campaign.subject}”`,
            meta: null,
          }))
        for (let i = 0; i < rows.length; i += 500) {
          await admin.from('crm_deal_activities').insert(rows.slice(i, i + 500))
        }
      }
    } catch (e) {
      console.warn('[send-campaign] activity logging failed:', (e as Error).message)
    }

    return json({ sent, failed, skipped: skipped.length, error: failed > 0 ? lastError : null })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
