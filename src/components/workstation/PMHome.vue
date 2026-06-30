<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { UsersRound, Briefcase, Clock, AlertTriangle, Sparkles } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'
import { useTeamStore } from '@/stores/team'
import { useBusinessCalendar } from '@/composables/useBusinessCalendar'
import { useTeamHours } from '@/composables/useTeamHours'
import { usePmDashboard } from '@/composables/usePmDashboard'
import { formatHours } from '@/lib/format'
import AmbientHive from '@/components/workstation/home/AmbientHive.vue'
import PulseStatCard from '@/components/workstation/home/PulseStatCard.vue'
import NeedsAttention from '@/components/workstation/home/NeedsAttention.vue'
import BuzzyHiveBrief from '@/components/workstation/home/BuzzyHiveBrief.vue'
import VaRoster from '@/components/workstation/home/VaRoster.vue'
import ClientRoster from '@/components/workstation/home/ClientRoster.vue'

const auth = useAuthStore()
const clients = useClientsStore()
const team = useTeamStore()
const router = useRouter()

const { now, weekStart, isOverdue, greeting, todayLabel } = useBusinessCalendar()
const { hoursTodayByVa, hoursWeekByVa, totalHoursWeek, dailySeconds, loading: hoursLoading } =
  useTeamHours(now)
const {
  loading,
  errorMsg,
  allOpenTasks,
  overdueTasks,
  completedThisWeek,
  activeClients,
  headline,
  suggestions,
  alerts,
  vaCards,
  clientRows,
  goVa,
  goClient
} = usePmDashboard({ weekStart, isOverdue }, { hoursTodayByVa, hoursWeekByVa })

// "Plan my week" focuses the AI brief — the one place that proposes concrete moves.
const briefAnchor = ref<HTMLElement | null>(null)
function planMyWeek() {
  briefAnchor.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div class="space-y-6">
    <!-- Hero -->
    <header
      class="rounded-2xl border px-6 py-5 sm:px-7 sm:py-6 flex items-center gap-5 shadow-hc-1"
      style="
        background: linear-gradient(135deg, var(--hc-accent-bg) 0%, var(--hc-surface-warm) 100%);
        border-color: var(--hc-accent-soft);
      "
    >
      <div class="flex-1 min-w-0">
        <p class="text-[0.7rem] uppercase tracking-[0.08em] text-base-content/60 font-medium mb-1.5">
          {{ todayLabel }}
        </p>
        <h1 class="font-display text-2xl sm:text-[1.8rem] font-medium leading-tight">
          {{ greeting }}, <span style="color: var(--hc-accent)">{{ auth.firstName || 'there' }}</span>.
          <span class="italic font-normal text-base-content/50">
            {{
              loading
                ? 'Pulling your week together…'
                : overdueTasks.length > 0
                  ? `${overdueTasks.length} ${overdueTasks.length === 1 ? 'task is' : 'things are'} overdue.`
                  : alerts.length > 0
                    ? `${alerts.length} ${alerts.length === 1 ? 'thing needs' : 'things need'} you this week.`
                    : 'Nothing urgent — a good day to plan.'
            }}
          </span>
        </h1>
      </div>
      <button
        type="button"
        class="hidden sm:inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium shrink-0 transition-transform hover:scale-[1.02] active:scale-95"
        style="background: var(--hc-ink); color: var(--hc-paper);"
        @click="planMyWeek"
      >
        <Sparkles class="w-3.5 h-3.5" :stroke-width="1.5" />
        Plan my week
      </button>
    </header>

    <!-- The Hive — live presence -->
    <AmbientHive />

    <!-- Error banner -->
    <div
      v-if="errorMsg"
      class="rounded-xl border border-error/30 bg-error/5 px-4 py-2.5 text-sm text-error flex items-center gap-2"
    >
      <AlertTriangle class="w-4 h-4 shrink-0" :stroke-width="1.75" />
      Couldn't load part of your dashboard: {{ errorMsg }}
    </div>

    <!-- Today's pulse -->
    <section class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <PulseStatCard
        :icon="UsersRound"
        label="VAs on team"
        :value="team.myTeam.length"
        :sub="`${allOpenTasks.length} open · ${completedThisWeek} done`"
        clickable
        :loading="loading"
        @select="router.push({ name: 'workstation-team' })"
      />
      <PulseStatCard
        :icon="Briefcase"
        label="Active clients"
        :value="activeClients.length"
        :sub="`across ${clients.clients.length} total`"
        clickable
        :loading="loading"
        @select="router.push({ name: 'workstation-clients' })"
      />
      <PulseStatCard
        :icon="Clock"
        label="Hours this week"
        :value="formatHours(totalHoursWeek)"
        sub="team total · last 7 days"
        :sparkline="dailySeconds"
        :loading="hoursLoading && totalHoursWeek === 0"
      />
      <PulseStatCard
        :icon="AlertTriangle"
        label="Overdue"
        :value="overdueTasks.length"
        :sub="overdueTasks.length === 0 ? 'all clear' : 'past due — needs attention'"
        :tone="overdueTasks.length > 0 ? 'error' : 'default'"
        :loading="loading"
      />
    </section>

    <!-- Needs attention — highest-value block, promoted full-width -->
    <NeedsAttention :alerts="alerts" :loading="loading" />

    <!-- BuzzyHiveAI brief -->
    <div ref="briefAnchor" class="scroll-mt-4">
      <BuzzyHiveBrief :headline="headline" :suggestions="suggestions" :loading="loading" />
    </div>

    <!-- Rosters -->
    <VaRoster
      :va-cards="vaCards"
      :loading="loading"
      @open="goVa"
      @see-all="router.push({ name: 'workstation-team' })"
    />
    <ClientRoster
      :client-rows="clientRows"
      :loading="loading"
      @open="goClient"
      @manage="router.push({ name: 'workstation-clients' })"
    />
  </div>
</template>
