<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  Building2, Heading2, Type, Image as ImageIcon, MousePointerClick, PanelLeft,
  Columns2, Minus, MoveVertical, Share2, Flag, GripVertical, Copy, Check, Code2,
} from 'lucide-vue-next'
import { compileEmailDoc, type EmailDoc, type DocBlock, type DocBlockType } from '@/lib/emailDoc'
import DSeg from './DSeg.vue'
import DSwatches from './DSwatches.vue'
import DSlider from './DSlider.vue'
import DToggle from './DToggle.vue'

// Right rail: Block (selected block's props) | Styles (document globals) |
// HTML (the compiled email source, copyable — take it anywhere).

const props = defineProps<{
  doc: EmailDoc
  selectedId: string | null
}>()
const emit = defineEmits<{
  (e: 'update', id: string, patch: Record<string, unknown>): void
  (e: 'set-g', patch: Record<string, unknown>): void
}>()

const tab = ref<'block' | 'styles' | 'html'>('block')
const block = computed<DocBlock | null>(() =>
  props.doc.blocks.find((b) => b.id === props.selectedId) ?? null)

// Selecting a block on the canvas pulls the rail to its options.
watch(() => props.selectedId, (id) => { if (id) tab.value = 'block' })

const ICONS: Record<DocBlockType, unknown> = {
  header: Building2, heading: Heading2, text: Type, image: ImageIcon,
  button: MousePointerClick, imageText: PanelLeft, columns: Columns2,
  divider: Minus, spacer: MoveVertical, social: Share2, footer: Flag,
}
const TYPE_LABEL: Record<DocBlockType, string> = {
  header: 'Header', heading: 'Heading', text: 'Text', image: 'Image',
  button: 'Button', imageText: 'Image + text', columns: '2 columns',
  divider: 'Divider', spacer: 'Spacer', social: 'Social', footer: 'Footer',
}

const set = (patch: Record<string, unknown>) => block.value && emit('update', block.value.id, patch)

const ALIGN_OPTS = [{ v: 'left', label: 'Left' }, { v: 'center', label: 'Center' }, { v: 'right', label: 'Right' }]
const FONTS = ['Hanken Grotesk', 'Georgia', 'Helvetica', 'Courier']
const ACCENTS = ['#611f69', '#2f6fed', '#0d9488', '#c2700c', '#d6336c', '#15803d', '#1b1a1d']

function toggleNetwork(nw: string) {
  if (!block.value) return
  const list = block.value.props.networks as string[]
  set({ networks: list.includes(nw) ? list.filter((x) => x !== nw) : [...list, nw] })
}

// ── HTML tab ──────────────────────────────────────────────────────────────────
const compiledHtml = computed(() => compileEmailDoc(props.doc))
const copied = ref(false)
async function copyHtml() {
  try {
    await navigator.clipboard.writeText(compiledHtml.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch { /* clipboard denied — user can still select-all in the textarea */ }
}
</script>

<template>
  <div class="w-[288px] flex-none border-l border-base-300 bg-base-100 flex flex-col">
    <!-- tabs -->
    <div class="flex px-3 pt-2.5 gap-1 border-b border-base-300">
      <button
        v-for="t in [{ k: 'block', label: 'Block' }, { k: 'styles', label: 'Styles' }, { k: 'html', label: 'HTML' }]"
        :key="t.k"
        type="button"
        class="flex-1 py-2 text-[13px] font-bold -mb-px border-b-2 transition-colors"
        :class="tab === t.k ? '' : 'text-base-content/40 border-transparent hover:text-base-content/70'"
        :style="tab === t.k ? { color: 'var(--accent-fg)', borderColor: 'var(--accent)' } : {}"
        @click="tab = (t.k as 'block' | 'styles' | 'html')"
      >{{ t.label }}</button>
    </div>

    <div class="flex-1 overflow-y-auto px-4 pt-4 pb-7">
      <!-- ══ Block tab ══ -->
      <template v-if="tab === 'block'">
        <template v-if="block">
          <div class="flex items-center gap-2 mb-4">
            <span class="w-7 h-7 rounded-lg grid place-items-center" :style="{ background: 'var(--accent-soft)', color: 'var(--accent-fg)' }">
              <component :is="ICONS[block.type]" :size="15" />
            </span>
            <span class="text-[14px] font-bold text-base-content">{{ TYPE_LABEL[block.type] }}</span>
          </div>

          <!-- heading -->
          <template v-if="block.type === 'heading'">
            <div class="crm-insp-row"><div class="crm-insp-label">Size</div>
              <DSeg :options="[{ v: 'h1', label: 'Large' }, { v: 'h2', label: 'Medium' }, { v: 'h3', label: 'Small' }]" :model-value="block.props.level" @update:model-value="(v: string) => set({ level: v })" /></div>
            <div class="crm-insp-row"><div class="crm-insp-label">Alignment</div>
              <DSeg :options="ALIGN_OPTS" :model-value="block.props.align" @update:model-value="(v: string) => set({ align: v })" /></div>
            <div class="crm-insp-row"><div class="crm-insp-label">Color</div>
              <DSwatches allow-accent :options="['#1b1a1d', '#2f6fed', '#15803d', '#c2253c']" :model-value="block.props.color" @update:model-value="(v: string) => set({ color: v })" /></div>
          </template>

          <!-- text -->
          <template v-else-if="block.type === 'text'">
            <div class="crm-insp-row"><div class="crm-insp-label">Alignment</div>
              <DSeg :options="ALIGN_OPTS" :model-value="block.props.align" @update:model-value="(v: string) => set({ align: v })" /></div>
            <div class="crm-insp-row"><div class="crm-insp-label">Font size</div>
              <DSlider :model-value="block.props.size" :min="12" :max="22" suffix="px" @update:model-value="(v: number) => set({ size: v })" /></div>
            <div class="crm-insp-row"><div class="crm-insp-label">Color</div>
              <DSwatches :options="['#3a3942', '#1b1a1d', '#62606a', '#611f69']" :model-value="block.props.color" @update:model-value="(v: string) => set({ color: v })" /></div>
          </template>

          <!-- image -->
          <template v-else-if="block.type === 'image'">
            <div class="crm-insp-row"><div class="crm-insp-label">Image URL</div>
              <input class="crm-insp-in" :value="block.props.src" placeholder="https://…" @input="set({ src: ($event.target as HTMLInputElement).value })" /></div>
            <div class="crm-insp-row"><div class="crm-insp-label">Alt text</div>
              <input class="crm-insp-in" :value="block.props.alt" placeholder="Describe the image" @input="set({ alt: ($event.target as HTMLInputElement).value })" /></div>
            <div class="crm-insp-row"><div class="crm-insp-label">Width</div>
              <DSlider :model-value="block.props.width" :min="30" :max="100" suffix="%" @update:model-value="(v: number) => set({ width: v })" /></div>
            <div class="crm-insp-row"><div class="crm-insp-label">Alignment</div>
              <DSeg :options="ALIGN_OPTS" :model-value="block.props.align" @update:model-value="(v: string) => set({ align: v })" /></div>
            <div class="crm-insp-row"><div class="crm-insp-label">Corner radius</div>
              <DSlider :model-value="block.props.radius" :min="0" :max="24" suffix="px" @update:model-value="(v: number) => set({ radius: v })" /></div>
            <div class="crm-insp-row"><div class="crm-insp-label">Link URL</div>
              <input class="crm-insp-in" :value="block.props.href" placeholder="https://" @input="set({ href: ($event.target as HTMLInputElement).value })" /></div>
          </template>

          <!-- button -->
          <template v-else-if="block.type === 'button'">
            <div class="crm-insp-row"><div class="crm-insp-label">Link URL</div>
              <input class="crm-insp-in" :value="block.props.href" placeholder="https://" @input="set({ href: ($event.target as HTMLInputElement).value })" /></div>
            <div class="crm-insp-row"><div class="crm-insp-label">Alignment</div>
              <DSeg :options="ALIGN_OPTS" :model-value="block.props.align" @update:model-value="(v: string) => set({ align: v })" /></div>
            <div class="crm-insp-row"><div class="crm-insp-label">Size</div>
              <DSeg :options="[{ v: 'sm', label: 'S' }, { v: 'md', label: 'M' }, { v: 'lg', label: 'L' }]" :model-value="block.props.size" @update:model-value="(v: string) => set({ size: v })" /></div>
            <div class="crm-insp-row"><div class="crm-insp-label">Button color</div>
              <DSwatches allow-accent :options="ACCENTS" :model-value="block.props.bg" @update:model-value="(v: string) => set({ bg: v })" /></div>
            <div class="crm-insp-row"><div class="crm-insp-label">Corner radius</div>
              <DSlider :model-value="block.props.radius" :min="0" :max="26" suffix="px" @update:model-value="(v: number) => set({ radius: v })" /></div>
            <DToggle label="Full width" :model-value="block.props.full" @update:model-value="(v: boolean) => set({ full: v })" />
          </template>

          <!-- header -->
          <template v-else-if="block.type === 'header'">
            <div class="crm-insp-row"><div class="crm-insp-label">Alignment</div>
              <DSeg :options="ALIGN_OPTS" :model-value="block.props.align" @update:model-value="(v: string) => set({ align: v })" /></div>
            <DToggle label="Show logo mark" :model-value="block.props.showLogo" @update:model-value="(v: boolean) => set({ showLogo: v })" />
          </template>

          <!-- imageText -->
          <template v-else-if="block.type === 'imageText'">
            <div class="crm-insp-row"><div class="crm-insp-label">Image URL</div>
              <input class="crm-insp-in" :value="block.props.src" placeholder="https://…" @input="set({ src: ($event.target as HTMLInputElement).value })" /></div>
            <div class="crm-insp-row"><div class="crm-insp-label">Image side</div>
              <DSeg :options="[{ v: 'left', label: 'Left' }, { v: 'right', label: 'Right' }]" :model-value="block.props.imgSide" @update:model-value="(v: string) => set({ imgSide: v })" /></div>
            <div class="crm-insp-row"><div class="crm-insp-label">Link URL</div>
              <input class="crm-insp-in" :value="block.props.href" placeholder="https://" @input="set({ href: ($event.target as HTMLInputElement).value })" /></div>
            <DToggle label="Show link" :model-value="block.props.showBtn" @update:model-value="(v: boolean) => set({ showBtn: v })" />
          </template>

          <!-- columns -->
          <template v-else-if="block.type === 'columns'">
            <div class="crm-insp-row"><div class="crm-insp-label">Alignment</div>
              <DSeg :options="ALIGN_OPTS" :model-value="block.props.align" @update:model-value="(v: string) => set({ align: v })" /></div>
            <div class="text-[11.5px] text-base-content/40 leading-relaxed">Click either column on the canvas to edit its text.</div>
          </template>

          <!-- divider -->
          <template v-else-if="block.type === 'divider'">
            <div class="crm-insp-row"><div class="crm-insp-label">Style</div>
              <DSeg :options="[{ v: 'solid', label: 'Solid' }, { v: 'dashed', label: 'Dashed' }, { v: 'dotted', label: 'Dotted' }]" :model-value="block.props.style" @update:model-value="(v: string) => set({ style: v })" /></div>
            <div class="crm-insp-row"><div class="crm-insp-label">Thickness</div>
              <DSlider :model-value="block.props.thickness" :min="1" :max="6" suffix="px" @update:model-value="(v: number) => set({ thickness: v })" /></div>
            <div class="crm-insp-row"><div class="crm-insp-label">Width</div>
              <DSlider :model-value="block.props.width" :min="20" :max="100" suffix="%" @update:model-value="(v: number) => set({ width: v })" /></div>
            <div class="crm-insp-row"><div class="crm-insp-label">Color</div>
              <DSwatches :options="['#e5e2ea', '#c9c5d0', '#611f69', '#1b1a1d']" :model-value="block.props.color" @update:model-value="(v: string) => set({ color: v })" /></div>
          </template>

          <!-- spacer -->
          <template v-else-if="block.type === 'spacer'">
            <div class="crm-insp-row"><div class="crm-insp-label">Height</div>
              <DSlider :model-value="block.props.height" :min="8" :max="80" suffix="px" @update:model-value="(v: number) => set({ height: v })" /></div>
          </template>

          <!-- social -->
          <template v-else-if="block.type === 'social'">
            <div class="crm-insp-row"><div class="crm-insp-label">Alignment</div>
              <DSeg :options="ALIGN_OPTS" :model-value="block.props.align" @update:model-value="(v: string) => set({ align: v })" /></div>
            <div class="crm-insp-row"><div class="crm-insp-label">Networks</div>
              <div class="flex gap-1.5 flex-wrap">
                <button
                  v-for="nw in ['x', 'in', 'ig', 'fb', 'yt']"
                  :key="nw"
                  type="button"
                  class="px-2.5 py-[5px] rounded-[7px] text-[12px] font-semibold uppercase border transition-colors"
                  :class="block.props.networks.includes(nw) ? '' : 'bg-base-200 text-base-content/40 border-transparent'"
                  :style="block.props.networks.includes(nw) ? { background: 'var(--accent-soft)', color: 'var(--accent-fg)', borderColor: 'var(--accent-bord)' } : {}"
                  @click="toggleNetwork(nw)"
                >{{ nw }}</button>
              </div>
            </div>
            <div class="crm-insp-row">
              <div class="crm-insp-label">Profile links</div>
              <div class="flex flex-col gap-1.5">
                <input
                  v-for="nw in block.props.networks"
                  :key="nw"
                  class="crm-insp-in"
                  :value="block.props.links?.[nw] ?? ''"
                  :placeholder="String(nw).toUpperCase() + ' URL'"
                  @input="set({ links: { ...block.props.links, [nw]: ($event.target as HTMLInputElement).value } })"
                />
              </div>
            </div>
          </template>

          <!-- footer -->
          <template v-else-if="block.type === 'footer'">
            <DToggle label="Unsubscribe line" :model-value="block.props.unsub" @update:model-value="(v: boolean) => set({ unsub: v })" />
            <div class="text-[11.5px] text-base-content/40 leading-relaxed mt-2.5">Click the footer text on the canvas to edit company &amp; address.</div>
          </template>
        </template>

        <div v-else class="text-center px-3 py-10 text-base-content/40">
          <GripVertical :size="26" class="inline opacity-50" />
          <div class="text-[13px] font-semibold text-base-content/60 mt-2.5">Select a block</div>
          <div class="text-[12px] mt-1">Click any block on the canvas to edit it.</div>
        </div>
      </template>

      <!-- ══ Styles tab ══ -->
      <template v-else-if="tab === 'styles'">
        <div class="crm-insp-row"><div class="crm-insp-label">Background</div>
          <DSwatches :options="['#f5f4f6', '#ffffff', '#efe9f1', '#eef3fb', '#1b1a1d']" :model-value="doc.g.bg" @update:model-value="(v: string) => emit('set-g', { bg: v })" /></div>
        <div class="crm-insp-row"><div class="crm-insp-label">Email card</div>
          <DSeg :options="[{ v: 'card', label: 'Card' }, { v: 'flat', label: 'Flat' }]" :model-value="doc.g.card ? 'card' : 'flat'" @update:model-value="(v: string) => emit('set-g', { card: v === 'card' })" /></div>
        <div class="crm-insp-row"><div class="crm-insp-label">Content width</div>
          <DSlider :model-value="doc.g.width" :min="480" :max="680" :step="20" suffix="px" @update:model-value="(v: number) => emit('set-g', { width: v })" /></div>
        <div class="crm-insp-row"><div class="crm-insp-label">Accent</div>
          <DSwatches :options="ACCENTS" :model-value="doc.g.accent" @update:model-value="(v: string) => emit('set-g', { accent: v })" /></div>
        <div class="crm-insp-row"><div class="crm-insp-label">Body font</div>
          <DSeg :options="FONTS.map((f) => ({ v: f, label: f.split(' ')[0] }))" :model-value="doc.g.font" @update:model-value="(v: string) => emit('set-g', { font: v })" /></div>
        <div class="crm-insp-row"><div class="crm-insp-label">Text color</div>
          <DSwatches :options="['#1b1a1d', '#272530', '#3a3942']" :model-value="doc.g.text" @update:model-value="(v: string) => emit('set-g', { text: v })" /></div>
      </template>

      <!-- ══ HTML tab ══ -->
      <template v-else>
        <div class="flex items-center gap-2 mb-2">
          <Code2 :size="14" class="text-base-content/40" />
          <span class="text-[12px] font-bold text-base-content/60">Compiled email HTML</span>
          <button
            type="button"
            class="ml-auto inline-flex items-center gap-1 text-[11.5px] font-semibold px-2 py-1 rounded-md border border-base-300 text-base-content/60 hover:text-base-content hover:bg-base-200"
            @click="copyHtml"
          >
            <component :is="copied ? Check : Copy" :size="11" :style="copied ? { color: '#15803d' } : {}" />
            {{ copied ? 'Copied' : 'Copy' }}
          </button>
        </div>
        <textarea
          readonly
          spellcheck="false"
          class="w-full h-[52vh] rounded-lg border border-base-300 bg-base-200 px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-base-content/80 outline-none resize-y"
          :value="compiledHtml"
          @focus="($event.target as HTMLTextAreaElement).select()"
        />
        <div class="text-[11px] text-base-content/40 leading-relaxed mt-2">
          Table-based, inline-styled — paste it into any email tool. Updates live as you design.
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.crm-insp-row { margin-bottom: 14px; }
.crm-insp-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: color-mix(in oklab, var(--color-base-content) 40%, transparent);
  margin-bottom: 7px;
}
.crm-insp-in {
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--color-base-300);
  background: var(--color-base-200);
  color: var(--color-base-content);
  font-size: 13px;
  outline: none;
  transition: border-color 0.12s;
}
.crm-insp-in:focus { border-color: var(--accent); }
</style>
