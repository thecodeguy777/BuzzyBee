<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import Sortable from 'sortablejs'
import { Plus } from 'lucide-vue-next'
import CrmDealCard from './CrmDealCard.vue'
import { STAGES, fmtMoney, type Deal, type StageId } from '@/lib/crmData'

const props = defineProps<{ deals: Deal[] }>()
const emit = defineEmits<{
  (e: 'open', deal: Deal): void
  (e: 'move', id: string, stage: StageId): void
  (e: 'new-deal', stage: StageId): void
}>()

const dealsByStage = computed<Record<StageId, Deal[]>>(() => {
  const out = Object.fromEntries(STAGES.map((s) => [s.id, [] as Deal[]])) as Record<StageId, Deal[]>
  for (const d of props.deals) out[d.stage]?.push(d)
  return out
})
const totalFor = (id: StageId) => dealsByStage.value[id].reduce((s, d) => s + d.value, 0)

// ── SortableJS wiring (same pattern as TaskBoardView) ──────────────────────
// One Sortable instance per column body; group:'crm-deals' lets cards move
// between stages. Deals carry no manual order within a stage, so onEnd only
// cares about the destination column.

const columnBodies = ref<Record<string, HTMLElement | null>>({})
const sortables: Sortable[] = []

function setColumnRef(stage: StageId, el: Element | any) {
  columnBodies.value[stage] = (el as HTMLElement) ?? null
}

// Sortable physically moves the dragged node, but Vue's keyed v-for still owns
// it. Put the node back where Vue left it before mutating state, so the keyed
// re-render is the single source of truth — otherwise a failed drop leaves the
// card stuck in the wrong column, and successful moves can ghost/duplicate.
function revertSortableMove(evt: Sortable.SortableEvent) {
  const { item, from, oldIndex } = evt
  item.remove()
  const siblings = Array.from(from.querySelectorAll(':scope > [data-deal-id]'))
  const ref = siblings[oldIndex ?? siblings.length] ?? null
  if (ref) {
    from.insertBefore(item, ref)
  } else if (siblings.length) {
    const last = siblings[siblings.length - 1]
    from.insertBefore(item, last.nextSibling)
  } else {
    from.insertBefore(item, from.firstChild)
  }
}

function onSortEnd(evt: Sortable.SortableEvent) {
  const dealId = evt.item.getAttribute('data-deal-id') ?? ''
  const toStage = evt.to.getAttribute('data-stage') as StageId | null
  revertSortableMove(evt)
  if (!dealId || !toStage) return
  const deal = props.deals.find((d) => d.id === dealId)
  if (!deal || deal.stage === toStage) return
  emit('move', dealId, toStage)
}

function destroySortables() {
  while (sortables.length) sortables.pop()?.destroy()
}

function buildSortables() {
  destroySortables()
  for (const st of STAGES) {
    const el = columnBodies.value[st.id]
    if (!el) continue
    sortables.push(
      Sortable.create(el, {
        group: 'crm-deals',
        animation: 150,
        ghostClass: 'bb-sort-ghost',
        chosenClass: 'bb-sort-chosen',
        dragClass: 'bb-sort-drag',
        // Only deal cards are draggable — not the placeholder or Add button.
        draggable: '[data-deal-id]',
        onEnd: onSortEnd
      })
    )
  }
}

onMounted(async () => {
  await nextTick()
  buildSortables()
})
onBeforeUnmount(() => destroySortables())

// Rebuild when column refs change (e.g., HMR or template churn)
watch(
  () => columnBodies.value,
  () => buildSortables(),
  { deep: true, flush: 'post' }
)
</script>

<template>
  <div class="flex-1 overflow-auto px-5 pb-5 pt-1">
    <div class="flex gap-[14px] items-start h-full">
      <div
        v-for="st in STAGES"
        :key="st.id"
        class="w-[286px] flex-none flex flex-col rounded-xl border border-base-300 bg-base-200 max-h-full"
      >
        <div class="flex items-center gap-2 px-3 py-2.5 rounded-t-[11px] border-b border-base-300" :style="{ background: st.tint }">
          <span class="w-2 h-2 rounded-full flex-none" :style="{ background: st.dot }" />
          <span class="text-[12.5px] font-bold uppercase tracking-wide text-base-content whitespace-nowrap">{{ st.label }}</span>
          <span
            class="min-w-5 h-5 px-1.5 grid place-items-center rounded-full text-[11.5px] font-bold text-base-content"
            :style="{ background: 'color-mix(in oklab, ' + st.dot + ' 18%, transparent)' }"
          >{{ dealsByStage[st.id].length }}</span>
          <div class="flex-1" />
          <span class="text-xs font-bold text-base-content/60">{{ fmtMoney(totalFor(st.id)) }}</span>
        </div>

        <div
          :ref="(el) => setColumnRef(st.id, el)"
          :data-stage="st.id"
          class="flex-1 overflow-y-auto p-2.5 flex flex-col gap-[9px] min-h-[90px]"
        >
          <CrmDealCard
            v-for="d in dealsByStage[st.id]"
            :key="d.id"
            :deal="d"
            :data-deal-id="d.id"
            @open="emit('open', $event)"
          />
          <div
            v-if="dealsByStage[st.id].length === 0"
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

<!-- Sortable state classes are applied to teleport-free raw DOM nodes, so they
     must be global. TaskBoardView defines the same ones, but only while that
     chunk is mounted — the CRM board carries its own copy. -->
<style>
.bb-sort-ghost {
  opacity: 0.4;
  background: rgb(var(--bb-primary-rgb, 250 200 80) / 0.1);
}
.bb-sort-chosen {
  cursor: grabbing !important;
}
.bb-sort-drag {
  opacity: 0.95;
  transform: rotate(1.5deg);
}
</style>
