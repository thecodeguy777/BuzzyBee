<script setup lang="ts">
import { ref } from 'vue'
import { Plus } from 'lucide-vue-next'
import CrmDealCard from './CrmDealCard.vue'
import { STAGES, fmtMoney, type Deal, type StageId } from '@/lib/crmData'

const props = defineProps<{ deals: Deal[] }>()
const emit = defineEmits<{
  (e: 'open', deal: Deal): void
  (e: 'move', id: string, stage: StageId): void
  (e: 'new-deal', stage: StageId): void
}>()

const dragId = ref<string | null>(null)
const overStage = ref<StageId | null>(null)

const dealsFor = (id: StageId) => props.deals.filter((d) => d.stage === id)
const totalFor = (id: StageId) => dealsFor(id).reduce((s, d) => s + d.value, 0)

function onLeave(e: DragEvent, id: StageId) {
  const el = e.currentTarget as HTMLElement
  if (!el.contains(e.relatedTarget as Node) && overStage.value === id) overStage.value = null
}
function onDrop(id: StageId) {
  overStage.value = null
  if (dragId.value) emit('move', dragId.value, id)
}
</script>

<template>
  <div class="flex-1 overflow-auto px-5 pb-5 pt-1">
    <div class="flex gap-[14px] items-start h-full">
      <div
        v-for="st in STAGES"
        :key="st.id"
        class="w-[286px] flex-none flex flex-col rounded-xl border border-base-300 bg-base-200 max-h-full transition-colors"
        :style="{ outline: overStage === st.id ? '2px solid var(--accent)' : 'none', outlineOffset: '-1px' }"
        @dragover.prevent="overStage = st.id"
        @dragleave="onLeave($event, st.id)"
        @drop.prevent="onDrop(st.id)"
      >
        <div class="flex items-center gap-2 px-3 py-2.5 rounded-t-[11px] border-b border-base-300" :style="{ background: st.tint }">
          <span class="w-2 h-2 rounded-full flex-none" :style="{ background: st.dot }" />
          <span class="text-[12.5px] font-bold uppercase tracking-wide text-base-content whitespace-nowrap">{{ st.label }}</span>
          <span
            class="min-w-5 h-5 px-1.5 grid place-items-center rounded-full text-[11.5px] font-bold text-base-content"
            :style="{ background: 'color-mix(in oklab, ' + st.dot + ' 18%, transparent)' }"
          >{{ dealsFor(st.id).length }}</span>
          <div class="flex-1" />
          <span class="text-xs font-bold text-base-content/60">{{ fmtMoney(totalFor(st.id)) }}</span>
        </div>

        <div class="flex-1 overflow-y-auto p-2.5 flex flex-col gap-[9px] min-h-[90px]">
          <CrmDealCard
            v-for="d in dealsFor(st.id)"
            :key="d.id"
            :deal="d"
            :dragging="dragId === d.id"
            @open="emit('open', $event)"
            @dragstart="dragId = $event"
            @dragend="dragId = null"
          />
          <div
            v-if="dealsFor(st.id).length === 0"
            class="py-[18px] text-center text-base-content/40 text-[12.5px] italic border-[1.5px] border-dashed border-base-300 rounded-[10px]"
          >Drop deals here</div>
          <button class="crm-add flex items-center gap-[7px] px-2 py-[7px] rounded-lg text-base-content/40 text-[13px] font-semibold w-full" @click="emit('new-deal', st.id)">
            <Plus :size="15" /> Add deal
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.crm-add:hover {
  background: var(--color-base-300);
}
</style>
