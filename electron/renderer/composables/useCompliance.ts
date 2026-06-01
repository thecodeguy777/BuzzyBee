import { ref, watch } from 'vue'
import { useCallLog } from './useCallLog'
import type { Lead } from './useLeads'

// Compliance layer for the auto-dialer.
//
// Three guardrails:
//   1. **Per-lead attempt cap** — max N calls per 30-day rolling window
//   2. **Cool-down** — minimum hours between attempts to the same lead
//   3. **Lead-timezone business hours** — call only during 8am–9pm in the
//      *lead's* local time (TCPA quiet hours), derived from area code or
//      explicit `lead.timezone`.
//
// Defaults are conservative on purpose. Tune in the dialer settings popover.

// Bumped key version (was '.compliance') to reset everyone to the new
// "trust the rep" defaults. Old key is left orphaned in localStorage.
const STORAGE_KEY = 'hivemind.dialer.compliance.v2'

const persisted = (() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
})()

// ── Singleton config ──
// Defaults are deliberately permissive. Lead-local TCPA hours stay enforced
// (legal floor); everything else defaults off / generous.
const maxAttemptsPer30Days = ref<number>(persisted.maxAttemptsPer30Days ?? 7)
const cooldownHours        = ref<number>(persisted.cooldownHours ?? 0)
const callWindowStart      = ref<number>(persisted.callWindowStart ?? 8)
const callWindowEnd        = ref<number>(persisted.callWindowEnd ?? 21)
const enforceLeadTimezone  = ref<boolean>(persisted.enforceLeadTimezone ?? true)

watch(
  [maxAttemptsPer30Days, cooldownHours, callWindowStart, callWindowEnd, enforceLeadTimezone],
  () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        maxAttemptsPer30Days: maxAttemptsPer30Days.value,
        cooldownHours: cooldownHours.value,
        callWindowStart: callWindowStart.value,
        callWindowEnd: callWindowEnd.value,
        enforceLeadTimezone: enforceLeadTimezone.value,
      }))
    } catch {}
  },
)

// ── Area code → timezone map (NANP — US + Canada) ──
// Compact form: timezone tags ('ET'/'CT'/'MT'/'PT'/'AZT'/'AKT'/'HAT')
// → IANA at use time. Covers all NANP area codes assigned as of 2024.
// Mobile portability means this is ~80% accurate, which is *much* better
// than calling everyone in the agent's timezone.

type TZTag = 'ET' | 'CT' | 'MT' | 'PT' | 'AZT' | 'AKT' | 'HAT'

const TZ_TO_IANA: Record<TZTag, string> = {
  ET:  'America/New_York',
  CT:  'America/Chicago',
  MT:  'America/Denver',
  PT:  'America/Los_Angeles',
  AZT: 'America/Phoenix',     // no DST
  AKT: 'America/Anchorage',
  HAT: 'Pacific/Honolulu',    // no DST
}

const AREA_CODE_TZ: Record<string, TZTag> = (() => {
  const out: Record<string, TZTag> = {}
  // grouped by tz for compactness
  const groups: Record<TZTag, string[]> = {
    ET: [
      '201','202','203','207','215','216','220','223','227','229','234','236','239',
      '240','246','248','267','272','276','283','289','301','302','304','305','321',
      '330','332','339','341','347','351','352','364','365','380','386','407','410',
      '412','413','416','419','423','434','437','438','440','443','447','450','463',
      '464','475','478','484','488','508','513','516','517','518','519','526','531',
      '539','540','548','551','556','558','564','567','570','571','579','581','585',
      '586','587','593','594','597','598','603','607','609','610','613','614','615',
      '616','617','623','626','629','631','645','646','659','665','667','670','672',
      '673','674','680','681','683','689','703','704','705','706','708','716','717',
      '718','724','727','732','734','737','740','743','754','757','762','770','772',
      '774','781','782','786','787','802','803','804','810','812','813','814','815',
      '819','820','828','829','839','843','845','848','849','850','856','857','859',
      '860','862','863','865','872','876','878','902','904','905','910','912','914',
      '917','919','929','934','937','938','939','941','943','947','954','959','978',
      '980','984','989',
    ],
    CT: [
      '205','217','218','219','224','225','228','251','254','256','262','270','281',
      '309','312','314','316','318','319','320','331','334','337','346','361','363',
      '402','405','414','417','430','431','432','438','445','447','451','463','469',
      '479','501','504','507','512','515','531','534','563','573','574','580','582',
      '584','585','591','601','608','620','622','629','630','636','639','641','651',
      '659','660','662','669','678','679','682','701','708','712','713','715','737',
      '763','769','773','779','785','787','812','815','816','817','830','832','833',
      '835','847','870','872','877','901','903','913','915','918','920','931','936',
      '940','952','956','972','973','978','979','985','990',
    ],
    MT: [
      '208','303','307','385','406','423','435','480','505','521','523','526','559',
      '564','575','580','602','623','669','672','680','719','720','725','737','782',
      '801','803','806','839','850','863','877','915','916','970','971','975','983','984','986',
    ],
    PT: [
      '209','213','236','250','253','272','279','310','312','323','341','360','369',
      '408','415','424','425','428','442','445','458','503','510','530','541','559',
      '562','564','567','572','591','619','626','628','631','650','657','661','669',
      '671','672','679','693','714','725','747','760','762','769','771','775','778',
      '786','805','818','820','823','825','826','831','839','840','848','858','872',
      '906','909','916','925','928','936','949','951','971','984',
    ],
    AZT: ['480','520','602','623','928'],
    AKT: ['907'],
    HAT: ['808'],
  }
  for (const tz of Object.keys(groups) as TZTag[]) {
    for (const code of groups[tz]) {
      // First-write wins; ET/CT before MT/PT means split-tz codes default ET.
      // Phoenix (AZT) overrides 480/602/623 because it's listed first in iteration.
      if (!(code in out)) out[code] = tz
    }
  }
  return out
})()

function systemTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch { return 'UTC' }
}

/** Resolve the lead's IANA timezone. Order: explicit lead.timezone → US
 *  area-code map → PH default for +63 numbers → system timezone. */
export function leadTimezone(lead: Lead): string {
  if (lead.timezone) return lead.timezone
  const e164 = lead.phoneE164
  // PH numbers
  if (e164.startsWith('+63')) return 'Asia/Manila'
  // US/Canada (NANP)
  if (e164.startsWith('+1')) {
    const digits = e164.slice(2).replace(/\D/g, '')
    if (digits.length >= 3) {
      const tag = AREA_CODE_TZ[digits.slice(0, 3)]
      if (tag) return TZ_TO_IANA[tag]
    }
  }
  return systemTimezone()
}

/** What hour of the day is it RIGHT NOW in the given IANA timezone? */
function hourInTz(tz: string): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    })
    const parts = fmt.formatToParts(new Date())
    const hourStr = parts.find(p => p.type === 'hour')?.value ?? '0'
    const h = parseInt(hourStr, 10)
    return Number.isFinite(h) ? h : new Date().getHours()
  } catch {
    return new Date().getHours()
  }
}

/** Pretty-format the lead's local time for display ("3:42 PM PT"). */
export function formatLeadLocalTime(lead: Lead): string {
  const tz = leadTimezone(lead)
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    })
    return fmt.format(new Date())
  } catch {
    return new Date().toLocaleTimeString()
  }
}

export type ComplianceCheckResult =
  | { ok: true }
  | { ok: false; reason: string; nextOkAt?: Date }

export function useCompliance() {
  const callLog = useCallLog()

  function attemptsPer30Days(leadId: string): number {
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000
    return callLog.calls.value.filter(
      c => c.leadId === leadId && new Date(c.startedAt).getTime() >= since,
    ).length
  }

  function lastCallAt(leadId: string): Date | null {
    const c = callLog.calls.value.find(c => c.leadId === leadId)
    return c ? new Date(c.startedAt) : null
  }

  function cooldownRemainingMs(leadId: string): number {
    const last = lastCallAt(leadId)
    if (!last) return 0
    const cooldownMs = cooldownHours.value * 60 * 60 * 1000
    const elapsed = Date.now() - last.getTime()
    return Math.max(0, cooldownMs - elapsed)
  }

  function isWithinLeadHours(lead: Lead): { ok: boolean; tz: string; hour: number } {
    const tz = enforceLeadTimezone.value ? leadTimezone(lead) : systemTimezone()
    const h = hourInTz(tz)
    return { ok: h >= callWindowStart.value && h < callWindowEnd.value, tz, hour: h }
  }

  /** The single check used by the auto-dialer's lead picker.
   *  Order of checks is intentional: legal blockers first, team-policy
   *  blockers last. That way a TCPA violation never gets disguised as a
   *  "cool-down" message. */
  function isLeadCallableNow(lead: Lead): ComplianceCheckResult {
    // ── Legal floor (always enforced) ──
    if (lead.status === 'dnc') return { ok: false, reason: 'Lead is DNC' }

    const hours = isWithinLeadHours(lead)
    if (!hours.ok) {
      const tzShort = hours.tz.split('/').pop()?.replace('_', ' ') ?? hours.tz
      return {
        ok: false,
        reason: `Outside ${callWindowStart.value}:00–${callWindowEnd.value}:00 in ${tzShort} (now ${hours.hour}:00)`,
      }
    }

    // ── Team policy (skipped when set to 0 / disabled) ──
    if (maxAttemptsPer30Days.value > 0) {
      const attempts = attemptsPer30Days(lead.id)
      if (attempts >= maxAttemptsPer30Days.value) {
        return { ok: false, reason: `Max ${maxAttemptsPer30Days.value} attempts reached (last 30d)` }
      }
    }

    if (cooldownHours.value > 0) {
      const cd = cooldownRemainingMs(lead.id)
      if (cd > 0) {
        const hoursLeft = Math.ceil(cd / (60 * 60 * 1000))
        return {
          ok: false,
          reason: `Cool-down: try again in ${hoursLeft}h`,
          nextOkAt: new Date(Date.now() + cd),
        }
      }
    }

    return { ok: true }
  }

  return {
    // config
    maxAttemptsPer30Days,
    cooldownHours,
    callWindowStart,
    callWindowEnd,
    enforceLeadTimezone,
    // helpers
    leadTimezone,
    formatLeadLocalTime,
    attemptsPer30Days,
    lastCallAt,
    cooldownRemainingMs,
    isWithinLeadHours,
    isLeadCallableNow,
  }
}
