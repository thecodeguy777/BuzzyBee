import type { InjectionKey } from 'vue'
import type { useChannelStream } from '@/composables/useChannelStream'
import type { useHuddlePresence } from '@/composables/useHuddlePresence'

// The comms/huddle stream is instantiated ONCE at the workstation shell
// (WorkstationLayout) and provided down, so an active huddle + the live channel
// survive route changes (Tasks ↔ Calendar ↔ Board ↔ Comms). Both the full
// CommsView and the floating CommsDock inject this same instance.
export type CommsStream = ReturnType<typeof useChannelStream>
export const COMMS_STREAM: InjectionKey<CommsStream> = Symbol('comms-stream')

// Cross-channel huddle presence (which channels have active huddles), also
// provided from the workstation shell. See useHuddlePresence.
export type HuddlePresence = ReturnType<typeof useHuddlePresence>
export const HUDDLE_PRESENCE: InjectionKey<HuddlePresence> = Symbol('huddle-presence')
