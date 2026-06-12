<script setup lang="ts">
import { computed } from 'vue'
import { Calendar, MessageSquare, ListChecks } from 'lucide-vue-next'
import CrmAvatar from './CrmAvatar.vue'
import CrmHealthDot from './CrmHealthDot.vue'
import { useCrmStore } from '@/stores/crm'
import { useTeamStore } from '@/stores/team'
import { userColor } from '@/lib/userColor'
import { fmtMoney, type Deal } from '@/lib/crmData'

const props = defineProps<{ deal: Deal }>()
const emit = defineEmits<{
  (e: 'open', deal: Deal): void
}>()

const crm = useCrmStore()
const team = useTeamStore()
const co = computed(() => crm.company(props.deal.companyId))
const ownerProfile = computed(() => (props.deal.ownerId ? team.profiles[props.deal.ownerId] : null))
const taskN = computed(() => crm.linkedTasks(props.deal.id).length)
</script>

<template>
  <div
    class="crm-card flex flex-col gap-[9px] px-[13px] py-[11px]"
    role="button"
    tabindex="0"
    @click="emit('open', deal)"
    @keydown.enter.prevent="emit('open', deal)"
  >
    <div class="flex items-center gap-2">
      <CrmAvatar :name="co?.name" :initials="co?.initials" :color="co?.color" :size="24" :radius="7" />
      <div class="min-w-0 flex-1">
        <div class="text-xs font-bold text-base-content/60 truncate">{{ co?.name }}</div>
      </div>
      <CrmHealthDot :health="deal.health" />
    </div>

    <div class="text-sm font-semibold text-base-content leading-snug line-clamp-2">{{ deal.title }}</div>

    <div class="flex items-center gap-2">
      <span class="text-base font-extrabold text-base-content tracking-tight">{{ fmtMoney(deal.value) }}</span>
      <div class="flex-1" />
      <span class="inline-flex items-center gap-1 text-[11.5px] text-base-content/40">
        <Calendar :size="12" :stroke-width="1.9" /> {{ deal.close }}
      </span>
    </div>

    <!-- ecosystem links -->
    <div class="flex items-center gap-[7px] pt-2 border-t border-base-200">
      <span
        v-if="deal.channelName"
        class="inline-flex items-center gap-1 px-[7px] py-0.5 rounded-md text-[10.5px] font-bold"
        :style="{ background: 'var(--accent-soft)', color: 'var(--accent-fg)' }"
        :title="'Linked channel #' + deal.channelName"
      >
        <MessageSquare :size="11" :stroke-width="2" /> chat
      </span>
      <span
        v-if="taskN > 0"
        class="inline-flex items-center gap-1 px-[7px] py-0.5 rounded-md text-[10.5px] font-bold bg-base-200 text-base-content/60"
        :title="taskN + ' linked task' + (taskN > 1 ? 's' : '') + ' in the tracker'"
      >
        <ListChecks :size="11" :stroke-width="2" /> {{ taskN }}
      </span>
      <div class="flex-1" />
      <CrmAvatar
        :name="ownerProfile?.full_name ?? 'Unassigned'"
        :avatar-url="ownerProfile?.avatar_url"
        :color="deal.ownerId ? userColor(deal.ownerId) : 'var(--accent)'"
        :size="21"
        :radius="6"
      />
    </div>
  </div>
</template>

<style scoped>
.crm-card {
  background: var(--color-base-100);
  border: 1px solid var(--color-base-300);
  border-radius: 11px;
  box-shadow: var(--sh-card);
  cursor: pointer;
  transition: border-color 0.13s, box-shadow 0.13s, transform 0.13s;
}
.crm-card:hover {
  border-color: var(--accent-bord);
  box-shadow: var(--sh-pop);
  transform: translateY(-1px);
}
.crm-card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
</style>
