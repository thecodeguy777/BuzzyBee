import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'

export type FieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'checkbox'
  | 'select'
  | 'multi_select'
  | 'url'

export interface FieldOption {
  value: string
  label: string
  color?: string
}

export interface TaskFieldDef {
  id: string
  client_id: string
  key: string
  label: string
  field_type: FieldType
  options: FieldOption[]
  required: boolean
  display_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export const useTaskFieldsStore = defineStore('taskFields', () => {
  const auth = useAuthStore()
  const clients = useClientsStore()

  const defs = ref<TaskFieldDef[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  let channel: RealtimeChannel | null = null

  const defsForCurrentClient = computed(() =>
    defs.value
      .filter((d) => d.client_id === clients.currentClientId)
      .sort((a, b) => a.display_order - b.display_order || a.label.localeCompare(b.label))
  )

  async function fetchAll() {
    if (!auth.isAuthenticated) return
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('task_field_defs')
        .select('*')
        .order('display_order', { ascending: true })
      if (err) throw err
      defs.value = (data ?? []) as TaskFieldDef[]
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load custom fields.'
      console.warn('[taskFields] fetchAll:', error.value)
    } finally {
      loading.value = false
    }
  }

  function applyRealtime(payload: any) {
    const ev = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
    if (ev === 'INSERT') {
      const row = payload.new as TaskFieldDef
      if (!defs.value.some((d) => d.id === row.id)) defs.value.push(row)
    } else if (ev === 'UPDATE') {
      const row = payload.new as TaskFieldDef
      const idx = defs.value.findIndex((d) => d.id === row.id)
      if (idx !== -1) defs.value[idx] = row
      else defs.value.push(row)
    } else if (ev === 'DELETE') {
      const old = payload.old as TaskFieldDef
      defs.value = defs.value.filter((d) => d.id !== old.id)
    }
  }

  function startRealtime() {
    if (channel) return
    channel = supabase
      .channel('bb-task-field-defs')
      .on(
        'postgres_changes',
        { event: '*', schema: 'buzzybee', table: 'task_field_defs' },
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

  function slugify(label: string) {
    return label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'field'
  }

  async function uniqueKey(clientId: string, base: string) {
    let key = base
    let n = 2
    while (defs.value.some((d) => d.client_id === clientId && d.key === key)) {
      key = `${base}_${n++}`
    }
    return key
  }

  async function addField(input: {
    label: string
    field_type: FieldType
    options?: FieldOption[]
    required?: boolean
  }) {
    if (!clients.currentClientId) throw new Error('No client selected')
    if (!auth.user) throw new Error('Not authenticated')
    const baseKey = slugify(input.label)
    const key = await uniqueKey(clients.currentClientId, baseKey)
    const maxOrder = defsForCurrentClient.value.reduce(
      (m, d) => Math.max(m, d.display_order),
      0
    )

    const { data, error: err } = await supabase
      .from('task_field_defs')
      .insert({
        client_id: clients.currentClientId,
        key,
        label: input.label.trim(),
        field_type: input.field_type,
        options: input.options ?? [],
        required: input.required ?? false,
        display_order: maxOrder + 10,
        created_by: auth.user.id
      })
      .select('*')
      .single()
    if (err) throw err
    const row = data as TaskFieldDef
    if (!defs.value.some((d) => d.id === row.id)) defs.value.push(row)
    return row
  }

  async function updateField(id: string, patch: Partial<TaskFieldDef>) {
    const idx = defs.value.findIndex((d) => d.id === id)
    const prev = idx !== -1 ? { ...defs.value[idx] } : null
    if (idx !== -1) defs.value[idx] = { ...defs.value[idx], ...(patch as Partial<TaskFieldDef>) }
    try {
      const { data, error: err } = await supabase
        .from('task_field_defs')
        .update(patch as Record<string, unknown>)
        .eq('id', id)
        .select('*')
        .single()
      if (err) throw err
      const row = data as TaskFieldDef
      const i = defs.value.findIndex((d) => d.id === row.id)
      if (i !== -1) defs.value[i] = row
      return row
    } catch (e) {
      // Re-find by id — realtime events may have shifted the array while the
      // request was in flight.
      const j = defs.value.findIndex((d) => d.id === id)
      if (j !== -1 && prev) defs.value[j] = prev
      throw e
    }
  }

  async function deleteField(id: string) {
    const idx = defs.value.findIndex((d) => d.id === id)
    const prev = idx !== -1 ? defs.value[idx] : null
    if (idx !== -1) defs.value.splice(idx, 1)
    try {
      const { error: err } = await supabase.from('task_field_defs').delete().eq('id', id)
      if (err) throw err
    } catch (e) {
      if (prev) defs.value.push(prev)
      throw e
    }
  }

  watch(
    () => auth.isAuthenticated,
    (isAuthed) => {
      if (isAuthed) {
        void fetchAll()
        startRealtime()
      } else {
        defs.value = []
        void stopRealtime()
      }
    },
    { immediate: true }
  )

  return {
    defs,
    defsForCurrentClient,
    loading,
    error,
    fetchAll,
    addField,
    updateField,
    deleteField,
    startRealtime,
    stopRealtime
  }
})
