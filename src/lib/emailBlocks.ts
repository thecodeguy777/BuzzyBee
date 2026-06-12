// No-code email blocks: the "Canva of emails" layer. A campaign body is a
// stack of blocks that compiles to the same table-based, inline-styled HTML
// dialect as emailLayouts — so preview, send, merge tags, templates, and
// tracking all work unchanged. Blocks serialize to JSON (crm_campaigns /
// crm_email_templates .body_blocks) so designs stay editable.

import { DEFAULT_ACCENT } from '@/lib/emailLayouts'

export type EmailBlock =
  | { id: string; type: 'heading'; text: string; align: 'left' | 'center' }
  | { id: string; type: 'text'; html: string }
  | { id: string; type: 'image'; src: string; alt: string; href: string }
  | { id: string; type: 'button'; label: string; href: string; color: string; align: 'left' | 'center' }
  | { id: string; type: 'divider' }
  | { id: string; type: 'spacer'; size: number }

export type BlockType = EmailBlock['type']

const FONT = 'Arial, Helvetica, sans-serif'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function compileBlock(b: EmailBlock, accent: string): string {
  switch (b.type) {
    case 'heading':
      return `<h2 style="font-family:${FONT};font-size:22px;font-weight:bold;color:#1b1a1d;line-height:1.3;margin:0 0 14px;text-align:${b.align}">${esc(b.text)}</h2>`
    case 'text':
      // Authored via the rich-text editor by pm/admin — same trust as body_html.
      return `<div style="font-family:${FONT};font-size:14px;line-height:1.65;color:#33313a;margin:0 0 14px">${b.html}</div>`
    case 'image': {
      if (!b.src.trim()) return ''
      const img = `<img src="${esc(b.src)}" alt="${esc(b.alt)}" style="display:block;width:100%;height:auto;border-radius:8px" />`
      const inner = b.href.trim() ? `<a href="${esc(b.href)}" target="_blank">${img}</a>` : img
      return `<div style="margin:0 0 16px">${inner}</div>`
    }
    case 'button': {
      // Padded <a> in a table cell — the only button construction Outlook respects.
      const bg = b.color || accent
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;${b.align === 'center' ? 'margin-left:auto;margin-right:auto;' : ''}">`
        + `<tr><td style="border-radius:8px;background:${esc(bg)}">`
        + `<a href="${esc(b.href || '#')}" target="_blank" style="display:inline-block;padding:12px 28px;font-family:${FONT};font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px">${esc(b.label)}</a>`
        + `</td></tr></table>`
    }
    case 'divider':
      return `<hr style="border:none;border-top:1px solid #e8e6ec;margin:18px 0" />`
    case 'spacer':
      return `<div style="height:${Math.max(4, Math.min(96, b.size))}px;line-height:1px;font-size:1px">&nbsp;</div>`
  }
}

export function compileBlocks(blocks: EmailBlock[], accent: string = DEFAULT_ACCENT): string {
  return blocks.map((b) => compileBlock(b, accent)).join('')
}

let n = 0
export const blockId = () => 'blk-' + Date.now().toString(36) + '-' + (n++).toString(36)

// Omit that distributes over the union (plain Omit collapses it to the
// common keys, which drops every per-type field).
type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never
export type DesignBlock = DistributiveOmit<EmailBlock, 'id'>

/** Fresh editable copies (new ids) of a design's blocks. */
export function freshBlocks(blocks: DesignBlock[]): EmailBlock[] {
  return blocks.map((b) => ({ ...b, id: blockId() } as EmailBlock))
}

export function newBlock(type: BlockType): EmailBlock {
  const id = blockId()
  switch (type) {
    case 'heading': return { id, type, text: 'Heading', align: 'left' }
    case 'text': return { id, type, html: '<p>Write something…</p>' }
    case 'image': return { id, type, src: '', alt: '', href: '' }
    case 'button': return { id, type, label: 'Call to action', href: '', color: '', align: 'center' }
    case 'divider': return { id, type }
    case 'spacer': return { id, type, size: 24 }
  }
}

// ── Starter gallery ───────────────────────────────────────────────────────────
// Product content (not client data) — ships in code. Text-first designs: no
// external images, so nothing ever renders broken; image blocks are left for
// the sender's own assets.

type DesignBlocks = DesignBlock[]
export interface EmailDesign {
  id: string
  name: string
  blurb: string
  subject: string
  layout: 'plain' | 'clean' | 'branded'
  blocks: DesignBlocks
}

const D = (b: DesignBlocks) => b

export const EMAIL_GALLERY: EmailDesign[] = [
  {
    id: 'newsletter',
    name: 'Monthly newsletter',
    blurb: 'Sections + a read-more button',
    subject: 'Your monthly roundup',
    layout: 'clean',
    blocks: D([
      { type: 'heading', text: 'The monthly roundup', align: 'left' },
      { type: 'text', html: '<p>Hi {{first_name}}, here\'s everything worth knowing this month — in two minutes.</p>' },
      { type: 'divider' },
      { type: 'heading', text: 'Highlight one', align: 'left' },
      { type: 'text', html: '<p>A short paragraph on the first thing that matters. Keep it scannable — two sentences max.</p>' },
      { type: 'heading', text: 'Highlight two', align: 'left' },
      { type: 'text', html: '<p>Same again: what happened, why the reader should care.</p>' },
      { type: 'spacer', size: 8 },
      { type: 'button', label: 'Read the full update', href: '', color: '', align: 'center' },
    ]),
  },
  {
    id: 'welcome',
    name: 'Welcome aboard',
    blurb: 'Onboarding with a get-started CTA',
    subject: 'Welcome — here\'s how to get started',
    layout: 'branded',
    blocks: D([
      { type: 'heading', text: 'Welcome, {{first_name}}!', align: 'center' },
      { type: 'text', html: '<p style="text-align:center">We\'re glad you\'re here. Your account is ready — here\'s the fastest way to get value from it today.</p>' },
      { type: 'spacer', size: 8 },
      { type: 'button', label: 'Get started', href: '', color: '', align: 'center' },
      { type: 'divider' },
      { type: 'text', html: '<p>Questions? Just reply to this email — a real person reads every message.</p>' },
    ]),
  },
  {
    id: 'product-update',
    name: 'Product update',
    blurb: 'What shipped and why it matters',
    subject: 'New this month: what we shipped for you',
    layout: 'branded',
    blocks: D([
      { type: 'heading', text: 'What\'s new', align: 'left' },
      { type: 'text', html: '<p>Hi {{first_name}}, we\'ve shipped a few things we think you\'ll love:</p><ul><li><strong>Feature one</strong> — a sentence on why it matters.</li><li><strong>Feature two</strong> — another quick benefit.</li><li><strong>Feature three</strong> — keep the list to three.</li></ul>' },
      { type: 'button', label: 'See what\'s new', href: '', color: '', align: 'left' },
    ]),
  },
  {
    id: 'event',
    name: 'Event invite',
    blurb: 'Date, details, save-your-spot',
    subject: 'You\'re invited',
    layout: 'branded',
    blocks: D([
      { type: 'heading', text: 'You\'re invited', align: 'center' },
      { type: 'text', html: '<p style="text-align:center">Hi {{first_name}}, we\'d love for you to join us.</p><p style="text-align:center"><strong>What:</strong> Event name<br/><strong>When:</strong> Date &amp; time<br/><strong>Where:</strong> Location or link</p>' },
      { type: 'spacer', size: 8 },
      { type: 'button', label: 'Save your spot', href: '', color: '', align: 'center' },
      { type: 'spacer', size: 8 },
      { type: 'text', html: '<p style="text-align:center;font-size:12px;color:#86848d">Can\'t make it? Reply and we\'ll send the recording.</p>' },
    ]),
  },
  {
    id: 'promo',
    name: 'Offer / promotion',
    blurb: 'Big claim, one bold button',
    subject: 'A special offer for you',
    layout: 'branded',
    blocks: D([
      { type: 'heading', text: 'Something special, {{first_name}}', align: 'center' },
      { type: 'text', html: '<p style="text-align:center">One sentence on the offer and why it\'s worth acting on now.</p>' },
      { type: 'spacer', size: 8 },
      { type: 'button', label: 'Claim the offer', href: '', color: '', align: 'center' },
      { type: 'spacer', size: 12 },
      { type: 'text', html: '<p style="text-align:center;font-size:11px;color:#a3a1a9">Offer ends — terms apply.</p>' },
    ]),
  },
  {
    id: 'followup',
    name: 'Personal follow-up',
    blurb: 'Reads like a one-to-one email',
    subject: 'Quick follow-up',
    layout: 'plain',
    blocks: D([
      { type: 'text', html: '<p>Hi {{first_name}},</p><p>Just circling back on my last note — I know inboxes get busy.</p><p>Would it be worth a quick 15-minute call this week? Happy to work around your schedule.</p><p>Either way, just hit reply and let me know.</p><p>Best,<br/>Your name</p>' },
    ]),
  },
  {
    id: 'announcement',
    name: 'Announcement',
    blurb: 'One piece of news, clearly',
    subject: 'An announcement from the team',
    layout: 'clean',
    blocks: D([
      { type: 'heading', text: 'Some news from us', align: 'left' },
      { type: 'text', html: '<p>Hi {{first_name}},</p><p>The announcement in one short paragraph: what\'s changing, when, and what it means for you.</p>' },
      { type: 'divider' },
      { type: 'text', html: '<p>What this means in practice — a couple of plain-language sentences answering the obvious questions.</p>' },
      { type: 'button', label: 'Learn more', href: '', color: '', align: 'left' },
    ]),
  },
  {
    id: 'thanks',
    name: 'Thank you',
    blurb: 'Gratitude, no ask',
    subject: 'Thank you',
    layout: 'clean',
    blocks: D([
      { type: 'heading', text: 'Thank you, {{first_name}}', align: 'center' },
      { type: 'text', html: '<p style="text-align:center">A short, sincere note. No pitch, no button — just appreciation for their business, their time, or a milestone you hit together.</p>' },
      { type: 'spacer', size: 12 },
      { type: 'text', html: '<p style="text-align:center">— The whole team</p>' },
    ]),
  },
]
