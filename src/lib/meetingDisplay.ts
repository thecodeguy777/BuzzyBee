// Display + link helpers for scheduled meetings — pure functions shared by
// the Meetings view, its row/modal components, and the home cards.

import type { Meeting } from '@/stores/meetings'
import { tzShortName } from '@/lib/timezones'

/** Instant rooms (started from CRM/Comms) have no scheduled_at — fall back to
 *  when they were created, which is when they actually happened. */
export function startOf(m: Meeting): string {
  return m.scheduledAt ?? m.createdAt
}

export function joinLinkOf(m: Meeting): string {
  return `${window.location.origin}/meet/${m.token}`
}

export function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function timeRange(m: Meeting): string {
  const s = new Date(startOf(m))
  const e = new Date(s.getTime() + m.durationMinutes * 60_000)
  const t = (x: Date) => x.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${t(s)} – ${t(e)}`
}

/** The line that goes into invite emails, zone labeled. Pass the client's
 *  IANA zone to speak the RECIPIENT's clock; defaults to the host's local
 *  zone (and falls back to it on an invalid stored zone). */
export function whenTextOf(scheduledAt: string | null, tz?: string | null): string {
  if (!scheduledAt) return ''
  const d = new Date(scheduledAt)
  const viewerZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  let zone = tz || viewerZone
  try {
    // Probe: throws on an invalid zone name in stored data.
    d.toLocaleTimeString('en-US', { timeZone: zone })
  } catch {
    zone = viewerZone
  }
  const date = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: zone })
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: zone })
  const abbr = tzShortName(zone, d.getTime())
  return `${date} · ${time}${abbr ? ' ' + abbr : ''}`
}

/** Relative status against a caller-supplied clock (a ticking ref keeps the
 *  "starts in Xm" labels live without every row polling Date.now()). */
export function statusOf(m: Meeting, now: number): { label: string; live: boolean } {
  const start = new Date(startOf(m)).getTime()
  const end = start + m.durationMinutes * 60_000
  if (now >= start && now <= end) return { label: 'happening now', live: true }
  if (now > end) {
    return {
      label: 'link active until ' + new Date(m.expiresAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
      live: false
    }
  }
  const mins = Math.round((start - now) / 60_000)
  if (mins < 60) return { label: `starts in ${mins}m`, live: false }
  if (mins < 24 * 60) return { label: `starts in ${Math.round(mins / 60)}h`, live: false }
  return { label: `in ${Math.round(mins / (24 * 60))}d`, live: false }
}

export function msgTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** "2d 4h" / "11h 04m" / "23m" until the given start; 'now' once reached. */
export function countdownTo(iso: string, now: number): string {
  const diff = new Date(iso).getTime() - now
  if (diff <= 0) return 'now'
  const mins = Math.ceil(diff / 60_000)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h ${String(mins % 60).padStart(2, '0')}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

// ── No-ESP invite path ────────────────────────────────────────────────────────
// Until the sending domain is verified with Resend, the reliable channel is
// the host's own mailbox: a prefilled Gmail compose. The .ics attachment is
// replaced by a Google Calendar template link — one click adds the event
// (with the join link) to the recipient's calendar.

export function gcalUrl(m: Meeting): string {
  const start = new Date(startOf(m))
  const end = new Date(start.getTime() + m.durationMinutes * 60_000)
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: m.title,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: `Join the meeting (no account needed): ${joinLinkOf(m)}`,
    location: joinLinkOf(m)
  })
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}

export function plainInviteText(m: Meeting, note: string, tz?: string | null): string {
  return (
    `Hi,\n\n` +
    `You're invited to "${m.title}"\n` +
    `${whenTextOf(m.scheduledAt, tz)}\n\n` +
    `Join from your browser (no account needed):\n${joinLinkOf(m)}\n\n` +
    `Add it to your calendar:\n${gcalUrl(m)}` +
    (note.trim() ? `\n\n${note.trim()}` : '')
  )
}

/** Prefilled Gmail compose. The URL can only carry PLAIN text — when the
 *  branded card was copied to the clipboard (copyBrandedInvite), pass
 *  includeBody:false so pasting doesn't duplicate the fallback text. */
export function gmailComposeUrl(m: Meeting, to: string[], note: string, includeBody = true, tz?: string | null): string {
  const p = new URLSearchParams({
    view: 'cm',
    fs: '1',
    to: to.join(','),
    su: `Meeting invitation: ${m.title} — ${whenTextOf(m.scheduledAt, tz)}`
  })
  if (includeBody) p.set('body', plainInviteText(m, note, tz))
  return `https://mail.google.com/mail/?${p.toString()}`
}

// ── Branded invite via clipboard ─────────────────────────────────────────────
// Gmail's compose editor preserves pasted inline-styled HTML, so the branded
// card CAN go through the host's own mailbox: copy it as rich text, open the
// compose window, paste into the body. Mirror of the send-meeting-invite edge
// function's card (email-safe: tables + inline styles only).

const FONT = 'Arial, Helvetica, sans-serif'
const ACCENT = '#611f69'

function escHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function inviteEmailHtml(m: Meeting, note: string, hostName: string, tz?: string | null): string {
  const url = joinLinkOf(m)
  const when = whenTextOf(m.scheduledAt, tz)
  // Hosted PNG (public/brand/) — email clients strip <svg> and block data: URIs.
  // Baked on the header's aubergine, so it blends even if border-radius is lost.
  const logo = `${window.location.origin}/brand/email-logo.png`
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3f6;padding:24px 8px">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:540px;max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #eceaee">
<tr><td style="background:${ACCENT};padding:12px 28px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:10px"><img src="${logo}" width="22" height="27" alt="" style="display:block;border:0" /></td>
<td><span style="font-family:${FONT};font-size:16px;font-weight:bold;color:#ffffff">BuzzyHive</span></td>
</tr></table></td></tr>
<tr><td style="padding:28px">
<p style="font-family:${FONT};font-size:13px;color:#7a7785;margin:0 0 6px">${escHtml(hostName)} has invited you to a meeting</p>
<p style="font-family:${FONT};font-size:19px;font-weight:bold;color:#221f27;margin:0 0 12px">${escHtml(m.title)}</p>
<p style="font-family:${FONT};font-size:15px;font-weight:bold;color:#33313a;margin:0 0 20px">${escHtml(when)}</p>
${note.trim() ? `<p style="font-family:${FONT};font-size:14px;color:#5c5966;background:#f8f7fa;border-radius:8px;padding:12px 14px;margin:0 0 20px">${escHtml(note.trim())}</p>` : ''}
<p style="margin:0 0 18px"><a href="${url}" style="display:inline-block;background:${ACCENT};color:#ffffff;font-family:${FONT};font-size:14px;font-weight:bold;text-decoration:none;padding:12px 26px;border-radius:8px">Join meeting</a></p>
<p style="font-family:${FONT};font-size:12px;color:#7a7785;margin:0">Or open this link: <a href="${url}" style="color:${ACCENT}">${url}</a><br />
<a href="${gcalUrl(m)}" style="color:${ACCENT}">Add it to your calendar</a> · No account needed — join from your browser.</p>
</td></tr>
</table>
</td></tr></table>`
}

/** Copy the branded invite as rich text (+ plain fallback). Returns false on
 *  engines without ClipboardItem or when the write is denied — callers fall
 *  back to the plain-text compose body. */
export async function copyBrandedInvite(m: Meeting, note: string, hostName: string, tz?: string | null): Promise<boolean> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([inviteEmailHtml(m, note, hostName, tz)], { type: 'text/html' }),
        'text/plain': new Blob([plainInviteText(m, note, tz)], { type: 'text/plain' })
      })
    ])
    return true
  } catch {
    return false
  }
}
