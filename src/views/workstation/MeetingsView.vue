<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Video, Plus, Zap, Search, CalendarClock } from 'lucide-vue-next'
import { useMeetingsStore, type Meeting } from '@/stores/meetings'
import { useAuthStore } from '@/stores/auth'
import { createMeetingRoom } from '@/lib/meetingRoom'
import NextMeetingHero from '@/components/workstation/meetings/NextMeetingHero.vue'
import UpcomingMeetingRow from '@/components/workstation/meetings/UpcomingMeetingRow.vue'
import PastMeetingRow from '@/components/workstation/meetings/PastMeetingRow.vue'
import ScheduleMeetingModal from '@/components/workstation/meetings/ScheduleMeetingModal.vue'
import MeetingInviteModal from '@/components/workstation/meetings/MeetingInviteModal.vue'
import MeetingTranscriptModal from '@/components/workstation/meetings/MeetingTranscriptModal.vue'
import { startOf } from '@/lib/meetingDisplay'

// Layout follows the Meetings.html design: next-up hero + "later" rows,
// day-grouped past list, Upcoming/Past/All tabs with search. Rows and modals
// are components under components/workstation/meetings/; modals mount on
// demand so their state is born fresh per open.

const store = useMeetingsStore()
const auth = useAuthStore()
onMounted(() => { if (!store.loaded) void store.load() })

// One shared clock for countdown/relative labels.
const now = ref(Date.now())
const tick = window.setInterval(() => (now.value = Date.now()), 30_000)
onUnmounted(() => window.clearInterval(tick))

// ── Tabs + search ─────────────────────────────────────────────────────────────
type Tab = 'upcoming' | 'past' | 'all'
const tab = ref<Tab>('upcoming')
const query = ref('')
const matches = (m: Meeting) => m.title.toLowerCase().includes(query.value.trim().toLowerCase())

const upcoming = computed(() => store.upcoming.filter(matches))
const past = computed(() => store.past.filter(matches))
const nextUp = computed(() => upcoming.value[0] ?? null)
const later = computed(() => upcoming.value.slice(1))

// Past grouped by local day, newest day first (rows within already sorted).
const pastDays = computed(() => {
  const groups = new Map<string, { label: string; rows: Meeting[] }>()
  for (const m of past.value.slice(0, 60)) {
    const d = new Date(startOf(m))
    const key = d.toDateString()
    if (!groups.has(key)) {
      groups.set(key, {
        label: d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
        rows: []
      })
    }
    groups.get(key)!.rows.push(m)
  }
  return [...groups.values()]
})

const showUpcoming = computed(() => tab.value === 'upcoming' || tab.value === 'all')
const showPast = computed(() => tab.value === 'past' || tab.value === 'all')

// ── Actions ───────────────────────────────────────────────────────────────────
const scheduling = ref(false)
const rebookFrom = ref<Meeting | null>(null)
const inviting = ref<Meeting | null>(null)
const viewing = ref<Meeting | null>(null)

function openSchedule() {
  rebookFrom.value = null
  scheduling.value = true
}
function rebook(m: Meeting) {
  rebookFrom.value = m
  viewing.value = null
  scheduling.value = true
}
function closeSchedule() {
  scheduling.value = false
  rebookFrom.value = null
  void store.load() // pick up invites sent from the created panel
}

const startingInstant = ref(false)
async function startInstant() {
  if (!auth.user || startingInstant.value) return
  startingInstant.value = true
  try {
    const token = await createMeetingRoom(auth.user.id)
    window.open('/meet/' + token, '_blank', 'noopener')
  } catch (e) {
    alert((e as Error).message)
  } finally {
    startingInstant.value = false
  }
}

async function cancelMeeting(m: Meeting) {
  if (!confirm(`Cancel "${m.title}"? The link stops working for everyone.`)) return
  try {
    await store.cancel(m.id)
  } catch (e) {
    alert((e as Error).message)
  }
}
</script>

<template>
  <div class="max-w-[1080px] mx-auto space-y-5">
    <!-- Header -->
    <header class="flex items-start gap-4 flex-wrap">
      <span class="w-[46px] h-[46px] rounded-[13px] grid place-items-center text-primary shrink-0" style="background: var(--accent-soft)">
        <Video class="w-6 h-6" :stroke-width="1.8" />
      </span>
      <div>
        <h1 class="font-display text-[1.6rem] font-extrabold tracking-tight leading-tight">Meetings</h1>
        <p class="text-sm text-base-content/60 mt-0.5 max-w-lg">Schedule a link and email the invite. Guests join from the browser, no account needed.</p>
      </div>
      <div class="flex-1" />
      <div class="flex items-center gap-2.5">
        <button
          type="button"
          class="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-[11px] text-sm font-bold bg-base-100 border border-base-300 hover:border-primary/40 hover:text-primary transition-colors"
          :disabled="startingInstant"
          @click="startInstant"
        >
          <Zap class="w-4 h-4" :stroke-width="2" />
          {{ startingInstant ? 'Starting…' : 'Start instant' }}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-2 px-4 py-2.5 rounded-[11px] text-sm font-bold text-primary-content bg-primary shadow-[0_6px_16px_-6px_rgba(97,31,105,.55)] hover:opacity-90 hover:-translate-y-px transition-all"
          @click="openSchedule"
        >
          <Plus class="w-4 h-4" :stroke-width="2.2" />
          Schedule meeting
        </button>
      </div>
    </header>

    <!-- Toolbar -->
    <div class="flex items-center gap-3 flex-wrap">
      <div class="flex gap-0.5 bg-base-100 border border-base-300 p-1 rounded-xl">
        <button
          v-for="t in (['upcoming', 'past', 'all'] as const)"
          :key="t"
          type="button"
          class="flex items-center gap-1.5 px-3.5 py-2 rounded-[9px] text-[0.82rem] font-bold capitalize transition-colors"
          :class="tab === t ? 'text-primary' : 'text-base-content/55 hover:text-base-content'"
          :style="tab === t ? 'background: var(--accent-soft)' : ''"
          @click="tab = t"
        >
          {{ t }}
          <span
            v-if="t !== 'all'"
            class="text-[0.68rem] font-extrabold px-1.5 py-px rounded-full"
            :class="tab === t ? 'bg-base-100 text-primary' : 'bg-base-200 text-base-content/45'"
          >{{ t === 'upcoming' ? store.upcoming.length : store.past.length }}</span>
        </button>
      </div>
      <label class="flex items-center gap-2 h-10 px-3 rounded-[11px] border border-base-300 bg-base-100 w-60 focus-within:border-primary">
        <Search class="w-[15px] h-[15px] text-base-content/45 shrink-0" :stroke-width="1.9" />
        <input
          v-model="query"
          type="text"
          placeholder="Search meetings"
          class="flex-1 bg-transparent outline-none text-[0.84rem] min-w-0 placeholder:text-base-content/40"
        />
      </label>
    </div>

    <div v-if="store.error" class="rounded-xl border border-error/30 bg-error/5 px-4 py-2.5 text-sm text-error">
      {{ store.error }}
    </div>

    <div v-if="store.loading && !store.loaded" class="text-base-content/60 text-sm">Loading…</div>

    <!-- Empty -->
    <div v-else-if="!store.upcoming.length && !store.past.length" class="py-14 text-center text-base-content/50">
      <CalendarClock class="w-8 h-8 mx-auto text-base-content/30" :stroke-width="1.5" />
      <p class="mt-3 text-sm font-medium">No meetings scheduled</p>
      <p class="text-xs mt-1">Schedule one and the invite lands in their inbox with a calendar attachment.</p>
    </div>

    <template v-else>
      <!-- ── Upcoming ── -->
      <template v-if="showUpcoming">
        <NextMeetingHero
          v-if="nextUp"
          :meeting="nextUp"
          :now="now"
          @invite="inviting = nextUp"
          @cancel="cancelMeeting(nextUp)"
        />
        <p v-else-if="tab === 'upcoming'" class="text-sm text-base-content/45 text-center py-6">
          {{ query ? 'No upcoming meetings match.' : 'Nothing on the calendar — schedule one above.' }}
        </p>

        <template v-if="later.length">
          <div class="flex items-center gap-2.5 text-[0.7rem] font-extrabold tracking-[0.06em] uppercase text-base-content/40 mt-6 mb-1 px-0.5">
            Later
            <span class="flex-1 h-px bg-base-300/60" />
          </div>
          <div class="space-y-2.5">
            <UpcomingMeetingRow
              v-for="m in later"
              :key="m.id"
              :meeting="m"
              :now="now"
              @invite="inviting = m"
              @details="viewing = m"
              @cancel="cancelMeeting(m)"
            />
          </div>
        </template>
      </template>

      <!-- ── Past, grouped by day ── -->
      <template v-if="showPast">
        <p v-if="!pastDays.length && tab === 'past'" class="text-sm text-base-content/45 text-center py-6">
          {{ query ? 'No past meetings match.' : 'No past meetings yet.' }}
        </p>
        <div v-for="day in pastDays" :key="day.label" class="mt-5">
          <div class="flex items-baseline gap-2.5 px-1 pb-2">
            <span class="text-[0.85rem] font-extrabold tracking-tight">{{ day.label }}</span>
            <span class="text-[0.72rem] font-semibold text-base-content/45">
              {{ day.rows.length }} meeting{{ day.rows.length === 1 ? '' : 's' }}
            </span>
          </div>
          <div class="bg-base-100 border border-base-300 rounded-2xl overflow-hidden shadow-hc-1">
            <PastMeetingRow
              v-for="m in day.rows"
              :key="m.id"
              :meeting="m"
              @details="viewing = m"
              @rebook="rebook(m)"
            />
          </div>
        </div>
      </template>
    </template>

    <!-- Modals — mounted on demand -->
    <ScheduleMeetingModal
      v-if="scheduling"
      :prefill-title="rebookFrom?.title"
      :prefill-duration="rebookFrom?.durationMinutes"
      :prefill-client-id="rebookFrom?.clientId"
      @close="closeSchedule"
    />
    <MeetingInviteModal v-if="inviting" :meeting="inviting" @close="inviting = null" />
    <MeetingTranscriptModal v-if="viewing" :meeting="viewing" @close="viewing = null" />
  </div>
</template>
