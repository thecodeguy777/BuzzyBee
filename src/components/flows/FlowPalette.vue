<script setup lang="ts">
// Left rail of the flow studio — mirrors the email DesignerPalette: grouped,
// draggable tiles. Live nodes drag onto the canvas / click to add; "soon" nodes
// are visible (so the full recruiting vision shows) but dimmed and inert.
import { computed } from 'vue'
import { GripVertical } from 'lucide-vue-next'
import { FLOW_GROUPS, FLOW_NODE_DEFS, flowDrag, type FlowNodeType } from '@/lib/flowNodes'

const emit = defineEmits<{ (e: 'add', type: FlowNodeType): void }>()

const groups = computed(() =>
  FLOW_GROUPS.map((g) => ({ group: g, defs: FLOW_NODE_DEFS.filter((d) => d.group === g) })).filter((x) => x.defs.length),
)

function onDragStart(e: DragEvent, type: FlowNodeType) {
  flowDrag.type = type
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('text/plain', type)
  }
}
function onDragEnd() { flowDrag.type = null }
</script>

<template>
  <div class="w-[248px] flex-none border-r border-base-300 overflow-y-auto px-3.5 pt-3.5 pb-6 bg-base-200/40">
    <div class="text-[11px] font-bold tracking-wide text-base-content/40 uppercase mb-3">Nodes</div>
    <div v-for="grp in groups" :key="grp.group" class="mb-4">
      <div class="text-[11px] font-bold tracking-wide text-base-content/40 uppercase mb-2">{{ grp.group }}</div>
      <div class="flex flex-col gap-[7px]">
        <div
          v-for="d in grp.defs"
          :key="d.type"
          class="fp-tile"
          :class="{ 'fp-soon': d.soon }"
          :draggable="!d.soon"
          role="button"
          :title="d.soon ? 'Coming soon' : 'Drag onto the canvas, or click to add'"
          @dragstart="(e) => !d.soon && onDragStart(e, d.type)"
          @dragend="onDragEnd"
          @click="!d.soon && emit('add', d.type)"
        >
          <span class="fp-ico"><component :is="d.icon" :size="16" :stroke-width="1.9" /></span>
          <span class="fp-label">{{ d.label }}</span>
          <span v-if="d.soon" class="fp-badge">soon</span>
          <GripVertical v-else :size="14" class="ml-auto text-base-content/30" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fp-tile {
  display: flex; align-items: center; gap: 9px; padding: 8px 11px; border-radius: 10px;
  border: 1px solid var(--color-base-300); background: var(--color-base-100); cursor: grab;
  transition: border-color 0.12s, box-shadow 0.12s, transform 0.08s; user-select: none;
}
.fp-tile:hover { border-color: var(--accent-bord); box-shadow: 0 1px 3px rgba(20, 12, 22, 0.08); }
.fp-tile:active { cursor: grabbing; transform: scale(0.98); }
.fp-soon { opacity: 0.5; cursor: default; }
.fp-soon:hover { border-color: var(--color-base-300); box-shadow: none; transform: none; }
.fp-soon:active { transform: none; }
.fp-ico {
  width: 30px; height: 30px; flex: none; display: grid; place-items: center; border-radius: 8px;
  background: var(--accent-soft); color: var(--accent-fg);
}
.fp-label { font-size: 13px; font-weight: 600; color: var(--color-base-content); }
.fp-badge {
  margin-left: auto; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px;
  color: color-mix(in oklab, var(--color-base-content) 40%, transparent);
  background: var(--color-base-200); padding: 2px 6px; border-radius: 5px;
}
</style>
