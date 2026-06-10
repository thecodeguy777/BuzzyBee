import { computed, onUnmounted, ref, watch, type Ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { startOfDayInTz, startOfWeekInTz, DAY_MS } from '@/lib/businessTime'

interface TimeEntryRow {
  va_id: string | null
  started_at: string
  ended_at: string | null
}

/**
 * Team time-tracking aggregates for the PM dashboard. Unlike the `time` store
 * (which is the current user's personal clock), this reads every entry the PM
 * is allowed to see (RLS-scoped) and rolls it up per-VA.
 *
 * Open entries (no ended_at) are measured against the shared ticking `now`, so
 * a clocked-in VA's hours advance live. A 60s poll + a realtime subscription on
 * time_entries pick up entries opened/closed in other sessions.
 */
export function useTeamHours(now: Ref<number>) {
  const auth = useAuthStore()

  const entries = ref<TimeEntryRow[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  let channel: RealtimeChannel | null = null
  let pollId: number | undefined

  async function refresh() {
    if (!auth.isAuthenticated) return
    loading.value = true
    error.value = null
    try {
      // Cover both the current week (for week totals) and a rolling 7 days
      // (for the daily sparkline), whichever reaches further back.
      const ref = new Date(now.value)
      const since = Math.min(startOfWeekInTz(ref), startOfDayInTz(ref) - 6 * DAY_MS)
      const { data, error: err } = await supabase
        .from('time_entries')
        .select('va_id, started_at, ended_at')
        .gte('started_at', new Date(since).toISOString())
      if (err) throw err
      entries.value = (data ?? []) as TimeEntryRow[]
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load hours.'
      console.warn('[useTeamHours]', error.value)
    } finally {
      loading.value = false
    }
  }

  function endOf(e: TimeEntryRow, tnow: number): number {
    return e.ended_at ? new Date(e.ended_at).getTime() : tnow
  }

  /** Seconds per VA since the start of this week. */
  const hoursWeekByVa = computed<Record<string, number>>(() => {
    const tnow = now.value
    const weekStart = startOfWeekInTz(new Date(tnow))
    const map: Record<string, number> = {}
    for (const e of entries.value) {
      if (!e.va_id) continue
      const start = Math.max(new Date(e.started_at).getTime(), weekStart)
      const end = endOf(e, tnow)
      if (end <= start) continue
      map[e.va_id] = (map[e.va_id] ?? 0) + Math.floor((end - start) / 1000)
    }
    return map
  })

  /** Seconds per VA since business midnight (clamped so overnight entries split correctly). */
  const hoursTodayByVa = computed<Record<string, number>>(() => {
    const tnow = now.value
    const today = startOfDayInTz(new Date(tnow))
    const map: Record<string, number> = {}
    for (const e of entries.value) {
      if (!e.va_id) continue
      const start = Math.max(new Date(e.started_at).getTime(), today)
      const end = endOf(e, tnow)
      if (end <= start) continue
      map[e.va_id] = (map[e.va_id] ?? 0) + Math.floor((end - start) / 1000)
    }
    return map
  })

  const totalHoursWeek = computed(() =>
    Object.values(hoursWeekByVa.value).reduce((a, b) => a + b, 0)
  )

  /** Team hours (seconds) per day for the last 7 days, oldest → today. Real data. */
  const dailySeconds = computed<number[]>(() => {
    const tnow = now.value
    const todayStart = startOfDayInTz(new Date(tnow))
    const buckets = new Array(7).fill(0)
    for (const e of entries.value) {
      const start = new Date(e.started_at).getTime()
      const end = endOf(e, tnow)
      for (let i = 0; i < 7; i++) {
        const dStart = todayStart - (6 - i) * DAY_MS
        const overlap = Math.min(end, dStart + DAY_MS) - Math.max(start, dStart)
        if (overlap > 0) buckets[i] += overlap / 1000
      }
    }
    return buckets
  })

  function start() {
    void refresh()
    pollId = window.setInterval(() => void refresh(), 60_000)
    if (!channel) {
      channel = supabase
        .channel('bb-team-hours')
        .on(
          'postgres_changes',
          { event: '*', schema: 'buzzybee', table: 'time_entries' },
          () => void refresh()
        )
        .subscribe()
    }
  }

  function stop() {
    if (pollId !== undefined) {
      window.clearInterval(pollId)
      pollId = undefined
    }
    if (channel) {
      void supabase.removeChannel(channel)
      channel = null
    }
  }

  watch(
    () => auth.isAuthenticated,
    (is) => {
      if (is) start()
      else {
        entries.value = []
        stop()
      }
    },
    { immediate: true }
  )

  onUnmounted(stop)

  return {
    hoursTodayByVa,
    hoursWeekByVa,
    totalHoursWeek,
    dailySeconds,
    loading,
    error,
    refresh
  }
}
