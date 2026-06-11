<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { X, Upload, FileSpreadsheet, Check, Users, Building2 } from 'lucide-vue-next'
import { useCrmStore } from '@/stores/crm'
import { useClientsStore } from '@/stores/clients'
import { parseCsvWithHeaders, type ParsedCsv } from '@/lib/csv'

// HubSpot (or any) CSV → this client workspace. Flow: pick kind + file →
// auto-mapped columns (editable) → preview → import via crm.bulkImport, which
// dedupes inside the workspace and never overwrites typed-in data.

const emit = defineEmits<{ (e: 'close'): void; (e: 'done', summary: string): void }>()

const crm = useCrmStore()
const clients = useClientsStore()
const visible = ref(false)
const closeBtn = ref<HTMLElement | null>(null)
let triggerEl: HTMLElement | null = null

type Kind = 'contacts' | 'companies'
const kind = ref<Kind>('contacts')
const fileName = ref('')
const parsed = ref<ParsedCsv | null>(null)
const mapping = ref<Record<string, string>>({}) // our field -> csv header ('' = not mapped)
const importing = ref(false)
const result = ref<{ companiesCreated: number; companiesEnriched: number; contactsCreated: number; contactsSkipped: number } | null>(null)
const parseError = ref<string | null>(null)

interface FieldSpec { key: string; label: string; required?: boolean; candidates: string[] }
// candidates are normalized (lowercase, alphanumeric only) header names —
// covers HubSpot's default contact/company export columns.
const CONTACT_FIELDS: FieldSpec[] = [
  { key: 'firstName', label: 'First name', candidates: ['firstname'] },
  { key: 'lastName', label: 'Last name', candidates: ['lastname'] },
  { key: 'name', label: 'Full name', candidates: ['name', 'fullname', 'contactname'] },
  { key: 'email', label: 'Email', candidates: ['email', 'emailaddress'] },
  { key: 'phone', label: 'Phone', candidates: ['phonenumber', 'phone', 'mobilephonenumber'] },
  { key: 'role', label: 'Title', candidates: ['jobtitle', 'title', 'role'] },
  { key: 'company', label: 'Company', candidates: ['companyname', 'associatedcompany', 'company', 'primaryassociatedcompanyname'] },
  { key: 'address', label: 'Street address', candidates: ['streetaddress', 'address'] },
  { key: 'city', label: 'City', candidates: ['city'] },
  { key: 'country', label: 'Country', candidates: ['countryregion', 'country'] },
]
const COMPANY_FIELDS: FieldSpec[] = [
  { key: 'name', label: 'Company name', required: true, candidates: ['name', 'companyname', 'company'] },
  { key: 'site', label: 'Website', candidates: ['companydomainname', 'websiteurl', 'website', 'domain'] },
  { key: 'industry', label: 'Industry', candidates: ['industry'] },
  { key: 'address', label: 'Street address', candidates: ['streetaddress', 'address'] },
  { key: 'city', label: 'City', candidates: ['city'] },
  { key: 'country', label: 'Country', candidates: ['countryregion', 'country'] },
  { key: 'employees', label: 'Employees', candidates: ['numberofemployees', 'employees', 'headcount'] },
  { key: 'annualRevenue', label: 'Annual revenue', candidates: ['annualrevenue', 'revenue'] },
  { key: 'linkedin', label: 'LinkedIn page', candidates: ['linkedincompanypage', 'linkedin', 'linkedinurl'] },
]
const fields = computed(() => (kind.value === 'contacts' ? CONTACT_FIELDS : COMPANY_FIELDS))

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function autoMap() {
  const headers = parsed.value?.headers ?? []
  const used = new Set<string>()
  const m: Record<string, string> = {}
  for (const f of fields.value) {
    const hit = headers.find((h) => !used.has(h) && f.candidates.includes(normalize(h)))
    m[f.key] = hit ?? ''
    if (hit) used.add(hit)
  }
  mapping.value = m
}

async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  parseError.value = null
  result.value = null
  try {
    const text = await file.text()
    const p = parseCsvWithHeaders(text)
    if (!p.headers.length || !p.rows.length) throw new Error('No rows found in that file.')
    parsed.value = p
    fileName.value = file.name
    // Heuristic: a file with company-ish headers and no email column is a companies export.
    const norm = p.headers.map(normalize)
    if (!norm.some((h) => h.includes('email')) && norm.some((h) => ['companydomainname', 'numberofemployees', 'annualrevenue'].includes(h))) {
      kind.value = 'companies'
    }
    autoMap()
  } catch (err) {
    parsed.value = null
    parseError.value = (err as Error).message
  }
  ;(e.target as HTMLInputElement).value = ''
}

const val = (row: Record<string, string>, key: string) => (mapping.value[key] ? row[mapping.value[key]] ?? '' : '')
const num = (s: string) => {
  const n = Number(s.replace(/[^0-9.\-]/g, ''))
  return s.trim() === '' || !Number.isFinite(n) ? null : n
}
const contactName = (row: Record<string, string>) =>
  (val(row, 'name') || (val(row, 'firstName') + ' ' + val(row, 'lastName'))).trim()

const previewRows = computed(() => (parsed.value?.rows ?? []).slice(0, 4))
const mappedCount = computed(() => Object.values(mapping.value).filter(Boolean).length)
const canImport = computed(() => {
  if (!parsed.value || importing.value) return false
  if (kind.value === 'companies') return !!mapping.value.name
  return !!(mapping.value.name || mapping.value.firstName || mapping.value.lastName)
})

async function runImport() {
  if (!parsed.value || !canImport.value) return
  importing.value = true
  try {
    const rows = parsed.value.rows
    const payload = kind.value === 'companies'
      ? {
          companies: rows.map((r) => ({
            name: val(r, 'name'), site: val(r, 'site'), industry: val(r, 'industry'),
            address: val(r, 'address'), city: val(r, 'city'), country: val(r, 'country'),
            employees: num(val(r, 'employees')), annualRevenue: num(val(r, 'annualRevenue')),
            linkedin: val(r, 'linkedin'),
          })).filter((c) => c.name),
          contacts: [],
        }
      : {
          companies: [],
          contacts: rows.map((r) => ({
            name: contactName(r), email: val(r, 'email'), phone: val(r, 'phone'),
            role: val(r, 'role'), company: val(r, 'company'),
            address: val(r, 'address'), city: val(r, 'city'), country: val(r, 'country'),
          })).filter((c) => c.name),
        }
    const res = await crm.bulkImport(payload)
    if (res) {
      result.value = res
      const bits: string[] = []
      if (res.companiesCreated) bits.push(res.companiesCreated + ' companies added')
      if (res.companiesEnriched) bits.push(res.companiesEnriched + ' enriched')
      if (res.contactsCreated) bits.push(res.contactsCreated + ' contacts added')
      if (res.contactsSkipped) bits.push(res.contactsSkipped + ' duplicates skipped')
      emit('done', bits.join(', ') || 'Nothing new to import.')
    }
  } finally {
    importing.value = false
  }
}

function requestClose() { visible.value = false }
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') requestClose()
}
onMounted(() => {
  triggerEl = document.activeElement as HTMLElement
  document.addEventListener('keydown', onKey)
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
        class="fixed top-0 right-0 bottom-0 z-[95] w-[560px] max-w-[95vw] flex flex-col bg-base-100 border-l border-base-300"
        style="box-shadow: -16px 0 48px -16px rgba(0,0,0,.45)"
        role="dialog"
        aria-modal="true"
        aria-label="Import CRM data"
      >
        <div class="flex items-center gap-2.5 px-4 py-3.5 border-b border-base-300">
          <span class="w-[30px] h-[30px] rounded-[9px] grid place-items-center" :style="{ background: 'var(--accent-soft)', color: 'var(--accent-fg)' }">
            <Upload :size="16" />
          </span>
          <div class="flex-1 min-w-0">
            <div class="text-[13.5px] font-bold text-base-content">Import from HubSpot</div>
            <div class="text-[11.5px] text-base-content/40 truncate">CSV export → {{ clients.currentClient?.name ?? 'this workspace' }}</div>
          </div>
          <button ref="closeBtn" type="button" class="w-[30px] h-[30px] rounded-lg grid place-items-center text-base-content/60 hover:bg-base-200" aria-label="Close" @click="requestClose">
            <X :size="17" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-5 py-4">
          <!-- kind + file -->
          <div class="flex gap-2 mb-3" role="radiogroup" aria-label="What are you importing?">
            <button
              v-for="k in (['contacts', 'companies'] as const)"
              :key="k"
              type="button"
              role="radio"
              :aria-checked="kind === k"
              class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[9px] border text-[12.5px] font-bold capitalize"
              :style="kind === k
                ? { background: 'var(--accent-soft)', color: 'var(--accent-fg)', borderColor: 'var(--accent-bord)' }
                : { borderColor: 'var(--color-base-300)', color: 'var(--color-base-content)', opacity: 0.65 }"
              @click="kind = k; parsed && autoMap()"
            >
              <component :is="k === 'contacts' ? Users : Building2" :size="14" /> {{ k }}
            </button>
          </div>

          <label class="flex items-center gap-3 px-3.5 py-3 rounded-[10px] border-[1.5px] border-dashed border-base-300 cursor-pointer hover:bg-base-200 mb-1">
            <FileSpreadsheet :size="20" class="text-base-content/40 flex-none" />
            <div class="flex-1 min-w-0">
              <div class="text-[13px] font-semibold text-base-content truncate">{{ fileName || 'Choose a CSV file…' }}</div>
              <div class="text-[11.5px] text-base-content/40">In HubSpot: Contacts (or Companies) → Export view → CSV</div>
            </div>
            <input type="file" accept=".csv,text/csv" class="hidden" @change="onFile" />
          </label>
          <p v-if="parseError" class="text-[12.5px] font-semibold mb-2" style="color: #c2253c">{{ parseError }}</p>

          <template v-if="parsed">
            <div class="text-[12.5px] text-base-content/60 mt-3 mb-2">
              <strong class="text-base-content">{{ parsed.rows.length.toLocaleString() }}</strong> rows ·
              {{ mappedCount }} of {{ fields.length }} fields mapped
            </div>

            <!-- mapping -->
            <div class="border border-base-300 rounded-[10px] overflow-hidden mb-4">
              <div
                v-for="f in fields"
                :key="f.key"
                class="flex items-center gap-2 px-3 py-2 border-b border-base-200 last:border-b-0"
              >
                <span class="w-32 flex-none text-[12.5px] font-semibold text-base-content">
                  {{ f.label }}<span v-if="f.required" style="color:#c2253c"> *</span>
                </span>
                <select v-model="mapping[f.key]" class="flex-1 bg-base-200 rounded-[7px] px-2 py-1.5 text-[12.5px] text-base-content outline-none">
                  <option value="">— skip —</option>
                  <option v-for="h in parsed.headers" :key="h" :value="h">{{ h }}</option>
                </select>
                <Check v-if="mapping[f.key]" :size="14" class="flex-none" :style="{ color: 'var(--st-done-fg)' }" />
                <span v-else class="w-[14px] flex-none" />
              </div>
            </div>

            <!-- preview -->
            <div class="text-[11px] font-bold tracking-wide uppercase text-base-content/40 mb-1.5">Preview</div>
            <div class="border border-base-300 rounded-[10px] overflow-x-auto mb-4">
              <table class="w-full text-[12px]">
                <tbody>
                  <tr v-for="(r, i) in previewRows" :key="i" class="border-b border-base-200 last:border-b-0">
                    <td class="px-3 py-2 font-semibold text-base-content whitespace-nowrap">
                      {{ kind === 'contacts' ? contactName(r) || '(no name)' : val(r, 'name') || '(no name)' }}
                    </td>
                    <td class="px-3 py-2 text-base-content/60 whitespace-nowrap">
                      {{ kind === 'contacts' ? val(r, 'email') : val(r, 'site') }}
                    </td>
                    <td class="px-3 py-2 text-base-content/60 whitespace-nowrap">
                      {{ kind === 'contacts' ? val(r, 'company') : val(r, 'industry') }}
                    </td>
                    <td class="px-3 py-2 text-base-content/60 whitespace-nowrap">
                      {{ [val(r, 'city'), val(r, 'country')].filter(Boolean).join(', ') }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- result -->
            <div v-if="result" class="rounded-[10px] px-3.5 py-3 mb-4 text-[13px] font-semibold" :style="{ background: 'var(--st-done-bg)', color: 'var(--st-done-fg)' }">
              Imported: {{ result.companiesCreated }} companies added<template v-if="result.companiesEnriched"> · {{ result.companiesEnriched }} enriched</template><template v-if="result.contactsCreated"> · {{ result.contactsCreated }} contacts added</template><template v-if="result.contactsSkipped"> · {{ result.contactsSkipped }} duplicates skipped</template>
            </div>
          </template>
        </div>

        <div class="px-4 py-3 border-t border-base-300 flex gap-2">
          <button type="button" class="px-4 py-[10px] rounded-[10px] border border-base-300 text-[13px] font-semibold text-base-content/60 hover:bg-base-200" @click="requestClose">
            {{ result ? 'Done' : 'Cancel' }}
          </button>
          <button
            type="button"
            class="flex-1 flex items-center justify-center gap-[7px] px-3 py-[10px] rounded-[10px] text-white text-[13.5px] font-bold disabled:opacity-50"
            :style="{ background: 'var(--accent)' }"
            :disabled="!canImport"
            @click="runImport"
          >
            <Upload :size="15" />
            {{ importing ? 'Importing…' : 'Import ' + (parsed ? parsed.rows.length.toLocaleString() + ' rows' : '') }}
          </button>
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
</style>
