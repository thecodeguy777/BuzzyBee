import type { InjectionKey } from 'vue'
import type { useChannelStream } from '@/composables/useChannelStream'

// The comms/huddle stream is instantiated ONCE at the workstation shell
// (WorkstationLayout) and provided down, so an active huddle + the live channel
// survive route changes (Tasks ↔ Calendar ↔ Board ↔ Comms). Both the full
// CommsView and the floating CommsDock inject this same instance.
export type CommsStream = ReturnType<typeof useChannelStream>
export const COMMS_STREAM: InjectionKey<CommsStream> = Symbol('comms-stream')
