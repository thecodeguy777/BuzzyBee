import { computed, onUnmounted, ref } from 'vue'
import { startOfDayInTz, startOfWeekInTz, dateStrInTz } from '@/lib/businessTime'

// A single ticking clock the dashboard derives all date boundaries from, so
// open time entries advance and "today" rolls over without a refresh. Data
// boundaries use the business timezone (see businessTime.ts); viewer-facing
// copy (greeting, date label) uses the viewer's local time.
export function useBusinessCalendar(tickMs = 30_000) {
  const now = ref(Date.now())
  const id = window.setInterval(() => {
    now.value = Date.now()
  }, tickMs)
  onUnmounted(() => window.clearInterval(id))

  const nowDate = computed(() => new Date(now.value))

  /** Epoch ms — business-timezone boundaries. */
  const todayStart = computed(() => startOfDayInTz(nowDate.value))
  const weekStart = computed(() => startOfWeekInTz(nowDate.value))
  /** 'YYYY-MM-DD' business date, for lexical comparison against date columns. */
  const todayStr = computed(() => dateStrInTz(nowDate.value))

  /** A `date` column value is overdue if it's strictly before the business today. */
  function isOverdue(dueOn: string | null | undefined): boolean {
    return !!dueOn && dueOn < todayStr.value
  }

  // Viewer-local copy.
  const greeting = computed(() => {
    const h = nowDate.value.getHours()
    if (h < 5) return 'Working late'
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
  })
  const todayLabel = computed(() =>
    nowDate.value.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    })
  )

  return { now, todayStart, weekStart, todayStr, isOverdue, greeting, todayLabel }
}
