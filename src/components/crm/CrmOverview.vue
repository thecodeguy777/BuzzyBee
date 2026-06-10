<script setup lang="ts">
import { computed } from 'vue'
import { Route, ArrowRight, Filter, Handshake, MessageSquare, ListChecks, Star } from 'lucide-vue-next'
import CrmAvatar from './CrmAvatar.vue'
import CrmHealthDot from './CrmHealthDot.vue'
import { useCrmStore } from '@/stores/crm'
import { STAGES, fmtMoney, type Deal } from '@/lib/crmData'

const props = defineProps<{ deals: Deal[] }>()
const emit = defineEmits<{ (e: 'open', deal: Deal): void }>()
const crm = useCrmStore()

const flow = [
  { icon: Filter, tag: 'CRM', label: 'Lead captured', sub: 'New prospect enters pipeline', color: '#2f6fed' },
  { icon: Handshake, tag: 'CRM', label: 'Deal won', sub: 'Opportunity closes', color: '#15803d' },
  { icon: MessageSquare, tag: 'Comms', label: 'Client workspace', sub: 'Channels spin up automatically', color: 'var(--accent-fg)' },
  { icon: ListChecks, tag: 'Tracker', label: 'Work delivered', sub: 'Tasks created & tracked', color: '#c2700c' },
]

const open = computed(() => props.deals.filter((d) => d.stage !== 'won' && d.stage !== 'lost'))
const pipeline = computed(() => open.value.reduce((s, d) => s + d.value, 0))
const won = computed(() => props.deals.filter((d) => d.stage === 'won'))
const stats = computed(() => [
  { label: 'Open pipeline', value: fmtMoney(pipeline.value), col: 'var(--accent-fg)', sub: open.value.length + ' active deals' },
  { label: 'Won this quarter', value: fmtMoney(won.value.reduce((s, d) => s + d.value, 0)), col: '#15803d', sub: won.value.length + ' deals closed' },
  { label: 'Avg. deal size', value: fmtMoney(Math.round(pipeline.value / (open.value.length || 1))), col: '#2f6fed', sub: 'across pipeline' },
  { label: 'Active clients', value: String(Object.values(crm.companies).filter((c) => c.isClient).length), col: '#c2700c', sub: 'live workspaces' },
])

const stageVal = (id: string) => props.deals.filter((d) => d.stage === id).reduce((s, d) => s + d.value, 0)
const maxStage = computed(() => Math.max(...STAGES.map((s) => stageVal(s.id)), 1))
const hot = computed(() => [...open.value].sort((a, b) => b.value - a.value).slice(0, 5))
</script>

<template>
  <div class="flex-1 overflow-auto px-5 pb-6 pt-2">
    <!-- ecosystem flow -->
    <div class="border border-base-300 rounded-[13px] bg-base-100 px-[18px] py-4 mb-4">
      <div class="flex items-center gap-[7px] mb-3.5">
        <Route :size="16" :style="{ color: 'var(--accent-fg)' }" />
        <span class="text-sm font-bold text-base-content">How a lead flows through your ecosystem</span>
        <span class="text-[11.5px] text-base-content/40">— CRM, Comms &amp; Tracker, connected</span>
      </div>
      <div class="flex items-stretch">
        <template v-for="(s, i) in flow" :key="i">
          <div class="flex-1 flex flex-col gap-[7px] px-1 py-0.5">
            <div class="flex items-center gap-2">
              <span class="w-[34px] h-[34px] rounded-[10px] flex-none grid place-items-center"
                :style="{ background: `color-mix(in oklab, ${s.color} 14%, var(--color-base-100))`, color: s.color }">
                <component :is="s.icon" :size="18" />
              </span>
              <span class="text-[9.5px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-[5px]"
                :style="{ color: s.color, background: `color-mix(in oklab, ${s.color} 12%, var(--color-base-100))` }">{{ s.tag }}</span>
            </div>
            <div class="text-[13.5px] font-bold text-base-content">{{ s.label }}</div>
            <div class="text-[11.5px] text-base-content/40 leading-snug">{{ s.sub }}</div>
          </div>
          <div v-if="i < flow.length - 1" class="flex items-center px-1 text-base-content/40">
            <ArrowRight :size="18" />
          </div>
        </template>
      </div>
    </div>

    <!-- stats -->
    <div class="grid grid-cols-4 gap-3 mb-4">
      <div v-for="s in stats" :key="s.label" class="px-[18px] py-[15px] rounded-[13px] border border-base-300 bg-base-100" :style="{ boxShadow: 'var(--sh-card)' }">
        <div class="text-[26px] font-extrabold tracking-tight leading-none" :style="{ color: s.col }">{{ s.value }}</div>
        <div class="text-[13px] text-base-content mt-[7px] font-semibold">{{ s.label }}</div>
        <div class="text-[11.5px] text-base-content/40 mt-0.5">{{ s.sub }}</div>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <!-- funnel -->
      <div class="rounded-[13px] border border-base-300 bg-base-100 overflow-hidden">
        <div class="px-[18px] py-3.5 border-b border-base-300 flex items-center gap-2">
          <Filter :size="16" :style="{ color: 'var(--accent-fg)' }" />
          <span class="text-[14.5px] font-bold text-base-content whitespace-nowrap">Pipeline by stage</span>
        </div>
        <div class="px-[18px] py-3.5 flex flex-col gap-[11px]">
          <div v-for="st in STAGES" :key="st.id" class="flex items-center gap-[11px]">
            <span class="w-[84px] flex-none flex items-center gap-1.5 text-[12.5px] font-semibold text-base-content/60">
              <span class="w-2 h-2 rounded-full" :style="{ background: st.dot }" />{{ st.label }}
            </span>
            <div class="flex-1 h-[22px] rounded-md bg-base-200 overflow-hidden">
              <div class="h-full rounded-md transition-all"
                :style="{ width: Math.max(stageVal(st.id) / maxStage * 100, 3) + '%', background: `color-mix(in oklab, ${st.dot} 75%, var(--color-base-100))` }" />
            </div>
            <span class="w-[62px] flex-none text-right text-[12.5px] font-bold text-base-content">{{ fmtMoney(stageVal(st.id)) }}</span>
          </div>
        </div>
      </div>

      <!-- top deals -->
      <div class="rounded-[13px] border border-base-300 bg-base-100 overflow-hidden">
        <div class="px-[18px] py-3.5 border-b border-base-300 flex items-center gap-2">
          <Star :size="16" :style="{ color: '#c2700c' }" />
          <span class="text-[14.5px] font-bold text-base-content whitespace-nowrap">Top open deals</span>
        </div>
        <div v-if="!hot.length" class="px-[18px] py-8 text-center text-[12.5px] text-base-content/40">
          No open deals.
        </div>
        <div
          v-for="d in hot"
          :key="d.id"
          class="crm-row flex items-center gap-[11px] px-[18px] py-[11px] cursor-pointer border-b border-base-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-inset"
          role="button"
          tabindex="0"
          @click="emit('open', d)"
          @keydown.enter.prevent="emit('open', d)"
        >
          <CrmAvatar :name="crm.company(d.companyId)?.name" :initials="crm.company(d.companyId)?.initials" :color="crm.company(d.companyId)?.color" :size="28" :radius="8" />
          <div class="flex-1 min-w-0">
            <div class="text-[13.5px] font-semibold text-base-content truncate">{{ d.title }}</div>
            <div class="text-[11.5px] text-base-content/40">{{ crm.company(d.companyId)?.name }}</div>
          </div>
          <CrmHealthDot :health="d.health" />
          <span class="text-sm font-extrabold text-base-content tracking-tight">{{ fmtMoney(d.value) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.crm-row:hover {
  background: var(--color-base-200);
}
</style>
