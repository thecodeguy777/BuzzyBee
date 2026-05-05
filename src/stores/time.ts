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
    if (!auth.isAuthenticated) return
    try {
      const { data, error: err } = await supabase
        .from('time_entries')
        .select('*')
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
    if (!auth.isAuthenticated) return
    const since = new Date()
    since.setDate(since.getDate() - days)
    try {
      const { data, error: err } = await supabase
        .from('time_entries')
        .select('*')
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

  async function clockOut() {
    if (!currentEntry.value) return null
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('time_entries')
        .update({ ended_at: new Date().toISOString(), status: 'closed' })
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
    await switchClient(newId)
    clients.setCurrentClient(newId)
  }

  function cancelSwitch() {
    pendingSwitchClientId.value = null
  }

  return {
    currentEntry,
    recentEntries,
    isRunning,
    elapsedSeconds,
    loading,
    error,
    pendingSwitchClientId,
    fetchCurrent,
    fetchRecent,
    clockIn,
    clockOut,
    switchClient,
    requestSwitch,
    confirmSwitch,
    cancelSwitch
  }
})
