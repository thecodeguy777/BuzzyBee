import { ref } from 'vue'

export type ToastKind = 'success' | 'info' | 'warning' | 'error'

export interface Toast {
  id: string
  kind: ToastKind
  message: string
  // Optional secondary line (e.g. "3 added · 1 skipped")
  detail?: string
  // Auto-dismiss after this many ms. 0 = sticky.
  duration: number
  createdAt: number
}

// Singleton stack at module scope so any component can push.
const toasts = ref<Toast[]>([])

const DEFAULT_DURATION_MS = 3500
const ERROR_DURATION_MS = 6000
const MAX_VISIBLE = 4

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function push(kind: ToastKind, message: string, detail?: string, duration?: number) {
  const t: Toast = {
    id: uid(),
    kind,
    message,
    detail,
    duration: duration ?? (kind === 'error' ? ERROR_DURATION_MS : DEFAULT_DURATION_MS),
    createdAt: Date.now(),
  }
  toasts.value = [...toasts.value, t].slice(-MAX_VISIBLE)
  if (t.duration > 0) {
    setTimeout(() => dismiss(t.id), t.duration)
  }
  return t.id
}

function dismiss(id: string) {
  toasts.value = toasts.value.filter(t => t.id !== id)
}

function clear() {
  toasts.value = []
}

export function useToast() {
  return {
    toasts,
    dismiss,
    clear,
    success: (message: string, detail?: string) => push('success', message, detail),
    info:    (message: string, detail?: string) => push('info', message, detail),
    warning: (message: string, detail?: string) => push('warning', message, detail),
    error:   (message: string, detail?: string) => push('error', message, detail),
  }
}
