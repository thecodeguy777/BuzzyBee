<script setup lang="ts">
import { ListTodo, Flag } from 'lucide-vue-next'
import MemberAvatar from './MemberAvatar.vue'
import RoleChip from './RoleChip.vue'
import CapacityBar from './CapacityBar.vue'
import ClientStack from './ClientStack.vue'
import type { TeamMemberRow } from './capacity'

defineProps<{ rows: TeamMemberRow[] }>()
const emit = defineEmits<{ (e: 'open', id: string): void }>()
</script>

<template>
  <div class="grid gap-3.5" style="grid-template-columns: repeat(auto-fill, minmax(268px, 1fr))">
    <button
      v-for="m in rows"
      :key="m.id"
      type="button"
      class="team-card p-4 flex flex-col gap-3 text-left"
      :class="m.inactive && 'opacity-50'"
      @click="emit('open', m.id)"
    >
      <div class="flex items-center gap-2.5 min-w-0">
        <MemberAvatar :name="m.name" :email="m.email" :avatar-url="m.avatarUrl" :online="m.online" :size="42" />
        <div class="min-w-0 flex-1">
          <div class="text-sm font-bold truncate">{{ m.name }}</div>
          <div class="text-[0.72rem] text-base-content/50 truncate">{{ m.timezone || m.email }}</div>
        </div>
        <RoleChip :role="m.role" />
      </div>
      <CapacityBar :seconds="m.seconds" />
      <div class="flex items-center gap-2 pt-3 border-t border-base-200">
        <ClientStack :clients="m.clients" :size="22" />
        <div class="flex-1" />
        <span class="inline-flex items-center gap-1 text-[0.72rem] text-base-content/60">
          <ListTodo class="w-3.5 h-3.5" :stroke-width="1.9" /> {{ m.open }} open
        </span>
        <span
          v-if="m.overdue > 0"
          class="inline-flex items-center gap-1 text-[0.72rem] font-semibold"
          style="color: var(--st-block-fg)"
        >
          <Flag class="w-3 h-3" :stroke-width="2" /> {{ m.overdue }}
        </span>
      </div>
    </button>
  </div>
</template>

<style scoped>
.team-card {
  background: var(--color-base-100);
  border: 1px solid var(--color-base-300);
  border-radius: 11px;
  box-shadow: var(--sh-card);
  cursor: pointer;
  transition: border-color 0.13s, box-shadow 0.13s, transform 0.13s;
}
.team-card:hover {
  border-color: var(--accent-bord);
  box-shadow: var(--sh-pop);
  transform: translateY(-1px);
}
</style>
