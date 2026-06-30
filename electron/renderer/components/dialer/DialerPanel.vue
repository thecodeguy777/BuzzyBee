<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { Phone, User, Building2, Headphones } from 'lucide-vue-next'
import { useAutoDialer } from '../../composables/useAutoDialer'
import { useSoftphone } from '../../composables/useSoftphone'
import Dialpad from './Dialpad.vue'
import ActiveCall from './ActiveCall.vue'
import DispositionPicker from './DispositionPicker.vue'
import LeadStatusBadge from './LeadStatusBadge.vue'
import CrmStageBadge from '../crm/CrmStageBadge.vue'

const auto = useAutoDialer()
const dialer = auto.dialer
const softphone = useSoftphone()
const input = ref('')
const showKeypadDuringCall = ref(false)

// When an outbound call is happening, the dialer's REST poll is the source
// of truth — SIP session state only tells us "audio pipe to SignalWire is
// open", not "destination connected". Defer to dialer status during calls.
const softphoneLabel = computed(() => {
  if (dialer.isActive.value || dialer.status.value === 'ended' || dialer.status.value === 'failed') {
    switch (dialer.status.value) {
      case 'connecting': return 'Calling…'
      case 'ringing':    return 'Ringing destination'
      case 'in-call':    return 'On call'
      case 'ended':      return 'Call ended'
      case 'failed':     return dialer.error.value ?? 'Call failed'
    }
  }
  switch (softphone.status.value) {
    case 'idle':          return 'Starting…'
    case 'connecting':    return 'Connecting…'
    case 'registering':   return 'Registering…'
    case 'registered':    return 'Headset ready'
    case 'ringing':       return 'Incoming…'
    case 'in-call':       return 'On call'
    case 'unregistering': return 'Stopping…'
    case 'failed':        return softphone.error.value ?? 'Softphone offline'
    default: return ''
  }
})

const softphoneDotClass = computed(() => {
  if (dialer.isActive.value || dialer.status.value === 'ended' || dialer.status.value === 'failed') {
    const s = dialer.status.value
    if (s === 'in-call') return 'bg-blue-500'                  // solid — actually connected
    if (s === 'ringing' || s === 'connecting') return 'bg-blue-500 animate-pulse'
    if (s === 'failed') return 'bg-red-500'
    return 'bg-base-300'                                       // 'ended' — neutral
  }
  const s = softphone.status.value
  if (s === 'registered') return 'bg-green-500'
  if (s === 'in-call' || s === 'ringing') return 'bg-blue-500 animate-pulse'
  if (s === 'failed') return 'bg-red-500'
  return 'bg-amber-500 animate-pulse'
})

const showDialpad = computed(() => {
  if (auto.state.value === 'awaiting-disposition') return false
  if (!dialer.isActive.value) return true
  return showKeypadDuringCall.value
})

const showLeadCard = computed(() => !!auto.currentLead.value)

const canDial = computed(() => input.value.trim().length >= 4 && !dialer.isActive.value)

function formatForDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) {
    return `1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return raw
}

async function startCall() {
  if (!canDial.value) return
  const toE164 = input.value.startsWith('+') ? input.value : `+${input.value.replace(/\D/g, '')}`
  // One-off keypad calls log too — useAutoDialer.logKeypadCall starts the
  // call-log entry and primes the state machine so the end-watch closes it.
  // Await so currentCallLogId is a real id string by the time the dialer
  // status watch starts firing.
  await auto.logKeypadCall(toE164)
  await dialer.dial(toE164)
}

function endCall() {
  dialer.hangup()
}

function onDigitDuringCall(digit: string) {
  if (dialer.inCall.value) dialer.sendDTMF(digit)
}

// One-off call (no lead): when call ends, just reset and clear input.
// Lead-based calls: stay on the awaiting-disposition view until user picks
// an outcome, then auto-dialer handles next steps.
watch(() => dialer.status.value, (s) => {
  if ((s === 'ended' || s === 'failed') && !auto.currentLead.value) {
    setTimeout(() => {
      dialer.reset()
      showKeypadDuringCall.value = false
      input.value = ''
    }, 2500)
  }
})

// ── Physical keyboard / numpad ──────────────────────────────
// When the Dialer panel is visible and no text input has focus, route
// digit keys into the dial buffer. Enter places the call; Backspace
// deletes; * and # are accepted; + only at start.

const panelEl = ref<HTMLElement | null>(null)

function panelVisible(): boolean {
  // v-show toggles display:none on parent, which makes offsetParent null.
  return !!panelEl.value && panelEl.value.offsetParent !== null
}

function focusInTextInput(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  return false
}

function onKey(e: KeyboardEvent) {
  if (!panelVisible()) return
  if (focusInTextInput()) return
  if (e.ctrlKey || e.metaKey || e.altKey) return

  const key = e.key

  // Digits, *, #
  if (/^[0-9*#]$/.test(key)) {
    e.preventDefault()
    if (dialer.inCall.value) {
      dialer.sendDTMF(key)
    } else if (!dialer.isActive.value) {
      input.value = input.value + key
    }
    return
  }

  // + only at the start (E.164 prefix)
  if (key === '+' && !dialer.isActive.value && input.value.length === 0) {
    e.preventDefault()
    input.value = '+'
    return
  }

  // Backspace deletes the last digit (only when not in a call)
  if (key === 'Backspace' && !dialer.isActive.value) {
    e.preventDefault()
    input.value = input.value.slice(0, -1)
    return
  }

  // Enter places the call
  if (key === 'Enter' && canDial.value) {
    e.preventDefault()
    startCall()
    return
  }

  // Escape clears or hangs up
  if (key === 'Escape') {
    if (dialer.isActive.value) {
      e.preventDefault()
      endCall()
    } else if (input.value) {
      e.preventDefault()
      input.value = ''
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  // Bootstrap the embedded softphone — registers to SignalWire so the
  // rep leg of click-to-call rings inside BuzzyHive itself instead of Zoiper.
  softphone.start().catch((err) => console.error('[DialerPanel] softphone start:', err))
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  // Don't stop the softphone here — the dialer window may be temporarily hidden
  // but the registration should persist. softphone.stop() only on app quit.
})
</script>

<template>
  <div ref="panelEl" class="p-3 h-full flex flex-col gap-2">
    <!-- Softphone status pill — shows whether the in-app rep leg is ready -->
    <div class="flex items-center gap-1.5 text-[10px] text-base-content/60">
      <Headphones class="w-3 h-3 shrink-0" />
      <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="softphoneDotClass" />
      <span class="truncate">{{ softphoneLabel }}</span>
    </div>

    <!-- Lead context card (visible when lead-based call in progress) -->
    <div
      v-if="showLeadCard"
      class="border border-primary/20 bg-primary/5 rounded-lg p-2.5 space-y-1"
    >
      <div class="flex items-center justify-between gap-1">
        <div class="flex items-center gap-1.5 min-w-0">
          <User class="w-3 h-3 text-primary shrink-0" />
          <span class="text-xs font-medium text-base-content truncate">
            {{ auto.currentLead.value?.fullName }}
          </span>
        </div>
        <div v-if="auto.currentLead.value" class="flex items-center gap-1 shrink-0">
          <CrmStageBadge :stage="auto.currentLead.value.stage" size="xs" />
          <LeadStatusBadge :status="auto.currentLead.value.status" size="xs" />
        </div>
      </div>
      <div v-if="auto.currentLead.value?.company" class="flex items-center gap-1.5 text-[10px] text-base-content/60">
        <Building2 class="w-2.5 h-2.5 shrink-0" />
        <span class="truncate">{{ auto.currentLead.value.company }}</span>
      </div>
      <div v-if="auto.currentLead.value?.notes" class="text-[10px] text-base-content/60 italic line-clamp-2">
        {{ auto.currentLead.value.notes }}
      </div>
      <div v-if="auto.currentLead.value && auto.currentLead.value.callCount > 0" class="text-[10px] text-base-content/40">
        {{ auto.currentLead.value.callCount }} prior attempt{{ auto.currentLead.value.callCount > 1 ? 's' : '' }}
      </div>
    </div>

    <!-- Disposition picker (shown after call, lead-based) -->
    <DispositionPicker
      v-if="auto.state.value === 'awaiting-disposition' && auto.currentLead.value"
      :lead-name="auto.currentLead.value.fullName"
      @submit="(payload) => auto.applyDisposition(payload.outcome, { callbackAt: payload.callbackAt, notes: payload.notes })"
    />

    <!-- Active call view (during connecting/ringing/in-call/ended for one-offs) -->
    <ActiveCall
      v-if="(dialer.isActive.value || (dialer.status.value === 'ended' && !auto.currentLead.value))"
      :status="dialer.status.value"
      :remote-e164="dialer.remoteE164.value"
      :elapsed-ms="dialer.elapsedMs.value"
      :muted="dialer.muted.value"
      @hangup="endCall"
      @toggle-mute="dialer.toggleMute()"
      @toggle-dtmf="showKeypadDuringCall = !showKeypadDuringCall"
    />

    <!-- Number entry (no active call, no lead in progress) -->
    <div
      v-if="!dialer.isActive.value && dialer.status.value !== 'ended' && auto.state.value !== 'awaiting-disposition'"
      class="text-center mt-1 mb-3"
    >
      <div class="min-h-[40px] flex items-center justify-center">
        <span v-if="input" class="text-2xl font-light tracking-wide text-base-content">
          {{ formatForDisplay(input) }}
        </span>
        <span v-else class="text-xs text-base-content/30">
          Enter a number, or pick a lead
        </span>
      </div>
    </div>

    <!-- Dialpad — scrolls if cramped, never hides the call button -->
    <div v-if="showDialpad" class="flex-1 min-h-0 overflow-y-auto">
      <Dialpad
        v-model:value="input"
        :disabled="dialer.isActive.value && !dialer.inCall.value"
        @press="onDigitDuringCall"
      />
    </div>

    <!-- Call button — pinned at the bottom of the panel, always visible -->
    <div
      v-if="showDialpad && !dialer.isActive.value"
      class="shrink-0 flex flex-col items-center gap-0.5 pt-1"
    >
      <button
        class="w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-md hover:shadow-lg disabled:cursor-not-allowed"
        :class="canDial
          ? 'bg-green-500 hover:bg-green-600 hover:scale-105 active:scale-95'
          : 'bg-green-500/30'"
        :disabled="!canDial"
        :title="canDial ? `Call ${formatForDisplay(input)}` : 'Type at least 4 digits to call'"
        @click="startCall"
      >
        <Phone class="w-6 h-6 text-white" fill="currentColor" />
      </button>
      <span
        class="text-[10px] uppercase tracking-wider font-semibold"
        :class="canDial ? 'text-green-600 dark:text-green-400' : 'text-base-content/40'"
      >
        {{ canDial
          ? 'Tap to call'
          : input.length === 0
            ? 'Enter number'
            : `${Math.max(0, 4 - input.length)} more digit${input.length === 3 ? '' : 's'}` }}
      </span>
    </div>

    <div v-if="dialer.error.value" class="text-xs text-red-500 text-center">
      {{ dialer.error.value }}
    </div>
  </div>
</template>
