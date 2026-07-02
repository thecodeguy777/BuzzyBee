// send-meeting-invite: email a /meet link for a scheduled meeting via Resend,
// with an .ics calendar attachment so it lands on the recipient's calendar.
//
// Invoked by the Meetings view with the host's JWT. Only the room's host (or
// an admin) can send invites. Recipients don't need accounts — the /meet link
// is guest-joinable, exactly like instant meetings.
//
// This is transactional mail (a person inviting a person), not a blast — no
// List-Unsubscribe machinery needed.
//
// Secrets: RESEND_API_KEY (required). MEET_FROM_EMAIL (optional — a verified
// address once the domain exists; defaults to onboarding@resend.dev, which
// only delivers to the Resend account owner until then).

import { createClient } from 'npm:@supabase/supabase-js@2'

const DEFAULT_FROM = 'onboarding@resend.dev'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const FONT = 'Arial, Helvetica, sans-serif'
const ACCENT = '#611f69'

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

// ── ICS (RFC 5545) ────────────────────────────────────────────────────────────
function icsDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}
function icsEscape(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}
function buildIcs(opts: {
  token: string; title: string; start: Date; durationMinutes: number
  url: string; organizerName: string; organizerEmail: string
  attendee: { email: string; name: string | null }
}) {
  const end = new Date(opts.start.getTime() + opts.durationMinutes * 60_000)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BuzzyHive//Meet//EN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${opts.token}@buzzyhive-meet`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(opts.start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(opts.title)}`,
    `DESCRIPTION:${icsEscape('Join the meeting: ' + opts.url)}`,
    `URL:${opts.url}`,
    `ORGANIZER;CN=${icsEscape(opts.organizerName)}:mailto:${opts.organizerEmail}`,
    `ATTENDEE;CN=${icsEscape(opts.attendee.name || opts.attendee.email)};RSVP=TRUE:mailto:${opts.attendee.email}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.join('\r\n')
}
function b64(s: string) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)))
}

// ── Invite email ──────────────────────────────────────────────────────────────
function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function inviteHtml(opts: {
  hostName: string; title: string; whenText: string; url: string; note: string | null
  logoUrl: string | null
}) {
  // Logo is a hosted PNG (public/brand/ on the app site) — email clients
  // strip <svg> and block data: URIs. Falls back to text-only when the site
  // base is unknown.
  const brand = opts.logoUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr>`
      + `<td style="padding-right:10px"><img src="${opts.logoUrl}" width="22" height="27" alt="" style="display:block;border:0" /></td>`
      + `<td><span style="font-family:${FONT};font-size:16px;font-weight:bold;color:#ffffff;letter-spacing:.2px">BuzzyHive</span></td>`
      + `</tr></table>`
    : `<span style="font-family:${FONT};font-size:16px;font-weight:bold;color:#ffffff;letter-spacing:.2px">BuzzyHive</span>`
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3f6;padding:28px 12px">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #eceaee">
<tr><td style="background:${ACCENT};padding:14px 32px">${brand}</td></tr>
<tr><td style="padding:32px">
<div style="font-family:${FONT};font-size:14px;line-height:1.65;color:#33313a">
<p style="margin:0 0 6px;color:#7a7785">${esc(opts.hostName)} has invited you to a meeting</p>
<h1 style="margin:0 0 14px;font-size:20px;line-height:1.35;color:#221f27">${esc(opts.title)}</h1>
<p style="margin:0 0 22px;font-size:15px;font-weight:bold;color:#33313a">${esc(opts.whenText)}</p>
${opts.note ? `<p style="margin:0 0 22px;padding:12px 14px;background:#f8f7fa;border-radius:8px;color:#5c5966">${esc(opts.note)}</p>` : ''}
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:${ACCENT}">
<a href="${opts.url}" target="_blank" style="display:inline-block;padding:12px 26px;font-family:${FONT};font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none">Join meeting</a>
</td></tr></table>
<p style="margin:18px 0 0;font-size:12px;color:#7a7785">Or open this link: <a href="${opts.url}" style="color:${ACCENT}">${opts.url}</a><br />No account needed — join from your browser.</p>
</div>
</td></tr>
<tr><td style="padding:14px 32px;border-top:1px solid #f0eef2">
<p style="font-family:${FONT};font-size:11px;color:#a3a1a9;line-height:1.6;margin:0;text-align:center">Meeting invitation sent via BuzzyHive Meet.</p>
</td></tr>
</table>
</td></tr></table>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const apiKey = Deno.env.get('RESEND_API_KEY')
    if (!apiKey) return json({ error: 'RESEND_API_KEY is not configured' }, 500)

    const url = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      db: { schema: 'buzzybee' },
    })
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Not authenticated' }, 401)

    const body = await req.json() as {
      roomId?: string
      recipients?: { email: string; name?: string | null }[]
      whenText?: string   // pre-formatted by the client in the host's timezone
      note?: string | null
    }
    if (!body.roomId) return json({ error: 'roomId is required' }, 400)
    const recipients = (body.recipients ?? [])
      .map((r) => ({ email: (r.email ?? '').trim().toLowerCase(), name: r.name?.trim() || null }))
      .filter((r) => EMAIL_RE.test(r.email))
    if (!recipients.length) return json({ error: 'No valid recipient emails' }, 400)
    if (recipients.length > 50) return json({ error: 'Too many recipients (max 50 per meeting)' }, 400)

    const { data: room } = await admin
      .from('meeting_rooms')
      .select('id,token,title,host_id,scheduled_at,duration_minutes,expires_at,ended_at')
      .eq('id', body.roomId)
      .maybeSingle()
    if (!room) return json({ error: 'Meeting not found' }, 404)
    if (room.ended_at) return json({ error: 'This meeting was cancelled or has ended' }, 409)
    if (!room.scheduled_at) return json({ error: 'This room has no scheduled time — invites are for scheduled meetings' }, 400)

    const { data: profile } = await admin
      .from('profiles')
      .select('full_name,email,role')
      .eq('id', user.id)
      .single()
    const isAdmin = ['admin', 'superadmin'].includes(profile?.role ?? '')
    if (room.host_id !== user.id && !isAdmin) {
      return json({ error: 'Only the meeting host can send invites' }, 403)
    }

    const hostName = profile?.full_name || profile?.email?.split('@')[0] || 'Your host'
    const fromEmail = Deno.env.get('MEET_FROM_EMAIL') || DEFAULT_FROM
    const from = `${hostName} via BuzzyHive <${fromEmail}>`
    // The public join link. VITE builds serve the app from the site root; the
    // meet route is public/bare, so origin comes from the request or a secret.
    const siteBase = Deno.env.get('PUBLIC_SITE_URL') || req.headers.get('origin') || ''
    if (!siteBase) return json({ error: 'Cannot resolve the site URL for the join link (set PUBLIC_SITE_URL)' }, 500)
    const joinUrl = `${siteBase.replace(/\/$/, '')}/meet/${room.token}`
    const logoUrl = `${siteBase.replace(/\/$/, '')}/brand/email-logo.png`

    const title = room.title || 'BuzzyHive meeting'
    const start = new Date(room.scheduled_at)
    const durationMinutes = room.duration_minutes ?? 60
    const whenText = body.whenText || start.toUTCString()
    const note = body.note?.trim() || null

    let sent = 0
    const failures: string[] = []
    for (const r of recipients) {
      const ics = buildIcs({
        token: room.token, title, start, durationMinutes, url: joinUrl,
        organizerName: hostName, organizerEmail: fromEmail, attendee: r,
      })
      const html = inviteHtml({ hostName, title, whenText, url: joinUrl, note, logoUrl })
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [r.email],
          reply_to: profile?.email || undefined,
          subject: `Meeting invitation: ${title} — ${whenText}`,
          html,
          text: `${hostName} has invited you to "${title}"\n${whenText}\n\nJoin: ${joinUrl}${note ? `\n\n${note}` : ''}`,
          attachments: [{ filename: 'meeting.ics', content: b64(ics) }],
        }),
      })
      if (resp.ok) {
        sent++
        // Resend to the same address refreshes sent_at instead of duplicating.
        await admin.from('meeting_invites').upsert(
          { room_id: room.id, email: r.email, name: r.name, sent_at: new Date().toISOString() },
          { onConflict: 'room_id,email' },
        )
      } else {
        failures.push(`${r.email}: Resend ${resp.status} ${(await resp.text()).slice(0, 200)}`)
      }
    }

    return json({ sent, failed: failures.length, error: failures.length ? failures[0] : null })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
