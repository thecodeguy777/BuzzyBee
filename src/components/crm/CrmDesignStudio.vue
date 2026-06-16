<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import {
  Sparkles, Plus, ArrowLeft, Trash2, Check, Send, LayoutTemplate, Undo2, Redo2,
  Monitor, Smartphone,
} from 'lucide-vue-next'
import { useEmailTemplatesStore, type EmailTemplate } from '@/stores/emailTemplates'
import { compileBlocks, freshBlocks, type EmailDesign } from '@/lib/emailBlocks'
import {
  newDoc, asDoc, isEmailDoc, storedHasBlocks, compileEmailDoc, buildDocTemplate,
  makeDocBlock, designerDrag, docBlockId,
  type EmailDoc, type DocBlockType, type StoredDesign,
} from '@/lib/emailDoc'
import DesignerPalette from '@/components/crm/designer/DesignerPalette.vue'
import DesignerCanvas from '@/components/crm/designer/DesignerCanvas.vue'
import DesignerInspector from '@/components/crm/designer/DesignerInspector.vue'
import CrmTemplateGallery from '@/components/crm/CrmTemplateGallery.vue'

// The design studio v2 (Claude Design handoff: Email Designer): Canva-style
// drag & drop. Palette | WYSIWYG canvas | inspector rail, with undo/redo,
// presets, device preview, and an HTML export tab. Designs save as this
// client's templates (layout 'doc' — the compiled body is the whole email).

const emit = defineEmits<{
  (e: 'compose', template: EmailTemplate): void
}>()

// When embedded (e.g. from the flow builder's Email node), open straight to a
// specific design's editor instead of the library.
const props = defineProps<{ openTemplateId?: string }>()

const tplStore = useEmailTemplatesStore()

// ── Library vs editor ─────────────────────────────────────────────────────────
const editingId = ref<string | null>(null) // template id, or 'new'
const galleryOpen = ref(false)
const designs = computed(() => tplStore.visible)

// ── Editor state ──────────────────────────────────────────────────────────────
const doc = ref<EmailDoc>(newDoc())
const name = ref('')
const subject = ref('')
const device = ref<'desktop' | 'mobile'>('desktop')
const selectedId = ref<string | null>(null)
const saveState = ref<'idle' | 'saving' | 'saved'>('idle')
const dirty = ref(false)

// Undo/redo: bounded snapshot history (the doc is plain JSON).
const past = ref<string[]>([])
const future = ref<string[]>([])
const canUndo = computed(() => past.value.length > 0)
const canRedo = computed(() => future.value.length > 0)

function mutate(fn: (d: EmailDoc) => EmailDoc) {
  past.value.push(JSON.stringify(doc.value))
  if (past.value.length > 60) past.value.shift()
  future.value = []
  doc.value = fn(doc.value)
  dirty.value = true
}
function undo() {
  const prev = past.value.pop()
  if (!prev) return
  future.value.push(JSON.stringify(doc.value))
  doc.value = JSON.parse(prev) as EmailDoc
  dirty.value = true
}
function redo() {
  const next = future.value.pop()
  if (!next) return
  past.value.push(JSON.stringify(doc.value))
  doc.value = JSON.parse(next) as EmailDoc
  dirty.value = true
}

// ── Doc operations ────────────────────────────────────────────────────────────
const update = (id: string, patch: Record<string, unknown>) =>
  mutate((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === id ? { ...b, props: { ...b.props, ...patch } } : b)) }))
const setG = (patch: Record<string, unknown>) =>
  mutate((d) => ({ ...d, g: { ...d.g, ...patch } }))

function insertAt(type: DocBlockType, index: number) {
  const nb = makeDocBlock(type)
  mutate((d) => {
    const blocks = [...d.blocks]
    blocks.splice(index, 0, nb)
    return { ...d, blocks }
  })
  selectedId.value = nb.id
}
const addEnd = (type: DocBlockType) => insertAt(type, doc.value.blocks.length)

function onTool(action: 'up' | 'down' | 'dup' | 'del', id: string) {
  if (action === 'del') {
    mutate((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== id) }))
    if (selectedId.value === id) selectedId.value = null
    return
  }
  if (action === 'dup') {
    const src = doc.value.blocks.find((b) => b.id === id)
    if (!src) return
    const nb = { id: docBlockId(), type: src.type, props: JSON.parse(JSON.stringify(src.props)) }
    mutate((d) => {
      const i = d.blocks.findIndex((b) => b.id === id)
      const blocks = [...d.blocks]
      blocks.splice(i + 1, 0, nb)
      return { ...d, blocks }
    })
    selectedId.value = nb.id
    return
  }
  mutate((d) => {
    const i = d.blocks.findIndex((b) => b.id === id)
    const j = action === 'up' ? i - 1 : i + 1
    if (i < 0 || j < 0 || j >= d.blocks.length) return d
    const blocks = [...d.blocks]
    ;[blocks[i], blocks[j]] = [blocks[j], blocks[i]]
    return { ...d, blocks }
  })
}

function onDropBlock(index: number) {
  const drag = designerDrag.current
  if (!drag) return
  if (drag.kind === 'new') {
    insertAt(drag.type, index)
  } else {
    const id = drag.id
    mutate((d) => {
      const from = d.blocks.findIndex((b) => b.id === id)
      if (from < 0) return d
      let to = index
      const blocks = [...d.blocks]
      const [m] = blocks.splice(from, 1)
      if (from < to) to--
      blocks.splice(to, 0, m)
      return { ...d, blocks }
    })
    selectedId.value = id
  }
  designerDrag.current = null
}

const applyTemplate = (tn: string) => {
  mutate((d) => ({ ...d, blocks: buildDocTemplate(tn) }))
  selectedId.value = null
}

// Top-bar presets (background treatments).
const curPreset = computed(() => {
  const g = doc.value.g
  if (!g.card) return 'plain'
  return g.bg !== '#f4f2f6' && g.bg !== '#f5f4f6' ? 'branded' : 'card'
})
function applyPreset(k: string) {
  if (k === 'plain') setG({ card: false, bg: '#ffffff' })
  else if (k === 'card') setG({ card: true, bg: '#f4f2f6', cardBg: '#ffffff' })
  else if (k === 'branded') setG({ card: true, bg: `color-mix(in oklab, ${doc.value.g.accent} 10%, #ffffff)`, cardBg: '#ffffff' })
}

// ── Open / save ───────────────────────────────────────────────────────────────
function resetEditor(nextDoc: EmailDoc, nextName = '', nextSubject = '') {
  doc.value = nextDoc
  name.value = nextName
  subject.value = nextSubject
  selectedId.value = null
  past.value = []
  future.value = []
  dirty.value = false
  device.value = 'desktop'
}

function openNew() {
  editingId.value = 'new'
  resetEditor(newDoc('Announcement'))
}
function openFromGallery(design: EmailDesign) {
  editingId.value = 'new'
  const d = asDoc(freshBlocks(design.blocks))
  resetEditor(d, design.name, design.subject)
  if (design.layout === 'plain') doc.value = { ...doc.value, g: { ...doc.value.g, card: false, bg: '#ffffff' } }
  galleryOpen.value = false
}
function openExisting(t: EmailTemplate) {
  editingId.value = t.id
  const stored = t.bodyBlocks as StoredDesign | null
  const d = storedHasBlocks(stored)
    ? asDoc(stored, t.accent || undefined)
    // Old text-only templates open as a single editable text block.
    : { ...newDoc('Blank'), blocks: [{ id: docBlockId(), type: 'text' as const, props: { html: t.bodyHtml, align: 'left', size: 16, color: '' } }] }
  resetEditor(d, t.name, t.subject)
}
function backToLibrary() {
  if (dirty.value && !window.confirm('Leave without saving? Your changes will be lost.')) return
  editingId.value = null
}

async function save(): Promise<EmailTemplate | null> {
  if (!name.value.trim() || saveState.value === 'saving') return null
  saveState.value = 'saving'
  const input = {
    name: name.value,
    subject: subject.value,
    bodyHtml: compileEmailDoc(doc.value),
    bodyBlocks: doc.value,
    layout: 'doc',
    accent: doc.value.g.accent,
  }
  let result: EmailTemplate | null = null
  if (editingId.value === 'new') {
    result = await tplStore.save(input)
    if (result) editingId.value = result.id
  } else if (editingId.value) {
    const ok = await tplStore.update(editingId.value, input)
    result = ok ? tplStore.templates.find((t) => t.id === editingId.value) ?? null : null
  }
  saveState.value = result ? 'saved' : 'idle'
  if (result) {
    dirty.value = false
    setTimeout(() => { saveState.value = 'idle' }, 2000)
  }
  return result
}

async function useInCampaign() {
  const t = await save()
  if (t) emit('compose', t)
}

async function removeDesign(t: EmailTemplate, e: MouseEvent) {
  e.stopPropagation()
  if (!window.confirm('Delete the design "' + t.name + '"?')) return
  await tplStore.remove(t.id)
}

// Library card previews: compile whatever generation the template is.
function previewFor(t: EmailTemplate): string {
  const stored = t.bodyBlocks as StoredDesign | null
  if (isEmailDoc(stored)) return compileEmailDoc(stored)
  if (Array.isArray(stored) && stored.length) return compileBlocks(stored, t.accent || undefined)
  return t.bodyHtml
}

// ── Keyboard ──────────────────────────────────────────────────────────────────
function isTyping() {
  const el = document.activeElement as HTMLElement | null
  return !!el && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
}
function onKey(e: KeyboardEvent) {
  if (!editingId.value) return
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
    if (isTyping()) return
    e.preventDefault(); undo()
  } else if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
    if (isTyping()) return
    e.preventDefault(); redo()
  } else if (e.key === 'Escape') {
    if (galleryOpen.value) return
    selectedId.value = null
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId.value && !isTyping()) {
    e.preventDefault()
    onTool('del', selectedId.value)
  }
}

onMounted(async () => {
  await tplStore.load()
  if (props.openTemplateId) {
    const t = tplStore.templates.find((x) => x.id === props.openTemplateId)
    if (t) openExisting(t)
  }
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="flex-1 min-h-0 flex flex-col">
    <!-- ══ Library ══ -->
    <div v-if="!editingId" class="flex-1 min-h-0 overflow-y-auto px-5 pb-6">
      <div class="flex items-center gap-3.5 pb-3">
        <div class="flex-1 text-[12.5px] text-base-content/60">
          Design branded emails — drag blocks, no code.
          <span class="text-base-content/40">Designs stay in this client's workspace.</span>
        </div>
        <button
          type="button"
          class="flex items-center gap-[7px] h-[34px] px-3 rounded-[9px] text-[13px] font-semibold text-base-content/60 hover:bg-base-200 hover:text-base-content whitespace-nowrap"
          @click="galleryOpen = true"
        >
          <Sparkles :size="15" /> Browse gallery
        </button>
        <button
          type="button"
          class="flex items-center gap-[7px] h-[34px] px-3.5 rounded-[9px] text-[13.5px] font-bold text-white whitespace-nowrap"
          :style="{ background: 'var(--accent)' }"
          @click="openNew"
        >
          <Plus :size="16" /> New design
        </button>
      </div>

      <div v-if="!designs.length" class="rounded-xl border-[1.5px] border-dashed border-base-300 px-6 py-14 text-center">
        <span class="inline-grid place-items-center w-11 h-11 rounded-xl mb-3" :style="{ background: 'var(--accent-soft)', color: 'var(--accent-fg)' }">
          <LayoutTemplate :size="20" />
        </span>
        <div class="text-[14px] font-bold text-base-content mb-1">No designs yet</div>
        <div class="text-[12.5px] text-base-content/40 mb-4">Start from a professional design and make it yours — every block is editable.</div>
        <button type="button" class="inline-flex items-center gap-[7px] h-[34px] px-3.5 rounded-[9px] text-[13.5px] font-bold text-white" :style="{ background: 'var(--accent)' }" @click="openNew">
          <Plus :size="16" /> New design
        </button>
      </div>

      <div v-else class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        <button
          v-for="t in designs"
          :key="t.id"
          type="button"
          class="crm-ds-card group/card text-left rounded-xl border border-base-300 bg-base-100 overflow-hidden"
          @click="openExisting(t)"
        >
          <span class="block h-40 overflow-hidden relative" style="background: #f4f3f6">
            <span class="absolute inset-x-2 top-2 bottom-0 block overflow-hidden rounded-t-lg">
              <span
                class="block pointer-events-none"
                style="width: 250%; transform: scale(0.4); transform-origin: top left"
                v-html="previewFor(t)"
              />
            </span>
            <span
              role="button"
              class="crm-ds-del absolute top-2 right-2 w-7 h-7 rounded-lg grid place-items-center bg-base-100 border border-base-300 text-base-content/40 hover:text-[#c2253c]"
              title="Delete design"
              @click="removeDesign(t, $event)"
            >
              <Trash2 :size="13" />
            </span>
          </span>
          <span class="block px-3 py-2.5">
            <span class="block text-[13px] font-bold text-base-content truncate">{{ t.name }}</span>
            <span class="block text-[11px] text-base-content/40">
              {{ t.timesUsed ? 'Used ' + t.timesUsed + '×' : 'Not used yet' }}
            </span>
          </span>
        </button>
      </div>
    </div>

    <!-- ══ Editor ══ -->
    <template v-else>
      <!-- studio bar -->
      <div class="flex items-center gap-2 px-3 py-1.5 border-b border-base-300 flex-none flex-wrap">
        <button type="button" class="w-8 h-8 rounded-lg grid place-items-center text-base-content/60 hover:bg-base-200" title="Back to designs" @click="backToLibrary">
          <ArrowLeft :size="17" />
        </button>
        <input
          v-model="name"
          class="bg-transparent outline-none text-[15px] font-bold text-base-content px-2 py-1 rounded-lg hover:bg-base-200 focus:bg-base-200 min-w-0 w-48"
          placeholder="Name this design *"
        />
        <span class="w-px h-5 bg-base-300" />
        <div class="flex gap-0.5">
          <button
            v-for="p in [{ k: 'plain', label: 'Plain' }, { k: 'card', label: 'Clean card' }, { k: 'branded', label: 'Branded' }]"
            :key="p.k"
            type="button"
            class="px-2.5 py-1.5 rounded-lg text-[12.5px] font-semibold whitespace-nowrap transition-colors"
            :class="curPreset === p.k ? '' : 'text-base-content/50 hover:bg-base-200'"
            :style="curPreset === p.k ? { color: 'var(--accent-fg)', background: 'var(--accent-soft)' } : {}"
            @click="applyPreset(p.k)"
          >{{ p.label }}</button>
        </div>
        <label class="flex items-center gap-1.5 text-[12px] font-semibold text-base-content/50 cursor-pointer px-1.5 py-1 rounded-lg border border-base-300">
          Accent
          <input
            type="color"
            class="w-[18px] h-[18px] rounded-[5px] border-0 bg-transparent cursor-pointer p-0"
            :value="doc.g.accent"
            @input="setG({ accent: ($event.target as HTMLInputElement).value })"
          />
        </label>
        <span class="flex-1" />
        <div class="flex gap-[3px] bg-base-200 p-[3px] rounded-lg">
          <button
            type="button"
            class="w-8 h-7 rounded-md grid place-items-center transition-all"
            :class="device === 'desktop' ? 'bg-base-100 text-base-content shadow-sm' : 'text-base-content/40'"
            title="Desktop preview"
            @click="device = 'desktop'"
          ><Monitor :size="15" /></button>
          <button
            type="button"
            class="w-8 h-7 rounded-md grid place-items-center transition-all"
            :class="device === 'mobile' ? 'bg-base-100 text-base-content shadow-sm' : 'text-base-content/40'"
            title="Mobile preview"
            @click="device = 'mobile'"
          ><Smartphone :size="15" /></button>
        </div>
        <button type="button" class="w-8 h-8 rounded-lg grid place-items-center text-base-content/60 hover:bg-base-200 disabled:opacity-30" title="Undo (⌘Z)" :disabled="!canUndo" @click="undo"><Undo2 :size="16" /></button>
        <button type="button" class="w-8 h-8 rounded-lg grid place-items-center text-base-content/60 hover:bg-base-200 disabled:opacity-30" title="Redo (⌘⇧Z)" :disabled="!canRedo" @click="redo"><Redo2 :size="16" /></button>
        <span v-if="tplStore.error" class="text-[12px] truncate max-w-[14rem]" style="color: #c2253c">{{ tplStore.error }}</span>
        <button
          type="button"
          class="flex items-center gap-1.5 h-[32px] px-3 rounded-[9px] text-[13px] font-semibold border border-base-300 text-base-content/60 hover:text-base-content hover:bg-base-200 disabled:opacity-50"
          :disabled="!name.trim() || saveState === 'saving'"
          @click="save"
        >
          <component :is="saveState === 'saved' ? Check : LayoutTemplate" :size="14" :style="saveState === 'saved' ? { color: '#15803d' } : {}" />
          {{ saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save design' }}
        </button>
        <button
          type="button"
          class="flex items-center gap-1.5 h-[32px] px-3.5 rounded-[9px] text-[13px] font-bold text-white disabled:opacity-50"
          :style="{ background: 'var(--accent)' }"
          :disabled="!name.trim()"
          title="Save and open the campaign composer with this design"
          @click="useInCampaign"
        >
          <Send :size="14" /> Use in a campaign
        </button>
      </div>

      <!-- palette | canvas | inspector -->
      <div class="flex-1 flex min-h-0">
        <DesignerPalette @add="addEnd" @template="applyTemplate" />
        <DesignerCanvas
          :doc="doc"
          :device="device"
          :selected-id="selectedId"
          @select="selectedId = $event"
          @tool="onTool"
          @update="update"
          @drop-block="onDropBlock"
        />
        <DesignerInspector :doc="doc" :selected-id="selectedId" @update="update" @set-g="setG" />
      </div>
    </template>

    <CrmTemplateGallery
      v-if="galleryOpen"
      :accent="doc.g.accent"
      @close="galleryOpen = false"
      @pick="openFromGallery"
    />
  </div>
</template>

<style scoped>
.crm-ds-card { transition: border-color 0.12s, box-shadow 0.12s, transform 0.12s; }
.crm-ds-card:hover { border-color: var(--accent-bord); transform: translateY(-2px); box-shadow: 0 8px 24px -8px rgba(20, 12, 22, 0.25); }
.crm-ds-card .crm-ds-del { opacity: 0; transition: opacity 0.12s; }
.crm-ds-card:hover .crm-ds-del { opacity: 1; }
</style>
