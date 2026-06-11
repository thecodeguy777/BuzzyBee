<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import {
  X, MessageSquare, ListChecks, Mail, Pencil, Route, Phone, Calendar, Trophy,
  Building2, Users, Plus, Video, Linkedin, Globe, MapPin, BadgeDollarSign, UserRound,
} from 'lucide-vue-next'
import CrmAvatar from './CrmAvatar.vue'
import { useCrmStore } from '@/stores/crm'
import { useTeamStore } from '@/stores/team'
import { useAuthStore } from '@/stores/auth'
import { createMeetingRoom } from '@/lib/meetingRoom'
import { STAGES, LOST, fmtMoney, fmtDate, relTime, ACT_COLOR, type Company, type Deal, type ActivityType } from '@/lib/crmData'

const props = defineProps<{ company: Company }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'open-deal', deal: Deal): void
}>()

const crm = useCrmStore()
const team = useTeamStore()
const auth = useAuthStore()
const closeBtn = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const visible = ref(false)
let triggerEl: HTMLElement | null = null

// The store row is the live source — props.company can go stale after edits.
const co = computed(() => crm.company(props.company.id) ?? props.company)
const contacts = computed(() => crm.contactsFor(props.company.id))
const deals = computed(() => crm.dealsFor(props.company.id))
const activities = computed(() => crm.companyActivities(props.company.id))
const stageOf = (id: string) => [...STAGES, LOST].find((s) => s.id === id)

const ACT_ICONS: Record<ActivityType, unknown> = {
  message: MessageSquare, task: ListChecks, email: Mail, note: Pencil,
  stage: Route, call: Phone, meeting: Calendar, won: Trophy,
}
const actIcon = (t: ActivityType) => ACT_ICONS[t] ?? Pencil
const actColor = (t: ActivityType) => ACT_COLOR[t] ?? 'var(--color-base-content)'
function actorName(id: string | null) {
  return (id ? team.profiles[id]?.full_name?.split(' ')[0] : null) ?? 'System'
}

// ── About: click-away editable fields ─────────────────────────────────────────
type FieldKey = 'industry' | 'site' | 'address' | 'city' | 'country' | 'employees' | 'annualRevenue' | 'linkedin'
const FIELDS: { key: FieldKey; label: string; icon: unknown; placeholder: string }[] = [
  { key: 'industry', label: 'Industry', icon: Building2, placeholder: 'Add industry' },
  { key: 'site', label: 'Website', icon: Globe, placeholder: 'Add website' },
  { key: 'address', label: 'Address', icon: MapPin, placeholder: 'Add address' },
  { key: 'city', label: 'City', icon: MapPin, placeholder: 'Add city' },
  { key: 'country', label: 'Country', icon: MapPin, placeholder: 'Add country' },
  { key: 'employees', label: 'Employees', icon: Users, placeholder: 'Add headcount' },
  { key: 'annualRevenue', label: 'Annual revenue', icon: BadgeDollarSign, placeholder: 'Add revenue' },
  { key: 'linkedin', label: 'LinkedIn', icon: Linkedin, placeholder: 'Add LinkedIn URL' },
]
const fieldValue = (k: FieldKey): string => {
  const v = co.value[k]
  if (v == null || v === '') return ''
  if (k === 'annualRevenue') return fmtMoney(Number(v))
  return String(v)
}
function saveField(k: FieldKey, raw: string) {
  const v = raw.trim()
  if (k === 'employees') {
    const n = v === '' ? null : Number(v.replace(/[^0-9.]/g, ''))
    if (n !== co.value.employees) void crm.updateCompany(co.value.id, { employees: Number.isFinite(n as number) ? n : null })
    return
  }
  if (k === 'annualRevenue') {
    const n = v === '' ? null : Number(v.replace(/[^0-9.]/g, ''))
    if (n !== co.value.annualRevenue) void crm.updateCompany(co.value.id, { annualRevenue: Number.isFinite(n as number) ? n : null })
    return
  }
  if (v !== co.value[k]) void crm.updateCompany(co.value.id, { [k]: v })
}
const editing = ref<FieldKey | null>(null)
const draft = ref('')
function startEdit(k: FieldKey) {
  editing.value = k
  draft.value = k === 'annualRevenue' ? String(co.value.annualRevenue ?? '') : String(co.value[k] ?? '')
  void nextTick(() => panel.value?.querySelector<HTMLInputElement>('#crm-co-field')?.focus())
}
function commitEdit() {
  if (editing.value) saveField(editing.value, draft.value)
  editing.value = null
}

// ── Add contact ───────────────────────────────────────────────────────────────
const addingContact = ref(false)
const newContact = ref({ name: '', role: '', email: '', phone: '' })
async function submitContact() {
  if (!newContact.value.name.trim()) return
  const c = await crm.addContact({ companyId: co.value.id, ...newContact.value })
  if (c) {
    addingContact.value = false
    newContact.value = { name: '', role: '', email: '', phone: '' }
  }
}

// ── Log activity / calls / meetings ───────────────────────────────────────────
const logType = ref<ActivityType>('note')
const logBody = ref('')
const logContactId = ref<string>('')
const LOG_TYPES: { id: ActivityType; label: string; icon: unknown }[] = [
  { id: 'note', label: 'Note', icon: Pencil },
  { id: 'call', label: 'Call', icon: Phone },
  { id: 'meeting', label: 'Meeting', icon: Calendar },
  { id: 'email', label: 'Email', icon: Mail },
]
async function submitLog() {
  const body = logBody.value.trim()
  if (!body) return
  const ok = await crm.logCompanyActivity(co.value.id, {
    type: logType.value, body, contactId: logContactId.value || null,
  })
  if (ok) {
    logBody.value = ''
    logContactId.value = ''
  }
}

const startingMeeting = ref(false)
async function startMeeting() {
  if (!auth.user || startingMeeting.value) return
  startingMeeting.value = true
  try {
    const token = await createMeetingRoom(auth.user.id, co.value.name + ' meeting')
    window.open('/meet/' + token, '_blank', 'noopener')
    await crm.logCompanyActivity(co.value.id, {
      type: 'meeting', body: 'started a meeting', meta: '/meet/' + token,
      contactId: logContactId.value || null,
    })
  } catch (e) {
    crm.error = "Couldn't start a meeting — " + (e as Error).message
  } finally {
    startingMeeting.value = false
  }
}

// ── Panel chrome (same behavior as the deal panel) ────────────────────────────
function requestClose() {
  visible.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { requestClose(); return }
  if (e.key === 'Tab' && panel.value) {
    const els = Array.from(
      panel.value.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
    ).filter((el) => el.offsetParent !== null)
    if (!els.length) return
    const first = els[0], last = els[els.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
}
onMounted(() => {
  triggerEl = document.activeElement as HTMLElement
  document.addEventListener('keydown', onKey)
  void crm.loadCompanyActivities(props.company.id)
  visible.value = true
  void nextTick(() => closeBtn.value?.focus())
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  triggerEl?.focus?.()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="crm-scrim">
      <div v-if="visible" class="fixed inset-0 z-[90]" style="background: rgba(0,0,0,.5)" @click="requestClose" />
    </Transition>
    <Transition name="crm-panel" @after-leave="emit('close')">
      <div
        v-if="visible"
        ref="panel"
        class="fixed top-0 right-0 bottom-0 z-[95] w-[508px] max-w-[95vw] flex flex-col bg-base-100 border-l border-base-300"
        style="box-shadow: -16px 0 48px -16px rgba(0,0,0,.45)"
        role="dialog"
        aria-modal="true"
        :aria-label="co.name + ' — company details'"
      >
        <!-- header -->
        <div class="flex items-center gap-2.5 px-4 py-3.5 border-b border-base-300">
          <CrmAvatar :name="co.name" :initials="co.initials" :color="co.color" :size="34" :radius="9" />
          <div class="flex-1 min-w-0">
            <div class="text-[15px] font-bold text-base-content truncate">{{ co.name }}</div>
            <div class="text-[11.5px] text-base-content/40 flex items-center gap-1.5">
              <span
                class="inline-flex items-center gap-1 px-[7px] py-px rounded-full text-[10.5px] font-semibold"
                :style="co.isClient
                  ? { background: 'var(--st-done-bg)', color: 'var(--st-done-fg)' }
                  : { background: 'var(--st-rev-bg)', color: 'var(--st-rev-fg)' }"
              >{{ co.isClient ? 'Active client' : 'Prospect' }}</span>
              <span>Created {{ fmtDate(co.createdAt) }}</span>
              <span v-if="co.lastActivityAt">· Last activity {{ relTime(co.lastActivityAt) }}</span>
            </div>
          </div>
          <button ref="closeBtn" type="button" class="w-[30px] h-[30px] rounded-lg grid place-items-center text-base-content/60 hover:bg-base-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" aria-label="Close" @click="requestClose">
            <X :size="17" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto">
          <!-- quick actions -->
          <div class="px-5 py-3 border-b border-base-300 flex gap-2">
            <button
              type="button"
              class="flex-1 flex items-center justify-center gap-[7px] px-3 py-2 rounded-[9px] text-white text-[12.5px] font-bold disabled:opacity-60"
              :style="{ background: 'var(--accent)' }"
              :disabled="startingMeeting"
              @click="startMeeting"
            >
              <Video :size="15" /> {{ startingMeeting ? 'Starting…' : 'Start meeting' }}
            </button>
            <button
              type="button"
              class="flex-1 flex items-center justify-center gap-[7px] px-3 py-2 rounded-[9px] border border-base-300 text-base-content/70 text-[12.5px] font-semibold hover:bg-base-200"
              @click="logType = 'call'; void nextTick(() => panel?.querySelector<HTMLElement>('#crm-co-log')?.focus())"
            >
              <Phone :size="15" /> Log call
            </button>
          </div>

          <!-- about -->
          <div class="px-5 py-4 border-b border-base-300">
            <h3 class="text-[13.5px] font-bold text-base-content mb-2.5 m-0">About</h3>
            <div class="grid grid-cols-2 gap-x-4 gap-y-0.5">
              <div v-for="f in FIELDS" :key="f.key" class="min-h-[44px] py-1.5" :class="f.key === 'address' ? 'col-span-2' : ''">
                <div class="flex items-center gap-1.5 text-[11px] font-bold tracking-wide uppercase text-base-content/40 mb-0.5">
                  <component :is="f.icon" :size="12" /> {{ f.label }}
                </div>
                <input
                  v-if="editing === f.key"
                  id="crm-co-field"
                  v-model="draft"
                  class="w-full bg-base-200 rounded-md px-2 py-1 text-[13px] text-base-content outline-none ring-1 ring-primary/40"
                  @blur="commitEdit"
                  @keydown.enter.prevent="commitEdit"
                  @keydown.esc.stop="editing = null"
                />
                <a
                  v-else-if="f.key === 'linkedin' && co.linkedin"
                  class="block text-[13px] truncate hover:underline"
                  :style="{ color: 'var(--link)' }"
                  :href="co.linkedin.startsWith('http') ? co.linkedin : 'https://' + co.linkedin"
                  target="_blank" rel="noopener"
                  @click.stop
                >{{ co.linkedin }}</a>
                <button
                  v-else
                  type="button"
                  class="block w-full text-left text-[13px] truncate rounded-md -mx-1 px-1 py-0.5 hover:bg-base-200"
                  :class="fieldValue(f.key) ? 'text-base-content' : 'text-base-content/35'"
                  @click="startEdit(f.key)"
                >{{ fieldValue(f.key) || f.placeholder }}</button>
              </div>
            </div>
          </div>

          <!-- contacts -->
          <div class="px-5 py-4 border-b border-base-300">
            <div class="flex items-center justify-between mb-2.5">
              <h3 class="text-[13.5px] font-bold text-base-content m-0">Contacts <span class="text-base-content/40 font-semibold">{{ contacts.length || '' }}</span></h3>
              <button type="button" class="inline-flex items-center gap-1 text-[12px] font-bold" :style="{ color: 'var(--accent-fg)' }" @click="addingContact = !addingContact">
                <Plus :size="13" /> Add contact
              </button>
            </div>
            <form v-if="addingContact" class="grid grid-cols-2 gap-1.5 mb-2.5" @submit.prevent="submitContact">
              <input v-model="newContact.name" placeholder="Name *" class="crm-input col-span-2" required />
              <input v-model="newContact.role" placeholder="Title" class="crm-input" />
              <input v-model="newContact.email" placeholder="Email" type="email" class="crm-input" />
              <input v-model="newContact.phone" placeholder="Phone" class="crm-input col-span-2" />
              <button type="submit" class="col-span-2 py-1.5 rounded-[8px] text-white text-[12.5px] font-bold" :style="{ background: 'var(--accent)' }">Save contact</button>
            </form>
            <div v-if="contacts.length" class="flex flex-col gap-2">
              <div v-for="c in contacts" :key="c.id" class="flex items-center gap-2.5">
                <CrmAvatar :name="c.name" :initials="c.initials" :color="c.color" :size="26" :radius="7" />
                <div class="flex-1 min-w-0">
                  <div class="text-[13px] font-semibold text-base-content truncate">
                    {{ c.name }}
                    <span v-if="c.primary" class="text-[9px] font-bold px-1 rounded align-middle" :style="{ color: 'var(--accent-fg)', background: 'var(--accent-soft)' }">PRIMARY</span>
                  </div>
                  <div class="text-[11.5px] text-base-content/40 truncate">{{ [c.role, c.email].filter(Boolean).join(' · ') }}</div>
                </div>
                <a v-if="c.phone" :href="'tel:' + c.phone" class="text-[12px] tabular-nums hover:underline" :style="{ color: 'var(--link)' }">{{ c.phone }}</a>
              </div>
            </div>
            <div v-else-if="!addingContact" class="text-[12.5px] text-base-content/40">No contacts yet.</div>
          </div>

          <!-- deals -->
          <div class="px-5 py-4 border-b border-base-300">
            <h3 class="text-[13.5px] font-bold text-base-content mb-2.5 m-0">Deals <span class="text-base-content/40 font-semibold">{{ deals.length || '' }}</span></h3>
            <div v-if="deals.length" class="flex flex-col gap-1.5">
              <button
                v-for="d in deals"
                :key="d.id"
                type="button"
                class="crm-link flex items-center gap-2.5 px-3 py-2.5 rounded-[9px] border border-base-300 bg-base-100 text-left"
                @click="emit('open-deal', d)"
              >
                <span class="w-[7px] h-[7px] rounded-full flex-none" :style="{ background: stageOf(d.stage)?.dot }" />
                <span class="flex-1 text-[13px] font-semibold text-base-content truncate">{{ d.title }}</span>
                <span class="text-[11.5px] text-base-content/40">{{ stageOf(d.stage)?.label }}</span>
                <span class="text-[12.5px] font-bold text-base-content">{{ fmtMoney(d.value) }}</span>
              </button>
            </div>
            <div v-else class="text-[12.5px] text-base-content/40">No deals yet.</div>
          </div>

          <!-- activity -->
          <div class="px-5 py-4">
            <h3 class="text-[13.5px] font-bold text-base-content mb-3 m-0">Activity timeline</h3>

            <!-- composer -->
            <div class="rounded-[10px] border border-base-300 bg-base-100 p-2.5 mb-4">
              <div class="flex gap-1 mb-2">
                <button
                  v-for="t in LOG_TYPES"
                  :key="t.id"
                  type="button"
                  class="inline-flex items-center gap-1 px-2 py-1 rounded-[7px] text-[11.5px] font-semibold border"
                  :style="logType === t.id
                    ? { background: `color-mix(in oklab, ${actColor(t.id)} 14%, var(--color-base-100))`, color: actColor(t.id), borderColor: `color-mix(in oklab, ${actColor(t.id)} 40%, transparent)` }
                    : { background: 'var(--color-base-200)', borderColor: 'transparent', color: 'var(--color-base-content)', opacity: 0.7 }"
                  @click="logType = t.id"
                >
                  <component :is="t.icon" :size="12" /> {{ t.label }}
                </button>
                <select v-if="contacts.length" v-model="logContactId" class="ml-auto bg-base-200 rounded-[7px] px-1.5 text-[11.5px] text-base-content/70 outline-none" aria-label="With contact">
                  <option value="">With contact…</option>
                  <option v-for="c in contacts" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </div>
              <div class="flex gap-1.5">
                <input
                  id="crm-co-log"
                  v-model="logBody"
                  class="crm-input flex-1"
                  :placeholder="logType === 'note' ? 'Write a note…' : 'What happened on the ' + logType + '?'"
                  @keydown.enter.prevent="submitLog"
                />
                <button type="button" class="px-3 rounded-[8px] text-white text-[12.5px] font-bold disabled:opacity-50" :style="{ background: 'var(--accent)' }" :disabled="!logBody.trim()" @click="submitLog">Log</button>
              </div>
            </div>

            <div v-if="activities.length" class="relative">
              <div class="absolute left-[13px] top-3 bottom-3 w-[1.5px] bg-base-300" />
              <div v-for="a in activities" :key="a.id" class="flex gap-[11px] mb-[15px] relative">
                <span
                  class="w-[27px] h-[27px] rounded-lg flex-none grid place-items-center z-[1] border"
                  :style="{ background: `color-mix(in oklab, ${actColor(a.type)} 14%, var(--color-base-100))`, color: actColor(a.type), borderColor: 'var(--color-base-100)' }"
                >
                  <component :is="actIcon(a.type)" :size="14" />
                </span>
                <div class="flex-1 pt-px">
                  <div class="text-[13px] text-base-content leading-relaxed">
                    <strong class="font-bold">{{ actorName(a.actorId) }}</strong> <span class="text-base-content/60">{{ a.body }}</span>
                    <span v-if="a.contactId" class="inline-flex items-center gap-1 ml-1 text-[11.5px] text-base-content/50">
                      <UserRound :size="11" />{{ contacts.find((c) => c.id === a.contactId)?.name ?? 'contact' }}
                    </span>
                  </div>
                  <div class="flex items-center gap-2 mt-0.5">
                    <span class="text-[11px] text-base-content/40">{{ relTime(a.createdAt) }}</span>
                    <a
                      v-if="a.meta && a.meta.startsWith('/meet/')"
                      class="text-[10.5px] font-semibold px-1.5 py-px rounded-[5px] hover:underline"
                      :style="{ background: 'var(--accent-soft)', color: 'var(--accent-fg)' }"
                      :href="a.meta" target="_blank" rel="noopener"
                    >Join meeting</a>
                    <span v-else-if="a.meta" class="text-[10.5px] font-semibold px-1.5 py-px rounded-[5px] bg-base-200 text-base-content/60" :class="a.meta.startsWith('TASK') ? 'font-mono' : ''">{{ a.meta }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="text-[12.5px] text-base-content/40">No activity yet — log the first touch above.</div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.crm-scrim-enter-active, .crm-scrim-leave-active { transition: opacity 0.2s ease; }
.crm-scrim-enter-from, .crm-scrim-leave-to { opacity: 0; }

.crm-panel-enter-active { transition: transform 0.24s cubic-bezier(0.2, 0.8, 0.3, 1), opacity 0.24s ease; }
.crm-panel-leave-active { transition: transform 0.18s ease-in, opacity 0.18s ease-in; }
.crm-panel-enter-from, .crm-panel-leave-to { transform: translateX(28px); opacity: 0; }

.crm-link { transition: border-color 0.12s, background 0.12s; }
.crm-link:hover { border-color: var(--accent-bord); background: var(--color-base-200); }

.crm-input {
  background: var(--color-base-200);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
  color: var(--color-base-content);
  outline: none;
}
.crm-input:focus { box-shadow: 0 0 0 1.5px color-mix(in oklab, var(--accent) 50%, transparent); }
</style>
