<script setup lang="ts">
import { ref, computed } from 'vue'
import { GripVertical, ChevronUp, ChevronDown, Copy, Trash2, Palette as PaletteIcon, Image as ImageIcon } from 'lucide-vue-next'
import { designerDrag, makeDocBlock, type EmailDoc, type DocBlock, type DocBlockType } from '@/lib/emailDoc'
import DesignerEditable from './DesignerEditable.vue'

const GHOST_ID = '__ghost'

// The WYSIWYG canvas: blocks render as the actual email and edit in place.
// Click selects (ring + floating toolbar), drag the grip — or a palette tile —
// and a drop indicator line shows where it lands.

const props = defineProps<{
  doc: EmailDoc
  device: 'desktop' | 'mobile'
  selectedId: string | null
}>()
const emit = defineEmits<{
  (e: 'select', id: string | null): void
  (e: 'tool', action: 'up' | 'down' | 'dup' | 'del', id: string): void
  (e: 'update', id: string, patch: Record<string, unknown>): void
  (e: 'drop-block', index: number): void
}>()

const dropIndex = ref<number | null>(null)
const cardEl = ref<HTMLElement | null>(null)
const g = computed(() => props.doc.g)

// ── Ghost preview ──────────────────────────────────────────────────────────────
// While dragging a new block from the palette, show a low-opacity preview of
// the actual module at the drop position — rendered through the very same block
// chain, so the ghost looks exactly like what you'll get. (Reordering keeps the
// dimmed original + drop line; the native drag image already ghosts that one.)
const isMoveDrag = () => designerDrag.current?.kind === 'move'
let ghostCache: { type: DocBlockType; block: DocBlock } | null = null
function ghostForNew(type: DocBlockType): DocBlock {
  if (ghostCache?.type !== type) ghostCache = { type, block: { ...makeDocBlock(type), id: GHOST_ID } }
  return ghostCache.block
}
const renderList = computed<DocBlock[]>(() => {
  const d = designerDrag.current
  if (d?.kind === 'new' && dropIndex.value != null) {
    const arr = [...props.doc.blocks]
    arr.splice(Math.min(dropIndex.value, arr.length), 0, ghostForNew(d.type))
    return arr
  }
  return props.doc.blocks
})

// Stable hit-testing: snapshot the real blocks' Y-midpoints once per drag (taken
// before any ghost exists), then map cursor → insertion index against that
// frozen geometry. Because inserting the ghost can't change the cached
// midpoints, the slot never oscillates as content reflows.
const blockMids = ref<number[]>([])
function measureMids() {
  const host = cardEl.value
  if (!host) return
  blockMids.value = [...host.querySelectorAll<HTMLElement>('[data-real-block]')].map((el) => {
    const r = el.getBoundingClientRect()
    return r.top + r.height / 2
  })
}
const width = computed(() => (props.device === 'mobile' ? 380 : g.value.width))

const ALIGN: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' }
const SOCIAL_LABEL: Record<string, string> = { x: 'X', in: 'in', ig: 'IG', fb: 'f', yt: '▶' }

const accentOf = (v: string) => (v === 'accent' || !v ? g.value.accent : v)
const headingSize = (level: string) => (level === 'h1' ? 30 : level === 'h3' ? 20 : 24)
const buttonPad = (size: string) => (size === 'lg' ? '14px 28px' : size === 'sm' ? '8px 16px' : '11px 22px')
const buttonFs = (size: string) => (size === 'lg' ? 16 : size === 'sm' ? 13 : 14.5)

const up = (b: DocBlock, patch: Record<string, unknown>) => emit('update', b.id, patch)

function onBlockDragStart(e: DragEvent, id: string) {
  designerDrag.current = { kind: 'move', id }
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }
}
function onCardDragOver(e: DragEvent) {
  const d = designerDrag.current
  if (!d) return
  e.preventDefault()
  if (!blockMids.value.length && props.doc.blocks.length) measureMids()
  const idx = blockMids.value.findIndex((m) => e.clientY < m)
  let next = idx === -1 ? props.doc.blocks.length : idx
  // Reordering onto either side of the block's own slot is a no-op — don't
  // tease an insertion point that wouldn't move anything.
  if (d.kind === 'move') {
    const from = props.doc.blocks.findIndex((b) => b.id === d.id)
    if (next === from || next === from + 1) { dropIndex.value = null; return }
  }
  dropIndex.value = next
}
function resetDrag() {
  dropIndex.value = null
  blockMids.value = []
}
function onCanvasLeave(e: DragEvent) {
  const host = e.currentTarget as HTMLElement
  if (!host.contains(e.relatedTarget as Node)) resetDrag()
}
function onCanvasDrop(e: DragEvent) {
  e.preventDefault()
  const had = designerDrag.current
  const at = dropIndex.value
  resetDrag()
  if (had) emit('drop-block', at ?? props.doc.blocks.length)
}
const isDragging = (id: string) =>
  designerDrag.current?.kind === 'move' && designerDrag.current.id === id
</script>

<template>
  <div
    class="flex-1 overflow-auto flex justify-center px-6 pt-7 pb-20"
    :style="{ background: g.bg, fontFamily: `'${g.font}', system-ui, sans-serif` }"
    @click="emit('select', null)"
    @dragover.prevent
    @dragleave="onCanvasLeave"
    @dragend="resetDrag"
    @drop="onCanvasDrop"
  >
    <div class="self-start max-w-full transition-[width] duration-200" :style="{ width: width + 'px' }">
      <div
        ref="cardEl"
        :style="{
          background: g.card ? g.cardBg : 'transparent',
          borderRadius: g.card ? '14px' : '0',
          boxShadow: g.card ? '0 1px 3px rgba(20,12,22,.06), 0 12px 36px -12px rgba(20,12,22,.18)' : 'none',
          padding: '22px 0',
          minHeight: '200px',
        }"
        @dragover="onCardDragOver"
      >
        <!-- empty state -->
        <div
          v-if="!renderList.length"
          class="mx-6 px-5 py-11 text-center rounded-xl"
          style="border: 2px dashed #d9d5e0; color: #9a98a3"
        >
          <PaletteIcon :size="30" class="inline opacity-50" />
          <div class="text-[14px] font-semibold mt-2.5" style="color: #62606a">Drag blocks here to start</div>
          <div class="text-[12.5px] mt-1">or pick a template on the left</div>
        </div>

        <template v-for="(b, i) in renderList" :key="b.id">
          <div v-if="isMoveDrag()" class="crm-dz-indicator" :class="dropIndex === i && 'active'" />
          <div :data-real-block="b.id === GHOST_ID ? null : ''">
            <div
              class="crm-dz-block"
              :class="[b.id === GHOST_ID && 'is-ghost', selectedId === b.id && 'selected', isDragging(b.id) && 'dragging']"
              style="padding: 10px 32px"
              @click.stop="b.id !== GHOST_ID && emit('select', b.id)"
            >
              <!-- floating toolbar on the selected block -->
              <div v-if="b.id !== GHOST_ID && selectedId === b.id" class="crm-blk-tool" @click.stop>
                <button
                  type="button"
                  class="crm-blk-grip"
                  title="Drag to move"
                  draggable="true"
                  @dragstart="onBlockDragStart($event, b.id)"
                  @dragend="designerDrag.current = null"
                ><GripVertical :size="14" /></button>
                <button type="button" title="Move up" @click="emit('tool', 'up', b.id)"><ChevronUp :size="14" /></button>
                <button type="button" title="Move down" @click="emit('tool', 'down', b.id)"><ChevronDown :size="14" /></button>
                <button type="button" title="Duplicate" @click="emit('tool', 'dup', b.id)"><Copy :size="13" /></button>
                <button type="button" title="Delete" @click="emit('tool', 'del', b.id)"><Trash2 :size="13" /></button>
              </div>

              <!-- ── block bodies ── -->
              <!-- header -->
              <div v-if="b.type === 'header'" class="flex items-center gap-3 py-1" :style="{ justifyContent: ALIGN[b.props.align] }">
                <div
                  v-if="b.props.showLogo"
                  class="w-[38px] h-[38px] rounded-[9px] grid place-items-center text-white font-extrabold text-lg flex-none"
                  :style="{ background: g.accent }"
                >{{ (b.props.brand || 'A').replace(/<[^>]*>/g, '')[0] }}</div>
                <div :style="{ textAlign: b.props.align }">
                  <DesignerEditable :html="b.props.brand" placeholder="Brand" :style="{ fontSize: '19px', fontWeight: 800, color: g.text, letterSpacing: '-.3px' }" @commit="(v: string) => up(b, { brand: v })" />
                  <DesignerEditable :html="b.props.tagline" placeholder="Add a tagline (optional)" :style="{ fontSize: '13px', color: g.muted, marginTop: '1px' }" @commit="(v: string) => up(b, { tagline: v })" />
                </div>
              </div>

              <!-- heading -->
              <DesignerEditable
                v-else-if="b.type === 'heading'"
                :html="b.props.text"
                placeholder="Heading"
                :style="{ fontSize: headingSize(b.props.level) + 'px', fontWeight: 800, lineHeight: 1.25, letterSpacing: '-.4px', textAlign: b.props.align, color: accentOf(b.props.color) || g.text }"
                @commit="(v: string) => up(b, { text: v })"
              />

              <!-- text -->
              <DesignerEditable
                v-else-if="b.type === 'text'"
                :html="b.props.html"
                placeholder="Write something…"
                :style="{ fontSize: b.props.size + 'px', lineHeight: 1.6, textAlign: b.props.align, color: b.props.color || g.text }"
                @commit="(v: string) => up(b, { html: v })"
              />

              <!-- image -->
              <div v-else-if="b.type === 'image'" class="flex" :style="{ justifyContent: ALIGN[b.props.align] }">
                <img
                  v-if="b.props.src"
                  :src="b.props.src"
                  :alt="b.props.alt"
                  class="block h-auto"
                  :style="{ width: b.props.width + '%', borderRadius: b.props.radius + 'px' }"
                />
                <div
                  v-else
                  class="grid place-items-center"
                  :style="{ width: b.props.width + '%', aspectRatio: '16/9', borderRadius: b.props.radius + 'px', background: '#eceaf0', color: '#9a98a3' }"
                >
                  <span class="text-center text-[12px] font-semibold"><ImageIcon :size="22" class="inline mb-1" /><br />Add an image URL in the panel →</span>
                </div>
              </div>

              <!-- button -->
              <div v-else-if="b.type === 'button'" class="flex" :style="{ justifyContent: ALIGN[b.props.align] }">
                <span
                  class="inline-block text-center font-bold"
                  :style="{
                    width: b.props.full ? '100%' : 'auto',
                    padding: buttonPad(b.props.size),
                    borderRadius: b.props.radius + 'px',
                    background: accentOf(b.props.bg),
                    color: b.props.color,
                    fontSize: buttonFs(b.props.size) + 'px',
                  }"
                >
                  <DesignerEditable tag="span" :html="b.props.label" placeholder="Button" style="display: inline-block" @commit="(v: string) => up(b, { label: v })" />
                </span>
              </div>

              <!-- image + text -->
              <div v-else-if="b.type === 'imageText'" class="flex gap-[18px] items-stretch" :style="{ flexDirection: b.props.imgSide === 'left' ? 'row' : 'row-reverse' }">
                <div style="flex: 0 0 42%">
                  <img v-if="b.props.src" :src="b.props.src" alt="" class="block w-full h-auto rounded-[10px]" />
                  <div v-else class="grid place-items-center w-full rounded-[10px]" style="aspect-ratio: 1/1; background: #eceaf0; color: #9a98a3">
                    <span class="text-[11.5px] font-semibold text-center"><ImageIcon :size="20" class="inline mb-1" /><br />Image URL →</span>
                  </div>
                </div>
                <div class="flex-1 flex flex-col gap-2 justify-center">
                  <DesignerEditable :html="b.props.heading" placeholder="Heading" :style="{ fontSize: '18px', fontWeight: 750, color: g.text, lineHeight: 1.3 }" @commit="(v: string) => up(b, { heading: v })" />
                  <DesignerEditable :html="b.props.text" placeholder="Supporting text" :style="{ fontSize: '14px', color: g.muted, lineHeight: 1.55 }" @commit="(v: string) => up(b, { text: v })" />
                  <span v-if="b.props.showBtn" class="inline-flex items-center gap-1 font-bold text-[13.5px]" :style="{ color: g.accent }">
                    <DesignerEditable tag="span" :html="b.props.btn" placeholder="Link" @commit="(v: string) => up(b, { btn: v })" /> →
                  </span>
                </div>
              </div>

              <!-- 2 columns -->
              <div v-else-if="b.type === 'columns'" class="flex gap-6">
                <DesignerEditable class="flex-1" :html="b.props.left" placeholder="Column one" :style="{ fontSize: '14px', lineHeight: 1.6, color: g.text, textAlign: b.props.align }" @commit="(v: string) => up(b, { left: v })" />
                <DesignerEditable class="flex-1" :html="b.props.right" placeholder="Column two" :style="{ fontSize: '14px', lineHeight: 1.6, color: g.text, textAlign: b.props.align }" @commit="(v: string) => up(b, { right: v })" />
              </div>

              <!-- divider -->
              <div v-else-if="b.type === 'divider'" class="flex justify-center">
                <div :style="{ width: b.props.width + '%', borderTop: `${b.props.thickness}px ${b.props.style} ${b.props.color}` }" />
              </div>

              <!-- spacer -->
              <div v-else-if="b.type === 'spacer'" class="relative" :style="{ height: b.props.height + 'px' }">
                <div class="absolute inset-0 grid place-items-center text-[11px] font-semibold opacity-50" style="color: #9a98a3">{{ b.props.height }}px spacer</div>
              </div>

              <!-- social -->
              <div v-else-if="b.type === 'social'" class="flex gap-2.5" :style="{ justifyContent: ALIGN[b.props.align] }">
                <span
                  v-for="nw in b.props.networks"
                  :key="nw"
                  class="w-[34px] h-[34px] rounded-full grid place-items-center text-white text-[13px] font-bold"
                  :style="{ background: g.accent }"
                >{{ SOCIAL_LABEL[nw] ?? nw }}</span>
              </div>

              <!-- footer -->
              <div v-else-if="b.type === 'footer'" class="text-center text-[12px]" :style="{ color: g.muted, lineHeight: 1.6 }">
                <DesignerEditable :html="b.props.company" placeholder="Company" :style="{ fontWeight: 700, color: g.text }" @commit="(v: string) => up(b, { company: v })" />
                <DesignerEditable :html="b.props.address" placeholder="Address (optional)" @commit="(v: string) => up(b, { address: v })" />
                <div v-if="b.props.unsub" class="mt-1.5">
                  You're receiving this from <span v-html="b.props.company" /> via BuzzyHive.
                  <span class="underline" :style="{ color: g.accent }">Unsubscribe</span>
                </div>
              </div>
            </div>
          </div>
        </template>
        <div v-if="isMoveDrag()" class="crm-dz-indicator" :class="dropIndex === doc.blocks.length && 'active'" />
      </div>
      <div class="text-center text-[11px] mt-3.5 opacity-70" style="color: #9a98a3">Sent via BuzzyHive · {{ width }}px wide</div>
    </div>
  </div>
</template>

<style scoped>
.crm-dz-block { position: relative; transition: box-shadow 0.12s; border-radius: 8px; }
.crm-dz-block:hover { box-shadow: 0 0 0 1.5px var(--accent-bord); }
.crm-dz-block.selected { box-shadow: 0 0 0 2px var(--accent); }
.crm-dz-block.dragging { opacity: 0.35; }

/* Ghost preview of the module being placed (palette drags). */
.crm-dz-block.is-ghost {
  opacity: 0.5;
  pointer-events: none;
  outline: 2px dashed var(--accent);
  outline-offset: -4px;
  border-radius: 10px;
  background: color-mix(in oklab, var(--accent) 6%, transparent);
  animation: crm-ghost-in 0.12s ease both;
}
@keyframes crm-ghost-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 0.5; transform: none; }
}

.crm-dz-indicator { height: 0; position: relative; }
.crm-dz-indicator.active::before {
  content: '';
  position: absolute;
  left: 10px; right: 10px; top: -2px;
  height: 4px;
  border-radius: 999px;
  background: var(--accent);
  box-shadow: 0 0 0 4px color-mix(in oklab, var(--accent) 18%, transparent);
}
.crm-dz-indicator.active::after {
  content: '';
  position: absolute;
  left: 5px; top: -5.5px;
  width: 11px; height: 11px;
  border-radius: 50%;
  border: 3px solid var(--accent);
  background: var(--color-base-100);
}

.crm-blk-tool {
  position: absolute;
  top: -13px; right: 10px;
  display: flex;
  align-items: center;
  gap: 1px;
  z-index: 20;
  background: var(--color-base-100);
  border: 1px solid var(--color-base-300);
  border-radius: 8px;
  box-shadow: 0 8px 24px -8px rgba(20, 12, 22, 0.3);
  padding: 2px;
}
.crm-blk-tool button {
  width: 26px; height: 26px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  color: color-mix(in oklab, var(--color-base-content) 60%, transparent);
}
.crm-blk-tool button:hover { background: var(--color-base-200); color: var(--color-base-content); }
.crm-blk-grip { cursor: grab; }
.crm-blk-grip:active { cursor: grabbing; }
</style>
