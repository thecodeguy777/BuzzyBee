<script setup lang="ts">
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-vue-next'
import { alertMeta, type Alert } from '@/composables/usePmDashboard'

defineProps<{ alerts: Alert[]; loading?: boolean }>()
</script>

<template>
  <div class="bg-white border border-base-300 rounded-2xl p-4 shadow-hc-1">
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-sm font-semibold flex items-center gap-2">
        <AlertTriangle class="w-4 h-4 text-base-content/60" :stroke-width="1.75" />
        Needs attention
      </h2>
      <span
        v-if="!loading"
        class="text-[0.65rem] uppercase tracking-wider text-base-content/40 font-semibold"
      >
        {{ alerts.length }} item{{ alerts.length === 1 ? '' : 's' }}
      </span>
    </div>

    <!-- Loading -->
    <ul v-if="loading" class="divide-y divide-base-200">
      <li v-for="n in 3" :key="n" class="py-2 flex items-center gap-3">
        <div class="w-7 h-7 rounded-md bg-base-200 animate-pulse shrink-0" />
        <div class="flex-1 space-y-1.5">
          <div class="h-3.5 w-1/2 rounded bg-base-200 animate-pulse" />
          <div class="h-2.5 w-1/3 rounded bg-base-200 animate-pulse" />
        </div>
      </li>
    </ul>

    <!-- Loaded with items -->
    <ul v-else-if="alerts.length" class="divide-y divide-base-200">
      <li v-for="(a, i) in alerts" :key="`${a.kind}-${a.label}-${i}`">
        <button
          type="button"
          class="w-full text-left py-2 flex items-center gap-3 hover:bg-base-200/40 -mx-2 px-2 rounded-md transition-colors"
          @click="a.onClick()"
        >
          <div
            class="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
            :class="alertMeta[a.kind].class"
          >
            <component :is="alertMeta[a.kind].icon" class="w-3.5 h-3.5" :stroke-width="1.75" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium truncate">{{ a.label }}</div>
            <div class="text-[0.7rem] text-base-content/50 truncate">
              {{ alertMeta[a.kind].label }}<span v-if="a.detail"> · {{ a.detail }}</span>
            </div>
          </div>
          <ArrowRight class="w-3.5 h-3.5 text-base-content/30 shrink-0" :stroke-width="1.75" />
        </button>
      </li>
    </ul>

    <!-- Loaded, empty -->
    <div v-else class="py-6 text-center text-xs text-base-content/50">
      <CheckCircle2 class="w-6 h-6 mx-auto text-success/60" :stroke-width="1.5" />
      <p class="mt-2">Nothing on fire. Nice.</p>
    </div>
  </div>
</template>
