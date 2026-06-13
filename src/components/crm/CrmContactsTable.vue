<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { Plus, Star, Trash2, Loader2 } from 'lucide-vue-next'
import CrmAvatar from './CrmAvatar.vue'
import { useCrmStore } from '@/stores/crm'
import { fmtDate, relTime, type Contact } from '@/lib/crmData'

const crm = useCrmStore()
const COLS = 'minmax(200px,1.3fr) 160px minmax(180px,1fr) 130px 130px 100px 110px 64px'
const location = (c: Contact) => [c.city, c.country].filter(Boolean).join(', ')

// ── Inline edits: click any value to change it (deal-panel pattern) ──────────
type Field = 'name' | 'role' | 'email' | 'phone' | 'location'
const editing = ref<{ id: string; field: Field } | null>(null)
const draft = ref('')

function startEdit(c: Contact, field: Field) {
  editing.value = { id: c.id, field }
  draft.value = field === 'location' ? location(c) : c[field]
  void nextTick(() => document.getElementById('crm-ct-edit')?.focus())
}
function commitEdit() {
  const e = editing.value
  editing.value = null
  if (!e) return
  const c = crm.contacts.find((x) => x.id === e.id)
  if (!c) return
  const v = draft.value.trim()
  if (e.field === 'location') {
    // "City, Country" — either side optional.
    const [city = '', country = ''] = v.split(',').map((s) => s.trim())
    if (city !== c.city || country !== c.country) void crm.updateContact(c.id, { city, country })
  } else if (e.field === 'name') {
    if (v && v !== c.name) void crm.updateContact(c.id, { name: v })
  } else if (e.field === 'role') {
    if (v !== c.role) void crm.updateContact(c.id, { role: v })
  } else if (e.field === 'email') {
    if (v !== c.email) void crm.updateContact(c.id, { email: v })
  } else if (e.field === 'phone') {
    if (v !== c.phone) void crm.updateContact(c.id, { phone: v })
  }
}
const isEditing = (id: string, field: Field) =>
  editing.value?.id === id && editing.value.field === field

async function togglePrimary(c: Contact) {
  await crm.updateContact(c.id, { primary: !c.primary })
}
async function removeContact(c: Contact) {
  if (!window.confirm('Delete ' + c.name + '? Their activity history stays on the company.')) return
  await crm.deleteContact(c.id)
}

// ── Add contact ───────────────────────────────────────────────────────────────
const adding = ref(false)
const saving = ref(false)
const companies = computed(() =>
  Object.values(crm.companies).sort((a, b) => a.name.localeCompare(b.name)))
const blank = () => ({ name: '', companyId: '', role: '', email: '', phone: '' })
const form = ref(blank())

function openAdd() {
  form.value = blank()
  form.value.companyId = companies.value[0]?.id ?? ''
  adding.value = true
  void nextTick(() => document.getElementById('crm-ct-new-name')?.focus())
}
async function submitAdd() {
  if (!form.value.name.trim() || !form.value.companyId || saving.value) return
  saving.value = true
  try {
    const c = await crm.addContact({
      companyId: form.value.companyId,
      name: form.value.name,
      role: form.value.role,
      email: form.value.email,
      phone: form.value.phone,
    })
    if (c) {
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
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2 text-[12.5px] text-base-content/40">
        <template v-if="crm.loading"><Loader2 :size="14" class="animate-spin" /> Loading contacts…</template>
        <template v-else>{{ crm.contacts.length }} {{ crm.contacts.length === 1 ? 'contact' : 'contacts' }} — click any value to edit it.</template>
      </div>
      <button
        type="button"
        class="flex items-center gap-[7px] h-[32px] px-3 rounded-[9px] text-[13px] font-bold text-white whitespace-nowrap"
        :style="{ background: 'var(--accent)' }"
        @click="openAdd"
      >
        <Plus :size="15" /> New contact
      </button>
    </div>

    <!-- inline add -->
    <form
      v-if="adding"
      class="flex flex-wrap items-center gap-1.5 mb-3 px-3 py-2.5 rounded-xl border border-base-300 bg-base-100"
      @submit.prevent="submitAdd"
    >
      <input id="crm-ct-new-name" v-model="form.name" class="crm-in flex-1 min-w-[140px]" placeholder="Full name *" @keydown.esc="adding = false" />
      <select v-model="form.companyId" class="crm-in w-44 cursor-pointer" aria-label="Company">
        <option value="" disabled>Company *</option>
        <option v-for="co in companies" :key="co.id" :value="co.id">{{ co.name }}</option>
      </select>
      <input v-model="form.role" class="crm-in w-32" placeholder="Title" @keydown.esc="adding = false" />
      <input v-model="form.email" class="crm-in w-48" placeholder="Email" @keydown.esc="adding = false" />
      <input v-model="form.phone" class="crm-in w-32" placeholder="Phone" @keydown.esc="adding = false" />
      <button type="submit" class="px-3 h-[30px] rounded-[8px] text-white text-[12.5px] font-bold disabled:opacity-50" :style="{ background: 'var(--accent)' }" :disabled="!form.name.trim() || !form.companyId || saving">
        {{ saving ? 'Adding…' : 'Add' }}
      </button>
      <button type="button" class="px-2.5 h-[30px] rounded-[8px] text-[12.5px] font-semibold text-base-content/50 hover:bg-base-200" @click="adding = false">Cancel</button>
      <div v-if="!companies.length" class="w-full text-[11.5px] text-[#c2253c]">Create a company first — contacts belong to one.</div>
    </form>

    <div class="border border-base-300 rounded-xl overflow-hidden bg-base-100 min-w-[1080px]">
      <div
        class="grid items-center px-4 h-[42px] border-b border-base-300 bg-base-200"
        :style="{ gridTemplateColumns: COLS }"
      >
        <span v-for="h in ['Name', 'Company', 'Email', 'Phone', 'Location', 'Created', 'Last activity', '']" :key="h"
          class="text-[11px] font-bold tracking-wider uppercase text-base-content/40">{{ h }}</span>
      </div>

      <div v-if="!crm.contacts.length" class="px-4 py-10 text-center text-[13px] text-base-content/40">
        <span v-if="crm.loading" class="inline-flex items-center gap-2"><Loader2 :size="15" class="animate-spin" /> Loading contacts…</span>
        <span v-else>No contacts yet.</span>
      </div>
      <div
        v-for="c in crm.contacts"
        :key="c.id"
        class="crm-row grid items-center px-4 h-[52px] border-b border-base-200"
        :style="{ gridTemplateColumns: COLS }"
      >
        <div class="flex items-center gap-[11px] min-w-0">
          <CrmAvatar :name="c.name" :initials="c.initials" :color="c.color" :size="30" :radius="8" />
          <div class="min-w-0">
            <div class="text-sm font-semibold text-base-content flex items-center gap-[7px] min-w-0">
              <input
                v-if="isEditing(c.id, 'name')"
                id="crm-ct-edit"
                v-model="draft"
                class="crm-cell-in font-semibold"
                @blur="commitEdit"
                @keydown.enter.prevent="commitEdit"
                @keydown.esc.prevent="editing = null"
              />
              <button v-else type="button" class="crm-editable truncate" title="Click to edit" @click="startEdit(c, 'name')">{{ c.name }}</button>
              <span
                v-if="c.primary"
                class="text-[9.5px] font-bold px-[5px] py-px rounded flex-none"
                :style="{ color: 'var(--accent-fg)', background: 'var(--accent-soft)' }"
              >PRIMARY</span>
            </div>
            <input
              v-if="isEditing(c.id, 'role')"
              id="crm-ct-edit"
              v-model="draft"
              class="crm-cell-in text-[11.5px]"
              @blur="commitEdit"
              @keydown.enter.prevent="commitEdit"
              @keydown.esc.prevent="editing = null"
            />
            <button v-else type="button" class="crm-editable block text-[11.5px] text-left truncate" :class="c.role ? 'text-base-content/40' : 'text-base-content/25'" title="Click to edit" @click="startEdit(c, 'role')">{{ c.role || 'Add title' }}</button>
          </div>
        </div>

        <div class="flex items-center gap-[7px] min-w-0">
          <CrmAvatar :name="crm.company(c.companyId)?.name" :initials="crm.company(c.companyId)?.initials" :color="crm.company(c.companyId)?.color" :size="20" :radius="6" />
          <span class="text-[13px] text-base-content/60 truncate">{{ crm.company(c.companyId)?.name }}</span>
        </div>

        <div class="min-w-0 pr-2">
          <input
            v-if="isEditing(c.id, 'email')"
            id="crm-ct-edit"
            v-model="draft"
            class="crm-cell-in"
            @blur="commitEdit"
            @keydown.enter.prevent="commitEdit"
            @keydown.esc.prevent="editing = null"
          />
          <button v-else type="button" class="crm-editable block w-full text-left text-[13px] truncate" :style="c.email ? { color: 'var(--link)' } : {}" :class="!c.email && 'text-base-content/25'" title="Click to edit" @click="startEdit(c, 'email')">{{ c.email || 'Add email' }}</button>
        </div>

        <div class="min-w-0 pr-2">
          <input
            v-if="isEditing(c.id, 'phone')"
            id="crm-ct-edit"
            v-model="draft"
            class="crm-cell-in tabular-nums"
            @blur="commitEdit"
            @keydown.enter.prevent="commitEdit"
            @keydown.esc.prevent="editing = null"
          />
          <button v-else type="button" class="crm-editable block w-full text-left text-[13px] tabular-nums truncate" :class="c.phone ? 'text-base-content/60' : 'text-base-content/25'" title="Click to edit" @click="startEdit(c, 'phone')">{{ c.phone || 'Add phone' }}</button>
        </div>

        <div class="min-w-0 pr-2">
          <input
            v-if="isEditing(c.id, 'location')"
            id="crm-ct-edit"
            v-model="draft"
            class="crm-cell-in"
            placeholder="City, Country"
            @blur="commitEdit"
            @keydown.enter.prevent="commitEdit"
            @keydown.esc.prevent="editing = null"
          />
          <button v-else type="button" class="crm-editable block w-full text-left text-[13px] truncate" :class="location(c) ? 'text-base-content/60' : 'text-base-content/25'" title="City, Country — click to edit" @click="startEdit(c, 'location')">{{ location(c) || 'Add location' }}</button>
        </div>

        <div class="text-[12.5px] text-base-content/60 tabular-nums">{{ fmtDate(c.createdAt) }}</div>
        <div class="text-[12.5px] text-base-content/60">{{ c.lastActivityAt ? relTime(c.lastActivityAt) : '—' }}</div>

        <div class="crm-actions flex items-center justify-end gap-0.5">
          <button
            type="button"
            class="w-6 h-6 rounded-md grid place-items-center"
            :class="c.primary ? '' : 'text-base-content/30 hover:text-base-content/70 hover:bg-base-300/60'"
            :style="c.primary ? { color: 'var(--accent-fg)' } : {}"
            :title="c.primary ? 'Unset as primary contact' : 'Make primary contact'"
            @click="togglePrimary(c)"
          >
            <Star :size="13" :fill="c.primary ? 'currentColor' : 'none'" />
          </button>
          <button
            type="button"
            class="w-6 h-6 rounded-md grid place-items-center text-base-content/30 hover:text-[#c2253c] hover:bg-base-300/60"
            :title="'Delete ' + c.name"
            @click="removeContact(c)"
          >
            <Trash2 :size="13" />
          </button>
        </div>
      </div>
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
