import { ref, watch, type Ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

// Per-task comment totals + unread counts for list surfaces (e.g. the task
// table's Chat column). The drawer's useTaskChat owns the live, per-task
// conversation; this is the cheap aggregate view over many tasks at once.
//
// Live message delivery happens over private per-task Broadcast channels, so
// there's no table-level realtime feed to subscribe to here. Instead callers
// should refresh() at natural moments — task list changes (handled here) and
// drawer open/close (where messages get sent and read).
//
// Unread convention matches useTaskChat: no task_comment_reads row → 0 unread
// (so old tasks that predate read-tracking don't light up forever).

const IN_CHUNK = 200 // keep .in() URL lengths sane

export function useTaskCommentCounts(taskIds: Ref<string[]>) {
  const auth = useAuthStore()

  const counts = ref<Record<string, number>>({})
  const unread = ref<Record<string, number>>({})

  // Stale guard: only the latest refresh may write results.
  let seq = 0

  async function refresh() {
    const ids = taskIds.value
    const token = ++seq
    if (ids.length === 0) {
      counts.value = {}
      unread.value = {}
      return
    }

    const uid = auth.user?.id ?? null
    const rows: { task_id: string; user_id: string; created_at: string }[] = []
    const lastReadByTask: Record<string, string> = {}

    try {
      for (let i = 0; i < ids.length; i += IN_CHUNK) {
        const chunk = ids.slice(i, i + IN_CHUNK)
        const [comments, reads] = await Promise.all([
          supabase
            .from('task_comments')
            .select('task_id, user_id, created_at')
            .in('task_id', chunk),
          uid
            ? supabase
                .from('task_comment_reads')
                .select('task_id, last_read_at')
                .eq('user_id', uid)
                .in('task_id', chunk)
            : Promise.resolve({ data: [], error: null })
        ])
        if (comments.error) throw comments.error
        if (reads.error) throw reads.error
        rows.push(...((comments.data ?? []) as typeof rows))
        for (const r of (reads.data ?? []) as { task_id: string; last_read_at: string }[]) {
          lastReadByTask[r.task_id] = r.last_read_at
        }
      }
    } catch (e) {
      console.warn('[task comment counts]', (e as Error).message)
      return
    }
    if (token !== seq) return // a newer refresh superseded this one

    const nextCounts: Record<string, number> = {}
    const nextUnread: Record<string, number> = {}
    for (const r of rows) {
      nextCounts[r.task_id] = (nextCounts[r.task_id] ?? 0) + 1
      const lastRead = lastReadByTask[r.task_id]
      // Compare as epochs — created_at and last_read_at can arrive in
      // different ISO offset spellings ('Z' vs '+00:00').
      if (
        lastRead &&
        r.user_id !== uid &&
        new Date(r.created_at).getTime() > new Date(lastRead).getTime()
      ) {
        nextUnread[r.task_id] = (nextUnread[r.task_id] ?? 0) + 1
      }
    }
    counts.value = nextCounts
    unread.value = nextUnread
  }

  // Refetch when the visible task set changes (project switch, task churn).
  watch(
    () => [...taskIds.value].sort().join(','),
    () => void refresh(),
    { immediate: true }
  )

  return { counts, unread, refresh }
}
