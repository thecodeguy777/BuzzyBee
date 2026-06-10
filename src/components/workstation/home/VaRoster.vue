<script setup lang="ts">
import { UsersRound, ArrowRight, Clock, ListTodo, AlertTriangle } from 'lucide-vue-next'
import HexAvatar from '@/components/shared/HexAvatar.vue'
import { formatHours } from '@/lib/format'
import type { VaCard } from '@/composables/usePmDashboard'

defineProps<{ vaCards: VaCard[]; loading?: boolean }>()
defineEmits<{ open: [id: string]; 'see-all': [] }>()
</script>

<template>
  <section class="bg-white border border-base-300 rounded-2xl p-4 shadow-hc-1">
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-sm font-semibold flex items-center gap-2">
        <UsersRound class="w-4 h-4 text-base-content/60" :stroke-width="1.75" />
        Your team
      </h2>
      <button
        type="button"
        class="text-[0.65rem] uppercase tracking-wider font-semibold text-primary hover:underline flex items-center gap-1"
        @click="$emit('see-all')"
      >
        See all
        <ArrowRight class="w-3 h-3" :stroke-width="1.75" />
      </button>
    </div>

    <div v-if="loading" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
      <div v-for="n in 3" :key="n" class="flex items-center gap-3 p-2.5 rounded-lg border border-base-200">
        <div class="w-9 h-9 rounded-lg bg-base-200 animate-pulse shrink-0" />
        <div class="flex-1 space-y-1.5">
          <div class="h-3.5 w-2/3 rounded bg-base-200 animate-pulse" />
          <div class="h-2.5 w-1/2 rounded bg-base-200 animate-pulse" />
        </div>
      </div>
    </div>

    <div v-else-if="vaCards.length" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
      <button
        v-for="v in vaCards"
        :key="v.id"
        type="button"
        class="flex items-center gap-3 p-2.5 rounded-lg border border-base-200 hover:border-base-content/20 hover:bg-base-200/40 transition-all text-left"
        @click="$emit('open', v.id)"
      >
        <HexAvatar
          :avatar-url="v.avatar_url"
          :name="v.name"
          :email="v.email"
          :size="36"
          class="shrink-0"
        />
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium truncate">{{ v.name }}</div>
          <div class="text-[0.65rem] text-base-content/60 flex items-center gap-1.5 mt-0.5 tabular-nums">
            <Clock class="w-2.5 h-2.5" :stroke-width="1.75" />
            {{ formatHours(v.hours_today) }} today
            <span class="text-base-content/30">·</span>
            <ListTodo class="w-2.5 h-2.5" :stroke-width="1.75" />
            {{ v.open_tasks }}
            <template v-if="v.overdue_tasks > 0">
              <span class="text-base-content/30">·</span>
              <span class="inline-flex items-center gap-0.5 text-error font-medium">
                <AlertTriangle class="w-2.5 h-2.5" :stroke-width="1.75" />
                {{ v.overdue_tasks }}
              </span>
            </template>
          </div>
        </div>
      </button>
    </div>

    <p v-else class="text-xs italic text-base-content/40 px-1 py-2">
      No VAs on your team yet.
    </p>
  </section>
</template>
