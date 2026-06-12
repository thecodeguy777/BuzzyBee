// Maps a task-status color token (stored on task_statuses.color) to the Tailwind
// classes each view needs. Literal strings so Tailwind's scanner keeps them.
export type StatusColor =
  | 'neutral'
  | 'primary'
  | 'success'
  | 'error'
  | 'warning'
  | 'info'
  | 'muted'

export interface StatusClasses {
  /** Board column header tint (CRM-pipeline style — soft fill, base-content text). */
  tintBg: string
  /** Count badge on the tinted header (slightly stronger than tintBg). */
  badgeBg: string
  /** Table group pill background. */
  pillBg: string
  /** Table group pill / dot foreground. */
  pillFg: string
  /** Small status dot. */
  dot: string
  /** Table progress-bar fill. */
  bar: string
}

const MAP: Record<StatusColor, StatusClasses> = {
  neutral: { tintBg: 'bg-base-300/60', badgeBg: 'bg-base-content/10', pillBg: 'bg-base-200',   pillFg: 'text-base-content/70', dot: 'bg-base-content/40', bar: 'bg-base-content/40' },
  primary: { tintBg: 'bg-primary/10',  badgeBg: 'bg-primary/20',      pillBg: 'bg-primary/10', pillFg: 'text-primary',         dot: 'bg-primary',         bar: 'bg-primary' },
  success: { tintBg: 'bg-success/10',  badgeBg: 'bg-success/20',      pillBg: 'bg-success/10', pillFg: 'text-success',         dot: 'bg-success',         bar: 'bg-success' },
  error:   { tintBg: 'bg-error/10',    badgeBg: 'bg-error/20',        pillBg: 'bg-error/10',   pillFg: 'text-error',           dot: 'bg-error',           bar: 'bg-error' },
  warning: { tintBg: 'bg-warning/10',  badgeBg: 'bg-warning/20',      pillBg: 'bg-warning/10', pillFg: 'text-warning',         dot: 'bg-warning',         bar: 'bg-warning' },
  info:    { tintBg: 'bg-info/10',     badgeBg: 'bg-info/20',         pillBg: 'bg-info/10',    pillFg: 'text-info',            dot: 'bg-info',            bar: 'bg-info' },
  muted:   { tintBg: 'bg-base-300/40', badgeBg: 'bg-base-content/10', pillBg: 'bg-base-200',   pillFg: 'text-base-content/40', dot: 'bg-base-content/30', bar: 'bg-base-content/30' }
}

export function statusClasses(color: string | null | undefined): StatusClasses {
  return MAP[(color as StatusColor) in MAP ? (color as StatusColor) : 'neutral']
}

/** The picker palette for the column editor (label + swatch class). */
export const STATUS_COLOR_OPTIONS: { value: StatusColor; label: string; swatch: string }[] = [
  { value: 'neutral', label: 'Gray',   swatch: 'bg-base-content/55' },
  { value: 'primary', label: 'Blue',   swatch: 'bg-primary' },
  { value: 'info',    label: 'Sky',    swatch: 'bg-info' },
  { value: 'success', label: 'Green',  swatch: 'bg-success' },
  { value: 'warning', label: 'Amber',  swatch: 'bg-warning' },
  { value: 'error',   label: 'Red',    swatch: 'bg-error' },
  { value: 'muted',   label: 'Muted',  swatch: 'bg-base-content/30' }
]
