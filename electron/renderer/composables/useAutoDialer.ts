import { ref, computed, watch } from 'vue'
import { useDialer } from './useDialer'
import { useLeads, STAGE_LABEL, type Lead, type DispositionOutcome } from './useLeads'
import { useCallLog } from './useCallLog'
import { useToast } from './useToast'
import { useCompliance } from './useCompliance'
import { useDialog } from './useDialog'
import { broadcastSend, broadcastSubscribe } from './useBroadcast'

export type PacingMode = 'preview' | 'power'

/**
 * Which slice of the lead pool the auto-dialer picks from.
 *   cold       — only fresh leads (status='new')  → prospecting mode
 *   pipeline   — every open lead (lead..negotiation)  → standard sales workflow
 *   callbacks  — only leads with a callback scheduled (overdue or upcoming)
 *   uncontacted — leads with zero prior calls
 */
export type DialScope = 'cold' | 'pipeline' | 'callbacks' | 'uncontacted'

export type AutoDialerState =
  | 'idle'
  | 'previewing'
  | 'dialing'
  | 'in-call'
  | 'awaiting-disposition'
  | 'paused'

const POWER_GAP_MS = 800
// Bumped to .v2 alongside the compliance reset so users get the new
// "trust the rep" defaults: manual pacing, pipeline scope, no agent-hour gate.
const STORAGE_KEY = 'hivemind.dialer.config.v2'

// ── Singleton state at module scope ──

const persisted = (() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
})()

const dialer = useDialer()
const leads = useLeads()
const callLog = useCallLog()
const toast = useToast()
const compliance = useCompliance()
const dialog = useDialog()

const state = ref<AutoDialerState>('idle')
const currentLeadId = ref<string | null>(null)
const currentCallLogId = ref<string | null>(null)
const previewSecondsLeft = ref(0)
const lastError = ref<string | null>(null)

// Preview is the default for consultative sales (deliberate per-call pacing).
// Power can be picked explicitly from the toolbar buttons.
const pacingMode = ref<PacingMode>(
  persisted.pacingMode === 'power' ? 'power' : 'preview',
)
const previewCountdownSeconds = ref<number>(
  Math.max(3, Math.min(10, persisted.previewCountdownSeconds ?? 5)),
)
const dialScope = ref<DialScope>(persisted.dialScope ?? 'pipeline')
const businessHoursEnabled = ref<boolean>(persisted.businessHoursEnabled ?? false)
const businessHoursStart = ref<number>(persisted.businessHoursStart ?? 8)
const businessHoursEnd = ref<number>(persisted.businessHoursEnd ?? 21)

let previewTimer: ReturnType<typeof setInterval> | null = null
let gapTimer: ReturnType<typeof setTimeout> | null = null

watch(
  [pacingMode, previewCountdownSeconds, dialScope, businessHoursEnabled, businessHoursStart, businessHoursEnd],
  () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        pacingMode: pacingMode.value,
        previewCountdownSeconds: previewCountdownSeconds.value,
        dialScope: dialScope.value,
        businessHoursEnabled: businessHoursEnabled.value,
        businessHoursStart: businessHoursStart.value,
        businessHoursEnd: businessHoursEnd.value,
      }))
    } catch {}
  },
)

const currentLead = computed<Lead | null>(() =>
  currentLeadId.value ? leads.leads.value.find(l => l.id === currentLeadId.value) ?? null : null,
)

const isCampaignActive = computed(() => state.value !== 'idle')
const canResume = computed(() => state.value === 'paused')

function clearTimers() {
  if (previewTimer) { clearInterval(previewTimer); previewTimer = null }
  if (gapTimer) { clearTimeout(gapTimer); gapTimer = null }
}

function isWithinBusinessHours(): boolean {
  if (!businessHoursEnabled.value) return true
  const now = new Date()
  const hour = now.getHours()
  return hour >= businessHoursStart.value && hour < businessHoursEnd.value
}

/** Apply the dial-scope filter on top of the base dialable list. */
function inScope(lead: Lead): boolean {
  switch (dialScope.value) {
    case 'cold':
      return lead.status === 'new' && lead.stage === 'lead'
    case 'uncontacted':
      return lead.callCount === 0
    case 'callbacks':
      return !!lead.nextCallbackAt
    case 'pipeline':
    default:
      // Any open stage. The base list already excluded closed-won/lost + DNC.
      return true
  }
}

const leadsInScope = computed(() =>
  leads.dialableLeads.value.filter(inScope),
)

function pickNextLead(): Lead | null {
  // Walk the sorted, in-scope dialable list and pick the first one that
  // passes ALL compliance checks (DNC, attempt cap, cool-down, lead-local hrs).
  for (const lead of leadsInScope.value) {
    if (compliance.isLeadCallableNow(lead).ok) return lead
  }
  return null
}

async function startCampaign(mode?: PacingMode) {
  if (isCampaignActive.value) return
  if (mode) pacingMode.value = mode
  if (!isWithinBusinessHours()) {
    lastError.value = `Outside business hours (${businessHoursStart.value}:00–${businessHoursEnd.value}:00). Toggle the guard off or wait.`
    toast.error('Outside business hours', `${businessHoursStart.value}:00–${businessHoursEnd.value}:00 only`)
    return
  }
  lastError.value = null
  toast.info(`${pacingMode.value === 'preview' ? 'Preview' : 'Power'} dial started`)
  await dialNext()
}

async function dialLead(leadId: string) {
  const lead = leads.leads.value.find(l => l.id === leadId)
  if (!lead) return
  // Compliance gate — DNC, attempt cap, cool-down, lead-local hours.
  const check = compliance.isLeadCallableNow(lead)
  if (!check.ok) {
    lastError.value = check.reason
    toast.warning(check.reason, lead.fullName)
    return
  }
  // Legacy agent-local hour guard (kept for the case where the user disabled
  // the lead-timezone enforcement and wants to also gate on their own hours).
  if (!isWithinBusinessHours()) {
    lastError.value = `Outside business hours.`
    toast.error('Outside agent business hours')
    return
  }
  lastError.value = null
  clearTimers()
  currentLeadId.value = leadId
  leads.updateLead(leadId, { status: 'calling' })
  state.value = 'dialing'
  // Await — startCall is async and returns the row id we'll use to close
  // the log later. Without await we'd store a Promise and break endCall.
  currentCallLogId.value = await callLog.startCall({
    leadId,
    leadName: lead.fullName,
    toE164: lead.phoneE164,
    direction: 'outbound',
  })
  // Tell the other window (CRM) we're now calling this lead.
  broadcastSend({
    type: 'call:start',
    leadId,
    leadName: lead.fullName,
    toE164: lead.phoneE164,
  })
  await dialer.dial(lead.phoneE164)
}

/** One-off keypad call (no lead). DialerPanel calls this before dialer.dial(). */
async function logKeypadCall(toE164: string): Promise<string> {
  // Synthetic 'dialing' state so the watch knows to close the log on hangup.
  // No leadId set → watch resets to 'idle' instead of 'awaiting-disposition'.
  state.value = 'dialing'
  const id = await callLog.startCall({
    leadId: null,
    leadName: null,
    toE164,
    direction: 'outbound',
  })
  currentCallLogId.value = id
  return id
}

async function dialNext() {
  clearTimers()
  if (!isWithinBusinessHours()) {
    lastError.value = `Outside business hours.`
    state.value = 'paused'
    toast.warning('Paused: outside business hours')
    return
  }
  const next = pickNextLead()
  if (!next) {
    state.value = 'idle'
    currentLeadId.value = null
    const scopeCount = leadsInScope.value.length
    if (scopeCount === 0) {
      lastError.value = `No leads in "${dialScope.value}" scope.`
      toast.info('Scope empty', `Try a wider scope or import more leads`)
    } else {
      lastError.value = `${scopeCount} leads in scope, all pending compliance.`
      toast.info('Pending compliance', `${scopeCount} leads waiting on cool-down or hours`)
    }
    return
  }
  if (pacingMode.value === 'preview') {
    currentLeadId.value = next.id
    state.value = 'previewing'
    previewSecondsLeft.value = previewCountdownSeconds.value
    previewTimer = setInterval(() => {
      previewSecondsLeft.value -= 1
      if (previewSecondsLeft.value <= 0) {
        clearTimers()
        dialLead(next.id)
      }
    }, 1000)
  } else {
    await dialLead(next.id)
  }
}

function skipPreview() {
  if (state.value !== 'previewing') return
  clearTimers()
  if (currentLeadId.value) dialLead(currentLeadId.value)
}

function cancelPreview() {
  clearTimers()
  if (currentLeadId.value) {
    const lead = leads.leads.value.find(l => l.id === currentLeadId.value)
    if (lead && lead.status === 'calling') leads.updateLead(currentLeadId.value, { status: 'new' })
  }
  currentLeadId.value = null
  state.value = 'idle'
}

function pauseCampaign() {
  clearTimers()
  state.value = 'paused'
  toast.info('Campaign paused')
}

function resumeCampaign() {
  if (state.value !== 'paused') return
  state.value = 'idle'
  toast.info('Campaign resumed')
  dialNext()
}

function stopCampaign() {
  clearTimers()
  if (dialer.isActive.value) dialer.hangup()
  if (currentLeadId.value) {
    const lead = leads.leads.value.find(l => l.id === currentLeadId.value)
    if (lead && lead.status === 'calling') leads.updateLead(currentLeadId.value, { status: 'new' })
  }
  currentLeadId.value = null
  currentCallLogId.value = null
  state.value = 'idle'
  toast.info('Campaign stopped')
}

const DISPO_LABEL: Record<DispositionOutcome, string> = {
  'contacted': 'Contacted',
  'callback': 'Callback set',
  'voicemail': 'Voicemail left',
  'no-answer': 'No answer',
  'not-interested': 'Not interested',
  'wrong-number': 'Wrong number',
  'dnc': 'Do Not Call',
}

function applyDisposition(outcome: DispositionOutcome, opts?: { callbackAt?: string; notes?: string }) {
  const leadName = currentLead.value?.fullName
  const dispoLeadId = currentLeadId.value
  let stageAdvancedTo: ReturnType<typeof leads.dispositionLead>['stageAdvancedTo'] = null

  if (currentLeadId.value) {
    const result = leads.dispositionLead(currentLeadId.value, outcome, { callbackAt: opts?.callbackAt })
    stageAdvancedTo = result.stageAdvancedTo
  }
  if (currentCallLogId.value) {
    callLog.applyDisposition(currentCallLogId.value, outcome, opts)
  }

  // Tiered feedback: highlight the stage advance when it happened, otherwise
  // just confirm the disposition.
  if (stageAdvancedTo) {
    toast.success(
      `${DISPO_LABEL[outcome]} → ${STAGE_LABEL[stageAdvancedTo]}`,
      `${leadName ?? 'Lead'} moved to ${STAGE_LABEL[stageAdvancedTo]} stage`,
    )
  } else {
    toast.success(`Logged: ${DISPO_LABEL[outcome]}`, leadName)
  }

  // "Not interested" — offer to terminally close the deal as Lost.
  // Fire-and-forget; agent picks during/after the gap, no campaign blocking.
  if (outcome === 'not-interested' && dispoLeadId) {
    const leadAtTime = dispoLeadId
    const nameAtTime = leadName
    dialog
      .confirm({
        title: 'Mark this deal as Closed Lost?',
        message: `${nameAtTime ?? 'The lead'} said they're not interested. Closing means they’re removed from the pipeline. Pick "Keep in pipeline" if you might re-engage later.`,
        destructive: false,
        confirmLabel: 'Mark Closed Lost',
        cancelLabel: 'Keep in pipeline',
      })
      .then((ok) => {
        if (!ok) return
        leads.setStage(leadAtTime, 'closed-lost', {
          wonLostReason: opts?.notes || 'Said not interested on call',
        })
        toast.info('Moved to Closed Lost', nameAtTime ?? undefined)
      })
      .catch(() => {})
  }

  broadcastSend({
    type: 'call:dispositioned',
    leadId: dispoLeadId,
    outcome,
    notes: opts?.notes,
  })
  currentCallLogId.value = null

  if (pacingMode.value === 'power') {
    gapTimer = setTimeout(() => {
      currentLeadId.value = null
      dialNext()
    }, POWER_GAP_MS)
  } else {
    // preview mode — chain into next preview countdown
    currentLeadId.value = null
    dialNext()
  }
}

// Module-level watch — single subscription drives everyone.
watch(() => dialer.status.value, (s, prev) => {
  if (s === 'in-call' && state.value === 'dialing') {
    state.value = 'in-call'
    if (currentCallLogId.value) callLog.markAnswered(currentCallLogId.value)
  }
  if ((s === 'ended' || s === 'failed') && (state.value === 'dialing' || state.value === 'in-call')) {
    if (currentCallLogId.value) {
      const endStatus = s === 'failed'
        ? 'failed'
        : prev === 'in-call' ? 'completed' : 'canceled'
      callLog.endCall(currentCallLogId.value, endStatus)
    }
    broadcastSend({ type: 'call:end', leadId: currentLeadId.value })
    if (currentLeadId.value) {
      state.value = 'awaiting-disposition'
    } else {
      state.value = 'idle'
      currentCallLogId.value = null
    }
  }
})

// Live status pings so the CRM banner can show duration/state in realtime.
watch(
  [() => dialer.status.value, () => dialer.elapsedMs.value],
  ([status, elapsed]) => {
    broadcastSend({
      type: 'call:status',
      status,
      elapsedMs: elapsed,
      leadId: currentLeadId.value,
    })
  },
)

// Listen for click-to-call from the CRM window.
broadcastSubscribe('dial:request', (ev) => {
  if (state.value === 'dialing' || state.value === 'in-call') return
  // Surface ourselves in case we were hidden, then dial.
  ;(window as any).dialerAPI?.window?.show?.()
  dialLead(ev.leadId)
})

export function useAutoDialer() {
  return {
    state,
    currentLead,
    currentLeadId,
    currentCallLogId,
    previewSecondsLeft,
    pacingMode,
    previewCountdownSeconds,
    dialScope,
    leadsInScope,
    businessHoursEnabled,
    businessHoursStart,
    businessHoursEnd,
    lastError,
    isCampaignActive,
    canResume,
    dialer,
    leads,
    callLog,
    startCampaign,
    dialLead,
    dialNext,
    skipPreview,
    cancelPreview,
    pauseCampaign,
    resumeCampaign,
    stopCampaign,
    applyDisposition,
    logKeypadCall,
    compliance,
  }
}
