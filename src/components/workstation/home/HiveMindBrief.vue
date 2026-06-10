<script setup lang="ts">
import { Sparkles } from 'lucide-vue-next'
import type { Suggestion } from '@/composables/usePmDashboard'

defineProps<{
  headline: { lead: string; tail: string }
  suggestions: Suggestion[]
  loading?: boolean
}>()
</script>

<template>
  <section
    class="rounded-2xl p-5 sm:p-6 shadow-hc-1 border"
    style="background: var(--hc-surface); border-color: var(--hc-divider);"
  >
    <div class="flex items-center gap-2 mb-3">
      <Sparkles class="w-3.5 h-3.5" :stroke-width="1.5" style="color: var(--hc-accent)" />
      <span
        class="text-[0.7rem] uppercase tracking-[0.08em] font-semibold"
        style="color: var(--hc-accent)"
      >
        HiveMindAI · this week's brief
      </span>
      <div class="flex-1" />
      <span class="text-[0.65rem] text-base-content/40">Synthesized from live data</span>
    </div>

    <div v-if="loading" class="space-y-2">
      <div class="h-5 w-3/4 rounded bg-base-200 animate-pulse" />
      <div class="h-5 w-1/2 rounded bg-base-200 animate-pulse" />
    </div>

    <template v-else>
      <p class="font-display text-[1.05rem] sm:text-base leading-relaxed text-base-content/85 font-normal">
        <strong class="font-medium text-base-content">{{ headline.lead }}</strong
        ><span class="italic text-base-content/60">{{ headline.tail }}</span>
      </p>

      <div v-if="suggestions.length" class="mt-4 grid sm:grid-cols-3 gap-2">
        <button
          v-for="(s, i) in suggestions"
          :key="s.title + i"
          type="button"
          class="text-left flex items-start gap-2.5 p-3 rounded-xl border transition-all hover:shadow-hc-1"
          style="background: var(--hc-surface-warm); border-color: var(--hc-divider);"
          @click="s.onClick?.()"
        >
          <div
            class="w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5"
            style="background: var(--hc-accent-bg); color: var(--hc-accent);"
          >
            <Sparkles class="w-3 h-3" :stroke-width="1.5" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium leading-snug">{{ s.title }}</div>
            <div class="text-[0.7rem] text-base-content/55 mt-0.5 leading-snug">{{ s.detail }}</div>
          </div>
        </button>
      </div>
    </template>
  </section>
</template>
