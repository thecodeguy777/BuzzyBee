<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  ChevronLeft, Download, Pencil, Loader2, Inbox, X, ExternalLink, Star,
} from 'lucide-vue-next'
import { useFormsStore, type FormRow, type FormResponse } from '@/stores/forms'
import { isInput, type FormField } from '@/lib/formFields'

// The form's data table: columns are the form's own fields, one row per
// submission — the "actual table built from the fields," like the task table.
const props = defineProps<{ id: string }>()
const router = useRouter()
const formsStore = useFormsStore()

const form = ref<FormRow | null>(null)
const responses = ref<FormResponse[]>([])
const loading = ref(true)
const selected = ref<FormResponse | null>(null)

onMounted(async () => {
  const [f, rows] = await Promise.all([formsStore.load(props.id), formsStore.fetchResponses(props.id)])
  form.value = f
  responses.value = rows
  loading.value = false
})

// Columns = every input field across steps (layout fields don't collect data).
const columns = computed<FormField[]>(() => {
  const out: FormField[] = []
  for (const s of form.value?.structure.steps ?? []) {
    for (const f of s.fields) if (isInput(f.type)) out.push(f)
  }
  return out
})
const gridTemplate = computed(
  () => columns.value.map(() => 'minmax(130px, 1fr)').join(' ') + ' 132px',
)

// ── Cell rendering by field type ──────────────────────────────────────────────
function cellText(field: FormField, raw: unknown): string {
  if (raw == null || raw === '') return ''
  if (Array.isArray(raw)) return raw.join(', ')
  if (field.type === 'date') {
    const d = new Date(String(raw))
    return Number.isNaN(d.getTime()) ? String(raw) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }
  return String(raw)
}
function ratingOf(raw: unknown): number {
  return typeof raw === 'number' ? raw : Number(raw) || 0
}
function fmtSubmitted(s: string): string {
  const d = new Date(s)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// ── CSV export ────────────────────────────────────────────────────────────────
function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}
function exportCsv() {
  const headers = [...columns.value.map((c) => c.props.label || 'Field'), 'Submitted']
  const lines = [headers.map(csvCell).join(',')]
  for (const r of responses.value) {
    const row = columns.value.map((c) => csvCell(cellText(c, r.values[c.id])))
    row.push(csvCell(fmtSubmitted(r.submitted_at)))
    lines.push(row.join(','))
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(form.value?.title || 'form').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-responses.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="h-full flex flex-col min-h-0">
    <!-- header -->
    <div class="flex items-center gap-3 pb-4 border-b border-base-300">
      <button class="w-9 h-9 rounded-lg grid place-items-center hover:bg-base-200" @click="router.push({ name: 'workstation-forms' })">
        <ChevronLeft class="w-5 h-5" :stroke-width="1.75" />
      </button>
      <div class="min-w-0">
        <h1 class="font-display text-lg font-semibold truncate">{{ form?.title || 'Responses' }}</h1>
        <p class="text-xs text-base-content/55">{{ responses.length }} {{ responses.length === 1 ? 'response' : 'responses' }}</p>
      </div>
      <div class="flex-1" />
      <button class="btn btn-sm btn-ghost gap-1.5" @click="router.push({ name: 'workstation-form-builder', params: { id } })">
        <Pencil class="w-4 h-4" :stroke-width="1.75" /> Edit form
      </button>
      <button class="btn btn-sm btn-ghost gap-1.5" :disabled="!responses.length" @click="exportCsv">
        <Download class="w-4 h-4" :stroke-width="1.75" /> Export CSV
      </button>
    </div>

    <div v-if="loading" class="flex-1 grid place-items-center">
      <Loader2 class="w-6 h-6 animate-spin text-base-content/30" />
    </div>

    <!-- empty -->
    <div v-else-if="!responses.length" class="flex-1 grid place-items-center">
      <div class="text-center max-w-sm">
        <span class="w-12 h-12 rounded-2xl grid place-items-center text-primary mx-auto mb-3" style="background: var(--accent-soft, rgba(138,58,147,.12))">
          <Inbox class="w-6 h-6" :stroke-width="1.5" />
        </span>
        <p class="font-display text-lg font-semibold mb-1">No responses yet</p>
        <p class="text-sm text-base-content/55">
          {{ form?.published ? 'Share the form link — submissions land here as rows.' : 'Publish the form to start collecting responses.' }}
        </p>
      </div>
    </div>

    <!-- table — compact data grid; columns fill the width, scroll once they outgrow it -->
    <div v-else class="flex-1 min-h-0 overflow-auto mt-4 border border-base-300 rounded-xl bg-base-100">
      <!-- header row -->
      <div
        class="grid h-8 border-b border-base-300 bg-base-200/70 sticky top-0 z-10 text-[0.66rem] font-bold uppercase tracking-wider text-base-content/50"
        :style="{ gridTemplateColumns: gridTemplate }"
      >
        <div v-for="c in columns" :key="c.id" class="flex items-center px-3 border-r border-base-300/60 truncate">
          {{ c.props.label || 'Field' }}
        </div>
        <div class="flex items-center px-3">Submitted</div>
      </div>
      <!-- data rows -->
      <div
        v-for="r in responses"
        :key="r.id"
        class="grid h-9 border-b border-base-200 last:border-b-0 hover:bg-base-200/40 cursor-pointer transition-colors"
        :style="{ gridTemplateColumns: gridTemplate }"
        @click="selected = r"
      >
        <div v-for="c in columns" :key="c.id" class="flex items-center px-3 border-r border-base-200/60 min-w-0 text-[13px]">
          <!-- rating shows stars; everything else is text -->
          <span v-if="c.type === 'rating'" class="inline-flex items-center gap-px text-warning">
            <Star v-for="i in ratingOf(r.values[c.id])" :key="i" class="w-3 h-3 fill-warning" :stroke-width="0" />
            <span v-if="!ratingOf(r.values[c.id])" class="text-base-content/25">—</span>
          </span>
          <span v-else-if="cellText(c, r.values[c.id])" class="truncate">{{ cellText(c, r.values[c.id]) }}</span>
          <span v-else class="text-base-content/25">—</span>
        </div>
        <div class="flex items-center px-3 text-[11.5px] text-base-content/45 tabular-nums whitespace-nowrap">{{ fmtSubmitted(r.submitted_at) }}</div>
      </div>
    </div>

    <!-- ── Submission detail drawer ── -->
    <Transition name="drawer">
      <div v-if="selected" class="fixed inset-0 z-50 flex justify-end" @click.self="selected = null">
        <div class="absolute inset-0 bg-black/30" @click="selected = null" />
        <div class="relative w-full max-w-md h-full bg-base-100 border-l border-base-300 shadow-2xl flex flex-col">
          <div class="flex items-center gap-2 px-5 h-14 border-b border-base-300 shrink-0">
            <span class="font-semibold">Submission</span>
            <span class="text-xs text-base-content/50">{{ fmtSubmitted(selected.submitted_at) }}</span>
            <div class="flex-1" />
            <button class="w-8 h-8 rounded-lg grid place-items-center hover:bg-base-200" @click="selected = null">
              <X class="w-4 h-4" :stroke-width="2" />
            </button>
          </div>
          <div class="flex-1 overflow-y-auto p-5 space-y-4">
            <div v-for="c in columns" :key="c.id">
              <div class="text-[0.7rem] font-bold uppercase tracking-wider text-base-content/45 mb-1">{{ c.props.label || 'Field' }}</div>
              <div v-if="c.type === 'rating'" class="inline-flex items-center gap-0.5 text-warning">
                <Star v-for="i in ratingOf(selected.values[c.id])" :key="i" class="w-4 h-4 fill-warning" :stroke-width="0" />
                <span v-if="!ratingOf(selected.values[c.id])" class="text-base-content/30 text-sm">No answer</span>
              </div>
              <div v-else-if="cellText(c, selected.values[c.id])" class="text-sm whitespace-pre-wrap">{{ cellText(c, selected.values[c.id]) }}</div>
              <div v-else class="text-sm text-base-content/30">No answer</div>
            </div>
          </div>
          <div v-if="selected.created_task_id" class="px-5 py-3 border-t border-base-300 shrink-0">
            <RouterLink
              :to="{ name: 'workstation-tasks' }"
              class="inline-flex items-center gap-1.5 text-sm text-primary font-medium"
            >
              <ExternalLink class="w-4 h-4" :stroke-width="1.75" /> A task was created from this
            </RouterLink>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.drawer-enter-active,
.drawer-leave-active { transition: opacity 0.2s; }
.drawer-enter-active .relative,
.drawer-leave-active .relative { transition: transform 0.22s ease; }
.drawer-enter-from,
.drawer-leave-to { opacity: 0; }
.drawer-enter-from .relative,
.drawer-leave-to .relative { transform: translateX(100%); }
</style>
