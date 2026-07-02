// Email designer document model v2 (Claude Design handoff: Email Designer).
// A design is { g, blocks }: global styles (background, card, width, accent,
// font, text colors) plus a block list. The canvas renders blocks as Vue
// components (WYSIWYG, inline-editable); compileEmailDoc() renders the SAME
// model to table-based, inline-styled HTML for sending. v2 docs persist whole
// in body_blocks; v1 arrays (the old flat block editor) convert on open.

import type { EmailBlock as V1Block } from '@/lib/emailBlocks'

export interface EmailDocG {
  bg: string
  card: boolean
  cardBg: string
  width: number
  accent: string
  font: string
  text: string
  muted: string
}

export type DocBlockType =
  | 'header' | 'heading' | 'text' | 'image' | 'button'
  | 'imageText' | 'columns' | 'divider' | 'spacer' | 'social' | 'footer'

export interface DocBlock {
  id: string
  type: DocBlockType
  props: Record<string, any>
}

export interface EmailDoc {
  v: 2
  g: EmailDocG
  blocks: DocBlock[]
}

/** What body_blocks may contain across versions. */
export type StoredDesign = V1Block[] | EmailDoc

// Shared HTML5 drag state between the palette and the canvas (dataTransfer
// payloads aren't readable during dragover, so the usual module-singleton).
export const designerDrag: { current: null | { kind: 'new'; type: DocBlockType } | { kind: 'move'; id: string } } = {
  current: null,
}

export const DEFAULT_G: EmailDocG = {
  bg: '#f4f2f6', card: true, cardBg: '#ffffff', width: 600,
  accent: '#611f69', font: 'Hanken Grotesk', text: '#1b1a1d', muted: '#7c7a86',
}

let n = 0
export const docBlockId = () => 'db-' + Date.now().toString(36) + '-' + (n++).toString(36)

export const BLOCK_DEFS: { type: DocBlockType; label: string; group: 'Content' | 'Layout' | 'Spacing' }[] = [
  { type: 'header', label: 'Header', group: 'Layout' },
  { type: 'heading', label: 'Heading', group: 'Content' },
  { type: 'text', label: 'Text', group: 'Content' },
  { type: 'image', label: 'Image', group: 'Content' },
  { type: 'button', label: 'Button', group: 'Content' },
  { type: 'imageText', label: 'Image + text', group: 'Layout' },
  { type: 'columns', label: '2 columns', group: 'Layout' },
  { type: 'divider', label: 'Divider', group: 'Spacing' },
  { type: 'spacer', label: 'Spacer', group: 'Spacing' },
  { type: 'social', label: 'Social', group: 'Layout' },
  { type: 'footer', label: 'Footer', group: 'Layout' },
]

export function defaultProps(type: DocBlockType): Record<string, any> {
  switch (type) {
    case 'header': return { brand: 'Your brand', tagline: '', align: 'left', showLogo: true }
    case 'heading': return { text: 'Your headline goes here', level: 'h2', align: 'left', color: '' }
    case 'text': return { html: 'Write your message here. Click to edit — keep it short and scannable.', align: 'left', size: 16, color: '' }
    case 'image': return { src: '', alt: '', width: 100, align: 'center', radius: 8, href: '' }
    case 'button': return { label: 'Get started', href: 'https://', align: 'left', bg: 'accent', color: '#ffffff', radius: 8, size: 'md', full: false }
    case 'imageText': return { src: '', imgSide: 'left', heading: 'Feature headline', text: 'A short supporting sentence that explains the value.', btn: 'Learn more', href: '', showBtn: true }
    case 'columns': return { left: '<strong>Column one</strong><br>Describe the first point here.', right: '<strong>Column two</strong><br>Describe the second point here.', align: 'left' }
    case 'divider': return { color: '#e5e2ea', thickness: 1, style: 'solid', width: 100 }
    case 'spacer': return { height: 28 }
    case 'social': return { networks: ['x', 'in', 'ig', 'fb'], align: 'center', links: {} }
    case 'footer': return { company: 'Your company', address: '', unsub: true }
  }
}
export const makeDocBlock = (type: DocBlockType): DocBlock =>
  ({ id: docBlockId(), type, props: defaultProps(type) })

// Palette quick-start templates (block type sequences).
export const DOC_TEMPLATES: Record<string, DocBlockType[]> = {
  Blank: ['heading', 'text'],
  Announcement: ['header', 'heading', 'text', 'button', 'divider', 'footer'],
  Newsletter: ['header', 'heading', 'text', 'imageText', 'divider', 'columns', 'social', 'footer'],
  Promotion: ['header', 'image', 'heading', 'text', 'button', 'spacer', 'footer'],
}
export const buildDocTemplate = (name: string): DocBlock[] =>
  (DOC_TEMPLATES[name] ?? DOC_TEMPLATES.Blank).map(makeDocBlock)

export function newDoc(template = 'Blank'): EmailDoc {
  return { v: 2, g: { ...DEFAULT_G }, blocks: buildDocTemplate(template) }
}

// ── v1 → v2 conversion ────────────────────────────────────────────────────────
export function isEmailDoc(stored: unknown): stored is EmailDoc {
  return !!stored && !Array.isArray(stored) && (stored as EmailDoc).v === 2
}
export function storedHasBlocks(stored: unknown): boolean {
  if (!stored) return false
  if (Array.isArray(stored)) return stored.length > 0
  return isEmailDoc(stored) && stored.blocks.length > 0
}

/** Open anything saved (v1 array or v2 doc) as an editable v2 doc. */
export function asDoc(stored: StoredDesign | null, accent?: string): EmailDoc {
  if (isEmailDoc(stored)) return JSON.parse(JSON.stringify(stored)) as EmailDoc
  const g = { ...DEFAULT_G, ...(accent ? { accent } : {}) }
  const blocks: DocBlock[] = []
  for (const b of stored ?? []) {
    switch (b.type) {
      case 'heading':
        blocks.push({ id: docBlockId(), type: 'heading', props: { ...defaultProps('heading'), text: b.text, align: b.align } })
        break
      case 'text':
        blocks.push({ id: docBlockId(), type: 'text', props: { ...defaultProps('text'), html: b.html } })
        break
      case 'image':
        blocks.push({ id: docBlockId(), type: 'image', props: { ...defaultProps('image'), src: b.src, alt: b.alt, href: b.href } })
        break
      case 'button':
        blocks.push({ id: docBlockId(), type: 'button', props: { ...defaultProps('button'), label: b.label, href: b.href, align: b.align, bg: b.color || 'accent' } })
        break
      case 'divider':
        blocks.push(makeDocBlock('divider'))
        break
      case 'spacer':
        blocks.push({ id: docBlockId(), type: 'spacer', props: { height: b.size } })
        break
    }
  }
  return { v: 2, g, blocks }
}

// ── Compiler: doc → complete email body HTML (table-based, inline-styled) ─────
const esc = (s: string) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const FONT_STACKS: Record<string, string> = {
  'Hanken Grotesk': "'Hanken Grotesk', 'Helvetica Neue', Arial, sans-serif",
  Georgia: "Georgia, 'Times New Roman', serif",
  Helvetica: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  Courier: "'Courier New', Courier, monospace",
}
const fontStack = (f: string) => FONT_STACKS[f] ?? FONT_STACKS.Helvetica

const accentOf = (v: string, g: EmailDocG) => (v === 'accent' || !v ? g.accent : v)

const SOCIAL_LABEL: Record<string, string> = { x: 'X', in: 'in', ig: 'IG', fb: 'f', yt: '▶' }

function compileBlock(b: DocBlock, g: EmailDocG): string {
  const p = b.props
  const font = fontStack(g.font)
  switch (b.type) {
    case 'header': {
      const logo = p.showLogo
        ? `<td style="width:46px;vertical-align:middle"><div style="width:38px;height:38px;border-radius:9px;background:${g.accent};color:#ffffff;font:800 18px/38px ${font};text-align:center">${esc((p.brand || 'A').replace(/<[^>]*>/g, '')[0] ?? 'A')}</div></td>`
        : ''
      return `<table role="presentation" cellpadding="0" cellspacing="0" ${p.align === 'center' ? 'style="margin:0 auto"' : ''}><tr>${logo}`
        + `<td style="vertical-align:middle;text-align:${p.align}">`
        + `<div style="font:800 19px/1.3 ${font};color:${g.text};letter-spacing:-.3px">${p.brand}</div>`
        + (p.tagline ? `<div style="font:400 13px/1.4 ${font};color:${g.muted};margin-top:1px">${p.tagline}</div>` : '')
        + `</td></tr></table>`
    }
    case 'heading': {
      const sz = p.level === 'h1' ? 30 : p.level === 'h3' ? 20 : 24
      return `<div style="font:800 ${sz}px/1.25 ${font};letter-spacing:-.4px;text-align:${p.align};color:${accentOf(p.color, g) || g.text}">${p.text}</div>`
    }
    case 'text':
      return `<div style="font:400 ${p.size}px/1.6 ${font};text-align:${p.align};color:${p.color || g.text}">${p.html}</div>`
    case 'image': {
      if (!String(p.src ?? '').trim()) return ''
      const img = `<img src="${esc(p.src)}" alt="${esc(p.alt)}" width="${Math.round((g.width - 64) * p.width / 100)}" style="display:block;width:${p.width}%;height:auto;border-radius:${p.radius}px" />`
      const inner = String(p.href ?? '').trim() ? `<a href="${esc(p.href)}" target="_blank">${img}</a>` : img
      const align = p.align === 'center' ? 'center' : p.align
      return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td align="${align}">${inner}</td></tr></table>`
    }
    case 'button': {
      const pad = p.size === 'lg' ? '14px 28px' : p.size === 'sm' ? '8px 16px' : '11px 22px'
      const fs = p.size === 'lg' ? 16 : p.size === 'sm' ? 13 : 14.5
      const table = `<table role="presentation" cellpadding="0" cellspacing="0" ${p.full ? 'width="100%"' : ''}><tr>`
        + `<td style="border-radius:${p.radius}px;background:${accentOf(p.bg, g)};text-align:center">`
        + `<a href="${esc(p.href || '#')}" target="_blank" style="display:${p.full ? 'block' : 'inline-block'};padding:${pad};font:700 ${fs}px ${font};color:${p.color};text-decoration:none;border-radius:${p.radius}px">${p.label}</a>`
        + `</td></tr></table>`
      if (p.full) return table
      const align = p.align === 'center' ? 'center' : p.align
      return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td align="${align}">${table}</td></tr></table>`
    }
    case 'imageText': {
      const hasImg = !!String(p.src ?? '').trim()
      const imgTd = hasImg
        ? `<td style="width:42%;vertical-align:top;padding:${p.imgSide === 'left' ? '0 14px 0 0' : '0 0 0 14px'}"><img src="${esc(p.src)}" alt="" width="${Math.round((g.width - 64) * 0.42)}" style="display:block;width:100%;height:auto;border-radius:10px" /></td>`
        : ''
      const txtTd = `<td style="vertical-align:middle">`
        + `<div style="font:750 18px/1.3 ${font};color:${g.text}">${p.heading}</div>`
        + `<div style="font:400 14px/1.55 ${font};color:${g.muted};margin-top:7px">${p.text}</div>`
        + (p.showBtn ? `<div style="margin-top:9px"><a href="${esc(p.href || '#')}" target="_blank" style="font:700 13.5px ${font};color:${g.accent};text-decoration:none">${p.btn} &rarr;</a></div>` : '')
        + `</td>`
      const cells = p.imgSide === 'left' ? imgTd + txtTd : txtTd + imgTd
      return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>${cells}</tr></table>`
    }
    case 'columns':
      return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>`
        + `<td style="width:50%;vertical-align:top;padding-right:12px;font:400 14px/1.6 ${font};color:${g.text};text-align:${p.align}">${p.left}</td>`
        + `<td style="width:50%;vertical-align:top;padding-left:12px;font:400 14px/1.6 ${font};color:${g.text};text-align:${p.align}">${p.right}</td>`
        + `</tr></table>`
    case 'divider':
      return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td align="center">`
        + `<div style="width:${p.width}%;border-top:${p.thickness}px ${p.style} ${p.color};font-size:0;line-height:0">&nbsp;</div>`
        + `</td></tr></table>`
    case 'spacer':
      return `<div style="height:${p.height}px;line-height:1px;font-size:1px">&nbsp;</div>`
    case 'social': {
      const cells = (p.networks as string[]).map((nw) => {
        const href = esc((p.links?.[nw] as string) || '#')
        return `<td style="padding:0 5px"><a href="${href}" target="_blank" style="display:inline-block;width:34px;height:34px;border-radius:17px;background:${g.accent};color:#ffffff;font:700 13px/34px ${font};text-align:center;text-decoration:none">${SOCIAL_LABEL[nw] ?? nw}</a></td>`
      }).join('')
      const align = p.align === 'center' ? 'center' : p.align
      return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td align="${align}"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table></td></tr></table>`
    }
    case 'footer':
      return `<div style="text-align:center;font:400 12px/1.6 ${font};color:${g.muted}">`
        + `<div style="font-weight:700;color:${g.text}">${p.company}</div>`
        + (p.address ? `<div>${p.address}</div>` : '')
        // {{unsubscribe_url}} resolves per recipient at send time; legacy docs
        // saved with href="#" get patched by send-campaign's ensureUnsubLink.
        + (p.unsub ? `<div style="margin-top:6px">You're receiving this from ${p.company} via BuzzyHive. <a href="{{unsubscribe_url}}" style="color:${g.accent};text-decoration:underline">Unsubscribe</a></div>` : '')
        + `</div>`
  }
}

/**
 * Full email body for a v2 doc — background, card, blocks, everything.
 * Campaigns built from these save with layout 'doc' so the sender uses the
 * HTML as-is (no second wrapper, no appended footer).
 */
export function compileEmailDoc(doc: EmailDoc): string {
  const { g } = doc
  const rows = doc.blocks
    .map((b) => compileBlock(b, g))
    .filter(Boolean)
    .map((html) => `<tr><td style="padding:10px 32px">${html}</td></tr>`)
    .join('')
  const card = g.card
    ? `style="width:${g.width}px;max-width:100%;background:${g.cardBg};border-radius:14px;overflow:hidden"`
    : `style="width:${g.width}px;max-width:100%"`
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${g.bg};padding:28px 12px">`
    + `<tr><td align="center">`
    + `<table role="presentation" cellpadding="0" cellspacing="0" ${card}>`
    + `<tr><td style="padding:12px 0">`
    + `<table role="presentation" cellpadding="0" cellspacing="0" width="100%">${rows}</table>`
    + `</td></tr></table>`
    + `</td></tr></table>`
}
