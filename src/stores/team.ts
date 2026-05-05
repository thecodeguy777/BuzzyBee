import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'

export interface Assignment {
  id: string
  va_id: string
  client_id: string
  pm_id: string | null
  status: 'active' | 'paused' | 'ended'
  started_at: string
  ended_at: string | null
}

export interface MemberProfile {
  id: string
  full_name: string | null
  email: string | null
  role: 'va' | 'pm' | 'admin' | 'superadmin'
  timezone: string | null
  avatar_url: string | null
}

export const useTeamStore = defineStore('team', () => {
  const auth = useAuthStore()
  const clients = useClientsStore()

  const assignments = ref<Assignment[]>([])
  const profiles = ref<Record<string, MemberProfile>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)

  /** All assignments visible to me (RLS scopes this). */
  async function fetchAssignments() {
    if (!auth.isAuthenticated) return
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('assignments')
        .select('id, va_id, client_id, pm_id, status, started_at, ended_at')
        .order('started_at', { ascending: false })
      if (err) throw err
      assignments.value = (data ?? []) as Assignment[]
      // Pre-fetch all referenced profiles
      const ids = new Set<string>()
      for (const a of assignments.value) {
        if (a.va_id) ids.add(a.va_id)
        if (a.pm_id) ids.add(a.pm_id)
      }
      await fetchProfiles([...ids])
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load team.'
      console.warn('[team]', error.value)
    } finally {
      loading.value = false
    }
  }

  async function fetchProfiles(ids: string[]) {
    const missing = ids.filter((id) => !profiles.value[id])
    if (missing.length === 0) return
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, timezone, avatar_url')
      .in('id', missing)
    if (err) {
      console.warn('[team] fetchProfiles:', err.message)
      return
    }
    const next = { ...profiles.value }
    for (const p of (data ?? []) as MemberProfile[]) next[p.id] = p
    profiles.value = next
  }

  /**
   * For the current PM (or any admin), the unique VA roster they manage.
   * For admins this is everyone with active assignments.
   */
  const myTeam = computed(() => {
    const ids = new Set<string>()
    for (const a of assignments.value) {
      if (a.status !== 'active') continue
      if (auth.isAdmin) {
        if (a.va_id) ids.add(a.va_id)
        continue
      }
      if (a.pm_id === auth.user?.id && a.va_id) ids.add(a.va_id)
    }
    return [...ids].map((id) => profiles.value[id]).filter(Boolean) as MemberProfile[]
  })

  /** Active assignments grouped by VA. */
  const assignmentsByVa = computed<Record<string, Assignment[]>>(() => {
    const m: Record<string, Assignment[]> = {}
    for (const a of assignments.value) {
      if (a.status !== 'active') continue
      if (!a.va_id) continue
      if (!auth.isAdmin && a.pm_id !== auth.user?.id) continue
      if (!m[a.va_id]) m[a.va_id] = []
      m[a.va_id].push(a)
    }
    return m
  })

  /** Client name lookups for a VA's assignments. */
  function clientsForVa(vaId: string): string[] {
    const list = assignmentsByVa.value[vaId] ?? []
    const out: string[] = []
    for (const a of list) {
      const c = clients.clients.find((x) => x.id === a.client_id)
      if (c) out.push(c.name)
    }
    return out
  }

  watch(
    () => auth.isAuthenticated,
    (isAuthed) => {
      if (isAuthed) void fetchAssignments()
      else {
        assignments.value = []
        profiles.value = {}
      }
    },
    { immediate: true }
  )

  /**
   * Create an active assignment binding a VA to a client (optionally with a
   * PM as the day-to-day manager). Idempotent against the
   * (va_id, client_id) WHERE status='active' unique index — if an active
   * row already exists we just return it.
   */
  async function addAssignment(input: {
    va_id: string
    client_id: string
    pm_id?: string | null
  }): Promise<Assignment> {
    if (!auth.user) throw new Error('Not authenticated')

    // Reactivate a prior assignment for this VA+client if one exists.
    const { data: existing, error: existErr } = await supabase
      .from('assignments')
      .select('*')
      .eq('va_id', input.va_id)
      .eq('client_id', input.client_id)
      .order('started_at', { ascending: false })
      .limit(1)
    if (existErr) throw existErr
    const prior = (existing?.[0] as Assignment | undefined) ?? null
    if (prior && prior.status === 'active') {
      // Already active. If a PM is supplied and differs, patch it; otherwise no-op.
      if (input.pm_id !== undefined && prior.pm_id !== input.pm_id) {
        const { data: patched, error: pErr } = await supabase
          .from('assignments')
          .update({ pm_id: input.pm_id })
          .eq('id', prior.id)
          .select('*')
          .single()
        if (pErr) throw pErr
        const idx = assignments.value.findIndex((a) => a.id === prior.id)
        if (idx !== -1) assignments.value[idx] = patched as Assignment
        return patched as Assignment
      }
      return prior
    }

    // Insert a fresh active row.
    const payload: Record<string, unknown> = {
      va_id: input.va_id,
      client_id: input.client_id,
      pm_id: input.pm_id ?? null,
      status: 'active'
    }
    const { data, error: err } = await supabase
      .from('assignments')
      .insert(payload)
      .select('*')
      .single()
    if (err) throw err
    const row = data as Assignment
    if (!assignments.value.some((a) => a.id === row.id)) {
      assignments.value = [row, ...assignments.value]
    }
    // Make sure the VA's profile is loaded for downstream UI.
    if (!profiles.value[row.va_id]) {
      void fetchProfiles([row.va_id])
    }
    return row
  }

  /** End an active assignment (sets status='ended', keeps the row for history). */
  async function endAssignment(assignmentId: string): Promise<void> {
    const { error: err } = await supabase
      .from('assignments')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', assignmentId)
    if (err) throw err
    const idx = assignments.value.findIndex((a) => a.id === assignmentId)
    if (idx !== -1) {
      assignments.value[idx] = {
        ...assignments.value[idx],
        status: 'ended',
        ended_at: new Date().toISOString()
      }
    }
  }

  return {
    assignments,
    profiles,
    myTeam,
    assignmentsByVa,
    loading,
    error,
    fetchAssignments,
    fetchProfiles,
    clientsForVa,
    addAssignment,
    endAssignment
  }
})
