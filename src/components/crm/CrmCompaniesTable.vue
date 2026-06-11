<script setup lang="ts">
import { computed } from 'vue'
import { Hash } from 'lucide-vue-next'
import CrmAvatar from './CrmAvatar.vue'
import { useCrmStore } from '@/stores/crm'
import { fmtMoney, fmtDate, relTime, type Company } from '@/lib/crmData'

const emit = defineEmits<{ (e: 'open-company', company: Company): void }>()

const crm = useCrmStore()
const companies = computed(() => Object.values(crm.companies))
const COLS = 'minmax(220px,1.4fr) 110px 130px 90px 110px 110px 100px 110px 100px'

const openDeals = (id: string) => crm.dealsFor(id).filter((d) => d.stage !== 'won' && d.stage !== 'lost')
const openValue = (id: string) => openDeals(id).reduce((s, d) => s + d.value, 0)
const location = (co: Company) => [co.city, co.country].filter(Boolean).join(', ')
</script>

<template>
  <div class="flex-1 overflow-auto px-5 pb-6">
    <div class="border border-base-300 rounded-xl overflow-hidden bg-base-100 min-w-[1180px]">
      <div
        class="grid items-center px-4 h-[42px] border-b border-base-300 bg-base-200"
        :style="{ gridTemplateColumns: COLS }"
      >
        <span v-for="h in ['Company', 'Industry', 'Location', 'Open deals', 'Pipeline value', 'Status', 'Created', 'Last activity', 'Channel']" :key="h"
          class="text-[11px] font-bold tracking-wider uppercase text-base-content/40">{{ h }}</span>
      </div>

      <div v-if="!companies.length" class="px-4 py-10 text-center text-[13px] text-base-content/40">
        No companies yet.
      </div>
      <div
        v-for="co in companies"
        :key="co.id"
        class="crm-row grid items-center px-4 h-[54px] cursor-pointer border-b border-base-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-inset"
        :style="{ gridTemplateColumns: COLS }"
        role="button"
        tabindex="0"
        @click="emit('open-company', co)"
        @keydown.enter.prevent="emit('open-company', co)"
      >
        <div class="flex items-center gap-[11px] min-w-0">
          <CrmAvatar :name="co.name" :initials="co.initials" :color="co.color" :size="32" :radius="9" />
          <div class="min-w-0">
            <div class="text-sm font-semibold text-base-content truncate">{{ co.name }}</div>
            <div class="text-[11.5px] text-base-content/40 truncate">{{ co.site }}</div>
          </div>
        </div>
        <div class="text-[13px] text-base-content/60 truncate">{{ co.industry || '—' }}</div>
        <div class="text-[13px] text-base-content/60 truncate">{{ location(co) || '—' }}</div>
        <div class="text-[13.5px] font-semibold text-base-content">{{ openDeals(co.id).length || '—' }}</div>
        <div class="text-sm font-bold text-base-content">{{ openValue(co.id) > 0 ? fmtMoney(openValue(co.id)) : '—' }}</div>
        <div>
          <span
            class="inline-flex items-center gap-1.5 px-[9px] py-0.5 rounded-full text-[11.5px] font-semibold whitespace-nowrap"
            :style="co.isClient
              ? { background: 'var(--st-done-bg)', color: 'var(--st-done-fg)' }
              : { background: 'var(--st-rev-bg)', color: 'var(--st-rev-fg)' }"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-current" />{{ co.isClient ? 'Active client' : 'Prospect' }}
          </span>
        </div>
        <div class="text-[12.5px] text-base-content/60 tabular-nums">{{ fmtDate(co.createdAt) }}</div>
        <div class="text-[12.5px] text-base-content/60">{{ co.lastActivityAt ? relTime(co.lastActivityAt) : '—' }}</div>
        <div>
          <span v-if="co.channelName" class="inline-flex items-center gap-1 text-[12.5px] font-semibold" :style="{ color: 'var(--accent-fg)' }">
            <Hash :size="12" :stroke-width="2" />{{ co.channelName.length > 10 ? co.channelName.slice(0, 9) + '…' : co.channelName }}
          </span>
          <span v-else class="text-base-content/40">—</span>
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
