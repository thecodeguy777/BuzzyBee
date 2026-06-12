<script setup lang="ts">
import { computed } from 'vue'
import {
  Heading2, Type, Image as ImageIcon, MousePointerClick, Minus, MoveVertical,
  ChevronUp, ChevronDown, Copy, Trash2, AlignLeft, AlignCenter, Plus,
} from 'lucide-vue-next'
import { newBlock, blockId, type EmailBlock, type BlockType } from '@/lib/emailBlocks'
import RichTextEditor from '@/components/workstation/RichTextEditor.vue'

// The no-code stack: each block is a card with inline controls. Compiling to
// email HTML happens in the parent (emailBlocks.compileBlocks) — this
// component only edits the block array.

const props = defineProps<{
  modelValue: EmailBlock[]
  accent: string
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', blocks: EmailBlock[]): void
}>()

const blocks = computed(() => props.modelValue)

const BLOCK_TYPES: { type: BlockType; label: string; icon: unknown }[] = [
  { type: 'heading', label: 'Heading', icon: Heading2 },
  { type: 'text', label: 'Text', icon: Type },
  { type: 'image', label: 'Image', icon: ImageIcon },
  { type: 'button', label: 'Button', icon: MousePointerClick },
  { type: 'divider', label: 'Divider', icon: Minus },
  { type: 'spacer', label: 'Spacer', icon: MoveVertical },
]
const iconFor = (t: BlockType) => BLOCK_TYPES.find((b) => b.type === t)?.icon

function set(next: EmailBlock[]) {
  emit('update:modelValue', next)
}
function add(type: BlockType) {
  set([...blocks.value, newBlock(type)])
}
function patch(id: string, p: Record<string, unknown>) {
  set(blocks.value.map((b) => (b.id === id ? ({ ...b, ...p } as EmailBlock) : b)))
}
function move(id: string, dir: -1 | 1) {
  const i = blocks.value.findIndex((b) => b.id === id)
  const j = i + dir
  if (i === -1 || j < 0 || j >= blocks.value.length) return
  const next = [...blocks.value]
  ;[next[i], next[j]] = [next[j], next[i]]
  set(next)
}
function duplicate(id: string) {
  const i = blocks.value.findIndex((b) => b.id === id)
  if (i === -1) return
  const copy = { ...blocks.value[i], id: blockId() } as EmailBlock
  set([...blocks.value.slice(0, i + 1), copy, ...blocks.value.slice(i + 1)])
}
function remove(id: string) {
  set(blocks.value.filter((b) => b.id !== id))
}
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <div
      v-for="(b, i) in blocks"
      :key="b.id"
      class="crm-blk group/blk rounded-[10px] border border-base-300 bg-base-100 overflow-hidden"
    >
      <!-- block chrome -->
      <div class="flex items-center gap-1.5 px-2 py-1 bg-base-200/50 border-b border-base-200">
        <component :is="iconFor(b.type)" :size="12" class="text-base-content/40" />
        <span class="text-[10.5px] font-bold uppercase tracking-wide text-base-content/40">{{ b.type }}</span>

        <!-- per-type quick settings -->
        <template v-if="b.type === 'heading' || b.type === 'button'">
          <span class="w-px h-3.5 bg-base-300 mx-0.5" />
          <button
            type="button"
            class="crm-blk-ctl"
            :class="b.align === 'left' && 'crm-blk-ctl-on'"
            title="Align left"
            @click="patch(b.id, { align: 'left' })"
          ><AlignLeft :size="12" /></button>
          <button
            type="button"
            class="crm-blk-ctl"
            :class="b.align === 'center' && 'crm-blk-ctl-on'"
            title="Center"
            @click="patch(b.id, { align: 'center' })"
          ><AlignCenter :size="12" /></button>
        </template>
        <template v-if="b.type === 'button'">
          <label class="flex items-center gap-1 ml-0.5 cursor-pointer" title="Button color (defaults to your accent)">
            <input
              type="color"
              class="w-4 h-4 rounded border border-base-300 bg-transparent p-0 cursor-pointer"
              :value="b.color || accent"
              @input="patch(b.id, { color: ($event.target as HTMLInputElement).value })"
            />
          </label>
        </template>
        <template v-if="b.type === 'spacer'">
          <input
            type="range"
            min="8"
            max="96"
            step="4"
            class="range range-xs w-24 ml-1"
            :value="b.size"
            @input="patch(b.id, { size: Number(($event.target as HTMLInputElement).value) })"
          />
          <span class="text-[10px] text-base-content/40 tabular-nums">{{ b.size }}px</span>
        </template>

        <span class="flex-1" />
        <span class="crm-blk-acts flex items-center gap-0.5">
          <button type="button" class="crm-blk-ctl" :disabled="i === 0" title="Move up" @click="move(b.id, -1)"><ChevronUp :size="13" /></button>
          <button type="button" class="crm-blk-ctl" :disabled="i === blocks.length - 1" title="Move down" @click="move(b.id, 1)"><ChevronDown :size="13" /></button>
          <button type="button" class="crm-blk-ctl" title="Duplicate" @click="duplicate(b.id)"><Copy :size="12" /></button>
          <button type="button" class="crm-blk-ctl hover:!text-[#c2253c]" title="Delete" @click="remove(b.id)"><Trash2 :size="12" /></button>
        </span>
      </div>

      <!-- block content -->
      <div class="p-2">
        <input
          v-if="b.type === 'heading'"
          :value="b.text"
          class="w-full bg-transparent outline-none text-[16px] font-bold text-base-content px-1"
          :style="{ textAlign: b.align }"
          placeholder="Heading text"
          @input="patch(b.id, { text: ($event.target as HTMLInputElement).value })"
        />

        <RichTextEditor
          v-else-if="b.type === 'text'"
          :model-value="b.html"
          min-height="3.5rem"
          placeholder="Write — select text to format."
          @update:model-value="(v: string) => patch(b.id, { html: v })"
        />

        <div v-else-if="b.type === 'image'" class="flex flex-col gap-1.5">
          <img v-if="b.src" :src="b.src" :alt="b.alt" class="rounded-md max-h-36 object-cover w-full" />
          <input
            :value="b.src"
            class="crm-blk-in"
            placeholder="Image URL (https://…)"
            @input="patch(b.id, { src: ($event.target as HTMLInputElement).value })"
          />
          <div class="flex gap-1.5">
            <input
              :value="b.alt"
              class="crm-blk-in flex-1"
              placeholder="Alt text"
              @input="patch(b.id, { alt: ($event.target as HTMLInputElement).value })"
            />
            <input
              :value="b.href"
              class="crm-blk-in flex-1"
              placeholder="Link when clicked (optional)"
              @input="patch(b.id, { href: ($event.target as HTMLInputElement).value })"
            />
          </div>
        </div>

        <div v-else-if="b.type === 'button'" class="flex flex-col gap-1.5">
          <div :style="{ textAlign: b.align }">
            <span
              class="inline-block px-5 py-2 rounded-lg text-[13px] font-bold text-white"
              :style="{ background: b.color || accent }"
            >{{ b.label || 'Call to action' }}</span>
          </div>
          <div class="flex gap-1.5">
            <input
              :value="b.label"
              class="crm-blk-in flex-1"
              placeholder="Button label"
              @input="patch(b.id, { label: ($event.target as HTMLInputElement).value })"
            />
            <input
              :value="b.href"
              class="crm-blk-in flex-1"
              placeholder="https://… where it goes"
              @input="patch(b.id, { href: ($event.target as HTMLInputElement).value })"
            />
          </div>
        </div>

        <hr v-else-if="b.type === 'divider'" class="border-0 border-t border-base-300 my-1.5" />

        <div
          v-else-if="b.type === 'spacer'"
          class="rounded bg-base-200/60 grid place-items-center text-[10px] text-base-content/30"
          :style="{ height: Math.max(16, Math.min(48, b.size / 2)) + 'px' }"
        >
          {{ b.size }}px of breathing room
        </div>
      </div>
    </div>

    <!-- add block -->
    <div class="rounded-[10px] border-[1.5px] border-dashed border-base-300 p-1.5 flex items-center gap-1 flex-wrap">
      <span class="inline-flex items-center gap-1 text-[11px] font-bold text-base-content/40 uppercase tracking-wide pl-1 pr-0.5">
        <Plus :size="12" /> Add
      </span>
      <button
        v-for="bt in BLOCK_TYPES"
        :key="bt.type"
        type="button"
        class="inline-flex items-center gap-1 text-[11.5px] font-semibold px-2 py-1 rounded-md text-base-content/50 hover:text-base-content hover:bg-base-200 transition-colors"
        @click="add(bt.type)"
      >
        <component :is="bt.icon" :size="12" /> {{ bt.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.crm-blk-ctl {
  width: 20px;
  height: 20px;
  border-radius: 5px;
  display: grid;
  place-items: center;
  color: color-mix(in oklab, var(--color-base-content) 35%, transparent);
  transition: color 0.12s, background 0.12s;
}
.crm-blk-ctl:hover:not(:disabled) {
  color: var(--color-base-content);
  background: var(--color-base-300);
}
.crm-blk-ctl:disabled { opacity: 0.3; }
.crm-blk-ctl-on { color: var(--accent-fg); background: var(--accent-soft); }

.crm-blk .crm-blk-acts { opacity: 0; transition: opacity 0.12s; }
.crm-blk:hover .crm-blk-acts, .crm-blk:focus-within .crm-blk-acts { opacity: 1; }

.crm-blk-in {
  background: var(--color-base-200);
  border-radius: 7px;
  padding: 5px 8px;
  font-size: 12px;
  color: var(--color-base-content);
  outline: none;
  min-width: 0;
}
.crm-blk-in:focus { box-shadow: 0 0 0 1px color-mix(in oklab, var(--accent) 40%, transparent); }
</style>
