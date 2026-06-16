import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'
import type { FlowGraph } from '@/lib/flowNodes'

// Flows — the event-driven automation builder's data layer. A flow belongs to a
// client and carries a trigger ({type, config}); the graph is what the run-flow
// edge function executes; flow_runs is the read-only audit log.

export interface FlowTrigger { type: string; config: Record<string, any> }

export interface FlowRow {
  id: string
  form_id: string | null
  client_id: string | null
  name: string
  graph: FlowGraph
  trigger: FlowTrigger
  enabled: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface FlowStep {
  node_id: string
  type: string
  status: 'done' | 'failed' | 'skipped'
  output?: unknown
  error?: string
  at: string
}

export interface FlowRunRow {
  id: string
  flow_id: string
  form_response_id: string | null
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'waiting'
  trigger_type: string | null
  source: Record<string, unknown>
  context: Record<string, unknown>
  steps: FlowStep[]
  error: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

export const useFlowsStore = defineStore('flows', () => {
  const auth = useAuthStore()
  const clients = useClientsStore()

  const flows = ref<FlowRow[]>([])
  const loaded = ref(false)
  const error = ref<string | null>(null)

  // Scoped to the active client workspace, newest first.
  const visible = computed(() => flows.value.filter((f) => f.client_id === clients.currentClientId))

  async function fetchAll() {
    const { data, error: err } = await supabase.from('flows').select('*').order('updated_at', { ascending: false })
    if (err) { error.value = err.message; return }
    flows.value = (data ?? []) as FlowRow[]
    loaded.value = true
  }

  function byId(id: string): FlowRow | null {
    return flows.value.find((f) => f.id === id) ?? null
  }

  async function loadById(id: string): Promise<FlowRow | null> {
    const cached = byId(id)
    if (cached) return cached
    const { data, error: err } = await supabase.from('flows').select('*').eq('id', id).maybeSingle()
    if (err) { error.value = err.message; return null }
    if (!data) return null
    const row = data as FlowRow
    flows.value = [row, ...flows.value.filter((f) => f.id !== row.id)]
    return row
  }

  async function loadForForm(formId: string): Promise<FlowRow | null> {
    const { data, error: err } = await supabase
      .from('flows').select('*').eq('form_id', formId)
      .order('created_at', { ascending: true }).limit(1).maybeSingle()
    if (err) { error.value = err.message; return null }
    return (data as FlowRow) ?? null
  }

  /** The form's "Automation" tab: find-or-create that form's flow. */
  async function loadOrCreate(formId: string): Promise<FlowRow | null> {
    const existing = await loadForForm(formId)
    if (existing) return existing
    const { data: f } = await supabase.from('forms').select('client_id').eq('id', formId).maybeSingle()
    const { data, error: err } = await supabase.from('flows').insert({
      form_id: formId,
      client_id: (f as { client_id: string | null } | null)?.client_id ?? clients.currentClientId ?? null,
      name: 'Automation',
      trigger: { type: 'form_submitted', config: { form_id: formId } },
      created_by: auth.user?.id ?? null,
    }).select('*').single()
    if (err) { error.value = err.message; return null }
    const row = data as FlowRow
    flows.value = [row, ...flows.value]
    return row
  }

  /** Standalone "New automation": a flow scoped to the current client. */
  async function create(trigger: FlowTrigger, name = 'Untitled automation'): Promise<FlowRow | null> {
    const { data, error: err } = await supabase.from('flows').insert({
      client_id: clients.currentClientId ?? null,
      name, trigger, created_by: auth.user?.id ?? null,
    }).select('*').single()
    if (err) { error.value = err.message; return null }
    const row = data as FlowRow
    flows.value = [row, ...flows.value]
    return row
  }

  async function save(id: string, patch: Partial<Pick<FlowRow, 'graph' | 'enabled' | 'name' | 'trigger'>>): Promise<boolean> {
    flows.value = flows.value.map((f) => (f.id === id ? ({ ...f, ...patch } as FlowRow) : f))
    const { error: err } = await supabase.from('flows').update(patch).eq('id', id)
    if (err) { error.value = err.message; return false }
    return true
  }

  async function remove(id: string): Promise<boolean> {
    const prev = flows.value
    flows.value = flows.value.filter((f) => f.id !== id)
    const { error: err } = await supabase.from('flows').delete().eq('id', id)
    if (err) { flows.value = prev; error.value = err.message; return false }
    return true
  }

  async function fetchRuns(flowId: string): Promise<FlowRunRow[]> {
    const { data, error: err } = await supabase
      .from('flow_runs').select('*').eq('flow_id', flowId)
      .order('created_at', { ascending: false }).limit(50)
    if (err) { error.value = err.message; return [] }
    return (data ?? []) as FlowRunRow[]
  }

  return { flows, visible, loaded, error, fetchAll, byId, loadById, loadForForm, loadOrCreate, create, save, remove, fetchRuns }
})
