<script setup lang="ts">
import CrmAvatar from './CrmAvatar.vue'
import { useCrmStore } from '@/stores/crm'

const crm = useCrmStore()
const COLS = 'minmax(220px,1.3fr) 180px minmax(200px,1fr) 150px'
</script>

<template>
  <div class="flex-1 overflow-auto px-5 pb-6">
    <div class="border border-base-300 rounded-xl overflow-hidden bg-base-100 min-w-[860px]">
      <div
        class="grid items-center px-4 h-[42px] border-b border-base-300 bg-base-200"
        :style="{ gridTemplateColumns: COLS }"
      >
        <span v-for="h in ['Name', 'Company', 'Email', 'Phone']" :key="h"
          class="text-[11px] font-bold tracking-wider uppercase text-base-content/40">{{ h }}</span>
      </div>

      <div v-if="!crm.contacts.length" class="px-4 py-10 text-center text-[13px] text-base-content/40">
        No contacts yet.
      </div>
      <div
        v-for="c in crm.contacts"
        :key="c.id"
        class="crm-row grid items-center px-4 h-[52px] border-b border-base-200"
        :style="{ gridTemplateColumns: COLS }"
      >
        <div class="flex items-center gap-[11px] min-w-0">
          <CrmAvatar :name="c.name" :initials="c.initials" :color="c.color" :size="30" :radius="8" />
          <div class="min-w-0">
            <div class="text-sm font-semibold text-base-content flex items-center gap-[7px]">
              {{ c.name }}
              <span
                v-if="c.primary"
                class="text-[9.5px] font-bold px-[5px] py-px rounded"
                :style="{ color: 'var(--accent-fg)', background: 'var(--accent-soft)' }"
              >PRIMARY</span>
            </div>
            <div class="text-[11.5px] text-base-content/40">{{ c.role }}</div>
          </div>
        </div>
        <div class="flex items-center gap-[7px] min-w-0">
          <CrmAvatar :name="crm.company(c.companyId)?.name" :initials="crm.company(c.companyId)?.initials" :color="crm.company(c.companyId)?.color" :size="20" :radius="6" />
          <span class="text-[13px] text-base-content/60 truncate">{{ crm.company(c.companyId)?.name }}</span>
        </div>
        <div class="text-[13px] truncate" :style="{ color: 'var(--link)' }">{{ c.email }}</div>
        <div class="text-[13px] text-base-content/60 tabular-nums">{{ c.phone }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.crm-row:hover {
  background: var(--color-base-200);
}
</style>
