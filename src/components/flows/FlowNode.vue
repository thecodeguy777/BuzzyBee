<script setup lang="ts">
// A single canvas node card. Same aesthetic as the email designer's palette
// tiles (accent-soft icon square + label) so the flow studio reads as a sibling.
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { nodeDef, triggerDef, START_DEF, type FlowNodeType } from '@/lib/flowNodes'

const props = defineProps<{
  id: string
  data: { kind: FlowNodeType; config: Record<string, any>; trigger?: { type: string; config: Record<string, any> } }
  selected?: boolean
}>()

const isStart = computed(() => props.data.kind === 'start')
const trig = computed(() => (isStart.value ? triggerDef(props.data.trigger?.type ?? '') : undefined))
const def = computed(() => nodeDef(props.data.kind))
const icon = computed(() => (isStart.value ? (trig.value?.icon ?? START_DEF.icon) : def.value?.icon))
const label = computed(() => (isStart.value ? (trig.value?.label ?? 'Pick a trigger') : (def.value?.label ?? props.data.kind)))
const group = computed(() => (isStart.value ? 'When' : def.value?.group ?? ''))
const summary = computed(() => (isStart.value ? (trig.value?.summary?.(props.data.trigger?.config ?? {}) ?? '') : (def.value?.summary?.(props.data.config ?? {}) ?? '')))
</script>

<template>
  <div class="fn-card" :class="{ 'fn-sel': selected, 'fn-start': isStart }">
    <Handle v-if="!isStart" type="target" :position="Position.Top" class="fn-h" />
    <span class="fn-ico"><component :is="icon" :size="17" :stroke-width="1.9" /></span>
    <div class="fn-body">
      <div class="fn-kind">{{ group }}</div>
      <div class="fn-label">{{ label }}</div>
      <div v-if="summary" class="fn-sum">{{ summary }}</div>
    </div>
    <Handle type="source" :position="Position.Bottom" class="fn-h" />
  </div>
</template>

<style scoped>
.fn-card {
  display: flex; align-items: center; gap: 10px; width: 232px; padding: 11px 13px;
  border-radius: 13px; border: 1px solid var(--color-base-300); background: var(--color-base-100);
  box-shadow: 0 1px 2px rgba(20, 12, 22, 0.06), 0 1px 1px rgba(20, 12, 22, 0.04);
  transition: border-color 0.12s, box-shadow 0.12s;
}
.fn-card:hover { border-color: var(--accent-bord); }
.fn-sel { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in oklab, var(--accent) 30%, transparent); }
.fn-start { border-style: dashed; }
.fn-ico {
  width: 34px; height: 34px; flex: none; display: grid; place-items: center; border-radius: 9px;
  background: var(--accent-soft); color: var(--accent-fg);
}
.fn-body { min-width: 0; }
.fn-kind {
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px;
  color: color-mix(in oklab, var(--color-base-content) 40%, transparent);
}
.fn-label { font-size: 13.5px; font-weight: 700; color: var(--color-base-content); line-height: 1.2; }
.fn-sum {
  font-size: 11.5px; color: color-mix(in oklab, var(--color-base-content) 55%, transparent);
  margin-top: 2px; max-width: 168px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
/* Connection points are the brand's rounded honeycomb cell, not a plain square. */
.fn-h {
  width: 12px; height: 12px; min-width: 12px; min-height: 12px;
  background: var(--accent); border: none; border-radius: 0;
  clip-path: url(#hc-hex-clip); -webkit-clip-path: url(#hc-hex-clip);
  filter: drop-shadow(0 1px 1.5px rgba(20, 12, 22, 0.4));
}
.fn-h:hover { background: var(--accent-fg); }
</style>
