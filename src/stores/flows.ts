import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import type { FlowGraph } from '@/lib/flowNodes'

// Flows — the form-triggered automation builder's data layer. One flow per form
// (v1). The graph is the node/edge JSON the run-flow edge function executes;
// flow_runs is the read-only audit log the Runs panel shows.

export interface FlowRow {
  id: string
  form_id: string
  name: string
  graph: FlowGraph
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
  context: Record<string, unknown>
  steps: FlowStep[]
  error: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

export const useFlowsStore = defineStore('flows', () => {
  const auth = useAuthStore()
  const error = ref<string | null>(null)

  async function loadForForm(formId: string): Promise<FlowRow | null> {
    const { data, error: err } = await supabase
      .from('flows').select('*').eq('form_id', formId)
      .order('created_at', { ascending: true }).limit(1).maybeSingle()
    if (err) { error.value = err.message; return null }
    return (data as FlowRow) ?? null
  }

  async function createForForm(formId: string): Promise<FlowRow | null> {
    const { data, error: err } = await supabase
      .from('flows')
      .insert({ form_id: formId, name: 'Automation', created_by: auth.user?.id ?? null })
      .select('*').single()
    if (err) { error.value = err.message; return null }
    return data as FlowRow
  }

  /** The builder opens one flow per form, creating it on first visit. */
  async function loadOrCreate(formId: string): Promise<FlowRow | null> {
    return (await loadForForm(formId)) ?? (await createForForm(formId))
  }

  async function save(id: string, patch: Partial<Pick<FlowRow, 'graph' | 'enabled' | 'name'>>): Promise<boolean> {
    const { error: err } = await supabase.from('flows').update(patch).eq('id', id)
    if (err) { error.value = err.message; return false }
    return true
  }

  async function fetchRuns(flowId: string): Promise<FlowRunRow[]> {
    const { data, error: err } = await supabase
      .from('flow_runs').select('*').eq('flow_id', flowId)
      .order('created_at', { ascending: false }).limit(50)
    if (err) { error.value = err.message; return [] }
    return (data ?? []) as FlowRunRow[]
  }

  return { error, loadOrCreate, save, fetchRuns }
})
