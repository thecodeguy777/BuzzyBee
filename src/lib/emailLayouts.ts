// Email layout wrappers — table-based, inline-styled HTML, the only dialect
// every mail client (Outlook included) renders consistently. The composer's
// rich-text content drops into the BODY slot; the send-campaign edge function
// carries a copy of this logic (functions bundle separately from the app).
//
// Layouts:
//   plain   — content as-is + footer (what we shipped first)
//   clean   — centered 600px white card on a soft background
//   branded — clean + a colored header bar carrying the sender/brand name

// 'doc' = a complete designer-built body (Designs tab) — used as-is, never
// wrapped. The other three wrap composer-written content.
export type EmailLayout = 'plain' | 'clean' | 'branded' | 'doc'

export const EMAIL_LAYOUTS: { id: EmailLayout; name: string; blurb: string }[] = [
  { id: 'plain', name: 'Plain', blurb: 'Personal email feel' },
  { id: 'clean', name: 'Clean card', blurb: 'Newsletter card' },
  { id: 'branded', name: 'Branded', blurb: 'Colored header bar' },
]

export const DEFAULT_ACCENT = '#611f69'

const FONT = "Arial, Helvetica, sans-serif"

function footer(fromName: string) {
  const sender = fromName ? `${fromName} via BuzzyHive` : 'BuzzyHive'
  return `<p style="font-size:11px;color:#a3a1a9;line-height:1.6;margin:0;text-align:center">`
    + `You're receiving this email from ${sender}. Reply with &ldquo;unsubscribe&rdquo; to opt out.</p>`
}

/**
 * Wrap composer content in the chosen layout. Returns a full email body
 * (everything inside <body>); merge tags pass through for per-recipient
 * substitution at send time.
 */
export function renderEmailHtml(opts: {
  layout: EmailLayout
  accent?: string
  bodyHtml: string
  fromName: string
}): string {
  const accent = opts.accent || DEFAULT_ACCENT
  const content = `<div style="font-family:${FONT};font-size:14px;line-height:1.65;color:#33313a">${opts.bodyHtml}</div>`

  if (opts.layout === 'doc') return opts.bodyHtml

  if (opts.layout === 'plain') {
    return content
      + `<hr style="border:none;border-top:1px solid #e5e5e5;margin:28px 0 12px" />`
      + footer(opts.fromName)
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
    + `<tr><td style="padding:16px 32px;border-top:1px solid #f0eef2">${footer(opts.fromName)}</td></tr>`
    + `</table>`
    + `</td></tr></table>`
}
