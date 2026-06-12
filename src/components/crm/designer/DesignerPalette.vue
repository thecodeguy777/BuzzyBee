<script setup lang="ts">
import { computed } from 'vue'
import {
  Building2, Heading2, Type, Image as ImageIcon, MousePointerClick, PanelLeft,
  Columns2, Minus, MoveVertical, Share2, Flag, GripVertical,
} from 'lucide-vue-next'
import { BLOCK_DEFS, DOC_TEMPLATES, designerDrag, type DocBlockType } from '@/lib/emailDoc'

// Left rail of the designer: quick-start templates + draggable block tiles.
// Tiles drag onto the canvas (HTML5 DnD) or click to append.

const emit = defineEmits<{
  (e: 'add', type: DocBlockType): void
  (e: 'template', name: string): void
}>()

const ICONS: Record<DocBlockType, unknown> = {
  header: Building2, heading: Heading2, text: Type, image: ImageIcon,
  button: MousePointerClick, imageText: PanelLeft, columns: Columns2,
  divider: Minus, spacer: MoveVertical, social: Share2, footer: Flag,
}

const groups = computed(() => {
  const m: Record<string, typeof BLOCK_DEFS> = {}
  for (const d of BLOCK_DEFS) (m[d.group] ??= [] as unknown as typeof BLOCK_DEFS).push(d)
  return m
})

function onDragStart(e: DragEvent, type: DocBlockType) {
  designerDrag.current = { kind: 'new', type }
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('text/plain', type)
  }
}
function onDragEnd() {
  designerDrag.current = null
}
</script>

<template>
  <div class="w-[248px] flex-none border-r border-base-300 overflow-y-auto px-3.5 pt-3.5 pb-6 bg-base-200/40">
    <div class="text-[11px] font-bold tracking-wide text-base-content/40 uppercase mb-2">Start from a template</div>
    <div class="grid grid-cols-2 gap-2 mb-5">
      <button
        v-for="(_, name) in DOC_TEMPLATES"
        :key="name"
        type="button"
        class="flex flex-col gap-1.5 p-2.5 rounded-[10px] border border-base-300 bg-base-100 hover:border-[var(--accent-bord)] transition-colors text-left"
        @click="emit('template', String(name))"
      >
        <span class="flex flex-col gap-[2.5px] items-start">
          <span class="w-[70%] h-1 rounded-sm opacity-80" :style="{ background: 'var(--accent)' }" />
          <span class="w-full h-[3px] rounded-sm bg-base-300" />
          <span class="w-[90%] h-[3px] rounded-sm bg-base-300" />
          <span class="w-[40%] h-1.5 rounded-sm opacity-50 mt-px" :style="{ background: 'var(--accent)' }" />
        </span>
        <span class="text-[12px] font-semibold text-base-content">{{ name }}</span>
      </button>
    </div>

    <div v-for="(defs, group) in groups" :key="group" class="mb-4">
      <div class="text-[11px] font-bold tracking-wide text-base-content/40 uppercase mb-2">{{ group }}</div>
      <div class="flex flex-col gap-[7px]">
        <div
          v-for="d in defs"
          :key="d.type"
          class="crm-pal-tile"
          draggable="true"
          role="button"
          :title="'Drag onto the canvas, or click to add'"
          @dragstart="onDragStart($event, d.type)"
          @dragend="onDragEnd"
          @click="emit('add', d.type)"
        >
          <span class="w-[30px] h-[30px] rounded-lg flex-none grid place-items-center" :style="{ background: 'var(--accent-soft)', color: 'var(--accent-fg)' }">
            <component :is="ICONS[d.type]" :size="16" />
          </span>
          <span class="text-[13px] font-semibold text-base-content">{{ d.label }}</span>
          <GripVertical :size="14" class="ml-auto text-base-content/30" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.crm-pal-tile {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 11px;
  border-radius: 10px;
  border: 1px solid var(--color-base-300);
  background: var(--color-base-100);
  cursor: grab;
  transition: border-color 0.12s, box-shadow 0.12s, transform 0.08s;
  user-select: none;
}
.crm-pal-tile:hover { border-color: var(--accent-bord); box-shadow: 0 1px 3px rgba(20, 12, 22, 0.08); }
.crm-pal-tile:active { cursor: grabbing; transform: scale(0.98); }
</style>
