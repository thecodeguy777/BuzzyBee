import { ref } from 'vue'

// Custom dialog system to replace Electron-disabled window.confirm/prompt.
// Both methods return Promises that resolve when the user acts.

export type DialogKind = 'confirm' | 'prompt'

interface BaseDialog {
  id: string
  kind: DialogKind
  title: string
  message?: string
  confirmLabel: string
  cancelLabel: string
  destructive: boolean
}

export interface ConfirmDialog extends BaseDialog {
  kind: 'confirm'
  resolve: (ok: boolean) => void
}

export interface PromptDialog extends BaseDialog {
  kind: 'prompt'
  placeholder?: string
  defaultValue: string
  required: boolean
  resolve: (value: string | null) => void
}

export type ActiveDialog = ConfirmDialog | PromptDialog

const queue = ref<ActiveDialog[]>([])

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function next() {
  // The first item in the queue is the currently visible dialog.
  // Removing the head of the queue advances to the next one.
  queue.value = queue.value.slice(1)
}

function confirm(opts: {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}): Promise<boolean> {
  return new Promise(resolve => {
    queue.value = [...queue.value, {
      id: uid(),
      kind: 'confirm',
      title: opts.title,
      message: opts.message,
      confirmLabel: opts.confirmLabel ?? (opts.destructive ? 'Delete' : 'Confirm'),
      cancelLabel: opts.cancelLabel ?? 'Cancel',
      destructive: !!opts.destructive,
      resolve: (ok) => { next(); resolve(ok) },
    }]
  })
}

function prompt(opts: {
  title: string
  message?: string
  placeholder?: string
  defaultValue?: string
  required?: boolean
  confirmLabel?: string
  cancelLabel?: string
}): Promise<string | null> {
  return new Promise(resolve => {
    queue.value = [...queue.value, {
      id: uid(),
      kind: 'prompt',
      title: opts.title,
      message: opts.message,
      placeholder: opts.placeholder,
      defaultValue: opts.defaultValue ?? '',
      required: !!opts.required,
      confirmLabel: opts.confirmLabel ?? 'OK',
      cancelLabel: opts.cancelLabel ?? 'Cancel',
      destructive: false,
      resolve: (val) => { next(); resolve(val) },
    }]
  })
}

export function useDialog() {
  return { queue, confirm, prompt }
}
