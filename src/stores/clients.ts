import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

export type ClientStatus = 'active' | 'paused' | 'archived'
export type ClientTier = 'starter' | 'professional' | 'specialist'
export type Channel = 'slack' | 'email'

export interface Client {
  id: string
  name: string
  preferred_channel: Channel | null
  slack_webhook_url: string | null
  email_to: string | null
  asana_project_id: string | null
  monthly_rate: number | null
  tier: ClientTier | null
  hivemind_enabled: boolean
  status: ClientStatus
  notes: string | null
  created_at: string
  updated_at: string
}

const CURRENT_KEY = 'buzzybee.workstation.current-client-id'

export interface ClientPm {
  client_id: string
  pm_id: string
  is_primary: boolean
  added_at: string
  added_by: string | null
}

export const useClientsStore = defineStore('clients', () => {
  const auth = useAuthStore()

  const clients = ref<Client[]>([])
  const clientPms = ref<ClientPm[]>([])
  const currentClientId = ref<string | null>(
    typeof window === 'undefined' ? null : window.localStorage.getItem(CURRENT_KEY)
  )
  const loading = ref(false)
  const error = ref<string | null>(null)
  const loaded = ref(false)

  const activeClients = computed(() =>
    clients.value.filter((c) => c.status === 'active')
  )
  const currentClient = computed(() =>
    clients.value.find((c) => c.id === currentClientId.value) ?? null
  )
  const hasClients = computed(() => clients.value.length > 0)

  async function fetchMine() {
    if (!auth.isAuthenticated) {
      clients.value = []
      clientPms.value = []
      loaded.value = true
      return
    }
    loading.value = true
    error.value = null
    try {
      const [clientsRes, pmsRes] = await Promise.all([
        supabase.from('clients').select('*').order('name', { ascending: true }),
        supabase.from('client_pms').select('*')
      ])
      if (clientsRes.error) throw clientsRes.error
      clients.value = (clientsRes.data ?? []) as Client[]
      if (pmsRes.error) console.warn('[clients] client_pms:', pmsRes.error.message)
      else clientPms.value = (pmsRes.data ?? []) as ClientPm[]

      // PMs may not have any assignment yet (so the team store hasn't seen
      // them). Make sure every PM referenced in client_pms has a profile
      // loaded so the Client drawer's PM list can render their name/avatar.
      if (clientPms.value.length > 0) {
        const ids = [...new Set(clientPms.value.map((cp) => cp.pm_id))]
        const { useTeamStore } = await import('@/stores/team')
        void useTeamStore().fetchProfiles(ids)
      }

      // If no current selection (or stale), pick the first active client.
      const stillExists = clients.value.some((c) => c.id === currentClientId.value)
      if (!stillExists) {
        const first = activeClients.value[0] ?? clients.value[0] ?? null
        currentClientId.value = first?.id ?? null
      }
      loaded.value = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load clients.'
      console.warn('[clients] fetchMine:', error.value)
    } finally {
      loading.value = false
    }
  }

  // PM-related helpers
  const pmsByClient = computed<Record<string, ClientPm[]>>(() => {
    const m: Record<string, ClientPm[]> = {}
    for (const cp of clientPms.value) {
      if (!m[cp.client_id]) m[cp.client_id] = []
      m[cp.client_id].push(cp)
    }
    return m
  })

  function primaryPmId(clientId: string): string | null {
    return pmsByClient.value[clientId]?.find((cp) => cp.is_primary)?.pm_id ?? null
  }

  /** Clients where the current user is a PM (primary or secondary). */
  const myPmClients = computed(() =>
    clients.value.filter((c) =>
      (pmsByClient.value[c.id] ?? []).some((cp) => cp.pm_id === auth.user?.id)
    )
  )

  async function addPm(clientId: string, pmId: string, isPrimary = false) {
    if (!auth.user) throw new Error('Not authenticated')
    if (isPrimary) {
      // Demote existing primary first
      const existing = pmsByClient.value[clientId]?.find((cp) => cp.is_primary)
      if (existing && existing.pm_id !== pmId) {
        const { error: dErr } = await supabase
          .from('client_pms')
          .update({ is_primary: false })
          .eq('client_id', clientId)
          .eq('pm_id', existing.pm_id)
        if (dErr) throw dErr
      }
    }
    const { data, error: err } = await supabase
      .from('client_pms')
      .upsert(
        {
          client_id: clientId,
          pm_id: pmId,
          is_primary: isPrimary,
          added_by: auth.user.id
        },
        { onConflict: 'client_id,pm_id' }
      )
      .select('*')
      .single()
    if (err) throw err
    const row = data as ClientPm
    const idx = clientPms.value.findIndex(
      (cp) => cp.client_id === row.client_id && cp.pm_id === row.pm_id
    )
    if (idx === -1) clientPms.value.push(row)
    else clientPms.value[idx] = row
    // Make sure the newly-added PM's profile is in the team store so the
    // drawer's myPmList join finds it.
    const { useTeamStore } = await import('@/stores/team')
    void useTeamStore().fetchProfiles([row.pm_id])
    return row
  }

  async function removePm(clientId: string, pmId: string) {
    const { error: err } = await supabase
      .from('client_pms')
      .delete()
      .eq('client_id', clientId)
      .eq('pm_id', pmId)
    if (err) throw err
    clientPms.value = clientPms.value.filter(
      (cp) => !(cp.client_id === clientId && cp.pm_id === pmId)
    )
  }

  async function setPrimaryPm(clientId: string, pmId: string) {
    return addPm(clientId, pmId, true)
  }

  async function createClient(input: { name: string; primary_pm_id?: string }) {
    if (!auth.user) throw new Error('Not authenticated')
    const trimmed = input.name.trim()
    if (!trimmed) throw new Error('Client name is required')
    const { data, error: err } = await supabase
      .from('clients')
      .insert({ name: trimmed, status: 'active' })
      .select('*')
      .single()
    if (err) throw err
    const row = data as Client
    if (!clients.value.some((c) => c.id === row.id)) clients.value.push(row)

    // Whoever creates the client becomes its primary PM (unless an explicit
    // primary_pm_id was passed). For VAs this would be a no-op since RLS
    // blocks them from inserting clients in the first place.
    const pmId = input.primary_pm_id ?? auth.user.id
    try {
      await addPm(row.id, pmId, true)
    } catch (e) {
      // Non-fatal — client exists, just no primary PM yet.
      console.warn('[clients] auto-add primary PM failed:', (e as Error).message)
    }
    return row
  }

  async function updateClient(id: string, patch: Partial<Client>) {
    const idx = clients.value.findIndex((c) => c.id === id)
    const prev = idx !== -1 ? { ...clients.value[idx] } : null
    if (idx !== -1) clients.value[idx] = { ...clients.value[idx], ...(patch as Partial<Client>) }
    try {
      const { data, error: err } = await supabase
        .from('clients')
        .update(patch as Record<string, unknown>)
        .eq('id', id)
        .select('*')
        .single()
      if (err) throw err
      const row = data as Client
      const i = clients.value.findIndex((c) => c.id === row.id)
      if (i !== -1) clients.value[i] = row
      return row
    } catch (e) {
      if (idx !== -1 && prev) clients.value[idx] = prev
      throw e
    }
  }

  function setCurrentClient(id: string | null) {
    currentClientId.value = id
  }

  watch(currentClientId, (id) => {
    if (typeof window === 'undefined') return
    if (id) window.localStorage.setItem(CURRENT_KEY, id)
    else window.localStorage.removeItem(CURRENT_KEY)
  })

  // Re-fetch whenever auth state flips.
  watch(
    () => auth.isAuthenticated,
    (isAuthed) => {
      if (isAuthed) void fetchMine()
      else {
        clients.value = []
        loaded.value = false
      }
    }
  )

  return {
    clients,
    clientPms,
    activeClients,
    currentClient,
    currentClientId,
    hasClients,
    loading,
    error,
    loaded,
    pmsByClient,
    primaryPmId,
    myPmClients,
    fetchMine,
    setCurrentClient,
    addPm,
    removePm,
    setPrimaryPm,
    createClient,
    updateClient
  }
})
