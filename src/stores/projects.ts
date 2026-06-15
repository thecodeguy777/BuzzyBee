import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'

export type ProjectStatus = 'active' | 'paused' | 'archived'

export interface Project {
  id: string
  client_id: string
  name: string
  description: string | null
  status: ProjectStatus
  display_order: number
  created_by: string | null
  created_at: string
  updated_at: string
  /** Shared per-project task-table column layout. null = built-in defaults. */
  task_column_layout: { order?: string[]; hidden?: string[] } | null
}

const CURRENT_KEY = 'buzzybee.workstation.current-project-id'

export const useProjectsStore = defineStore('projects', () => {
  const auth = useAuthStore()
  const clients = useClientsStore()

  const projects = ref<Project[]>([])
  const currentProjectId = ref<string | null>(
    typeof window === 'undefined' ? null : window.localStorage.getItem(CURRENT_KEY)
  )
  const loading = ref(false)
  const error = ref<string | null>(null)
  const loaded = ref(false)

  let channel: RealtimeChannel | null = null

  const projectsByClient = computed<Record<string, Project[]>>(() => {
    const m: Record<string, Project[]> = {}
    for (const p of projects.value) {
      if (!m[p.client_id]) m[p.client_id] = []
      m[p.client_id].push(p)
    }
    for (const k of Object.keys(m)) {
      m[k].sort(
        (a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name)
      )
    }
    return m
  })

  const projectsForCurrentClient = computed(() =>
    clients.currentClientId
      ? projectsByClient.value[clients.currentClientId] ?? []
      : []
  )

  const currentProject = computed(
    () => projects.value.find((p) => p.id === currentProjectId.value) ?? null
  )

  async function fetchAll() {
    if (!auth.isAuthenticated) return
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('projects')
        .select('*')
        .order('display_order', { ascending: true })
      if (err) throw err
      projects.value = (data ?? []) as Project[]

      // Pick a sensible default if none / stale.
      const stillExists = projects.value.some((p) => p.id === currentProjectId.value)
      if (!stillExists) {
        const fallback =
          projectsForCurrentClient.value[0] ?? projects.value[0] ?? null
        currentProjectId.value = fallback?.id ?? null
      }
      loaded.value = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load projects.'
      console.warn('[projects] fetchAll:', error.value)
    } finally {
      loading.value = false
    }
  }

  function applyRealtime(payload: any) {
    const ev = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
    if (ev === 'INSERT') {
      const row = payload.new as Project
      if (!projects.value.some((p) => p.id === row.id)) projects.value.push(row)
    } else if (ev === 'UPDATE') {
      const row = payload.new as Project
      const idx = projects.value.findIndex((p) => p.id === row.id)
      if (idx !== -1) projects.value[idx] = row
      else projects.value.push(row)
    } else if (ev === 'DELETE') {
      const old = payload.old as Project
      projects.value = projects.value.filter((p) => p.id !== old.id)
      if (currentProjectId.value === old.id) currentProjectId.value = null
    }
  }

  function startRealtime() {
    if (channel) return
    channel = supabase
      .channel('bb-projects')
      .on(
        'postgres_changes',
        { event: '*', schema: 'buzzybee', table: 'projects' },
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

  function setCurrentProject(id: string | null) {
    currentProjectId.value = id
  }

  watch(currentProjectId, (id) => {
    if (typeof window === 'undefined') return
    if (id) window.localStorage.setItem(CURRENT_KEY, id)
    else window.localStorage.removeItem(CURRENT_KEY)
  })

  // When the user switches client, pick that client's first project as default
  // (unless the current project already belongs to that client).
  watch(
    () => clients.currentClientId,
    (cid) => {
      if (!cid) return
      if (currentProject.value && currentProject.value.client_id === cid) return
      const first = projectsByClient.value[cid]?.[0]
      if (first) currentProjectId.value = first.id
    }
  )

  watch(
    () => auth.isAuthenticated,
    (isAuthed) => {
      if (isAuthed) {
        void fetchAll()
        startRealtime()
      } else {
        projects.value = []
        loaded.value = false
        void stopRealtime()
      }
    },
    { immediate: true }
  )

  async function createProject(input: {
    name: string
    client_id?: string
    description?: string
  }) {
    if (!auth.user) throw new Error('Not authenticated')
    const cid = input.client_id ?? clients.currentClientId
    if (!cid) throw new Error('No client selected')
    const maxOrder = (projectsByClient.value[cid] ?? []).reduce(
      (m, p) => Math.max(m, p.display_order),
      0
    )
    const { data, error: err } = await supabase
      .from('projects')
      .insert({
        client_id: cid,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        display_order: maxOrder + 10,
        created_by: auth.user.id
      })
      .select('*')
      .single()
    if (err) throw err
    const row = data as Project
    if (!projects.value.some((p) => p.id === row.id)) projects.value.push(row)
    return row
  }

  async function updateProject(id: string, patch: Partial<Project>) {
    const idx = projects.value.findIndex((p) => p.id === id)
    const prev = idx !== -1 ? { ...projects.value[idx] } : null
    if (idx !== -1) projects.value[idx] = { ...projects.value[idx], ...(patch as Partial<Project>) }
    try {
      const { data, error: err } = await supabase
        .from('projects')
        .update(patch as Record<string, unknown>)
        .eq('id', id)
        .select('*')
        .single()
      if (err) throw err
      const row = data as Project
      const i = projects.value.findIndex((p) => p.id === row.id)
      if (i !== -1) projects.value[i] = row
      return row
    } catch (e) {
      if (idx !== -1 && prev) projects.value[idx] = prev
      throw e
    }
  }

  async function deleteProject(id: string) {
    const idx = projects.value.findIndex((p) => p.id === id)
    const prev = idx !== -1 ? projects.value[idx] : null
    if (idx !== -1) projects.value.splice(idx, 1)
    if (currentProjectId.value === id) {
      const fallback = projectsForCurrentClient.value[0] ?? null
      currentProjectId.value = fallback?.id ?? null
    }
    try {
      const { error: err } = await supabase.from('projects').delete().eq('id', id)
      if (err) throw err
    } catch (e) {
      if (prev) projects.value.push(prev)
      throw e
    }
  }

  return {
    projects,
    projectsByClient,
    projectsForCurrentClient,
    currentProject,
    currentProjectId,
    loading,
    error,
    loaded,
    fetchAll,
    setCurrentProject,
    createProject,
    updateProject,
    deleteProject
  }
})
