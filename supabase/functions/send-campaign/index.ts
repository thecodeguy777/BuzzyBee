// send-campaign: deliver a crm_campaigns blast through Resend.
//
// The browser never sees the provider key — the client invokes this with the
// user's JWT, we verify pm/admin, then send with the service role. Batches of
// 100 per Resend batch call, throttled under their rate limit. Recipient rows
// are updated per batch; the campaign row carries the overall status.
//
// Secrets required: RESEND_API_KEY (Project Settings → Edge Functions).
// Until a sending domain is verified with Resend, from_email must be
// onboarding@resend.dev and delivery is limited to the Resend account owner.

import { createClient } from 'npm:@supabase/supabase-js@2'

const BATCH_SIZE = 100
const BATCH_PAUSE_MS = 600 // Resend default rate limit is 2 req/s
const DEFAULT_FROM = 'onboarding@resend.dev'

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

// Layout wrappers — mirror of src/lib/emailLayouts.ts (functions bundle
// separately from the app). Table-based + inline styles for Outlook safety.
const FONT = 'Arial, Helvetica, sans-serif'
const DEFAULT_ACCENT = '#611f69'

function footerHtml(fromName: string | null) {
  const sender = fromName ? `${fromName} via BuzzyHive` : 'BuzzyHive'
  return `<p style="font-size:11px;color:#a3a1a9;line-height:1.6;margin:0;text-align:center">`
    + `You're receiving this email from ${sender}. Reply with &ldquo;unsubscribe&rdquo; to opt out.</p>`
}

function renderEmailHtml(opts: { layout: string; accent: string | null; bodyHtml: string; fromName: string | null }) {
  const accent = opts.accent || DEFAULT_ACCENT
  const content = `<div style="font-family:${FONT};font-size:14px;line-height:1.65;color:#33313a">${opts.bodyHtml}</div>`

  // 'doc' = a complete designer-built body (own background, card, footer
  // block) — send it untouched.
  if (opts.layout === 'doc') return opts.bodyHtml

  if (opts.layout !== 'clean' && opts.layout !== 'branded') {
    return content
      + `<hr style="border:none;border-top:1px solid #e5e5e5;margin:28px 0 12px" />`
      + footerHtml(opts.fromName)
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
    + `<tr><td style="padding:16px 32px;border-top:1px solid #f0eef2">${footerHtml(opts.fromName)}</td></tr>`
    + `</table>`
    + `</td></tr></table>`
}

// {{first_name}} merge tag — personalized per recipient at send time.
function personalize(html: string, name: string | null | undefined) {
  const first = (name ?? '').trim().split(/\s+/)[0] || 'there'
  return html.replace(/\{\{\s*first_name\s*\}\}/g, first)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const apiKey = Deno.env.get('RESEND_API_KEY')
    if (!apiKey) {
      return json({ error: 'RESEND_API_KEY is not configured — add it under Project Settings → Edge Functions → Secrets.' }, 500)
    }

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
      const html = renderEmailHtml({
        layout: t.layout ?? 'plain', accent: t.accent ?? null,
        bodyHtml: t.bodyHtml, fromName: t.fromName ?? null,
      })
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [t.to],
          subject: '[Test] ' + t.subject,
          html: personalize(html, 'there'),
        }),
      })
      if (!resp.ok) return json({ error: `Resend ${resp.status}: ${(await resp.text()).slice(0, 300)}` }, 502)
      return json({ sent: 1, failed: 0, test: true })
    }

    const { campaignId } = body_
    if (!campaignId) return json({ error: 'campaignId is required' }, 400)

    const { data: campaign, error: cErr } = await admin
      .from('crm_campaigns')
      .select('id,subject,from_name,from_email,body_html,status,layout,accent')
      .eq('id', campaignId)
      .single()
    if (cErr || !campaign) return json({ error: 'Campaign not found' }, 404)
    if (campaign.status === 'sending') return json({ error: 'Campaign is already sending' }, 409)
    if (campaign.status === 'sent') return json({ error: 'Campaign was already sent' }, 409)

    const { data: recipients, error: rErr } = await admin
      .from('crm_campaign_recipients')
      .select('id,contact_id,email,name')
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')
    if (rErr) return json({ error: rErr.message }, 500)
    if (!recipients?.length) return json({ error: 'No pending recipients on this campaign' }, 400)

    await admin.from('crm_campaigns').update({ status: 'sending' }).eq('id', campaignId)

    const fromEmail = campaign.from_email || DEFAULT_FROM
    const from = campaign.from_name ? `${campaign.from_name} <${fromEmail}>` : fromEmail
    const htmlTemplate = renderEmailHtml({
      layout: campaign.layout ?? 'plain', accent: campaign.accent ?? null,
      bodyHtml: campaign.body_html, fromName: campaign.from_name,
    })

    let sent = 0
    let failed = 0
    let lastError: string | null = null
    const sentRecipientIds = new Set<string>()

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE)
      const ids = batch.map((r) => r.id)
      try {
        const resp = await fetch('https://api.resend.com/emails/batch', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(batch.map((r) => ({
            from,
            to: [r.email],
            subject: campaign.subject,
            html: personalize(htmlTemplate, r.name),
          }))),
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
      if (i + BATCH_SIZE < recipients.length) await sleep(BATCH_PAUSE_MS)
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
      const sentContactIds = recipients
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

    return json({ sent, failed, error: failed > 0 ? lastError : null })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
