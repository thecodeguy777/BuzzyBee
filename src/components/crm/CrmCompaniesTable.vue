<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { Hash, Plus, Trash2, Loader2, Search, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import CrmAvatar from './CrmAvatar.vue'
import { useCrmStore } from '@/stores/crm'
import { fmtMoney, fmtDate, relTime, type Company } from '@/lib/crmData'

const emit = defineEmits<{ (e: 'open-company', company: Company): void }>()

const crm = useCrmStore()
const companies = computed(() => Object.values(crm.companies))
const COLS = 'minmax(220px,1.4fr) 110px 130px 90px 110px 110px 100px 110px 100px 44px'

const openDeals = (id: string) => crm.dealsFor(id).filter((d) => d.stage !== 'won' && d.stage !== 'lost')
const openValue = (id: string) => openDeals(id).reduce((s, d) => s + d.value, 0)
const location = (co: Company) => [co.city, co.country].filter(Boolean).join(', ')

// Search + pagination — a client can hold thousands of companies; rendering them
// all at once locks the page. Only the 50/page slice is ever in the DOM.
const PAGE_SIZE = 50
const search = ref('')
const page = ref(0)
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return companies.value
  return companies.value.filter((c) =>
    c.name.toLowerCase().includes(q)
    || (c.industry ?? '').toLowerCase().includes(q)
    || location(c).toLowerCase().includes(q))
})
const sorted = computed(() => [...filtered.value].sort((a, b) => a.name.localeCompare(b.name)))
const pageCount = computed(() => Math.max(1, Math.ceil(sorted.value.length / PAGE_SIZE)))
const pageSafe = computed(() => Math.min(Math.max(0, page.value), pageCount.value - 1))
const paged = computed(() => sorted.value.slice(pageSafe.value * PAGE_SIZE, pageSafe.value * PAGE_SIZE + PAGE_SIZE))
watch(search, () => { page.value = 0 })

// ── Inline edits: click a value cell to change it; the rest of the row still
// opens the detail panel (which has the full field set).
type Field = 'name' | 'industry' | 'location'
const editing = ref<{ id: string; field: Field } | null>(null)
const draft = ref('')

function startEdit(co: Company, field: Field) {
  editing.value = { id: co.id, field }
  draft.value = field === 'location' ? location(co) : co[field]
  void nextTick(() => document.getElementById('crm-co-edit')?.focus())
}
function commitEdit() {
  const e = editing.value
  editing.value = null
  if (!e) return
  const co = crm.companies[e.id]
  if (!co) return
  const v = draft.value.trim()
  if (e.field === 'location') {
    const [city = '', country = ''] = v.split(',').map((s) => s.trim())
    if (city !== co.city || country !== co.country) void crm.updateCompany(co.id, { city, country })
  } else if (e.field === 'name') {
    if (v && v !== co.name) void crm.updateCompany(co.id, { name: v })
  } else if (e.field === 'industry') {
    if (v !== co.industry) void crm.updateCompany(co.id, { industry: v })
  }
}
const isEditing = (id: string, field: Field) =>
  editing.value?.id === id && editing.value.field === field

async function removeCompany(co: Company) {
  const deals = crm.dealsFor(co.id).length
  const contacts = crm.contactsFor(co.id).length
  const tail = deals || contacts
    ? ` Its ${[deals && deals + ' deal' + (deals === 1 ? '' : 's'), contacts && contacts + ' contact' + (contacts === 1 ? '' : 's')].filter(Boolean).join(' and ')} go with it.`
    : ''
  if (!window.confirm('Delete ' + co.name + '?' + tail)) return
  await crm.deleteCompany(co.id)
}

// ── Add company ───────────────────────────────────────────────────────────────
const adding = ref(false)
const saving = ref(false)
const blank = () => ({ name: '', industry: '', site: '' })
const form = ref(blank())

function openAdd() {
  form.value = blank()
  adding.value = true
  void nextTick(() => document.getElementById('crm-co-new-name')?.focus())
}
async function submitAdd() {
  if (!form.value.name.trim() || saving.value) return
  saving.value = true
  try {
    const co = await crm.createCompany({
      name: form.value.name,
      industry: form.value.industry,
      site: form.value.site,
    })
    if (co) {
      adding.value = false
      form.value = blank()
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex-1 overflow-auto px-5 pb-6">
    <div class="flex items-center gap-3 mb-3">
      <div class="flex items-center gap-2 text-[12.5px] text-base-content/40 flex-none whitespace-nowrap">
        <template v-if="crm.loading"><Loader2 :size="14" class="animate-spin" /> Loading companies…</template>
        <template v-else>{{ sorted.length.toLocaleString() }}<span v-if="search.trim() && sorted.length !== companies.length"> of {{ companies.length.toLocaleString() }}</span> {{ companies.length === 1 ? 'company' : 'companies' }}</template>
      </div>
      <div class="relative flex-1 max-w-[300px]">
        <Search :size="15" class="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40 pointer-events-none" />
        <input v-model="search" class="crm-in w-full !h-9 !pl-9" placeholder="Search companies…" />
      </div>
      <div class="flex-1" />
      <button
        type="button"
        class="flex items-center gap-[7px] h-[32px] px-3 rounded-[9px] text-[13px] font-bold text-white whitespace-nowrap"
        :style="{ background: 'var(--accent)' }"
        @click="openAdd"
      >
        <Plus :size="15" /> New company
      </button>
    </div>

    <!-- inline add -->
    <form
      v-if="adding"
      class="flex flex-wrap items-center gap-1.5 mb-3 px-3 py-2.5 rounded-xl border border-base-300 bg-base-100"
      @submit.prevent="submitAdd"
    >
      <input id="crm-co-new-name" v-model="form.name" class="crm-in flex-1 min-w-[160px]" placeholder="Company name *" @keydown.esc="adding = false" />
      <input v-model="form.industry" class="crm-in w-40" placeholder="Industry" @keydown.esc="adding = false" />
      <input v-model="form.site" class="crm-in w-48" placeholder="Website" @keydown.esc="adding = false" />
      <button type="submit" class="px-3 h-[30px] rounded-[8px] text-white text-[12.5px] font-bold disabled:opacity-50" :style="{ background: 'var(--accent)' }" :disabled="!form.name.trim() || saving">
        {{ saving ? 'Adding…' : 'Add' }}
      </button>
      <button type="button" class="px-2.5 h-[30px] rounded-[8px] text-[12.5px] font-semibold text-base-content/50 hover:bg-base-200" @click="adding = false">Cancel</button>
    </form>

    <div class="border border-base-300 rounded-xl overflow-hidden bg-base-100 min-w-[1180px]">
      <div
        class="grid items-center px-4 h-[42px] border-b border-base-300 bg-base-200"
        :style="{ gridTemplateColumns: COLS }"
      >
        <span v-for="h in ['Company', 'Industry', 'Location', 'Open deals', 'Pipeline value', 'Status', 'Created', 'Last activity', 'Channel', '']" :key="h"
          class="text-[11px] font-bold tracking-wider uppercase text-base-content/40">{{ h }}</span>
      </div>

      <div v-if="!sorted.length" class="px-4 py-10 text-center text-[13px] text-base-content/40">
        <span v-if="crm.loading" class="inline-flex items-center gap-2"><Loader2 :size="15" class="animate-spin" /> Loading companies…</span>
        <span v-else>{{ search.trim() ? 'No companies match your search.' : 'No companies yet.' }}</span>
      </div>
      <div
        v-for="co in paged"
        :key="co.id"
        class="crm-row grid items-center px-4 h-[54px] cursor-pointer border-b border-base-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-inset"
        :style="{ gridTemplateColumns: COLS }"
        role="button"
        tabindex="0"
        @click="emit('open-company', co)"
        @keydown.enter.prevent="emit('open-company', co)"
      >
        <div class="flex items-center gap-[11px] min-w-0">
          <CrmAvatar :name="co.name" :initials="co.initials" :color="co.color" :size="32" :radius="9" />
          <div class="min-w-0">
            <input
              v-if="isEditing(co.id, 'name')"
              id="crm-co-edit"
              v-model="draft"
              class="crm-cell-in font-semibold"
              @click.stop
              @blur="commitEdit"
              @keydown.enter.prevent="commitEdit"
              @keydown.esc.prevent="editing = null"
            />
            <button v-else type="button" class="crm-editable block text-sm font-semibold text-base-content text-left truncate" title="Click to rename" @click.stop="startEdit(co, 'name')">{{ co.name }}</button>
            <div class="text-[11.5px] text-base-content/40 truncate">{{ co.site }}</div>
          </div>
        </div>

        <div class="min-w-0 pr-2">
          <input
            v-if="isEditing(co.id, 'industry')"
            id="crm-co-edit"
            v-model="draft"
            class="crm-cell-in"
            @click.stop
            @blur="commitEdit"
            @keydown.enter.prevent="commitEdit"
            @keydown.esc.prevent="editing = null"
          />
          <button v-else type="button" class="crm-editable block w-full text-left text-[13px] truncate" :class="co.industry ? 'text-base-content/60' : 'text-base-content/25'" title="Click to edit" @click.stop="startEdit(co, 'industry')">{{ co.industry || 'Add industry' }}</button>
        </div>

        <div class="min-w-0 pr-2">
          <input
            v-if="isEditing(co.id, 'location')"
            id="crm-co-edit"
            v-model="draft"
            class="crm-cell-in"
            placeholder="City, Country"
            @click.stop
            @blur="commitEdit"
            @keydown.enter.prevent="commitEdit"
            @keydown.esc.prevent="editing = null"
          />
          <button v-else type="button" class="crm-editable block w-full text-left text-[13px] truncate" :class="location(co) ? 'text-base-content/60' : 'text-base-content/25'" title="City, Country — click to edit" @click.stop="startEdit(co, 'location')">{{ location(co) || 'Add location' }}</button>
        </div>

        <div class="text-[13.5px] font-semibold text-base-content">{{ openDeals(co.id).length || '—' }}</div>
        <div class="text-sm font-bold text-base-content">{{ openValue(co.id) > 0 ? fmtMoney(openValue(co.id)) : '—' }}</div>
        <div>
          <span
            class="inline-flex items-center gap-1.5 px-[9px] py-0.5 rounded-full text-[11.5px] font-semibold whitespace-nowrap"
            :style="co.isClient
              ? { background: 'var(--st-done-bg)', color: 'var(--st-done-fg)' }
              : { background: 'var(--st-rev-bg)', color: 'var(--st-rev-fg)' }"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-current" />{{ co.isClient ? 'Active client' : 'Prospect' }}
          </span>
        </div>
        <div class="text-[12.5px] text-base-content/60 tabular-nums">{{ fmtDate(co.createdAt) }}</div>
        <div class="text-[12.5px] text-base-content/60">{{ co.lastActivityAt ? relTime(co.lastActivityAt) : '—' }}</div>
        <div>
          <span v-if="co.channelName" class="inline-flex items-center gap-1 text-[12.5px] font-semibold" :style="{ color: 'var(--accent-fg)' }">
            <Hash :size="12" :stroke-width="2" />{{ co.channelName.length > 10 ? co.channelName.slice(0, 9) + '…' : co.channelName }}
          </span>
          <span v-else class="text-base-content/40">—</span>
        </div>

        <div class="crm-actions flex items-center justify-end">
          <button
            type="button"
            class="w-6 h-6 rounded-md grid place-items-center text-base-content/30 hover:text-[#c2253c] hover:bg-base-300/60"
            :title="'Delete ' + co.name"
            @click.stop="removeCompany(co)"
          >
            <Trash2 :size="13" />
          </button>
        </div>
      </div>
    </div>

    <!-- pagination -->
    <div v-if="sorted.length > 0" class="flex items-center gap-3 mt-3">
      <span class="text-[12.5px] text-base-content/40">
        Showing <strong class="text-base-content">{{ pageSafe * PAGE_SIZE + 1 }}–{{ Math.min((pageSafe + 1) * PAGE_SIZE, sorted.length) }}</strong> of {{ sorted.length.toLocaleString() }}
      </span>
      <div class="flex-1" />
      <button type="button" class="flex items-center gap-1.5 h-[32px] px-3 rounded-[9px] border border-base-300 bg-base-100 text-[13px] font-semibold disabled:opacity-40" :disabled="pageSafe === 0" @click="page = pageSafe - 1"><ChevronLeft :size="15" /> Prev</button>
      <span class="text-[12.5px] font-semibold text-base-content/60">Page {{ pageSafe + 1 }} / {{ pageCount }}</span>
      <button type="button" class="flex items-center gap-1.5 h-[32px] px-3 rounded-[9px] border border-base-300 bg-base-100 text-[13px] font-semibold disabled:opacity-40" :disabled="pageSafe >= pageCount - 1" @click="page = pageSafe + 1">Next <ChevronRight :size="15" /></button>
    </div>
  </div>
</template>

<style scoped>
.crm-row:hover {
  background: var(--color-base-200);
}
.crm-row .crm-actions { opacity: 0; transition: opacity 0.12s; }
.crm-row:hover .crm-actions, .crm-actions:focus-within { opacity: 1; }
.crm-editable { transition: background 0.12s; border-radius: 6px; padding: 1px 4px; margin: -1px -4px; }
.crm-editable:hover { background: var(--color-base-300); }
.crm-cell-in {
  width: 100%;
  background: var(--color-base-200);
  border-radius: 7px;
  padding: 2px 6px;
  font-size: 13px;
  color: var(--color-base-content);
  outline: none;
  box-shadow: 0 0 0 1px color-mix(in oklab, var(--accent) 40%, transparent);
}
.crm-in {
  height: 30px;
  background: var(--color-base-200);
  border-radius: 8px;
  padding: 0 10px;
  font-size: 12.5px;
  color: var(--color-base-content);
  outline: none;
}
.crm-in:focus { box-shadow: 0 0 0 1px color-mix(in oklab, var(--accent) 40%, transparent); }
</style>
