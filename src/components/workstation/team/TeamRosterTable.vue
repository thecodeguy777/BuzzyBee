<script setup lang="ts">
import { UserCheck, UserX } from 'lucide-vue-next'
import MemberAvatar from './MemberAvatar.vue'
import RoleChip from './RoleChip.vue'
import CapacityBar from './CapacityBar.vue'
import ClientStack from './ClientStack.vue'
import CountPill from './CountPill.vue'
import type { TeamMemberRow } from './capacity'

defineProps<{ rows: TeamMemberRow[]; admin: boolean }>()
const emit = defineEmits<{
  (e: 'open', id: string): void
  (e: 'toggle-active', id: string): void
}>()

const GRID = 'minmax(220px,1.4fr) 112px 150px minmax(130px,1fr) 60px 72px 64px 36px'
</script>

<template>
  <div class="border border-base-300 rounded-[13px] overflow-hidden bg-base-100 shadow-[var(--sh-card)]">
    <!-- header -->
    <div
      class="grid items-center gap-3.5 px-4 h-[42px] border-b border-base-300 bg-base-200/60 overflow-hidden"
      :style="{ gridTemplateColumns: GRID }"
    >
      <span class="tr-head">Member</span>
      <span class="tr-head">Role</span>
      <span class="tr-head">Workload</span>
      <span class="tr-head">Clients</span>
      <span class="tr-head text-center">Open</span>
      <span class="tr-head text-center">Overdue</span>
      <span class="tr-head text-center">Done</span>
      <span />
    </div>

    <button
      v-for="m in rows"
      :key="m.id"
      type="button"
      class="group/row w-full grid items-center gap-3.5 px-4 h-16 text-left border-b border-base-200 last:border-b-0 hover:bg-base-200/40 transition-colors"
      :class="m.inactive && 'opacity-50'"
      :style="{ gridTemplateColumns: GRID }"
      @click="emit('open', m.id)"
    >
      <div class="flex items-center gap-3 min-w-0">
        <MemberAvatar :name="m.name" :email="m.email" :avatar-url="m.avatarUrl" :online="m.online" :size="38" />
        <div class="min-w-0">
          <div class="text-sm font-bold truncate flex items-center gap-1.5">
            <span class="truncate">{{ m.name }}</span>
            <span
              v-if="m.inactive"
              class="text-[0.6rem] font-bold uppercase px-1.5 py-px rounded bg-base-200 text-base-content/50 shrink-0"
            >Inactive</span>
          </div>
          <div class="text-xs text-base-content/50 truncate">{{ m.email }}</div>
        </div>
      </div>
      <div><RoleChip :role="m.role" /></div>
      <div><CapacityBar :seconds="m.seconds" /></div>
      <div><ClientStack :clients="m.clients" /></div>
      <div class="text-center"><CountPill :n="m.open" kind="open" /></div>
      <div class="text-center"><CountPill :n="m.overdue" kind="overdue" /></div>
      <div class="text-center"><CountPill :n="m.done" kind="done" /></div>
      <span
        v-if="admin"
        role="button"
        class="opacity-0 group-hover/row:opacity-100 w-7 h-7 rounded-md grid place-items-center transition-opacity"
        :class="m.inactive
          ? 'text-success hover:bg-base-300/60'
          : 'text-base-content/30 hover:text-error hover:bg-base-300/60'"
        :title="m.inactive ? 'Reactivate account' : 'Deactivate account'"
        @click.stop="emit('toggle-active', m.id)"
      >
        <component :is="m.inactive ? UserCheck : UserX" class="w-3.5 h-3.5" :stroke-width="1.75" />
      </span>
      <span v-else />
    </button>
  </div>
</template>

<style scoped>
.tr-head {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-base-content);
  opacity: 0.45;
  white-space: nowrap;
}
</style>
