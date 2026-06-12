<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import {
  X, Mail, Send, Users, Building2, UserCheck, Search, CheckCircle2,
  AlertTriangle, Info, Eye, AtSign, Zap, Calendar, PenLine, Code2,
  ChevronDown, BookmarkPlus, Pencil, Trash2, LayoutTemplate,
} from 'lucide-vue-next'
import { useCrmStore } from '@/stores/crm'
import { useCampaignsStore, type Campaign, type CampaignRecipientInput } from '@/stores/campaigns'
import { useEmailTemplatesStore, type EmailTemplate } from '@/stores/emailTemplates'
import { useAuthStore } from '@/stores/auth'
import { EMAIL_LAYOUTS, renderEmailHtml, DEFAULT_ACCENT, type EmailLayout } from '@/lib/emailLayouts'
import { storedHasBlocks } from '@/lib/emailDoc'
import RichTextEditor from '@/components/workstation/RichTextEditor.vue'

// Two-pane composer (Claude Design handoff): compose on the left, live inbox
// preview on the right. The recipient list is built client-side — dedupe by
// address, drop blanks/invalid, exclude opt-outs — then snapshotted into
// crm_campaign_recipients so the send is auditable and resumable.

const props = defineProps<{
  /** A draft to edit, or null for a fresh campaign. */
  campaign: Campaign | null
  /** Prefill from `campaign` but create a new row (duplicate & edit). */
  duplicate?: boolean
  /** Prefill from a saved design ("Use in a campaign" from the studio). */
  template?: EmailTemplate | null
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'sent', summary: string): void
}>()

const crm = useCrmStore()
const campaigns = useCampaignsStore()
const tplStore = useEmailTemplatesStore()
const auth = useAuthStore()

const visible = ref(false)
const closeBtn = ref<HTMLElement | null>(null)
const editorRef = ref<InstanceType<typeof RichTextEditor> | null>(null)
let triggerEl: HTMLElement | null = null

// Editing an existing draft updates it in place; duplicating starts fresh.
const editingDraftId = computed(() =>
  props.campaign && props.campaign.status === 'draft' && !props.duplicate ? props.campaign.id : null)

// ── Compose state ─────────────────────────────────────────────────────────────
const subject = ref(props.campaign?.subject ?? props.template?.subject ?? '')
const fromName = ref(props.campaign?.fromName || (auth.fullName ?? ''))
const fromEmail = ref(props.campaign?.fromEmail ?? '')
const bodyHtml = ref(props.campaign?.bodyHtml ?? props.template?.bodyHtml ?? '')
const layout = ref<EmailLayout>(
  (props.campaign?.layout as EmailLayout) || (props.template?.layout as EmailLayout) || 'clean')
const accent = ref(props.campaign?.accent || props.template?.accent || DEFAULT_ACCENT)
const working = ref(false)
const testState = ref<'idle' | 'sending' | 'sent'>('idle')

// ── Editor modes ──────────────────────────────────────────────────────────────
// rich = freeform writing; html = paste raw HTML. Block design lives in the
// Designs tab (the studio) — designs arrive here as saved templates.
type EditorMode = 'rich' | 'html'
// Block-built designs arrive as compiled HTML — show them in the HTML surface
// (the rich editor would mangle table markup). Text edits happen in Designs.
const mode = ref<EditorMode>(
  storedHasBlocks(props.template?.bodyBlocks) || storedHasBlocks(props.campaign?.bodyBlocks) ? 'html' : 'rich')
const htmlArea = ref<HTMLTextAreaElement | null>(null)

// ── Audience ──────────────────────────────────────────────────────────────────
type AudienceMode = 'all' | 'companies' | 'contacts'
const audienceMode = ref<AudienceMode>('all')
const selectedCompanyIds = ref<string[]>([])
const companyList = computed(() =>
  Object.values(crm.companies).sort((a, b) => a.name.localeCompare(b.name)))

function toggleCompany(id: string) {
  selectedCompanyIds.value = selectedCompanyIds.value.includes(id)
    ? selectedCompanyIds.value.filter((x) => x !== id)
    : [...selectedCompanyIds.value, id]
}

const selectedContactIds = ref<string[]>([])
const contactSearch = ref('')
const contactList = computed(() => {
  const q = contactSearch.value.trim().toLowerCase()
  const list = q
    ? crm.contacts.filter((c) =>
        c.name.toLowerCase().includes(q)
        || c.email.toLowerCase().includes(q)
        || (crm.company(c.companyId)?.name ?? '').toLowerCase().includes(q))
    : crm.contacts
  return [...list].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 100)
})
function toggleContact(id: string) {
  selectedContactIds.value = selectedContactIds.value.includes(id)
    ? selectedContactIds.value.filter((x) => x !== id)
    : [...selectedContactIds.value, id]
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const pool = computed(() => {
  if (audienceMode.value === 'all') return crm.contacts
  if (audienceMode.value === 'companies') {
    return crm.contacts.filter((c) => selectedCompanyIds.value.includes(c.companyId))
  }
  return crm.contacts.filter((c) => selectedContactIds.value.includes(c.id))
})

// The honest funnel: every contact in the pool lands in exactly one bucket.
const breakdown = computed(() => {
  const seen = new Set<string>()
  const recipients: CampaignRecipientInput[] = []
  let noEmail = 0, invalid = 0, dupes = 0, unsubscribed = 0
  for (const c of pool.value) {
    const email = c.email.trim().toLowerCase()
    if (!email) { noEmail++; continue }
    if (!EMAIL_RE.test(email)) { invalid++; continue }
    if (c.unsubscribedAt) { unsubscribed++; continue }
    if (seen.has(email)) { dupes++; continue }
    seen.add(email)
    recipients.push({ contactId: c.id, email, name: c.name })
  }
  return { recipients, noEmail, invalid, dupes, unsubscribed, total: pool.value.length }
})

const audienceLabel = computed(() => {
  if (audienceMode.value === 'all') return 'All contacts'
  if (audienceMode.value === 'companies') {
    return selectedCompanyIds.value.length + ' ' + (selectedCompanyIds.value.length === 1 ? 'company' : 'companies')
  }
  return selectedContactIds.value.length + ' hand-picked ' + (selectedContactIds.value.length === 1 ? 'contact' : 'contacts')
})

// ── Templates + merge tags ────────────────────────────────────────────────────
const TEMPLATES = [
  { id: 'blank', name: 'Blank', body: '' },
  { id: 'update', name: 'Product update', body: '<p>Hi {{first_name}},</p><p>We\'ve shipped something we think you\'ll love. Here\'s what\'s new this month:</p><ul><li><strong>Feature one</strong> — a sentence on why it matters.</li><li><strong>Feature two</strong> — another quick benefit.</li></ul><p>As always, reply to this email if you have questions.</p><p>— The team</p>' },
  { id: 'newsletter', name: 'Newsletter', body: '<p>Hi {{first_name}},</p><p>Here\'s your monthly roundup — the highlights, in two minutes.</p><p><strong>In this issue</strong></p><ul><li>Highlight one</li><li>Highlight two</li><li>Highlight three</li></ul><p>Thanks for reading,</p><p>— The team</p>' },
  { id: 'invite', name: 'Event invite', body: '<p>Hi {{first_name}},</p><p>You\'re invited! We\'d love for you to join us.</p><p><strong>What:</strong> Event name<br/><strong>When:</strong> Date &amp; time<br/><strong>Where:</strong> Location or link</p><p>Save your spot below.</p>' },
] as const
const TPL_ICONS: Record<string, unknown> = { blank: PenLine, update: Zap, newsletter: Mail, invite: Calendar }
// Kept in script — literal {{ }} inside a template interpolation trips Vue's parser.
const mergeTagLabel = 'Insert {{first_name}}'

const tplMenuOpen = ref(false)
const confirmReplace = (name: string) => {
  const stripped = bodyHtml.value.replace(/<[^>]*>/g, '').trim()
  return !stripped || window.confirm('Replace the current email body with "' + name + '"?')
}

function applyStarter(t: (typeof TEMPLATES)[number]) {
  if (!confirmReplace(t.name)) return
  bodyHtml.value = t.body
  tplMenuOpen.value = false
}
function applySaved(t: EmailTemplate) {
  if (!confirmReplace(t.name)) return
  layout.value = (t.layout as EmailLayout) || layout.value
  if (t.accent) accent.value = t.accent
  if (!subject.value.trim() && t.subject) subject.value = t.subject
  // Block-built designs arrive compiled; tweak their text in the Designs tab.
  bodyHtml.value = t.bodyHtml
  if (storedHasBlocks(t.bodyBlocks) && mode.value === 'rich') mode.value = 'html'
  tplMenuOpen.value = false
  tplStore.bumpUsage(t.id)
}
async function renameSaved(t: EmailTemplate) {
  const name = window.prompt('Template name', t.name)
  if (name?.trim() && name.trim() !== t.name) await tplStore.rename(t.id, name)
}
async function removeSaved(t: EmailTemplate) {
  if (!window.confirm('Delete the template "' + t.name + '"?')) return
  await tplStore.remove(t.id)
}

// ── Save the current email as a template ──────────────────────────────────────
const saveTplOpen = ref(false)
const tplName = ref('')
const tplSaveState = ref<'idle' | 'saving' | 'saved'>('idle')

function openSaveTemplate() {
  if (bodyIsEmpty.value) {
    campaigns.error = 'Write the email before saving it as a template.'
    return
  }
  tplName.value = subject.value.trim()
  saveTplOpen.value = true
  void nextTick(() => document.getElementById('crm-cp-tpl-name')?.focus())
}
async function submitSaveTemplate() {
  if (!tplName.value.trim() || tplSaveState.value === 'saving') return
  tplSaveState.value = 'saving'
  const t = await tplStore.save({
    name: tplName.value,
    subject: subject.value,
    bodyHtml: bodyHtml.value,
    bodyBlocks: null,
    layout: layout.value,
    accent: accent.value,
  })
  tplSaveState.value = t ? 'saved' : 'idle'
  if (t) {
    saveTplOpen.value = false
    setTimeout(() => { tplSaveState.value = 'idle' }, 2500)
  }
}
function insertMergeTag() {
  if (mode.value === 'html') {
    const ta = htmlArea.value
    if (ta) {
      const at = ta.selectionStart ?? bodyHtml.value.length
      bodyHtml.value = bodyHtml.value.slice(0, at) + '{{first_name}}' + bodyHtml.value.slice(ta.selectionEnd ?? at)
      void nextTick(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = at + 14 })
    } else {
      bodyHtml.value += '{{first_name}}'
    }
    return
  }
  const e = editorRef.value?.editor
  if (e) e.chain().focus().insertContent('{{first_name}}').run()
  else bodyHtml.value += '<p>{{first_name}}</p>'
}

// ── Live preview ──────────────────────────────────────────────────────────────
const previewName = computed(() =>
  (breakdown.value.recipients[0]?.name ?? '').trim().split(/\s+/)[0] || 'Tom')
const previewHtml = computed(() => {
  const base = bodyHtml.value.replace(/<[^>]*>/g, '').trim()
    ? bodyHtml.value
    : '<p style="color:#9a98a3">Your email content will appear here as you write…</p>'
  // Exactly what the sender builds — layout wrapper included.
  return renderEmailHtml({
    layout: layout.value, accent: accent.value, bodyHtml: base, fromName: fromName.value,
  }).replace(
    /\{\{\s*first_name\s*\}\}/g,
    `<span style="background:var(--accent-soft);color:var(--accent-fg);padding:0 3px;border-radius:3px;font-weight:600">${previewName.value}</span>`,
  )
})
const previewTo = computed(() => {
  const n = breakdown.value.recipients.length
  if (!n) return 'your contacts'
  return 'to ' + (breakdown.value.recipients[0]?.name || breakdown.value.recipients[0]?.email)
    + (n > 1 ? ' +' + (n - 1).toLocaleString() + ' more' : '')
})

const bodyIsEmpty = computed(() => !bodyHtml.value.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim())
const canSubmit = computed(() =>
  !working.value && !!subject.value.trim() && !bodyIsEmpty.value && breakdown.value.recipients.length > 0)
const estSend = computed(() => {
  const mins = Math.ceil((Math.ceil(breakdown.value.recipients.length / 100) * 0.8) / 60)
  return mins <= 1 ? '<1 min' : '~' + mins + ' min'
})

// ── Actions ───────────────────────────────────────────────────────────────────
function composeInput() {
  return {
    subject: subject.value,
    fromName: fromName.value,
    fromEmail: fromEmail.value,
    bodyHtml: bodyHtml.value,
    bodyBlocks: null,
    audience: audienceLabel.value,
    layout: layout.value,
    accent: accent.value,
    recipients: breakdown.value.recipients,
  }
}

async function persist(): Promise<Campaign | null> {
  if (editingDraftId.value) {
    const ok = await campaigns.updateDraft(editingDraftId.value, composeInput())
    return ok ? campaigns.campaigns.find((c) => c.id === editingDraftId.value) ?? null : null
  }
  return campaigns.createCampaign(composeInput())
}

async function saveDraft() {
  if (!canSubmit.value) return
  working.value = true
  try {
    if (await persist()) emit('close')
  } finally {
    working.value = false
  }
}

async function sendNow() {
  if (!canSubmit.value) return
  const n = breakdown.value.recipients.length
  if (!window.confirm('Send "' + subject.value.trim() + '" to ' + n + ' recipient' + (n === 1 ? '' : 's') + '?')) return
  working.value = true
  try {
    const c = await persist()
    if (!c) return
    // Fire and close — the list shows live progress while the function works.
    void campaigns.send(c.id)
    emit('sent', n + ' recipient' + (n === 1 ? '' : 's') + ' queued — watch the progress bar.')
  } finally {
    working.value = false
  }
}

async function sendTest() {
  const to = auth.user?.email
  if (!to || testState.value === 'sending') return
  if (!subject.value.trim() || bodyIsEmpty.value) {
    campaigns.error = 'Write a subject and body before sending a test.'
    return
  }
  testState.value = 'sending'
  const ok = await campaigns.sendTest({
    subject: subject.value, fromName: fromName.value, fromEmail: fromEmail.value,
    bodyHtml: bodyHtml.value, layout: layout.value, accent: accent.value, to,
  })
  testState.value = ok ? 'sent' : 'idle'
  if (ok) setTimeout(() => { testState.value = 'idle' }, 3000)
}

// ── Panel chrome ──────────────────────────────────────────────────────────────
function requestClose() {
  visible.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (tplMenuOpen.value) { tplMenuOpen.value = false; return }
    if (saveTplOpen.value) { saveTplOpen.value = false; return }
    requestClose()
  }
}
onMounted(() => {
  triggerEl = document.activeElement as HTMLElement
  document.addEventListener('keydown', onKey)
  visible.value = true
  void tplStore.load()
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
      <div v-if="visible" class="fixed inset-0 z-[90]" style="background: rgba(0,0,0,.45)" @click="requestClose" />
    </Transition>
    <Transition name="crm-pop">
      <div
        v-if="visible"
        class="fixed inset-0 m-auto z-[95] w-[1060px] max-w-[95vw] h-[88vh] max-h-[760px] flex flex-col bg-base-100 rounded-2xl overflow-hidden border border-base-300"
        style="box-shadow: 0 24px 80px -16px rgba(0,0,0,.5)"
        role="dialog"
        aria-modal="true"
        :aria-label="editingDraftId ? subject + ' — edit draft' : 'New email campaign'"
      >
        <!-- header -->
        <div class="flex items-center gap-[11px] px-[18px] py-[15px] border-b border-base-300 flex-none">
          <span class="w-8 h-8 rounded-[9px] grid place-items-center" :style="{ background: 'var(--accent-soft)', color: 'var(--accent-fg)' }">
            <Mail :size="18" />
          </span>
          <div class="flex-1 min-w-0">
            <div class="text-[15.5px] font-bold text-base-content">
              {{ editingDraftId ? 'Edit draft' : duplicate ? 'Duplicate campaign' : 'New email campaign' }}
            </div>
            <div class="text-[12px] text-base-content/40">One email, every contact that should get it</div>
          </div>
          <button ref="closeBtn" type="button" class="w-8 h-8 rounded-lg grid place-items-center text-base-content/60 hover:bg-base-200" aria-label="Close" @click="requestClose">
            <X :size="18" />
          </button>
        </div>

        <!-- body: two panes -->
        <div class="flex-1 flex min-h-0">
          <!-- LEFT: compose -->
          <div class="w-[472px] flex-none overflow-y-auto px-[18px] py-4 border-r border-base-300">
            <div class="mb-3.5">
              <div class="text-[11px] font-bold tracking-wide text-base-content/40 uppercase mb-1.5">Subject</div>
              <input v-model="subject" class="crm-cp-in" placeholder="What's this email about?" />
            </div>
            <div class="flex gap-3">
              <div class="flex-1 mb-3.5">
                <div class="text-[11px] font-bold tracking-wide text-base-content/40 uppercase mb-1.5">From name</div>
                <input v-model="fromName" class="crm-cp-in" placeholder="Your name" />
              </div>
              <div class="flex-1 mb-3.5">
                <div class="text-[11px] font-bold tracking-wide text-base-content/40 uppercase mb-1.5">From email</div>
                <input v-model="fromEmail" class="crm-cp-in" placeholder="onboarding@resend.dev" />
              </div>
            </div>
            <div class="flex items-start gap-[7px] text-[11.5px] text-base-content/40 leading-relaxed -mt-1.5 mb-3.5">
              <Info :size="13" class="flex-none mt-px opacity-60" />
              <span>Leave "from email" blank to use the test sender. A verified domain unlocks your own address.</span>
            </div>

            <!-- audience -->
            <div class="mb-3.5">
              <div class="text-[11px] font-bold tracking-wide text-base-content/40 uppercase mb-1.5">Audience</div>
              <div class="flex gap-2 mb-2.5 flex-wrap">
                <button type="button" class="crm-cp-aud" :class="audienceMode === 'all' && 'crm-cp-aud-on'" @click="audienceMode = 'all'">
                  <Users :size="15" /> All contacts
                </button>
                <button type="button" class="crm-cp-aud" :class="audienceMode === 'companies' && 'crm-cp-aud-on'" @click="audienceMode = 'companies'">
                  <Building2 :size="15" /> Pick companies
                </button>
                <button type="button" class="crm-cp-aud" :class="audienceMode === 'contacts' && 'crm-cp-aud-on'" @click="audienceMode = 'contacts'">
                  <UserCheck :size="15" /> Pick contacts
                </button>
              </div>

              <div v-if="audienceMode === 'companies'" class="max-h-40 overflow-y-auto rounded-[10px] border border-base-300 p-1 mb-2.5">
                <label v-for="co in companyList" :key="co.id" class="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-base-200 cursor-pointer">
                  <input type="checkbox" class="checkbox checkbox-xs" :checked="selectedCompanyIds.includes(co.id)" @change="toggleCompany(co.id)" />
                  <span class="flex-1 text-[13px] font-semibold text-base-content truncate">{{ co.name }}</span>
                  <span class="text-[11.5px] text-base-content/40">{{ crm.contactsFor(co.id).length }} contacts</span>
                </label>
                <div v-if="!companyList.length" class="px-2.5 py-3 text-[12.5px] text-base-content/40 text-center">No companies in this workspace yet</div>
              </div>

              <div v-else-if="audienceMode === 'contacts'" class="rounded-[10px] border border-base-300 mb-2.5 overflow-hidden">
                <label class="flex items-center gap-2 px-2.5 py-2 border-b border-base-200 bg-base-200/40">
                  <Search :size="13" class="text-base-content/40 flex-none" />
                  <input v-model="contactSearch" class="flex-1 bg-transparent outline-none text-[12.5px] text-base-content placeholder:text-base-content/40" placeholder="Search by name, email, or company…" />
                  <span v-if="selectedContactIds.length" class="text-[11px] font-bold flex-none" :style="{ color: 'var(--accent-fg)' }">{{ selectedContactIds.length }} selected</span>
                </label>
                <div class="max-h-36 overflow-y-auto p-1">
                  <label v-for="c in contactList" :key="c.id" class="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-base-200 cursor-pointer">
                    <input type="checkbox" class="checkbox checkbox-xs" :checked="selectedContactIds.includes(c.id)" @change="toggleContact(c.id)" />
                    <span class="flex-1 min-w-0 flex items-baseline gap-2">
                      <span class="text-[13px] font-semibold text-base-content truncate">{{ c.name }}</span>
                      <span class="text-[11.5px] truncate" :class="c.email ? 'text-base-content/40' : 'text-[#c2253c]/70 italic'">{{ c.email || 'no email' }}</span>
                    </span>
                    <span class="text-[11.5px] text-base-content/40 truncate max-w-[7rem] flex-none">{{ crm.company(c.companyId)?.name }}</span>
                  </label>
                  <div v-if="!contactList.length" class="px-2.5 py-3 text-[12.5px] text-base-content/40 text-center">
                    {{ contactSearch ? 'No matches' : 'No contacts in this workspace yet' }}
                  </div>
                </div>
              </div>

              <!-- the funnel -->
              <div class="flex items-center gap-[11px] px-[13px] py-[11px] rounded-[10px] border" :style="{ borderColor: 'var(--accent-bord)', background: 'var(--accent-soft)' }">
                <CheckCircle2 :size="18" :stroke-width="2" class="flex-none" style="color: #15803d" />
                <div class="flex-1 min-w-0">
                  <div class="text-[13px] text-base-content">
                    <strong class="font-bold">{{ breakdown.recipients.length.toLocaleString() }} will receive this email</strong>
                    <span class="text-base-content/60"> of {{ breakdown.total.toLocaleString() }} in the audience</span>
                  </div>
                  <div v-if="breakdown.total - breakdown.recipients.length > 0" class="text-[11.5px] text-base-content/50 mt-px">
                    <span v-if="breakdown.noEmail">{{ breakdown.noEmail }} missing an email · </span>
                    <span v-if="breakdown.invalid">{{ breakdown.invalid }} invalid · </span>
                    <span v-if="breakdown.dupes">{{ breakdown.dupes }} duplicate{{ breakdown.dupes === 1 ? '' : 's' }} · </span>
                    <span v-if="breakdown.unsubscribed">{{ breakdown.unsubscribed }} unsubscribed · </span>excluded
                  </div>
                </div>
              </div>
            </div>

            <!-- layout (studio-built docs carry their own design — nothing to pick) -->
            <div v-if="layout === 'doc'" class="mb-3.5 flex items-center gap-2 px-3 py-2.5 rounded-[10px] border border-base-300 text-[12.5px] text-base-content/60">
              <Info :size="14" class="flex-none opacity-60" />
              Designed in the studio — edit the visuals in the <strong class="font-bold">Designs</strong> tab.
            </div>
            <div v-else class="mb-3.5">
              <div class="flex items-center mb-1.5">
                <span class="text-[11px] font-bold tracking-wide text-base-content/40 uppercase">Layout</span>
                <label v-if="layout === 'branded'" class="ml-auto flex items-center gap-1.5 text-[11.5px] font-semibold text-base-content/50 cursor-pointer">
                  Header color
                  <input v-model="accent" type="color" class="w-6 h-6 rounded-md border border-base-300 bg-transparent cursor-pointer p-0" />
                </label>
              </div>
              <div class="grid grid-cols-3 gap-2">
                <button
                  v-for="l in EMAIL_LAYOUTS"
                  :key="l.id"
                  type="button"
                  class="crm-cp-layout"
                  :class="layout === l.id && 'crm-cp-layout-on'"
                  @click="layout = l.id"
                >
                  <!-- mini wireframe -->
                  <span class="block w-full h-9 rounded-md overflow-hidden mb-1.5 border border-base-300" style="background: #f4f3f6">
                    <span v-if="l.id === 'plain'" class="block h-full bg-white px-2 py-1.5">
                      <span class="block w-3/4 h-1 rounded-full bg-base-300 mb-1" /><span class="block w-1/2 h-1 rounded-full bg-base-300" />
                    </span>
                    <span v-else class="flex h-full items-stretch justify-center px-3 py-1">
                      <span class="block w-full rounded-sm bg-white border border-base-200 overflow-hidden">
                        <span v-if="l.id === 'branded'" class="block h-[6px]" :style="{ background: accent }" />
                        <span class="block px-1.5 py-1"><span class="block w-3/4 h-1 rounded-full bg-base-300 mb-[3px]" /><span class="block w-1/2 h-1 rounded-full bg-base-300" /></span>
                      </span>
                    </span>
                  </span>
                  <span class="block text-[12px] font-bold whitespace-nowrap">{{ l.name }}</span>
                  <span class="block text-[10.5px] text-base-content/40 truncate">{{ l.blurb }}</span>
                </button>
              </div>
            </div>

            <!-- body -->
            <div>
              <div class="flex items-center mb-1.5 gap-1">
                <span class="text-[11px] font-bold tracking-wide text-base-content/40 uppercase">Email body</span>
                <span class="ml-auto flex gap-1 items-center">
                  <!-- editor mode: freeform writing / raw HTML -->
                  <span class="inline-flex rounded-md border border-base-300 overflow-hidden">
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-[3px] transition-colors"
                      :class="mode === 'rich' ? '' : 'text-base-content/40 hover:text-base-content/70'"
                      :style="mode === 'rich' ? { color: 'var(--accent-fg)', background: 'var(--accent-soft)' } : {}"
                      title="Freeform writing"
                      @click="mode = 'rich'"
                    >
                      <PenLine :size="11" /> Write
                    </button>
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-[3px] border-l border-base-300 transition-colors"
                      :class="mode === 'html' ? '' : 'text-base-content/40 hover:text-base-content/70'"
                      :style="mode === 'html' ? { color: 'var(--accent-fg)', background: 'var(--accent-soft)' } : {}"
                      title="Edit the raw HTML — paste a designed template from anywhere"
                      @click="mode = 'html'"
                    >
                      <Code2 :size="11" /> HTML
                    </button>
                  </span>
                  <!-- templates dropdown: starters + your saved library -->
                  <span class="relative">
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-[3px] rounded-md border transition-colors whitespace-nowrap"
                      :class="tplMenuOpen ? '' : 'border-base-300 text-base-content/40 hover:text-base-content/70'"
                      :style="tplMenuOpen ? { color: 'var(--accent-fg)', background: 'var(--accent-soft)', borderColor: 'var(--accent-bord)' } : {}"
                      @click="tplMenuOpen = !tplMenuOpen"
                    >
                      <LayoutTemplate :size="11" /> Templates <ChevronDown :size="10" />
                    </button>
                    <template v-if="tplMenuOpen">
                      <span class="fixed inset-0 z-[105]" @click="tplMenuOpen = false" />
                      <span class="absolute top-full right-0 mt-1.5 z-[106] block w-72 rounded-[10px] border border-base-300 bg-base-100 shadow-2xl overflow-hidden">
                        <span class="block px-2.5 pt-2 pb-1 text-[10px] font-bold tracking-wide text-base-content/40 uppercase">Starters</span>
                        <span class="block px-1 pb-1">
                          <button
                            v-for="t in TEMPLATES"
                            :key="t.id"
                            type="button"
                            class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-base-200 text-left text-[12.5px] font-semibold text-base-content"
                            @click="applyStarter(t)"
                          >
                            <component :is="TPL_ICONS[t.id]" :size="13" class="text-base-content/40" /> {{ t.name }}
                          </button>
                        </span>
                        <span class="block px-2.5 pt-2 pb-1 text-[10px] font-bold tracking-wide text-base-content/40 uppercase border-t border-base-200">Saved</span>
                        <span class="block px-1 pb-1 max-h-44 overflow-y-auto">
                          <span
                            v-for="t in tplStore.visible"
                            :key="t.id"
                            class="crm-cp-tpl group/tpl flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-base-200"
                          >
                            <button type="button" class="flex-1 min-w-0 flex items-center gap-2 text-left" @click="applySaved(t)">
                              <span class="flex-1 min-w-0 text-[12.5px] font-semibold text-base-content truncate">{{ t.name }}</span>
                              <span v-if="t.timesUsed" class="text-[10px] text-base-content/30 flex-none tabular-nums">×{{ t.timesUsed }}</span>
                            </button>
                            <button type="button" class="crm-cp-tpl-act w-5 h-5 rounded grid place-items-center text-base-content/30 hover:text-base-content flex-none" title="Rename" @click="renameSaved(t)">
                              <Pencil :size="11" />
                            </button>
                            <button type="button" class="crm-cp-tpl-act w-5 h-5 rounded grid place-items-center text-base-content/30 hover:text-[#c2253c] flex-none" title="Delete" @click="removeSaved(t)">
                              <Trash2 :size="11" />
                            </button>
                          </span>
                          <span v-if="!tplStore.visible.length" class="block px-2.5 py-2.5 text-[11.5px] text-base-content/40 text-center">
                            Nothing saved yet — write an email, then "Save as template".
                          </span>
                        </span>
                      </span>
                    </template>
                  </span>
                </span>
              </div>
              <textarea
                v-if="mode === 'html'"
                ref="htmlArea"
                v-model="bodyHtml"
                rows="10"
                spellcheck="false"
                class="w-full rounded-xl border border-base-300 bg-base-200 px-3 py-2.5 font-mono text-[12px] leading-relaxed text-base-content outline-none focus:ring-1 focus:ring-primary/40 resize-y"
                placeholder="<p>Paste or write the email's HTML…</p>"
              />
              <RichTextEditor v-else ref="editorRef" v-model="bodyHtml" toolbar min-height="9rem" placeholder="Write the email — use the toolbar, or select text for the floating one." />
              <div class="mt-1.5 flex items-center gap-1">
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2 py-1 rounded-md transition-colors"
                  :style="{ color: 'var(--accent-fg)' }"
                  title="Insert a merge tag — replaced with each recipient's first name at send time"
                  @click="insertMergeTag"
                >
                  <AtSign :size="13" /> {{ mergeTagLabel }}
                </button>
                <span class="relative ml-auto">
                  <button
                    type="button"
                    class="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2 py-1 rounded-md text-base-content/50 hover:text-base-content hover:bg-base-200 transition-colors disabled:opacity-50"
                    :disabled="bodyIsEmpty"
                    @click="openSaveTemplate"
                  >
                    <component :is="tplSaveState === 'saved' ? CheckCircle2 : BookmarkPlus" :size="13" :style="tplSaveState === 'saved' ? { color: '#15803d' } : {}" />
                    {{ tplSaveState === 'saved' ? 'Template saved' : 'Save as template' }}
                  </button>
                  <template v-if="saveTplOpen">
                    <span class="fixed inset-0 z-[105]" @click="saveTplOpen = false" />
                    <span class="absolute bottom-full right-0 mb-1.5 z-[106] block w-72 rounded-[10px] border border-base-300 bg-base-100 shadow-2xl p-2.5">
                      <span class="block text-[11px] font-bold tracking-wide text-base-content/40 uppercase mb-1.5">Save as template</span>
                      <input
                        id="crm-cp-tpl-name"
                        v-model="tplName"
                        class="w-full bg-base-200 rounded-[8px] px-2.5 py-1.5 text-[13px] text-base-content outline-none focus:ring-1 focus:ring-primary/40 mb-2"
                        placeholder="Template name"
                        @keydown.enter.prevent="submitSaveTemplate"
                        @keydown.esc.stop="saveTplOpen = false"
                      />
                      <span class="block text-[11px] text-base-content/40 leading-relaxed mb-2.5">
                        Saved to this client's workspace only — templates never cross clients.
                      </span>
                      <span class="flex gap-1.5 justify-end">
                        <button type="button" class="px-2.5 py-1.5 rounded-[8px] text-[12px] font-semibold text-base-content/50 hover:bg-base-200" @click="saveTplOpen = false">Cancel</button>
                        <button type="button" class="px-3 py-1.5 rounded-[8px] text-white text-[12px] font-bold disabled:opacity-50" :style="{ background: 'var(--accent)' }" :disabled="!tplName.trim() || tplSaveState === 'saving'" @click="submitSaveTemplate">
                          {{ tplSaveState === 'saving' ? 'Saving…' : 'Save' }}
                        </button>
                      </span>
                    </span>
                  </template>
                </span>
              </div>
            </div>
          </div>

          <!-- RIGHT: live preview -->
          <div class="flex-1 min-w-0 bg-base-200/60 flex flex-col">
            <div class="flex items-center gap-2 px-[18px] py-[11px] border-b border-base-300 flex-none">
              <Eye :size="15" class="text-base-content/40" />
              <span class="text-[12.5px] font-bold text-base-content/60">Live preview</span>
              <span class="text-[11px] text-base-content/40">— how it lands in the inbox</span>
              <span class="flex-1" />
              <button
                type="button"
                class="flex items-center gap-1.5 h-[30px] px-[11px] rounded-lg text-[12.5px] font-semibold border border-base-300 bg-base-100 text-base-content/60 hover:text-base-content disabled:opacity-60"
                :title="'Send a test to ' + (auth.user?.email ?? 'yourself')"
                :disabled="testState === 'sending'"
                @click="sendTest"
              >
                <component :is="testState === 'sent' ? CheckCircle2 : Send" :size="14" :style="testState === 'sent' ? { color: '#15803d' } : {}" />
                {{ testState === 'sending' ? 'Sending…' : testState === 'sent' ? 'Test sent' : 'Send test' }}
              </button>
            </div>
            <div class="flex-1 overflow-y-auto px-[26px] py-[22px]">
              <div class="bg-white rounded-xl overflow-hidden max-w-[560px] mx-auto" style="box-shadow: 0 1px 2px rgba(20,12,22,.06), 0 10px 30px -10px rgba(20,12,22,.18)">
                <!-- email header -->
                <div class="flex items-center gap-[11px] px-5 py-[15px]" style="border-bottom: 1px solid #eee">
                  <div class="w-[38px] h-[38px] rounded-full grid place-items-center text-white font-bold text-[15px] flex-none" :style="{ background: 'var(--accent)' }">
                    {{ (fromName || '?').slice(0, 1).toUpperCase() }}
                  </div>
                  <div class="min-w-0">
                    <div class="text-[13.5px] font-bold" style="color: #1b1a1d">{{ fromName || 'From name' }}</div>
                    <div class="text-[12px] truncate" style="color: #86848d">{{ fromEmail || 'onboarding@resend.dev' }} · {{ previewTo }}</div>
                  </div>
                </div>
                <!-- subject -->
                <div class="px-5 pt-4 pb-1">
                  <div class="text-[18px] font-bold leading-snug tracking-tight" style="color: #1b1a1d">{{ subject || 'Your subject line' }}</div>
                </div>
                <!-- body: the exact send-time HTML (layout wrapper + footer included) -->
                <div
                  :class="layout === 'plain' ? 'px-5 pt-2 pb-[22px]' : 'pt-2 pb-0'"
                  class="text-[14px] crm-cp-preview"
                  style="line-height: 1.65; color: #33313a"
                  v-html="previewHtml"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- footer -->
        <div class="flex items-center gap-2.5 px-[18px] py-[13px] border-t border-base-300 flex-none">
          <span v-if="campaigns.error" class="flex items-center gap-1.5 text-[12px] flex-1 min-w-0" style="color: #c2253c">
            <AlertTriangle :size="13" class="flex-none" /> <span class="truncate">{{ campaigns.error }}</span>
          </span>
          <span v-else class="text-[12.5px] text-base-content/40 flex-1">
            {{ breakdown.recipients.length.toLocaleString() }} recipient{{ breakdown.recipients.length === 1 ? '' : 's' }} · est. send {{ estSend }}
          </span>
          <button
            type="button"
            class="px-[15px] py-2.5 rounded-[9px] text-[13.5px] font-semibold text-base-content/60 border border-base-300 hover:bg-base-200 disabled:opacity-50"
            :disabled="!canSubmit"
            @click="saveDraft"
          >
            {{ editingDraftId ? 'Save changes' : 'Save draft' }}
          </button>
          <button
            type="button"
            class="flex items-center gap-[7px] px-[18px] py-2.5 rounded-[9px] text-[13.5px] font-bold text-white disabled:opacity-50"
            :style="{ background: 'var(--accent)' }"
            :disabled="!canSubmit"
            @click="sendNow"
          >
            <Send :size="16" /> {{ working ? 'Working…' : 'Send now' }}
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.crm-scrim-enter-active, .crm-scrim-leave-active { transition: opacity 0.2s ease; }
.crm-scrim-enter-from, .crm-scrim-leave-to { opacity: 0; }
.crm-pop-enter-active { transition: transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.15), opacity 0.22s ease; }
.crm-pop-leave-active { transition: transform 0.15s ease-in, opacity 0.15s ease-in; }
.crm-pop-enter-from, .crm-pop-leave-to { transform: scale(0.97) translateY(8px); opacity: 0; }

.crm-cp-in {
  width: 100%;
  padding: 10px 12px;
  border-radius: 9px;
  border: 1px solid var(--color-base-300);
  background: var(--color-base-200);
  color: var(--color-base-content);
  font-size: 14px;
  outline: none;
  transition: border-color 0.12s;
}
.crm-cp-in:focus { border-color: var(--accent); }

.crm-cp-aud {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 13px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 650;
  white-space: nowrap;
  border: 1px solid var(--color-base-300);
  background: var(--color-base-100);
  color: color-mix(in oklab, var(--color-base-content) 60%, transparent);
  transition: all 0.12s;
}
.crm-cp-aud:hover { border-color: var(--accent-bord); }
.crm-cp-aud-on {
  border-color: var(--accent-bord);
  background: var(--accent-soft);
  color: var(--accent-fg);
  font-weight: 700;
}

.crm-cp-layout {
  padding: 8px 9px;
  border-radius: 10px;
  border: 1px solid var(--color-base-300);
  background: var(--color-base-100);
  text-align: left;
  color: color-mix(in oklab, var(--color-base-content) 75%, transparent);
  transition: border-color 0.12s, background 0.12s;
  min-width: 0;
}
.crm-cp-layout:hover { border-color: var(--accent-bord); }
.crm-cp-layout-on {
  border-color: var(--accent-bord);
  background: var(--accent-soft);
  color: var(--accent-fg);
}

.crm-cp-tpl .crm-cp-tpl-act { opacity: 0; transition: opacity 0.12s; }
.crm-cp-tpl:hover .crm-cp-tpl-act, .crm-cp-tpl-act:focus-visible { opacity: 1; }

/* The preview renders authored HTML on a white card regardless of app theme. */
.crm-cp-preview :deep(p) { margin: 0 0 0.6em; }
.crm-cp-preview :deep(ul) { list-style: disc outside; padding-left: 1.4em; margin: 0.4em 0; }
.crm-cp-preview :deep(ol) { list-style: decimal outside; padding-left: 1.6em; margin: 0.4em 0; }
.crm-cp-preview :deep(a) { color: #2f6fed; text-decoration: underline; }
.crm-cp-preview :deep(h1), .crm-cp-preview :deep(h2), .crm-cp-preview :deep(h3) { font-weight: 700; margin: 0.8em 0 0.3em; color: #1b1a1d; }
</style>
