import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useProjectsStore } from '@/stores/projects'

export type ProjectMemberRole = 'lead' | 'contributor' | 'viewer'

export interface ProjectMember {
  project_id: string
  user_id: string
  role: ProjectMemberRole
  added_by: string | null
  added_at: string
}

export interface MemberWithProfile extends ProjectMember {
  full_name: string | null
  email: string | null
  avatar_url: string | null
}

export const useProjectMembersStore = defineStore('projectMembers', () => {
  const auth = useAuthStore()
  const projects = useProjectsStore()

  // members keyed by project_id
  const byProject = ref<Record<string, ProjectMember[]>>({})
  // small profile cache for rendering avatars + names
  const profileCache = ref<
    Record<string, { id: string; full_name: string | null; email: string | null; avatar_url: string | null }>
  >({})
  const loading = ref(false)
  const error = ref<string | null>(null)

  let channel: RealtimeChannel | null = null

  const currentMembers = computed<MemberWithProfile[]>(() => {
    const pid = projects.currentProjectId
    if (!pid) return []
    const list = byProject.value[pid] ?? []
    return list.map((m) => {
      const p = profileCache.value[m.user_id]
      return {
        ...m,
        full_name: p?.full_name ?? null,
        email: p?.email ?? null,
        avatar_url: p?.avatar_url ?? null
      }
    })
  })

  async function loadProfiles(ids: string[]) {
    const missing = ids.filter((id) => !profileCache.value[id])
    if (missing.length === 0) return
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url')
      .in('id', missing)
    if (err) {
      console.warn('[members] loadProfiles:', err.message)
      return
    }
    const next = { ...profileCache.value }
    for (const p of data ?? []) {
      next[p.id] = {
        id: p.id,
        full_name: (p as any).full_name ?? null,
        email: (p as any).email ?? null,
        avatar_url: (p as any).avatar_url ?? null
      }
    }
    profileCache.value = next
  }

  async function fetchAll() {
    if (!auth.isAuthenticated) return
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('project_members')
        .select('*')
      if (err) throw err
      const grouped: Record<string, ProjectMember[]> = {}
      const ids = new Set<string>()
      for (const m of (data ?? []) as ProjectMember[]) {
        if (!grouped[m.project_id]) grouped[m.project_id] = []
        grouped[m.project_id].push(m)
        ids.add(m.user_id)
      }
      byProject.value = grouped
      await loadProfiles([...ids])
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load members.'
      console.warn('[members] fetchAll:', error.value)
    } finally {
      loading.value = false
    }
  }

  function applyRealtime(payload: any) {
    const ev = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
    const row = (ev === 'DELETE' ? payload.old : payload.new) as ProjectMember
    const pid = row.project_id
    const list = byProject.value[pid] ? [...byProject.value[pid]] : []
    if (ev === 'INSERT') {
      if (!list.some((m) => m.user_id === row.user_id)) list.push(row)
      void loadProfiles([row.user_id])
    } else if (ev === 'UPDATE') {
      const idx = list.findIndex((m) => m.user_id === row.user_id)
      if (idx !== -1) list[idx] = row
      else list.push(row)
    } else if (ev === 'DELETE') {
      const idx = list.findIndex((m) => m.user_id === row.user_id)
      if (idx !== -1) list.splice(idx, 1)
    }
    byProject.value = { ...byProject.value, [pid]: list }
  }

  function startRealtime() {
    if (channel) return
    channel = supabase
      .channel('bb-project-members')
      .on(
        'postgres_changes',
        { event: '*', schema: 'buzzybee', table: 'project_members' },
        applyRealtime
      )
      .subscribe()
  }
  async function stopRealtime() {
    if (channel) {
      try {
        await supabase.removeChannel(channel)
      } catch {
        /* ignore */
      }
      channel = null
    }
  }

  async function addMember(projectId: string, userId: string, role: ProjectMemberRole = 'contributor') {
    if (!auth.user) throw new Error('Not authenticated')
    const { error: err } = await supabase
      .from('project_members')
      .insert({ project_id: projectId, user_id: userId, role, added_by: auth.user.id })
    if (err) throw err
    void loadProfiles([userId])
  }

  async function removeMember(projectId: string, userId: string) {
    const { error: err } = await supabase
      .from('project_members')
      .delete()
      .eq('project_id', projectId)
      .eq('user_id', userId)
    if (err) throw err
  }

  async function updateRole(projectId: string, userId: string, role: ProjectMemberRole) {
    const { error: err } = await supabase
      .from('project_members')
      .update({ role })
      .eq('project_id', projectId)
      .eq('user_id', userId)
    if (err) throw err
  }

  /**
   * Search profiles for the Add Member picker.
   *
   * TKT-0002 fix: previously only queried assignments for THIS client, so:
   *   - PMs added to the client via client_pms (no VA assignment yet) didn't show
   *   - VAs on other clients in the same workspace didn't show
   *   - Brand-new accounts didn't show even when a typed query matched
   *
   * New strategy:
   *   1. With no query: show the client's roster (assignments + client_pms PMs)
   *   2. With a query: search profiles directly via RLS-gated ilike. RLS
   *      controls who you see (post-20260502g: admin/PM can see all PM/admin
   *      profiles plus their own VA teammates).
   * Both paths exclude profiles already on this project.
   */
  async function searchTeammates(clientId: string, query: string, excludeIds: string[] = []) {
    const trimmed = query.trim()
    const exclude = new Set(excludeIds)

    // Path B: there's a search query — go broad via RLS-gated profile search.
    if (trimmed.length > 0) {
      const pattern = `%${trimmed.split(/\s+/).filter(Boolean).join('%')}%`
      const { data, error: err } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
        .limit(20)
      if (err) {
        console.warn('[members] searchTeammates profile search:', err.message)
        return []
      }
      return (data ?? []).filter((p) => !exclude.has(p.id)) as {
        id: string; full_name: string | null; email: string | null; avatar_url: string | null
      }[]
    }

    // Path A: no query — show the client's existing roster (assignments + PMs).
    const userIds = new Set<string>()

    const { data: assigns, error: aErr } = await supabase
      .from('assignments')
      .select('va_id, pm_id, status')
      .eq('client_id', clientId)
      .eq('status', 'active')
    if (aErr) {
      console.warn('[members] searchTeammates assignments:', aErr.message)
    } else {
      for (const a of (assigns ?? []) as { va_id: string | null; pm_id: string | null }[]) {
        if (a.va_id) userIds.add(a.va_id)
        if (a.pm_id) userIds.add(a.pm_id)
      }
    }

    const { data: clientPms, error: pmErr } = await supabase
      .from('client_pms')
      .select('pm_id')
      .eq('client_id', clientId)
    if (pmErr) {
      console.warn('[members] searchTeammates client_pms:', pmErr.message)
    } else {
      for (const r of (clientPms ?? []) as { pm_id: string }[]) {
        userIds.add(r.pm_id)
      }
    }

    for (const id of exclude) userIds.delete(id)
    if (userIds.size === 0) return []

    const { data: profs, error: pErr } = await supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url')
      .in('id', [...userIds])
      .limit(20)
    if (pErr) {
      console.warn('[members] searchTeammates profiles:', pErr.message)
      return []
    }
    return (profs ?? []) as {
      id: string; full_name: string | null; email: string | null; avatar_url: string | null
    }[]
  }

  watch(
    () => auth.isAuthenticated,
    (isAuthed) => {
      if (isAuthed) {
        void fetchAll()
        startRealtime()
      } else {
        byProject.value = {}
        profileCache.value = {}
        void stopRealtime()
      }
    },
    { immediate: true }
  )

  return {
    byProject,
    profileCache,
    currentMembers,
    loading,
    error,
    fetchAll,
    loadProfiles,
    addMember,
    removeMember,
    updateRole,
    searchTeammates
  }
})
