import { onUnmounted } from 'vue'
import type { DialerCallStatus } from '../../shared/ipc-channels-dialer'
import type { DispositionOutcome } from './useLeads'
import type { ToastKind } from './useToast'

// Cross-window message bus via BroadcastChannel.
// Both windows (control + floating dialer) load the same renderer code;
// each renderer creates its own channel to the shared namespace and they
// can hear each other in realtime.
//
// Use this for transient signals (a call started, a lead was selected, a
// dial request was made). Persistent state still lives in localStorage +
// the storage event — broadcast is the live nervous system, storage is the
// long-term memory.

export type BroadcastEvent =
  | { type: 'call:start';   leadId: string | null; leadName: string | null; toE164: string }
  | { type: 'call:status';  status: DialerCallStatus; elapsedMs: number; leadId: string | null }
  | { type: 'call:end';     leadId: string | null }
  | { type: 'call:dispositioned'; leadId: string | null; outcome: DispositionOutcome; notes?: string }
  | { type: 'lead:select';  leadId: string }
  | { type: 'dial:request'; leadId: string }   // CRM → dialer
  | { type: 'toast';        kind: ToastKind; message: string; detail?: string }

const CHANNEL = 'hivemind-dialer-bus'

const channel: BroadcastChannel | null =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null

type Listener<T extends BroadcastEvent['type']> = (
  ev: Extract<BroadcastEvent, { type: T }>,
) => void

const listeners = new Map<BroadcastEvent['type'], Set<Listener<any>>>()

if (channel) {
  channel.addEventListener('message', (e: MessageEvent<BroadcastEvent>) => {
    const set = listeners.get(e.data?.type)
    if (!set) return
    for (const cb of set) {
      try { cb(e.data) } catch (err) { console.error('[broadcast]', err) }
    }
  })
}

function broadcast(ev: BroadcastEvent) {
  channel?.postMessage(ev)
}

/** Subscribe to a broadcast event type. Returns an unsubscribe fn. */
function on<T extends BroadcastEvent['type']>(type: T, cb: Listener<T>): () => void {
  let set = listeners.get(type)
  if (!set) { set = new Set(); listeners.set(type, set) }
  set.add(cb)
  return () => { set!.delete(cb) }
}

export function useBroadcast() {
  const subs: Array<() => void> = []

  function subscribe<T extends BroadcastEvent['type']>(type: T, cb: Listener<T>) {
    subs.push(on(type, cb))
  }

  onUnmounted(() => {
    for (const off of subs) off()
    subs.length = 0
  })

  return {
    send: broadcast,
    on: subscribe,
    /** Fire-and-forget version that doesn't auto-cleanup (use only at module scope). */
    onForever: on,
  }
}

/** Module-scope subscriber for use outside Vue setup contexts. */
export function broadcastSubscribe<T extends BroadcastEvent['type']>(
  type: T,
  cb: Listener<T>,
): () => void {
  return on(type, cb)
}

export function broadcastSend(ev: BroadcastEvent): void {
  broadcast(ev)
}
