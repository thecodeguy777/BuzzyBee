import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'

export interface TimeEntry {
  id: string
  va_id: string
  client_id: string
  started_at: string
  ended_at: string | null
  status: 'running' | 'closed'
  notes: string | null
  active_seconds: number
  idle_seconds: number
  created_at: string
  updated_at: string
}

export const useTimeStore = defineStore('time', () => {
  const auth = useAuthStore()
  const clients = useClientsStore()

  const currentEntry = ref<TimeEntry | null>(null)
  const recentEntries = ref<TimeEntry[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const tick = ref(Date.now())
  // Set when the user requests a client switch while a timer is running.
  // The UI renders a confirmation modal off this state.
  const pendingSwitchClientId = ref<string | null>(null)

  const isRunning = computed(() => currentEntry.value?.status === 'running')

  const elapsedSeconds = computed(() => {
    const e = currentEntry.value
    if (!e || !e.started_at) return 0
    return Math.max(0, Math.floor((tick.value - new Date(e.started_at).getTime()) / 1000))
  })

  // Session-health thresholds: nudge at 6h, treat as "forgot to clock out"
  // at 12h (the server auto-closes at 12h too — see close_stale_time_entries).
  const isLongSession = computed(() => isRunning.value && elapsedSeconds.value > 6 * 3600)
  const isStaleSession = computed(() => isRunning.value && elapsedSeconds.value > 12 * 3600)

  let timerId: number | undefined
  function startTicker() {
    if (timerId !== undefined) return
    tick.value = Date.now()
    timerId = window.setInterval(() => {
      tick.value = Date.now()
    }, 1000)
  }
  function stopTicker() {
    if (timerId !== undefined) {
      window.clearInterval(timerId)
      timerId = undefined
    }
  }

  async function fetchCurrent() {
    if (!auth.user) return
    try {
      // Scoped to MY entries: PMs/admins can see other people's rows through
      // RLS, and an unscoped query made them "adopt" someone else's running
      // timer (the stuck client-switch modal).
      const { data, error: err } = await supabase
        .from('time_entries')
        .select('*')
        .eq('va_id', auth.user.id)
        .eq('status', 'running')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (err) throw err
      currentEntry.value = (data as TimeEntry) ?? null
      if (currentEntry.value) startTicker()
      else stopTicker()
    } catch (e) {
      console.warn('[time] fetchCurrent failed:', (e as Error).message)
    }
  }

  async function fetchRecent(days = 7) {
    if (!auth.user) return
    const since = new Date()
    since.setDate(since.getDate() - days)
    try {
      const { data, error: err } = await supabase
        .from('time_entries')
        .select('*')
        .eq('va_id', auth.user.id)
        .gte('started_at', since.toISOString())
        .order('started_at', { ascending: false })
      if (err) throw err
      recentEntries.value = (data ?? []) as TimeEntry[]
    } catch (e) {
      console.warn('[time] fetchRecent failed:', (e as Error).message)
    }
  }

  async function clockIn(clientId?: string) {
    if (!auth.user) return
    if (isRunning.value) return
    const cid = clientId ?? clients.currentClientId
    if (!cid) {
      error.value = 'Select a client before clocking in.'
      return
    }
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('time_entries')
        .insert({ client_id: cid, va_id: auth.user.id, status: 'running' })
        .select('*')
        .single()
      if (err) throw err
      currentEntry.value = data as TimeEntry
      startTicker()
      void fetchRecent()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Could not clock in.'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function clockOut(note?: string) {
    if (!currentEntry.value) return null
    loading.value = true
    error.value = null
    try {
      const patch: Record<string, unknown> = { ended_at: new Date().toISOString(), status: 'closed' }
      if (note?.trim()) patch.notes = note.trim()
      const { data, error: err } = await supabase
        .from('time_entries')
        .update(patch)
        .eq('id', currentEntry.value.id)
        .select('*')
        .single()
      if (err) throw err
      currentEntry.value = null
      stopTicker()
      void fetchRecent()
      return data as TimeEntry
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Could not clock out.'
      throw e
    } finally {
      loading.value = false
    }
  }

  // ── Corrections ──────────────────────────────────────────────────────────────
  // RLS scopes who may touch a row (VA: own; admin/superadmin: anyone's).
  async function updateEntry(
    id: string,
    patch: { started_at?: string; ended_at?: string | null; notes?: string | null },
  ): Promise<boolean> {
    error.value = null
    const db: Record<string, unknown> = {}
    if (patch.started_at !== undefined) db.started_at = patch.started_at
    if (patch.ended_at !== undefined) {
      db.ended_at = patch.ended_at
      if (patch.ended_at) db.status = 'closed'
    }
    if (patch.notes !== undefined) db.notes = patch.notes?.trim() || null
    if (!Object.keys(db).length) return true
    const { data, error: err } = await supabase
      .from('time_entries')
      .update(db)
      .eq('id', id)
      .select('*')
      .single()
    if (err) {
      error.value = /check constraint|ended_after_started/i.test(err.message)
        ? 'End time must be after the start time.'
        : err.message
      return false
    }
    const row = data as TimeEntry
    recentEntries.value = recentEntries.value.map((e) => (e.id === id ? row : e))
    if (currentEntry.value?.id === id) {
      currentEntry.value = row.status === 'running' ? row : null
      if (row.status !== 'running') stopTicker()
    }
    return true
  }

  async function deleteEntry(id: string): Promise<boolean> {
    error.value = null
    const { error: err } = await supabase.from('time_entries').delete().eq('id', id)
    if (err) {
      error.value = err.message
      return false
    }
    recentEntries.value = recentEntries.value.filter((e) => e.id !== id)
    if (currentEntry.value?.id === id) {
      currentEntry.value = null
      stopTicker()
    }
    return true
  }

  async function switchClient(newClientId: string) {
    if (!isRunning.value) return
    if (currentEntry.value?.client_id === newClientId) return
    await clockOut()
    await clockIn(newClientId)
  }

  // Refetch when auth state flips.
  watch(
    () => auth.isAuthenticated,
    (isAuthed) => {
      if (isAuthed) {
        void fetchCurrent()
        void fetchRecent()
      } else {
        currentEntry.value = null
        recentEntries.value = []
        stopTicker()
      }
    },
    { immediate: true }
  )

  function requestSwitch(newClientId: string) {
    if (!newClientId) return
    if (!isRunning.value || currentEntry.value?.client_id === newClientId) {
      // No running timer (or already on this client) → switch immediately, no modal.
      clients.setCurrentClient(newClientId)
      return
    }
    pendingSwitchClientId.value = newClientId
  }

  async function confirmSwitch() {
    const newId = pendingSwitchClientId.value
    if (!newId) return
    pendingSwitchClientId.value = null
    try {
      await switchClient(newId)
      clients.setCurrentClient(newId)
    } catch (e) {
      // Don't die silently (the old behavior): surface why, and re-sync the
      // running entry in case our local copy was stale.
      error.value = "Couldn't switch the timer — " + (e as Error).message
      void fetchCurrent()
    }
  }

  function cancelSwitch() {
    pendingSwitchClientId.value = null
  }

  return {
    currentEntry,
    recentEntries,
    isRunning,
    isLongSession,
    isStaleSession,
    elapsedSeconds,
    loading,
    error,
    pendingSwitchClientId,
    fetchCurrent,
    fetchRecent,
    clockIn,
    clockOut,
    updateEntry,
    deleteEntry,
    switchClient,
    requestSwitch,
    confirmSwitch,
    cancelSwitch
  }
})
