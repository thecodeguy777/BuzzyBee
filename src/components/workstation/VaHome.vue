<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  AlertTriangle,
  Briefcase,
  CalendarClock,
  Clock,
  ListTodo,
  Moon,
  Play,
  Square,
  Sun
} from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'
import { useTimeStore } from '@/stores/time'
import { useBusinessCalendar } from '@/composables/useBusinessCalendar'
import { useVaDashboard } from '@/composables/useVaDashboard'
import { formatHours } from '@/lib/format'
import { localTimeIn, isDaytime } from '@/lib/timezones'
import HexAvatar from '@/components/shared/HexAvatar.vue'
import PulseStatCard from '@/components/workstation/home/PulseStatCard.vue'
import NeedsAttention from '@/components/workstation/home/NeedsAttention.vue'
import UpcomingMeetings from '@/components/workstation/home/UpcomingMeetings.vue'

const auth = useAuthStore()
const clients = useClientsStore()
const time = useTimeStore()
const router = useRouter()

const { now, todayStart, weekStart, todayStr, isOverdue, greeting, todayLabel } =
  useBusinessCalendar()
const {
  loading,
  errorMsg,
  myOpenTasks,
  overdueTasks,
  dueTodayTasks,
  completedThisWeek,
  hoursTodaySeconds,
  myClientRows,
  alerts,
  goClient
} = useVaDashboard({ todayStart, weekStart, todayStr, isOverdue })

// ── Clock in/out — the VA's first and last action of the day ─────────────────
const clockBusy = ref(false)
async function toggleClock() {
  if (clockBusy.value) return
  clockBusy.value = true
  try {
    if (time.isRunning) await time.clockOut()
    else await time.clockIn()
  } finally {
    clockBusy.value = false
  }
}
const runningClientName = computed(() => {
  const cid = time.currentEntry?.client_id
  return cid ? (clients.clients.find((c) => c.id === cid)?.name ?? null) : null
})
const currentClientName = computed(
  () => clients.clients.find((c) => c.id === clients.currentClientId)?.name ?? null
)
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
                ? 'Pulling your day together…'
                : overdueTasks.length > 0
                  ? `${overdueTasks.length} overdue — catch up first.`
                  : dueTodayTasks.length > 0
                    ? `${dueTodayTasks.length} due today.`
                    : 'All clear — pick your next task.'
            }}
          </span>
        </h1>
      </div>

      <!-- Clock control -->
      <div class="hidden sm:flex flex-col items-end gap-1 shrink-0">
        <button
          type="button"
          class="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-60"
          style="background: var(--hc-ink); color: var(--hc-paper);"
          :disabled="clockBusy"
          @click="toggleClock"
        >
          <template v-if="time.isRunning">
            <span class="relative flex h-2 w-2">
              <span class="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 animate-ping" />
              <span class="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
            <span class="tabular-nums">{{ formatHours(time.elapsedSeconds) }}</span>
            <Square class="w-3 h-3" :stroke-width="2" />
            Clock out
          </template>
          <template v-else>
            <Play class="w-3.5 h-3.5" :stroke-width="2" />
            Clock in
          </template>
        </button>
        <span class="text-[0.68rem] text-base-content/50 truncate max-w-44">
          {{
            time.isRunning
              ? `on ${runningClientName ?? '…'}`
              : currentClientName
                ? `to ${currentClientName}`
                : 'select a client first'
          }}
        </span>
      </div>
    </header>

    <!-- Error banner -->
    <div
      v-if="errorMsg"
      class="rounded-xl border border-error/30 bg-error/5 px-4 py-2.5 text-sm text-error flex items-center gap-2"
    >
      <AlertTriangle class="w-4 h-4 shrink-0" :stroke-width="1.75" />
      {{ errorMsg }}
    </div>

    <!-- Today's pulse -->
    <section class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <PulseStatCard
        :icon="CalendarClock"
        label="Due today"
        :value="dueTodayTasks.length"
        :sub="dueTodayTasks.length === 0 ? 'nothing due today' : 'due by end of day'"
        clickable
        :loading="loading"
        @select="router.push({ name: 'workstation-my-tasks' })"
      />
      <PulseStatCard
        :icon="ListTodo"
        label="My open tasks"
        :value="myOpenTasks.length"
        :sub="`${completedThisWeek} done this week`"
        clickable
        :loading="loading"
        @select="router.push({ name: 'workstation-my-tasks' })"
      />
      <PulseStatCard
        :icon="Clock"
        label="Hours today"
        :value="formatHours(hoursTodaySeconds)"
        :sub="time.isRunning ? `clocked in · ${runningClientName ?? '…'}` : 'clocked out'"
        clickable
        @select="router.push({ name: 'workstation-time' })"
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

    <!-- Needs attention — my overdue + due today -->
    <NeedsAttention :alerts="alerts" :loading="loading" />

    <!-- My next scheduled meetings (hidden when none) -->
    <UpcomingMeetings />

    <!-- My clients -->
    <section class="bg-base-100 border border-base-300 rounded-2xl p-4 shadow-hc-1">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-semibold flex items-center gap-2">
          <Briefcase class="w-4 h-4 text-base-content/60" :stroke-width="1.75" />
          My clients
        </h2>
        <span
          v-if="!loading"
          class="text-[0.65rem] uppercase tracking-wider text-base-content/40 font-semibold"
        >
          {{ myClientRows.length }} active
        </span>
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

      <div v-else-if="myClientRows.length" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <button
          v-for="c in myClientRows"
          :key="c.id"
          type="button"
          class="flex items-center gap-3 p-2.5 rounded-lg border transition-all text-left"
          :class="
            c.is_current
              ? 'border-primary/40 bg-primary/5'
              : 'border-base-200 hover:border-base-content/20 hover:bg-base-200/40'
          "
          @click="goClient(c.id)"
        >
          <HexAvatar :name="c.name" :size="36" tint="primary" class="shrink-0" />
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium truncate flex items-center gap-1.5">
              {{ c.name }}
              <span
                v-if="c.is_current"
                class="text-[0.6rem] font-semibold uppercase tracking-wider text-primary shrink-0"
              >
                Current
              </span>
            </div>
            <div class="text-[0.65rem] text-base-content/60 flex items-center gap-1.5 mt-0.5 tabular-nums">
              <template v-if="c.timezone && localTimeIn(c.timezone, now)">
                <component
                  :is="isDaytime(c.timezone, now) ? Sun : Moon"
                  class="w-2.5 h-2.5"
                  :stroke-width="1.75"
                />
                {{ localTimeIn(c.timezone, now) }}
                <span class="text-base-content/30">·</span>
              </template>
              <ListTodo class="w-2.5 h-2.5" :stroke-width="1.75" />
              {{ c.open_tasks }}
              <template v-if="c.overdue_tasks > 0">
                <span class="text-base-content/30">·</span>
                <span class="inline-flex items-center gap-0.5 text-error font-medium">
                  <AlertTriangle class="w-2.5 h-2.5" :stroke-width="1.75" />
                  {{ c.overdue_tasks }}
                </span>
              </template>
            </div>
          </div>
        </button>
      </div>

      <p v-else class="text-xs italic text-base-content/40 px-1 py-2">
        No active assignments yet — your PM will set you up.
      </p>
    </section>
  </div>
</template>
