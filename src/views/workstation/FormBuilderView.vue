<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, reactive } from 'vue'
import { useRouter } from 'vue-router'
import {
  ChevronLeft, Eye, Share2, Plus, X, GripVertical, ChevronUp, ChevronDown,
  Copy as CopyIcon, Trash2, ArrowRight, Table2, Check, Loader2, FileText, Inbox, Workflow,
} from 'lucide-vue-next'
import {
  FIELD_DEFS, TABLE_COLS, TEMPLATE_NAMES, makeField, buildTemplate, newFieldId,
  fieldDef, isInput, hasOptions,
  type FieldType, type FormField, type FormStructure, type TemplateName, type MapKey,
} from '@/lib/formFields'
import FormFieldBody from '@/components/forms/FormFieldBody.vue'
import { useFormsStore } from '@/stores/forms'
import { useProjectsStore } from '@/stores/projects'
import { useClientsStore } from '@/stores/clients'
import { useStatusesStore } from '@/stores/statuses'

const props = defineProps<{ id: string }>()
const router = useRouter()
const formsStore = useFormsStore()
const projects = useProjectsStore()
const clients = useClientsStore()
const statuses = useStatusesStore()

// ── Local editable model (autosaved on debounce) ──────────────────────────────
const form = reactive({
  title: '',
  description: '' as string | null,
  submit_label: 'Submit',
  multi: false,
  project_id: null as string | null,
  client_id: null as string | null,
  land_status_key: null as string | null,
  structure: { steps: [] } as FormStructure,
  public_token: '',
  published: false,
})
const ready = ref(false)
const notFound = ref(false)

const step = ref(0)
const selectedId = ref<string | null>(null)
const tab = ref<'field' | 'connect'>('field')
const preview = ref(false)
const toast = ref<{ title: string; sub: string } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | undefined

function fire(title: string, sub: string) {
  toast.value = { title, sub }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = null), 3600)
}

onMounted(async () => {
  if (!projects.loaded) await projects.fetchAll()
  if (!statuses.byProject.value || !Object.keys(statuses.byProject.value).length) await statuses.fetchAll()
  const row = await formsStore.load(props.id)
  if (!row) { notFound.value = true; return }
  form.title = row.title
  form.description = row.description
  form.submit_label = row.submit_label
  form.multi = row.multi
  form.project_id = row.project_id
  form.client_id = row.client_id
  form.land_status_key = row.land_status_key
  form.structure = row.structure?.steps ? row.structure : { steps: [{ id: 's0', title: 'Step 1', fields: [] }] }
  form.public_token = row.public_token
  form.published = row.published
  ready.value = true
})

// ── Autosave ──────────────────────────────────────────────────────────────────
const saveState = ref<'idle' | 'saving' | 'saved'>('idle')
let saveTimer: ReturnType<typeof setTimeout> | undefined
function queueSave() {
  if (!ready.value) return
  saveState.value = 'saving'
  clearTimeout(saveTimer)
  saveTimer = setTimeout(flush, 700)
}
async function flush() {
  const ok = await formsStore.save(props.id, {
    title: form.title,
    description: form.description,
    submit_label: form.submit_label,
    multi: form.multi,
    project_id: form.project_id,
    client_id: form.client_id,
    land_status_key: form.land_status_key,
    structure: JSON.parse(JSON.stringify(form.structure)),
  })
  saveState.value = ok ? 'saved' : 'idle'
  if (ok) setTimeout(() => (saveState.value = 'idle'), 1500)
}
watch(() => JSON.stringify(form.structure), queueSave)
watch(() => [form.title, form.description, form.submit_label, form.multi, form.project_id, form.land_status_key], queueSave)
onBeforeUnmount(() => { clearTimeout(saveTimer); if (saveState.value === 'saving') void flush() })

// ── Field operations ──────────────────────────────────────────────────────────
const curFields = computed(() => form.structure.steps[step.value]?.fields ?? [])
function setFields(fn: (a: FormField[]) => FormField[]) {
  const s = form.structure.steps[step.value]
  if (s) s.fields = fn(s.fields)
}
function selectedField(): FormField | null {
  for (const s of form.structure.steps) {
    const f = s.fields.find((x) => x.id === selectedId.value)
    if (f) return f
  }
  return null
}
function insertAt(type: FieldType, idx: number) {
  const nf = makeField(type)
  setFields((a) => { const n = [...a]; n.splice(idx, 0, nf); return n })
  selectedId.value = nf.id
  tab.value = 'field'
}
function addEnd(type: FieldType) {
  insertAt(type, curFields.value.length)
}
function fieldTool(action: 'up' | 'down' | 'dup' | 'del', id: string) {
  if (action === 'del') {
    setFields((a) => a.filter((x) => x.id !== id))
    if (selectedId.value === id) selectedId.value = null
    return
  }
  if (action === 'dup') {
    const src = curFields.value.find((x) => x.id === id)
    if (!src) return
    const nf: FormField = { id: newFieldId(), type: src.type, props: JSON.parse(JSON.stringify(src.props)) }
    setFields((a) => { const i = a.findIndex((x) => x.id === id); const n = [...a]; n.splice(i + 1, 0, nf); return n })
    selectedId.value = nf.id
    return
  }
  setFields((a) => {
    const i = a.findIndex((x) => x.id === id)
    const j = action === 'up' ? i - 1 : i + 1
    if (j < 0 || j >= a.length) return a
    const n = [...a]
    ;[n[i], n[j]] = [n[j], n[i]]
    return n
  })
}

// ── Native drag-and-drop (no library moves DOM nodes — Vue owns the list) ──────
// dropIndex is the slot the field will land in; a prominent insertion bar
// renders there so you can see exactly where it'll go before letting go.
const drag = ref<{ kind: 'new'; type: FieldType } | { kind: 'move'; id: string } | null>(null)
const dropIndex = ref<number | null>(null)
const draggingId = ref<string | null>(null)
const dragActive = computed(() => drag.value !== null)
function onFieldDragOver(e: DragEvent, i: number) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  // Skip the slot on either side of the field being moved — dropping there is
  // a no-op, so don't tease an insertion point that won't move anything.
  const next = e.clientY < r.top + r.height / 2 ? i : i + 1
  const d = drag.value
  if (d?.kind === 'move') {
    const from = curFields.value.findIndex((x) => x.id === d.id)
    if (next === from || next === from + 1) { dropIndex.value = null; return }
  }
  dropIndex.value = next
}
function endDrag() {
  drag.value = null
  draggingId.value = null
  dropIndex.value = null
}
function handleDrop() {
  const di = dropIndex.value ?? curFields.value.length
  const d = drag.value
  draggingId.value = null
  dropIndex.value = null
  drag.value = null
  if (!d) return
  if (d.kind === 'new') {
    insertAt(d.type, di)
  } else {
    setFields((a) => {
      const from = a.findIndex((x) => x.id === d.id)
      if (from < 0) return a
      let to = di
      const n = [...a]
      const [m] = n.splice(from, 1)
      if (from < to) to--
      n.splice(to, 0, m)
      return n
    })
    selectedId.value = d.id
  }
}

// ── Steps / templates ─────────────────────────────────────────────────────────
function applyTemplate(name: TemplateName) {
  const built = buildTemplate(name)
  form.multi = built.multi
  form.structure = { steps: built.steps }
  step.value = 0
  selectedId.value = null
}
function addStep() {
  form.structure.steps.push({ id: `s-${Math.random().toString(36).slice(2, 6)}`, title: `Step ${form.structure.steps.length + 1}`, fields: [] })
  form.multi = true
  step.value = form.structure.steps.length - 1
}
function toggleMulti() {
  form.multi = !form.multi
  if (!form.multi) step.value = 0
}

// ── Inspector helpers ─────────────────────────────────────────────────────────
function updateField(patch: Partial<FormField['props']>) {
  const f = selectedField()
  if (f) Object.assign(f.props, patch)
}
function setOption(i: number, v: string) {
  const f = selectedField()
  if (f?.props.options) f.props.options[i] = v
}
function addOption() {
  const f = selectedField()
  if (!f) return
  f.props.options = [...(f.props.options ?? []), `Option ${(f.props.options?.length ?? 0) + 1}`]
}
function removeOption(i: number) {
  const f = selectedField()
  if (f?.props.options) f.props.options = f.props.options.filter((_, j) => j !== i)
}

// ── Connect tab ───────────────────────────────────────────────────────────────
interface ProjOption { id: string; label: string }
// Limit the picker to the form's client (forms are client-scoped now); legacy
// client-less forms still see every project so they can be filed.
const projectOptions = computed<ProjOption[]>(() =>
  projects.projects
    .filter((p) => !form.client_id || p.client_id === form.client_id)
    .map((p) => ({ id: p.id, label: `${clients.clients.find((c) => c.id === p.client_id)?.name ?? 'Client'} · ${p.name}` })),
)
function onProjectChange(pid: string) {
  form.project_id = pid || null
  const proj = projects.projects.find((p) => p.id === pid)
  form.client_id = proj?.client_id ?? null
  // Reset landing status to the new project's first column.
  form.land_status_key = statuses.forProject(pid)[0]?.key ?? null
}
const landingStatuses = computed(() => (form.project_id ? statuses.forProject(form.project_id) : []))
const mappedFields = computed(() => {
  const out: { label: string; col: string }[] = []
  for (const s of form.structure.steps) {
    for (const f of s.fields) {
      if (f.props.map && f.props.map !== 'none') {
        out.push({ label: f.props.label || 'Untitled', col: TABLE_COLS.find((c) => c.key === f.props.map)?.label ?? '' })
      }
    }
  }
  return out
})
function mapLabelFor(f: FormField): string | null {
  if (!f.props.map || f.props.map === 'none') return null
  return TABLE_COLS.find((c) => c.key === f.props.map)?.label ?? null
}

// ── Publish + share ───────────────────────────────────────────────────────────
const publicUrl = computed(() => `${window.location.origin}/f/${form.public_token}`)
async function publish() {
  if (!form.project_id) {
    tab.value = 'connect'
    fire('Connect a project first', 'Pick where submissions should land before publishing.')
    return
  }
  await flush()
  const ok = await formsStore.save(props.id, { published: true })
  if (ok) {
    form.published = true
    void navigator.clipboard?.writeText(publicUrl.value)
    fire('Form published', `Link copied — ${publicUrl.value.replace(/^https?:\/\//, '')}`)
  }
}
function copyLink() {
  void navigator.clipboard?.writeText(publicUrl.value)
  fire('Link copied', publicUrl.value.replace(/^https?:\/\//, ''))
}

// ── Preview (live fill) ───────────────────────────────────────────────────────
const pvStep = ref(0)
const pvVals = ref<Record<string, unknown>>({})
function openPreview() { pvStep.value = 0; pvVals.value = {}; preview.value = true }
const pvCurStep = computed(() => form.structure.steps[pvStep.value])
const pvLast = computed(() => pvStep.value === form.structure.steps.length - 1)
</script>

<template>
  <div v-if="notFound" class="h-full grid place-items-center">
    <div class="text-center">
      <p class="font-display text-lg font-semibold mb-1">Form not found</p>
      <button class="btn btn-sm btn-ghost" @click="router.push({ name: 'workstation-forms' })">Back to forms</button>
    </div>
  </div>

  <div v-else-if="!ready" class="h-full grid place-items-center">
    <Loader2 class="w-6 h-6 animate-spin text-base-content/30" />
  </div>

  <div v-else class="h-full flex flex-col min-h-0">
    <!-- top bar -->
    <div class="h-[54px] flex-none flex items-center gap-3 px-3 border-b border-base-300 bg-base-100">
      <button class="w-9 h-9 rounded-lg grid place-items-center hover:bg-base-200" @click="router.push({ name: 'workstation-forms' })">
        <ChevronLeft class="w-5 h-5" :stroke-width="1.75" />
      </button>
      <span class="w-[30px] h-[30px] rounded-[9px] grid place-items-center text-primary shrink-0" style="background: var(--accent-soft, rgba(138,58,147,.12))">
        <FileText class="w-[17px] h-[17px]" :stroke-width="1.75" />
      </span>
      <input
        v-model="form.title"
        class="w-56 px-2.5 py-1.5 rounded-lg border border-transparent bg-transparent text-[15px] font-bold outline-none focus:bg-base-200 focus:border-base-300"
      />
      <span v-if="form.project_id" class="inline-flex items-center gap-1.5 text-xs text-base-content/60 bg-base-200 px-2.5 py-1 rounded-md font-medium">
        <Table2 class="w-3 h-3" :stroke-width="2" />
        {{ projectOptions.find((p) => p.id === form.project_id)?.label ?? 'Project' }}
      </span>
      <span class="text-xs text-base-content/35 inline-flex items-center gap-1">
        <Loader2 v-if="saveState === 'saving'" class="w-3 h-3 animate-spin" />
        <Check v-else-if="saveState === 'saved'" class="w-3 h-3 text-success" :stroke-width="2.5" />
        {{ saveState === 'saving' ? 'Saving' : saveState === 'saved' ? 'Saved' : '' }}
      </span>
      <div class="flex-1" />
      <label class="flex items-center gap-2 mr-1 cursor-pointer">
        <input type="checkbox" class="toggle toggle-primary toggle-sm" :checked="form.multi" @change="toggleMulti" />
        <span class="text-[13px] font-medium whitespace-nowrap">Multi-step</span>
      </label>
      <button class="btn btn-sm btn-ghost gap-1.5" @click="router.push({ name: 'workstation-form-flow', params: { id } })"><Workflow class="w-4 h-4" :stroke-width="1.75" /> Automation</button>
      <button class="btn btn-sm btn-ghost gap-1.5" @click="router.push({ name: 'workstation-form-responses', params: { id } })"><Inbox class="w-4 h-4" :stroke-width="1.75" /> Responses</button>
      <button class="btn btn-sm btn-ghost gap-1.5" @click="openPreview"><Eye class="w-4 h-4" :stroke-width="1.75" /> Preview</button>
      <button v-if="form.published" class="btn btn-sm btn-ghost gap-1.5" @click="copyLink"><CopyIcon class="w-4 h-4" :stroke-width="1.75" /> Copy link</button>
      <button class="btn btn-sm btn-primary gap-1.5" @click="publish">
        <Share2 class="w-4 h-4" :stroke-width="1.75" /> {{ form.published ? 'Published' : 'Publish' }}
      </button>
    </div>

    <!-- step tabs -->
    <div v-if="form.multi" class="flex items-center gap-1.5 px-6 py-2.5 border-b border-base-300 bg-base-100 overflow-x-auto">
      <button
        v-for="(s, i) in form.structure.steps"
        :key="s.id"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold whitespace-nowrap"
        :class="step === i ? 'text-primary bg-primary/10' : 'text-base-content/60 bg-base-200'"
        @click="step = i; selectedId = null"
      >
        <span class="w-[18px] h-[18px] rounded-full grid place-items-center text-[11px] font-bold" :class="step === i ? 'bg-primary text-primary-content' : 'bg-base-300 text-base-content/60'">{{ i + 1 }}</span>
        {{ s.title }}
      </button>
      <button class="w-8 h-8 rounded-lg grid place-items-center hover:bg-base-200 text-base-content/60" @click="addStep"><Plus class="w-4 h-4" :stroke-width="2" /></button>
    </div>

    <div class="flex-1 flex min-h-0">
      <!-- ── Palette ── -->
      <div class="w-[244px] flex-none border-r border-base-300 bg-base-100 overflow-y-auto p-3.5">
        <div class="text-[11px] font-bold uppercase tracking-wider text-base-content/40 mb-2">Templates</div>
        <div class="grid grid-cols-2 gap-2 mb-5">
          <button
            v-for="name in TEMPLATE_NAMES"
            :key="name"
            class="px-2.5 py-2 rounded-[10px] border border-base-300 bg-base-100 text-xs font-semibold text-left hover:border-primary/40"
            @click="applyTemplate(name)"
          >{{ name }}</button>
        </div>
        <template v-for="group in ['Basic', 'Choice', 'Advanced', 'Layout']" :key="group">
          <div class="text-[11px] font-bold uppercase tracking-wider text-base-content/40 mb-2">{{ group }}</div>
          <div class="flex flex-col gap-1.5 mb-4">
            <div
              v-for="d in FIELD_DEFS.filter((x) => x.group === group)"
              :key="d.type"
              draggable="true"
              class="flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] border border-base-300 bg-base-100 cursor-grab hover:border-primary/40 active:scale-[0.98] transition-transform"
              @dragstart="drag = { kind: 'new', type: d.type }"
              @dragend="drag = null"
              @click="addEnd(d.type)"
            >
              <span class="w-[30px] h-[30px] rounded-lg grid place-items-center text-primary shrink-0" style="background: var(--accent-soft, rgba(138,58,147,.12))">
                <component :is="d.icon" class="w-4 h-4" :stroke-width="1.75" />
              </span>
              <span class="text-[13.5px] font-semibold">{{ d.label }}</span>
              <span v-if="d.map && d.map !== 'none'" class="ml-auto text-[9.5px] font-bold text-base-content/40 bg-base-200 px-1.5 py-0.5 rounded">↦ table</span>
            </div>
          </div>
        </template>
      </div>

      <!-- ── Canvas ── -->
      <div
        class="flex-1 overflow-auto bg-base-200/40 p-6 flex justify-center"
        @click="selectedId = null"
        @dragover.prevent
        @drop.prevent="handleDrop"
      >
        <div class="w-[600px] max-w-full self-start">
          <!-- header -->
          <div class="bg-base-100 border border-base-300 rounded-t-2xl border-b-0 px-6 pt-5 pb-4">
            <div class="h-[5px] bg-primary rounded w-[60px] mb-3.5" />
            <input v-model="form.title" placeholder="Form title" class="w-full text-[22px] font-extrabold tracking-tight bg-transparent outline-none" @click.stop />
            <textarea v-model="form.description" placeholder="Add a short description…" rows="1" class="w-full text-[13.5px] text-base-content/70 bg-transparent outline-none resize-none mt-1.5" @click.stop />
            <div v-if="form.multi" class="flex items-center gap-1.5 mt-4">
              <template v-for="(s, i) in form.structure.steps" :key="s.id">
                <div class="flex items-center gap-1.5">
                  <span class="w-[22px] h-[22px] rounded-full grid place-items-center text-[11.5px] font-bold" :class="i === step ? 'bg-primary text-primary-content' : 'bg-base-300 text-base-content/50'">{{ i + 1 }}</span>
                  <span class="text-[12.5px] font-semibold" :class="i === step ? 'text-base-content' : 'text-base-content/50'">{{ s.title }}</span>
                </div>
                <div v-if="i < form.structure.steps.length - 1" class="flex-1 h-[1.5px] bg-base-300 min-w-4" />
              </template>
            </div>
          </div>
          <!-- fields -->
          <div
            class="bg-base-100 border border-base-300 rounded-b-2xl px-1.5 pt-2 pb-4 min-h-40"
            :class="dragActive ? 'dz-canvas' : ''"
            @dragover.prevent="(e) => { if ((e.target as HTMLElement) === e.currentTarget) dropIndex = curFields.length }"
          >
            <div
              v-if="!curFields.length"
              class="m-3.5 py-10 px-5 text-center border-2 border-dashed rounded-xl transition-colors"
              :class="dragActive ? 'border-primary bg-primary/5 text-primary' : 'border-base-300 text-base-content/40'"
              @dragover.prevent="dropIndex = 0"
            >
              <Plus class="w-6 h-6 mx-auto opacity-60" :stroke-width="1.75" />
              <div class="text-[13.5px] font-semibold mt-2" :class="dragActive ? 'text-primary' : 'text-base-content/60'">
                {{ dragActive ? 'Drop to add it here' : 'Drag fields here, or click one' }}
              </div>
            </div>
            <template v-for="(f, i) in curFields" :key="f.id">
              <!-- insertion bar: shows exactly where the field will land -->
              <div class="dz-slot" :class="dropIndex === i ? 'dz-on' : ''"><span /></div>
              <div @dragover="onFieldDragOver($event, i)">
                <div
                  class="group/field relative rounded-lg px-4 py-3.5 cursor-grab transition-all"
                  :class="[
                    selectedId === f.id ? 'ring-2 ring-primary' : 'hover:ring-1 hover:ring-base-300',
                    draggingId === f.id ? 'opacity-40' : '',
                  ]"
                  draggable="true"
                  @click.stop="selectedId = f.id"
                  @dragstart="drag = { kind: 'move', id: f.id }; draggingId = f.id"
                  @dragend="endDrag"
                >
                  <!-- drag affordance on hover -->
                  <span class="absolute left-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover/field:opacity-100 text-base-content/30 transition-opacity">
                    <GripVertical class="w-3.5 h-3.5" :stroke-width="1.75" />
                  </span>
                  <!-- toolbar (mousedown.stop so tapping a button can't start a card drag) -->
                  <div v-if="selectedId === f.id" class="absolute -top-3 right-3 z-10 flex items-center gap-0.5 bg-base-100 border border-base-300 rounded-lg shadow-sm p-0.5" @mousedown.stop>

                    <button class="w-6 h-6 rounded grid place-items-center hover:bg-base-200" title="Up" @click.stop="fieldTool('up', f.id)"><ChevronUp class="w-3.5 h-3.5" :stroke-width="1.75" /></button>
                    <button class="w-6 h-6 rounded grid place-items-center hover:bg-base-200" title="Down" @click.stop="fieldTool('down', f.id)"><ChevronDown class="w-3.5 h-3.5" :stroke-width="1.75" /></button>
                    <button class="w-6 h-6 rounded grid place-items-center hover:bg-base-200" title="Duplicate" @click.stop="fieldTool('dup', f.id)"><CopyIcon class="w-3 h-3" :stroke-width="1.75" /></button>
                    <button class="w-6 h-6 rounded grid place-items-center hover:bg-base-200 hover:text-error" title="Delete" @click.stop="fieldTool('del', f.id)"><Trash2 class="w-3 h-3" :stroke-width="1.75" /></button>
                  </div>
                  <FormFieldBody :field="f" :edit="true" />
                  <div v-if="mapLabelFor(f)" class="absolute right-3.5 top-3 inline-flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                    <ArrowRight class="w-2.5 h-2.5" :stroke-width="2.5" /> {{ mapLabelFor(f) }}
                  </div>
                </div>
              </div>
            </template>
            <div class="dz-slot" :class="dropIndex === curFields.length ? 'dz-on' : ''"><span /></div>
            <!-- submit preview -->
            <div class="px-4 pt-3 pb-1">
              <span class="inline-flex px-5 py-2.5 rounded-[10px] bg-primary text-primary-content text-sm font-bold">
                {{ form.multi && step < form.structure.steps.length - 1 ? 'Next →' : form.submit_label || 'Submit' }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Right rail ── -->
      <div class="w-[288px] flex-none border-l border-base-300 bg-base-100 flex flex-col">
        <div class="flex px-3 pt-2.5 gap-1 border-b border-base-300">
          <button class="flex-1 py-2 text-[13px] font-bold border-b-2 -mb-px" :class="tab === 'field' ? 'text-primary border-primary' : 'text-base-content/50 border-transparent'" @click="tab = 'field'">Field</button>
          <button class="flex-1 py-2 text-[13px] font-bold border-b-2 -mb-px" :class="tab === 'connect' ? 'text-primary border-primary' : 'text-base-content/50 border-transparent'" @click="tab = 'connect'">Connect</button>
        </div>
        <div class="flex-1 overflow-y-auto p-4">
          <!-- Field inspector -->
          <template v-if="tab === 'field'">
            <template v-if="selectedField()">
              <div class="flex items-center gap-2 mb-4">
                <span class="w-7 h-7 rounded-lg grid place-items-center text-primary" style="background: var(--accent-soft, rgba(138,58,147,.12))">
                  <component :is="fieldDef(selectedField()!.type).icon" class="w-4 h-4" :stroke-width="1.75" />
                </span>
                <span class="text-[14.5px] font-bold">{{ fieldDef(selectedField()!.type).label }}</span>
              </div>

              <div class="mb-3.5">
                <div class="text-[11px] font-bold uppercase tracking-wide text-base-content/40 mb-1.5">{{ selectedField()!.type === 'para' ? 'Text' : 'Label' }}</div>
                <input :value="selectedField()!.props.label" class="input input-sm input-bordered w-full" placeholder="Label" @input="updateField({ label: ($event.target as HTMLInputElement).value })" />
              </div>

              <div v-if="['short', 'long', 'email', 'number'].includes(selectedField()!.type)" class="mb-3.5">
                <div class="text-[11px] font-bold uppercase tracking-wide text-base-content/40 mb-1.5">Placeholder</div>
                <input :value="selectedField()!.props.placeholder" class="input input-sm input-bordered w-full" placeholder="Placeholder" @input="updateField({ placeholder: ($event.target as HTMLInputElement).value })" />
              </div>

              <div v-if="isInput(selectedField()!.type)" class="mb-3.5">
                <div class="text-[11px] font-bold uppercase tracking-wide text-base-content/40 mb-1.5">Help text</div>
                <input :value="selectedField()!.props.help" class="input input-sm input-bordered w-full" placeholder="Optional hint" @input="updateField({ help: ($event.target as HTMLInputElement).value })" />
              </div>

              <div v-if="hasOptions(selectedField()!.type)" class="mb-3.5">
                <div class="text-[11px] font-bold uppercase tracking-wide text-base-content/40 mb-1.5">Options</div>
                <div class="flex flex-col gap-1.5">
                  <div v-for="(o, i) in selectedField()!.props.options" :key="i" class="flex gap-1.5">
                    <input :value="o" class="input input-sm input-bordered flex-1" @input="setOption(i, ($event.target as HTMLInputElement).value)" />
                    <button class="w-8 h-8 rounded-lg grid place-items-center hover:bg-base-200 shrink-0" @click="removeOption(i)"><X class="w-4 h-4" :stroke-width="1.75" /></button>
                  </div>
                  <button class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-primary text-[12.5px] font-semibold border border-dashed border-base-300" @click="addOption"><Plus class="w-3.5 h-3.5" :stroke-width="2" /> Add option</button>
                </div>
              </div>

              <div v-if="selectedField()!.type === 'rating'" class="mb-3.5">
                <div class="text-[11px] font-bold uppercase tracking-wide text-base-content/40 mb-1.5">Max stars</div>
                <input type="number" min="1" max="10" :value="selectedField()!.props.max ?? 5" class="input input-sm input-bordered w-full" @input="updateField({ max: Math.max(1, Math.min(10, +($event.target as HTMLInputElement).value || 5)) })" />
              </div>

              <div v-if="isInput(selectedField()!.type)" class="mb-3.5">
                <div class="text-[11px] font-bold uppercase tracking-wide text-base-content/40 mb-1.5">Maps to task column</div>
                <select :value="selectedField()!.props.map" class="select select-sm select-bordered w-full" @change="updateField({ map: ($event.target as HTMLSelectElement).value as MapKey })">
                  <option v-for="c in TABLE_COLS" :key="c.key" :value="c.key">{{ c.label }}</option>
                </select>
              </div>

              <label v-if="isInput(selectedField()!.type)" class="flex items-center gap-2.5 cursor-pointer mt-1">
                <input type="checkbox" class="toggle toggle-primary toggle-sm" :checked="selectedField()!.props.required" @change="updateField({ required: ($event.target as HTMLInputElement).checked })" />
                <span class="text-[13px] font-semibold">Required field</span>
              </label>
            </template>
            <div v-else class="text-center py-10 text-base-content/40">
              <GripVertical class="w-6 h-6 mx-auto opacity-50" :stroke-width="1.75" />
              <div class="text-[13px] font-semibold text-base-content/60 mt-2.5">Select a field</div>
              <div class="text-xs mt-1">Click any field to edit it.</div>
            </div>
          </template>

          <!-- Connect -->
          <template v-else>
            <div class="flex items-center gap-2 px-3.5 py-3 rounded-xl bg-primary/5 border border-primary/20 mb-4">
              <Table2 class="w-[17px] h-[17px] text-primary shrink-0" :stroke-width="1.75" />
              <div class="text-[12.5px] leading-snug">Each submission creates a <strong>task</strong> in the connected project.</div>
            </div>
            <div class="mb-3.5">
              <div class="text-[11px] font-bold uppercase tracking-wide text-base-content/40 mb-1.5">Send submissions to</div>
              <select :value="form.project_id ?? ''" class="select select-sm select-bordered w-full" @change="onProjectChange(($event.target as HTMLSelectElement).value)">
                <option value="" disabled>Pick a project…</option>
                <option v-for="p in projectOptions" :key="p.id" :value="p.id">{{ p.label }}</option>
              </select>
            </div>
            <div v-if="form.project_id && landingStatuses.length" class="mb-4">
              <div class="text-[11px] font-bold uppercase tracking-wide text-base-content/40 mb-1.5">New tasks land in</div>
              <select v-model="form.land_status_key" class="select select-sm select-bordered w-full">
                <option v-for="s in landingStatuses" :key="s.key" :value="s.key">{{ s.label }}</option>
              </select>
            </div>
            <div class="text-[11px] font-bold uppercase tracking-wide text-base-content/40 mb-2 mt-1">Field → column mapping</div>
            <div class="flex flex-col gap-1.5">
              <div v-if="!mappedFields.length" class="text-[12.5px] text-base-content/40 italic">No fields mapped yet. Select a field and set "Maps to task column".</div>
              <div v-for="(m, i) in mappedFields" :key="i" class="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-base-300">
                <span class="text-[12.5px] font-semibold flex-1 truncate">{{ m.label }}</span>
                <ArrowRight class="w-3.5 h-3.5 text-base-content/40 shrink-0" :stroke-width="1.75" />
                <span class="text-xs text-primary font-bold shrink-0">{{ m.col }}</span>
              </div>
            </div>
            <div v-if="form.published" class="mt-5 pt-4 border-t border-base-300">
              <div class="text-[11px] font-bold uppercase tracking-wide text-base-content/40 mb-1.5">Public link</div>
              <div class="flex gap-1.5">
                <input :value="publicUrl" readonly class="input input-sm input-bordered flex-1 text-xs" />
                <button class="btn btn-sm btn-ghost px-2" @click="copyLink"><CopyIcon class="w-4 h-4" :stroke-width="1.75" /></button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- ── Live preview overlay ── -->
    <div v-if="preview" class="fixed inset-0 z-[100] bg-base-200 flex flex-col">
      <div class="h-[54px] flex-none flex items-center gap-3 px-4 border-b border-base-300 bg-base-100">
        <span class="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary"><Eye class="w-4 h-4" :stroke-width="1.75" /> Preview — this is what people see</span>
        <div class="flex-1" />
        <button class="btn btn-sm btn-ghost" @click="preview = false">Back to editor</button>
      </div>
      <div class="flex-1 overflow-y-auto px-6 py-8 flex justify-center">
        <div class="w-[600px] max-w-full">
          <div class="bg-base-100 border border-base-300 rounded-2xl overflow-hidden shadow-sm">
            <div class="h-1.5 bg-primary" />
            <div class="px-7 pb-7 pt-6">
              <h1 class="text-2xl font-extrabold tracking-tight mb-1.5">{{ form.title }}</h1>
              <p v-if="form.description" class="text-sm text-base-content/70 leading-relaxed">{{ form.description }}</p>
              <div v-if="form.multi" class="flex items-center gap-1.5 my-5">
                <template v-for="(st, i) in form.structure.steps" :key="st.id">
                  <span class="w-6 h-6 rounded-full grid place-items-center text-xs font-bold" :class="i <= pvStep ? 'bg-primary text-primary-content' : 'bg-base-300 text-base-content/50'">{{ i < pvStep ? '✓' : i + 1 }}</span>
                  <div v-if="i < form.structure.steps.length - 1" class="flex-1 h-0.5" :class="i < pvStep ? 'bg-primary' : 'bg-base-300'" />
                </template>
              </div>
              <div class="flex flex-col gap-5 mt-5">
                <FormFieldBody
                  v-for="f in pvCurStep?.fields ?? []"
                  :key="f.id"
                  :field="f"
                  :edit="false"
                  :model-value="pvVals[f.id]"
                  @update:model-value="pvVals[f.id] = $event"
                />
              </div>
              <div class="flex gap-2.5 mt-6">
                <button v-if="form.multi && pvStep > 0" class="btn btn-ghost" @click="pvStep--">Back</button>
                <div class="flex-1" />
                <button class="btn btn-primary" @click="pvLast ? (preview = false, fire('Preview only', 'Publish to collect real submissions.')) : pvStep++">
                  {{ pvLast ? (form.submit_label || 'Submit') : 'Next →' }}
                </button>
              </div>
            </div>
          </div>
          <div class="text-center mt-4 text-[11.5px] text-base-content/40">Powered by BuzzyHive Forms</div>
        </div>
      </div>
    </div>

    <!-- toast -->
    <Transition name="fade">
      <div v-if="toast" class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[130] flex items-center gap-3 pl-3 pr-4 py-2.5 rounded-xl bg-neutral text-neutral-content shadow-2xl">
        <span class="w-6 h-6 rounded-lg grid place-items-center bg-white/15"><Check class="w-3.5 h-3.5" :stroke-width="2.5" /></span>
        <div><div class="text-[13.5px] font-bold">{{ toast.title }}</div><div class="text-xs opacity-60">{{ toast.sub }}</div></div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Insertion bar — the slot collapses to nothing until the drag hovers a
   position, then opens a clear gap with a primary bar + node so you can see
   exactly where the field will land. */
.dz-slot {
  height: 0;
  position: relative;
  transition: height 0.14s ease;
}
.dz-slot > span {
  position: absolute;
  left: 6px;
  right: 6px;
  top: 50%;
  height: 4px;
  border-radius: 999px;
  background: hsl(var(--p));
  transform: translateY(-50%) scaleX(0);
  transform-origin: left center;
  opacity: 0;
  transition: transform 0.14s ease, opacity 0.14s ease;
  box-shadow: 0 0 0 4px hsl(var(--p) / 0.16);
}
.dz-slot > span::before {
  content: '';
  position: absolute;
  left: -3px;
  top: 50%;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 3px solid hsl(var(--p));
  background: hsl(var(--b1));
  transform: translateY(-50%);
}
.dz-slot.dz-on {
  height: 22px;
}
.dz-slot.dz-on > span {
  transform: translateY(-50%) scaleX(1);
  opacity: 1;
}
/* Faint frame on the drop target while a drag is in progress. */
.dz-canvas {
  outline: 2px dashed hsl(var(--p) / 0.25);
  outline-offset: -4px;
  border-radius: 1rem;
}
.fade-enter-active,
.fade-leave-active { transition: opacity 0.2s, transform 0.2s; }
.fade-enter-from,
.fade-leave-to { opacity: 0; transform: translate(-50%, 8px); }
</style>
