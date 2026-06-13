// Form field model — definitions, defaults, templates, and the task-column
// map. Ported from the Form Builder design (forms-fields.jsx / forms-app.jsx).
// Each input field can map to a task column so a submission becomes a task.
import type { Component } from 'vue'
import {
  Type, AlignLeft, Mail, Hash, ChevronDown, CircleDot, CheckSquare,
  Calendar, User, Star, Paperclip, Heading, Minus,
} from 'lucide-vue-next'

export type FieldType =
  | 'short' | 'long' | 'email' | 'number'
  | 'select' | 'radio' | 'checkbox'
  | 'date' | 'people' | 'rating' | 'file'
  | 'heading' | 'para' | 'divider'

/** Which task column a field's answer can feed. */
export type MapKey = 'none' | 'name' | 'desc' | 'status' | 'priority' | 'due' | 'assignee'

export interface FieldProps {
  label?: string
  placeholder?: string
  help?: string
  required?: boolean
  options?: string[]
  max?: number
  map: MapKey
}
export interface FormField {
  id: string
  type: FieldType
  props: FieldProps
}
export interface FormStep {
  id: string
  title: string
  fields: FormField[]
}
export interface FormStructure {
  steps: FormStep[]
}

export interface FieldDef {
  type: FieldType
  label: string
  icon: Component
  group: 'Basic' | 'Choice' | 'Advanced' | 'Layout'
  /** Default column this field maps to (null = unmapped). */
  map: MapKey | null
}

export const FIELD_DEFS: FieldDef[] = [
  { type: 'short', label: 'Short text', icon: Type, group: 'Basic', map: 'name' },
  { type: 'long', label: 'Long text', icon: AlignLeft, group: 'Basic', map: 'desc' },
  { type: 'email', label: 'Email', icon: Mail, group: 'Basic', map: 'none' },
  { type: 'number', label: 'Number', icon: Hash, group: 'Basic', map: 'none' },
  { type: 'select', label: 'Dropdown', icon: ChevronDown, group: 'Choice', map: 'priority' },
  { type: 'radio', label: 'Single choice', icon: CircleDot, group: 'Choice', map: 'status' },
  { type: 'checkbox', label: 'Checkboxes', icon: CheckSquare, group: 'Choice', map: 'none' },
  { type: 'date', label: 'Date', icon: Calendar, group: 'Advanced', map: 'due' },
  { type: 'people', label: 'Assignee', icon: User, group: 'Advanced', map: 'assignee' },
  { type: 'rating', label: 'Rating', icon: Star, group: 'Advanced', map: 'none' },
  { type: 'file', label: 'File upload', icon: Paperclip, group: 'Advanced', map: 'none' },
  { type: 'heading', label: 'Heading', icon: Heading, group: 'Layout', map: 'none' },
  { type: 'para', label: 'Paragraph', icon: Type, group: 'Layout', map: 'none' },
  { type: 'divider', label: 'Divider', icon: Minus, group: 'Layout', map: 'none' },
]

export const TABLE_COLS: { key: MapKey; label: string }[] = [
  { key: 'none', label: "Don't map" },
  { key: 'name', label: 'Task name' },
  { key: 'desc', label: 'Description' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'due', label: 'Due date' },
  { key: 'assignee', label: 'Assignee' },
]

export function fieldDef(type: FieldType): FieldDef {
  return FIELD_DEFS.find((d) => d.type === type) ?? FIELD_DEFS[0]
}

/** Field types that collect an answer (vs. layout-only). */
export function isInput(type: FieldType): boolean {
  return !['heading', 'para', 'divider'].includes(type)
}
export function hasOptions(type: FieldType): boolean {
  return ['select', 'radio', 'checkbox'].includes(type)
}

let _fid = 0
export function newFieldId(): string {
  _fid += 1
  return `f${_fid}-${Math.random().toString(36).slice(2, 5)}`
}
function newStepId(): string {
  return `s-${Math.random().toString(36).slice(2, 6)}`
}

function fieldDefaults(type: FieldType): FieldProps {
  const base: FieldProps = { label: '', help: '', required: false, map: 'none' }
  const d = fieldDef(type)
  base.map = d.map ?? 'none'
  switch (type) {
    case 'short': return { ...base, label: 'Task name', placeholder: 'e.g. Design the homepage hero', map: 'name', required: true }
    case 'long': return { ...base, label: 'Details', placeholder: 'Describe what you need…', map: 'desc' }
    case 'email': return { ...base, label: 'Your email', placeholder: 'name@company.com' }
    case 'number': return { ...base, label: 'Number', placeholder: '0' }
    case 'select': return { ...base, label: 'Priority', options: ['Low', 'Medium', 'High', 'Urgent'], map: 'priority' }
    case 'radio': return { ...base, label: 'Status', options: ['To do', 'In progress', 'Blocked'], map: 'status' }
    case 'checkbox': return { ...base, label: 'Deliverables', options: ['Design', 'Copy', 'Development'] }
    case 'date': return { ...base, label: 'Due date', map: 'due' }
    case 'people': return { ...base, label: 'Assign to', map: 'assignee' }
    case 'rating': return { ...base, label: 'How urgent is this?', max: 5 }
    case 'file': return { ...base, label: 'Attachments', help: 'PDF, PNG, JPG up to 10MB' }
    case 'heading': return { ...base, label: 'Section heading' }
    case 'para': return { ...base, label: 'Add a short description or instructions for this section.' }
    case 'divider': return { ...base }
    default: return base
  }
}

export function makeField(type: FieldType): FormField {
  return { id: newFieldId(), type, props: fieldDefaults(type) }
}

// ── Templates ─────────────────────────────────────────────────────────────────
export type TemplateName = 'Client request' | 'Creative brief' | 'Bug report' | 'Blank'

const TEMPLATES: Record<TemplateName, { multi: boolean; steps: { title: string; fields: FieldType[] }[] }> = {
  'Client request': { multi: false, steps: [{ title: 'Request', fields: ['short', 'long', 'select', 'date', 'file'] }] },
  'Creative brief': {
    multi: true,
    steps: [
      { title: 'About you', fields: ['short', 'email'] },
      { title: 'The project', fields: ['heading', 'long', 'checkbox', 'date'] },
      { title: 'Priority', fields: ['select', 'rating', 'file'] },
    ],
  },
  'Bug report': { multi: false, steps: [{ title: 'Report', fields: ['short', 'long', 'radio', 'file'] }] },
  'Blank': { multi: false, steps: [{ title: 'Step 1', fields: ['short'] }] },
}
export const TEMPLATE_NAMES = Object.keys(TEMPLATES) as TemplateName[]

export function buildTemplate(name: TemplateName): { multi: boolean; steps: FormStep[] } {
  const tpl = TEMPLATES[name]
  return {
    multi: tpl.multi,
    steps: tpl.steps.map((s) => ({ id: newStepId(), title: s.title, fields: s.fields.map((t) => makeField(t)) })),
  }
}

/** Parse a "Low/Medium/High/Urgent"-style answer into a task priority (1–4). */
export function parsePriority(v: string): 1 | 2 | 3 | 4 {
  const s = v.toLowerCase()
  if (s === 'urgent') return 1
  if (s === 'high') return 2
  if (s === 'low') return 4
  return 3
}
