<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  Plus, FileText, ExternalLink, Copy as CopyIcon, Trash2, Loader2, Inbox, Circle,
  CheckCircle2, Files, X, FolderOpen,
} from 'lucide-vue-next'
import { useFormsStore } from '@/stores/forms'
import { useClientsStore } from '@/stores/clients'

const router = useRouter()
const formsStore = useFormsStore()
const clients = useClientsStore()
const creating = ref(false)
const copiedId = ref<string | null>(null)
const pickerOpen = ref(false)

onMounted(() => { if (!formsStore.loaded) void formsStore.fetchAll() })

// Per-client (reacts to the client switcher) + an Unfiled bucket for orphans.
const visible = computed(() => formsStore.visible)
const unfiled = computed(() => formsStore.unfiled)
const sections = computed(() => {
  const out: { label: string | null; note?: string; forms: typeof visible.value }[] = [{ label: null, forms: visible.value }]
  if (unfiled.value.length) out.push({ label: 'Unfiled', note: 'Not tied to a client yet — open one and connect a project.', forms: unfiled.value })
  return out
})
const clientName = computed(() => clients.currentClient?.name ?? null)

// The cross-client clone picker: every form you can access, grouped by client.
const pickerGroups = computed(() => {
  const groups = clients.clients
    .map((c: any) => ({ id: c.id, name: c.name, forms: formsStore.forms.filter((f) => f.client_id === c.id) }))
    .filter((g) => g.forms.length)
  const orphans = formsStore.forms.filter((f) => !f.client_id)
  if (orphans.length) groups.push({ id: 'unfiled', name: 'Unfiled', forms: orphans })
  return groups
})

async function newForm() {
  creating.value = true
  const row = await formsStore.createForm()
  creating.value = false
  if (row) router.push({ name: 'workstation-form-builder', params: { id: row.id } })
}
async function duplicate(id: string, clientId: string | null) {
  const row = await formsStore.cloneForm(id, clientId ?? clients.currentClientId)
  if (row) router.push({ name: 'workstation-form-builder', params: { id: row.id } })
}
async function cloneInto(id: string) {
  pickerOpen.value = false
  const row = await formsStore.cloneForm(id, clients.currentClientId)
  if (row) router.push({ name: 'workstation-form-builder', params: { id: row.id } })
}
function openForm(id: string) { router.push({ name: 'workstation-form-builder', params: { id } }) }
function openResponses(id: string) { router.push({ name: 'workstation-form-responses', params: { id } }) }
function copyLink(token: string, id: string) {
  void navigator.clipboard?.writeText(`${window.location.origin}/f/${token}`)
  copiedId.value = id
  setTimeout(() => { if (copiedId.value === id) copiedId.value = null }, 1500)
}
async function del(id: string, title: string) {
  if (!window.confirm(`Delete "${title}"? Its responses are removed too.`)) return
  await formsStore.remove(id)
}
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-5">
    <header class="flex items-center gap-3">
      <div>
        <h1 class="font-display text-xl font-semibold">Forms</h1>
        <p class="text-sm text-base-content/55 mt-0.5">
          <template v-if="clientName">Intake forms for <span class="font-semibold text-base-content/70">{{ clientName }}</span>.</template>
          <template v-else>Pick a client in the switcher to see its forms.</template>
        </p>
      </div>
      <div class="flex-1" />
      <button class="btn btn-ghost btn-sm gap-1.5" @click="pickerOpen = true">
        <Files class="w-4 h-4" :stroke-width="1.75" /> Start from existing
      </button>
      <button class="btn btn-primary btn-sm gap-1.5" :disabled="creating" @click="newForm">
        <Loader2 v-if="creating" class="w-4 h-4 animate-spin" />
        <Plus v-else class="w-4 h-4" :stroke-width="2" />
        New form
      </button>
    </header>

    <div v-if="formsStore.loading && !formsStore.forms.length" class="grid place-items-center py-20">
      <Loader2 class="w-6 h-6 animate-spin text-base-content/30" />
    </div>

    <div v-else-if="!visible.length && !unfiled.length" class="rounded-2xl border border-dashed border-base-300 py-16 text-center">
      <span class="w-12 h-12 rounded-2xl grid place-items-center text-primary mx-auto mb-3" style="background: var(--accent-soft, rgba(138,58,147,.12))">
        <FileText class="w-6 h-6" :stroke-width="1.5" />
      </span>
      <p class="font-display text-lg font-semibold mb-1">No forms{{ clientName ? ` for ${clientName}` : '' }} yet</p>
      <p class="text-sm text-base-content/55 mb-4">Build a fresh intake form, or copy one you've already made for another client.</p>
      <div class="flex items-center gap-2 justify-center">
        <button class="btn btn-ghost btn-sm gap-1.5" @click="pickerOpen = true"><Files class="w-4 h-4" :stroke-width="1.75" /> Start from existing</button>
        <button class="btn btn-primary btn-sm gap-1.5" @click="newForm"><Plus class="w-4 h-4" :stroke-width="2" /> New form</button>
      </div>
    </div>

    <template v-else>
      <section v-for="(sec, si) in sections" :key="si">
        <div v-if="sec.label" class="flex items-center gap-2 mb-2 mt-1">
          <FolderOpen class="w-3.5 h-3.5 text-base-content/40" :stroke-width="1.75" />
          <span class="text-[12px] font-bold uppercase tracking-wide text-base-content/45">{{ sec.label }}</span>
          <span v-if="sec.note" class="text-[11.5px] text-base-content/40">· {{ sec.note }}</span>
        </div>
        <div v-if="sec.forms.length" class="grid sm:grid-cols-2 gap-3" :class="sec.label ? 'opacity-90' : ''">
          <div
            v-for="f in sec.forms"
            :key="f.id"
            class="group rounded-xl border border-base-300 bg-base-100 p-4 hover:border-primary/40 hover:shadow-sm transition cursor-pointer"
            @click="openForm(f.id)"
          >
            <div class="flex items-start gap-3">
              <span class="w-9 h-9 rounded-xl grid place-items-center text-primary shrink-0" style="background: var(--accent-soft, rgba(138,58,147,.12))">
                <FileText class="w-[18px] h-[18px]" :stroke-width="1.75" />
              </span>
              <div class="flex-1 min-w-0">
                <div class="font-semibold truncate">{{ f.title }}</div>
                <div class="text-xs text-base-content/50 truncate">{{ f.description || 'No description' }}</div>
              </div>
              <span
                class="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0"
                :class="f.published ? 'text-success bg-success/10' : 'text-base-content/50 bg-base-200'"
              >
                <component :is="f.published ? CheckCircle2 : Circle" class="w-3 h-3" :stroke-width="2" />
                {{ f.published ? 'Live' : 'Draft' }}
              </span>
            </div>
            <div class="flex items-center gap-3 mt-3 pt-3 border-t border-base-200 text-xs text-base-content/50">
              <button class="inline-flex items-center gap-1 hover:text-primary font-medium" title="View responses" @click.stop="openResponses(f.id)">
                <Inbox class="w-3.5 h-3.5" :stroke-width="1.75" /> {{ f.submission_count }} {{ f.submission_count === 1 ? 'response' : 'responses' }}
              </button>
              <span>·</span>
              <span>Edited {{ fmtDate(f.updated_at) }}</span>
              <div class="flex-1" />
              <button
                class="opacity-0 group-hover:opacity-100 transition w-7 h-7 rounded-lg grid place-items-center hover:bg-base-200"
                title="Duplicate" @click.stop="duplicate(f.id, f.client_id)"
              >
                <Files class="w-3.5 h-3.5" :stroke-width="1.75" />
              </button>
              <button
                v-if="f.published"
                class="opacity-0 group-hover:opacity-100 transition w-7 h-7 rounded-lg grid place-items-center hover:bg-base-200"
                :title="copiedId === f.id ? 'Copied' : 'Copy public link'" @click.stop="copyLink(f.public_token, f.id)"
              >
                <CopyIcon class="w-3.5 h-3.5" :class="copiedId === f.id ? 'text-success' : ''" :stroke-width="1.75" />
              </button>
              <a
                v-if="f.published" class="opacity-0 group-hover:opacity-100 transition w-7 h-7 rounded-lg grid place-items-center hover:bg-base-200"
                :href="`/f/${f.public_token}`" target="_blank" title="Open public form" @click.stop
              >
                <ExternalLink class="w-3.5 h-3.5" :stroke-width="1.75" />
              </a>
              <button
                class="opacity-0 group-hover:opacity-100 transition w-7 h-7 rounded-lg grid place-items-center hover:bg-base-200 hover:text-error"
                title="Delete" @click.stop="del(f.id, f.title)"
              >
                <Trash2 class="w-3.5 h-3.5" :stroke-width="1.75" />
              </button>
            </div>
          </div>
        </div>
        <p v-else class="text-sm text-base-content/45 rounded-xl border border-dashed border-base-300 py-8 text-center">
          No forms for {{ clientName ?? 'this client' }} yet — make one, or copy from another client.
        </p>
      </section>
    </template>

    <!-- Clone picker: pick any form (across clients) to copy into the current client -->
    <div v-if="pickerOpen" class="fixed inset-0 z-[120] flex items-center justify-center p-4" @click.self="pickerOpen = false">
      <div class="absolute inset-0 bg-black/25" @click="pickerOpen = false" />
      <div class="relative w-[520px] max-w-full max-h-[80vh] bg-base-100 border border-base-300 rounded-2xl shadow-2xl flex flex-col">
        <div class="flex items-center gap-2 px-5 py-3.5 border-b border-base-300">
          <Files class="w-4 h-4 text-primary" :stroke-width="1.75" />
          <div class="leading-tight">
            <div class="text-[14px] font-bold">Start from an existing form</div>
            <div class="text-[12px] text-base-content/50">Copies into <span class="font-semibold">{{ clientName ?? 'Unfiled' }}</span></div>
          </div>
          <div class="flex-1" />
          <button class="w-8 h-8 rounded-lg grid place-items-center hover:bg-base-200" @click="pickerOpen = false"><X class="w-4 h-4" /></button>
        </div>
        <div class="flex-1 overflow-y-auto px-3 py-3">
          <div v-if="!pickerGroups.length" class="text-center py-10 text-base-content/40 text-[13px]">No forms to copy yet.</div>
          <div v-for="g in pickerGroups" :key="g.id" class="mb-3">
            <div class="text-[11px] font-bold uppercase tracking-wide text-base-content/40 px-2 mb-1">{{ g.name }}</div>
            <button
              v-for="f in g.forms" :key="f.id" type="button"
              class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-base-200 text-left"
              @click="cloneInto(f.id)"
            >
              <span class="w-7 h-7 rounded-lg grid place-items-center text-primary shrink-0" style="background: var(--accent-soft, rgba(138,58,147,.12))">
                <FileText class="w-3.5 h-3.5" :stroke-width="1.75" />
              </span>
              <span class="flex-1 min-w-0">
                <span class="block text-[13px] font-semibold truncate">{{ f.title }}</span>
                <span class="block text-[11.5px] text-base-content/45 truncate">{{ f.description || 'No description' }}</span>
              </span>
              <CopyIcon class="w-4 h-4 text-base-content/30 shrink-0" :stroke-width="1.75" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
