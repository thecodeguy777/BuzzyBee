import { onUnmounted, ref, watch } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

export interface RunningEntry {
  va_id: string
  client_id: string
  started_at: string
}

/**
 * Who is on the clock right now, keyed by VA. This is the honest, global signal
 * for the Ambient Hive — a running time_entry means someone is actively working
 * (and on which client). RLS scopes it to clients the viewer manages. Kept live
 * via a realtime subscription + a slow poll backstop.
 */
export function useHivePresence() {
  const auth = useAuthStore()
  const running = ref<Record<string, RunningEntry>>({})
  // Flips true once the first fetch settles, so the UI can hold a skeleton until
  // there's real data rather than flashing an empty state.
  const ready = ref(false)

  let channel: RealtimeChannel | null = null
  let pollId: number | undefined

  async function refresh() {
    if (!auth.isAuthenticated) return
    try {
      const { data, error } = await supabase
        .from('time_entries')
        .select('va_id, client_id, started_at, status')
        .eq('status', 'running')
      if (error) throw error
      const map: Record<string, RunningEntry> = {}
      for (const r of (data ?? []) as RunningEntry[]) {
        if (r.va_id) map[r.va_id] = { va_id: r.va_id, client_id: r.client_id, started_at: r.started_at }
      }
      running.value = map
    } catch (e) {
      console.warn('[hive] refresh:', (e as Error).message)
    } finally {
      ready.value = true
    }
  }

  function start() {
    void refresh()
    pollId = window.setInterval(() => void refresh(), 45_000)
    if (!channel) {
      channel = supabase
        .channel('bb-hive-presence')
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
        running.value = {}
        ready.value = false
        stop()
      }
    },
    { immediate: true }
  )
  onUnmounted(stop)

  return { running, ready, refresh }
}
