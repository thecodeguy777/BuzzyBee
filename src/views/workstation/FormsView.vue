<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  Plus, FileText, ExternalLink, Copy as CopyIcon, Trash2, Loader2, Inbox, Circle, CheckCircle2,
} from 'lucide-vue-next'
import { useFormsStore } from '@/stores/forms'

const router = useRouter()
const formsStore = useFormsStore()
const creating = ref(false)
const copiedId = ref<string | null>(null)

onMounted(() => { if (!formsStore.loaded) void formsStore.fetchAll() })

const forms = computed(() => formsStore.forms)

async function newForm() {
  creating.value = true
  const row = await formsStore.createForm()
  creating.value = false
  if (row) router.push({ name: 'workstation-form-builder', params: { id: row.id } })
}
function openForm(id: string) {
  router.push({ name: 'workstation-form-builder', params: { id } })
}
function openResponses(id: string) {
  router.push({ name: 'workstation-form-responses', params: { id } })
}
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
        <p class="text-sm text-base-content/55 mt-0.5">Intake forms — each submission becomes a task in the connected project.</p>
      </div>
      <div class="flex-1" />
      <button class="btn btn-primary btn-sm gap-1.5" :disabled="creating" @click="newForm">
        <Loader2 v-if="creating" class="w-4 h-4 animate-spin" />
        <Plus v-else class="w-4 h-4" :stroke-width="2" />
        New form
      </button>
    </header>

    <div v-if="formsStore.loading && !forms.length" class="grid place-items-center py-20">
      <Loader2 class="w-6 h-6 animate-spin text-base-content/30" />
    </div>

    <div v-else-if="!forms.length" class="rounded-2xl border border-dashed border-base-300 py-16 text-center">
      <span class="w-12 h-12 rounded-2xl grid place-items-center text-primary mx-auto mb-3" style="background: var(--accent-soft, rgba(138,58,147,.12))">
        <FileText class="w-6 h-6" :stroke-width="1.5" />
      </span>
      <p class="font-display text-lg font-semibold mb-1">No forms yet</p>
      <p class="text-sm text-base-content/55 mb-4">Build a client intake or request form that drops straight into your task board.</p>
      <button class="btn btn-primary btn-sm gap-1.5" @click="newForm"><Plus class="w-4 h-4" :stroke-width="2" /> Create your first form</button>
    </div>

    <div v-else class="grid sm:grid-cols-2 gap-3">
      <div
        v-for="f in forms"
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
          <button
            class="inline-flex items-center gap-1 hover:text-primary font-medium"
            title="View responses"
            @click.stop="openResponses(f.id)"
          >
            <Inbox class="w-3.5 h-3.5" :stroke-width="1.75" /> {{ f.submission_count }} {{ f.submission_count === 1 ? 'response' : 'responses' }}
          </button>
          <span>·</span>
          <span>Edited {{ fmtDate(f.updated_at) }}</span>
          <div class="flex-1" />
          <button
            v-if="f.published"
            class="opacity-0 group-hover:opacity-100 transition w-7 h-7 rounded-lg grid place-items-center hover:bg-base-200"
            :title="copiedId === f.id ? 'Copied' : 'Copy public link'"
            @click.stop="copyLink(f.public_token, f.id)"
          >
            <CopyIcon class="w-3.5 h-3.5" :class="copiedId === f.id ? 'text-success' : ''" :stroke-width="1.75" />
          </button>
          <a
            v-if="f.published"
            class="opacity-0 group-hover:opacity-100 transition w-7 h-7 rounded-lg grid place-items-center hover:bg-base-200"
            :href="`/f/${f.public_token}`"
            target="_blank"
            title="Open public form"
            @click.stop
          >
            <ExternalLink class="w-3.5 h-3.5" :stroke-width="1.75" />
          </a>
          <button
            class="opacity-0 group-hover:opacity-100 transition w-7 h-7 rounded-lg grid place-items-center hover:bg-base-200 hover:text-error"
            title="Delete"
            @click.stop="del(f.id, f.title)"
          >
            <Trash2 class="w-3.5 h-3.5" :stroke-width="1.75" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
