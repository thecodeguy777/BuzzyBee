<script setup lang="ts">
import { Briefcase, ArrowRight } from 'lucide-vue-next'
import type { ClientRow } from '@/composables/usePmDashboard'

defineProps<{ clientRows: ClientRow[]; loading?: boolean }>()
defineEmits<{ open: [id: string]; manage: [] }>()

const statusDot: Record<string, string> = {
  active: 'bg-success',
  paused: 'bg-warning',
  archived: 'bg-base-content/30'
}
</script>

<template>
  <section class="bg-base-100 border border-base-300 rounded-2xl p-4 shadow-hc-1">
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-sm font-semibold flex items-center gap-2">
        <Briefcase class="w-4 h-4 text-base-content/60" :stroke-width="1.75" />
        Clients
      </h2>
      <button
        type="button"
        class="text-[0.65rem] uppercase tracking-wider font-semibold text-primary hover:underline flex items-center gap-1"
        @click="$emit('manage')"
      >
        Manage
        <ArrowRight class="w-3 h-3" :stroke-width="1.75" />
      </button>
    </div>

    <div v-if="loading" class="space-y-2">
      <div v-for="n in 4" :key="n" class="h-8 rounded bg-base-200 animate-pulse" />
    </div>

    <div v-else-if="clientRows.length" class="overflow-x-auto -mx-1">
      <table class="w-full text-sm">
        <thead class="text-[0.65rem] uppercase tracking-wider text-base-content/50 font-semibold">
          <tr>
            <th scope="col" class="text-left px-2 py-1.5">Client</th>
            <th scope="col" class="text-left px-2 py-1.5">Primary PM</th>
            <th scope="col" class="text-right px-2 py-1.5">Overdue</th>
            <th scope="col" class="text-right px-2 py-1.5">Open</th>
            <th scope="col" class="text-left px-2 py-1.5">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in clientRows"
            :key="row.id"
            class="border-t border-base-200 hover:bg-base-200/40 cursor-pointer transition-colors"
            tabindex="0"
            role="button"
            @click="$emit('open', row.id)"
            @keydown.enter="$emit('open', row.id)"
            @keydown.space.prevent="$emit('open', row.id)"
          >
            <td class="px-2 py-2 font-medium">
              <span :class="{ 'text-warning': !row.has_primary }">{{ row.name }}</span>
            </td>
            <td class="px-2 py-2" :class="row.has_primary ? 'text-base-content/70' : 'text-warning'">
              {{ row.primary_pm }}
            </td>
            <td class="px-2 py-2 text-right font-mono tabular-nums">
              <span v-if="row.overdue_tasks > 0" class="text-error font-medium">{{ row.overdue_tasks }}</span>
              <span v-else class="text-base-content/30">—</span>
            </td>
            <td class="px-2 py-2 text-right font-mono tabular-nums">{{ row.open_tasks }}</td>
            <td class="px-2 py-2">
              <span class="inline-flex items-center gap-1.5 text-[0.7rem] capitalize">
                <span class="w-1.5 h-1.5 rounded-full" :class="statusDot[row.status] ?? 'bg-base-content/30'" />
                {{ row.status }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-else class="text-xs italic text-base-content/40 px-1 py-2">
      No clients yet.
    </p>
  </section>
</template>
