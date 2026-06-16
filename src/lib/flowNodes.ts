// flowNodes.ts — the single source of truth for the flow builder.
//
// One registry feeds: the palette tiles, the canvas node card, and the
// inspector field list. The `type` values mirror the run-flow edge function's
// EXECUTORS exactly, so the visual builder and the server runner never drift.
//
// `soon: true` nodes are shown in the palette (so the full recruiting vision is
// visible) but dimmed and not draggable until their executor + infra exist.

import {
  Mail, Webhook, Globe, CheckSquare, CircleDot, MessageSquare, MessageCircle,
  PhoneCall, FileSearch, ClipboardCheck, Brain, Sparkles, Video, Phone,
  GitBranch, Clock, Shuffle, UserCheck, Play, FileText, Handshake, Zap,
} from 'lucide-vue-next'
import type { Component } from 'vue'

export type FlowNodeType =
  | 'start' | 'email' | 'webhook' | 'http' | 'task' | 'status' | 'comms'
  | 'sms' | 'call' | 'resume' | 'skills' | 'personality' | 'iq'
  | 'video' | 'phone' | 'choice' | 'wait' | 'randomize' | 'manual'

/** One configurable field shown in the inspector for a node type. */
export interface FlowField {
  key: string
  label: string
  kind: 'text' | 'textarea' | 'url' | 'seg' | 'toggle' | 'field' | 'project' | 'status' | 'channel' | 'template'
  placeholder?: string
  options?: { v: string; label: string }[]
  /** show the "insert form field" helper next to this input */
  tokens?: boolean
  /** hide this field when the predicate is true (e.g. body when a design is picked) */
  hideWhen?: (c: Record<string, any>) => boolean
}

export interface FlowNodeDef {
  type: FlowNodeType
  label: string
  group: string
  icon: Component
  soon?: boolean
  fields: FlowField[]
  defaultConfig: Record<string, unknown>
  /** one-line shown on the canvas card */
  summary?: (c: Record<string, any>) => string
}

export const FLOW_GROUPS = ['Communication', 'Work', 'Team', 'Screening', 'Interviews', 'Flow control'] as const

export const FLOW_NODE_DEFS: FlowNodeDef[] = [
  // ── Communication ──
  {
    type: 'email', label: 'Email', group: 'Communication', icon: Mail,
    fields: [
      { key: 'templateId', label: 'Design', kind: 'template' },
      { key: 'to', label: 'To', kind: 'field', placeholder: 'name@example.com', tokens: true },
      { key: 'subject', label: 'Subject', kind: 'text', tokens: true, placeholder: "Blank = use the design's subject" },
      { key: 'body', label: 'Body', kind: 'textarea', tokens: true, hideWhen: (c) => !!c.templateId },
      { key: 'fromName', label: 'From name', kind: 'text' },
    ],
    defaultConfig: { templateId: null, to: '', subject: '', body: '', fromName: 'HiveMind' },
    summary: (c) => c.subject || 'Send an email',
  },
  {
    type: 'webhook', label: 'Webhook', group: 'Communication', icon: Webhook,
    fields: [{ key: 'url', label: 'URL', kind: 'url', placeholder: 'https://…' }],
    defaultConfig: { url: '' },
    summary: (c) => c.url || 'POST to a URL',
  },
  {
    type: 'http', label: 'HTTP Request', group: 'Communication', icon: Globe,
    fields: [
      { key: 'method', label: 'Method', kind: 'seg', options: [{ v: 'GET', label: 'GET' }, { v: 'POST', label: 'POST' }, { v: 'PUT', label: 'PUT' }] },
      { key: 'url', label: 'URL', kind: 'url', placeholder: 'https://…' },
      { key: 'body', label: 'Body', kind: 'textarea', tokens: true },
    ],
    defaultConfig: { method: 'POST', url: '', body: '' },
    summary: (c) => `${c.method || 'POST'} ${c.url || '…'}`,
  },
  { type: 'sms', label: 'SMS', group: 'Communication', icon: MessageCircle, soon: true, fields: [], defaultConfig: {} },
  { type: 'call', label: 'Voice Call', group: 'Communication', icon: PhoneCall, soon: true, fields: [], defaultConfig: {} },

  // ── Work ──
  {
    type: 'task', label: 'Create Task', group: 'Work', icon: CheckSquare,
    fields: [
      { key: 'title', label: 'Title', kind: 'text', tokens: true },
      { key: 'description', label: 'Description', kind: 'textarea', tokens: true },
      { key: 'project_id', label: 'Project', kind: 'project' },
      { key: 'status', label: 'Lands in', kind: 'status' },
      { key: 'priority', label: 'Priority', kind: 'seg', options: [{ v: 'low', label: 'Low' }, { v: 'normal', label: 'Normal' }, { v: 'high', label: 'High' }, { v: 'urgent', label: 'Urgent' }] },
    ],
    defaultConfig: { title: '', description: '', project_id: null, status: '', priority: 'normal' },
    summary: (c) => c.title || 'Create a task',
  },
  {
    type: 'status', label: 'Change Status', group: 'Work', icon: CircleDot,
    fields: [{ key: 'status', label: 'New status', kind: 'status' }],
    defaultConfig: { status: '' },
    summary: (c) => (c.status ? `Move to ${c.status}` : 'Change the task status'),
  },

  // ── Team ──
  {
    type: 'comms', label: 'Post to Comms', group: 'Team', icon: MessageSquare,
    fields: [
      { key: 'channel_id', label: 'Channel', kind: 'channel' },
      { key: 'text', label: 'Message', kind: 'textarea', tokens: true },
    ],
    defaultConfig: { channel_id: null, text: '' },
    summary: (c) => c.text || 'Post a message',
  },

  // ── Screening (soon) ──
  { type: 'resume', label: 'Resume Review', group: 'Screening', icon: FileSearch, soon: true, fields: [], defaultConfig: {} },
  { type: 'skills', label: 'Skills Test', group: 'Screening', icon: ClipboardCheck, soon: true, fields: [], defaultConfig: {} },
  { type: 'personality', label: 'Personality Test', group: 'Screening', icon: Sparkles, soon: true, fields: [], defaultConfig: {} },
  { type: 'iq', label: 'IQ Test', group: 'Screening', icon: Brain, soon: true, fields: [], defaultConfig: {} },

  // ── Interviews (soon) ──
  { type: 'video', label: 'Video Interview', group: 'Interviews', icon: Video, soon: true, fields: [], defaultConfig: {} },
  { type: 'phone', label: 'Phone Interview', group: 'Interviews', icon: Phone, soon: true, fields: [], defaultConfig: {} },

  // ── Flow control (soon — needs the durable engine / branching) ──
  { type: 'choice', label: 'Choice', group: 'Flow control', icon: GitBranch, soon: true, fields: [], defaultConfig: {} },
  { type: 'wait', label: 'Wait', group: 'Flow control', icon: Clock, soon: true, fields: [], defaultConfig: {} },
  { type: 'randomize', label: 'Randomize', group: 'Flow control', icon: Shuffle, soon: true, fields: [], defaultConfig: {} },
  { type: 'manual', label: 'Manual Review', group: 'Flow control', icon: UserCheck, soon: true, fields: [], defaultConfig: {} },
]

/** The fixed entry node — its label/icon come from the flow's trigger. */
export const START_DEF = { label: 'Trigger', icon: Play }

// ── Trigger registry — what STARTS a flow. Mirrors the dispatcher's trigger
// types. Live triggers fire today; "soon" ones await their DB event + runner
// context (Phase 2). `config` keys become the dispatcher's containment filter.
export interface TriggerDef {
  type: string
  label: string
  icon: Component
  soon?: boolean
  summary?: (config: Record<string, any>) => string
}
export const TRIGGER_DEFS: TriggerDef[] = [
  { type: 'form_submitted', label: 'Form submitted', icon: FileText, summary: (c) => (c.form_id ? 'A specific form' : 'Any form for this client') },
  { type: 'task_created', label: 'Task created', icon: CheckSquare, soon: true },
  { type: 'task_status_changed', label: 'Task status changed', icon: CircleDot, soon: true },
  { type: 'deal_created', label: 'Deal created', icon: Handshake, soon: true },
  { type: 'deal_stage_changed', label: 'Deal stage changed', icon: Handshake, soon: true },
  { type: 'dialer_disposition', label: 'Call dispositioned', icon: PhoneCall, soon: true },
  { type: 'manual', label: 'Manual — run now', icon: Zap, soon: true },
]
export function triggerDef(t: string): TriggerDef | undefined {
  return TRIGGER_DEFS.find((d) => d.type === t)
}

export function nodeDef(t: FlowNodeType): FlowNodeDef | undefined {
  return FLOW_NODE_DEFS.find((d) => d.type === t)
}

// ── Persisted graph shape (what's stored in flows.graph and read by run-flow) ──
export interface PersistedNode {
  id: string
  type: FlowNodeType
  config: Record<string, unknown>
  position: { x: number; y: number }
}
export interface PersistedEdge { id: string; source: string; target: string }
export interface FlowGraph { nodes: PersistedNode[]; edges: PersistedEdge[] }

/** Shared palette→canvas drag handoff (mirrors the email designer's designerDrag). */
export const flowDrag: { type: FlowNodeType | null } = { type: null }

export function newNodeId(): string {
  return 'n-' + Math.random().toString(36).slice(2, 9)
}
