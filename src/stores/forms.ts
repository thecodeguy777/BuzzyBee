import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'
import type { FormStructure } from '@/lib/formFields'
import { buildTemplate } from '@/lib/formFields'

// Forms — the intake builder. Members build/manage forms (RLS scopes them to
// their clients); the public fill page + submission→task run server-side via
// SECURITY DEFINER RPCs (get_public_form / submit_form).

export interface FormRow {
  id: string
  client_id: string | null
  project_id: string | null
  title: string
  description: string | null
  submit_label: string
  multi: boolean
  land_status_key: string | null
  structure: FormStructure
  public_token: string
  published: boolean
  submission_count: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface FormResponse {
  id: string
  form_id: string
  /** Answers keyed by field id. */
  values: Record<string, unknown>
  created_task_id: string | null
  submitted_at: string
}

export const useFormsStore = defineStore('forms', () => {
  const auth = useAuthStore()
  const clients = useClientsStore()

  const forms = ref<FormRow[]>([])
  const loaded = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Scoped to the active client workspace (like emailTemplates.visible / the CRM).
  const visible = computed(() => forms.value.filter((f) => f.client_id === clients.currentClientId))
  // Forms not tied to any client yet — surfaced as "Unfiled" so they're never lost.
  const unfiled = computed(() => forms.value.filter((f) => !f.client_id))

  async function fetchAll() {
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('forms')
        .select('*')
        .order('updated_at', { ascending: false })
      if (err) throw err
      forms.value = (data ?? []) as FormRow[]
      loaded.value = true
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  function byId(id: string): FormRow | null {
    return forms.value.find((f) => f.id === id) ?? null
  }

  async function load(id: string): Promise<FormRow | null> {
    const cached = byId(id)
    if (cached) return cached
    const { data, error: err } = await supabase.from('forms').select('*').eq('id', id).maybeSingle()
    if (err) {
      error.value = err.message
      return null
    }
    if (data) {
      const row = data as FormRow
      forms.value = [row, ...forms.value.filter((f) => f.id !== row.id)]
      return row
    }
    return null
  }

  /** Create a fresh form seeded from the "Client request" template. */
  async function createForm(): Promise<FormRow | null> {
    const built = buildTemplate('Client request')
    const { data, error: err } = await supabase
      .from('forms')
      .insert({
        title: 'New client request',
        description: "Tell us what you need and we'll create a task for it.",
        submit_label: 'Submit request',
        multi: built.multi,
        structure: { steps: built.steps },
        client_id: clients.currentClientId ?? null,
        created_by: auth.user?.id ?? null,
      })
      .select('*')
      .single()
    if (err) {
      error.value = err.message
      return null
    }
    const row = data as FormRow
    forms.value = [row, ...forms.value]
    return row
  }

  async function save(id: string, patch: Partial<FormRow>): Promise<boolean> {
    // Optimistic — the builder autosaves on a debounce, so keep local in step.
    const prev = forms.value
    forms.value = forms.value.map((f) => (f.id === id ? { ...f, ...patch } : f))
    const { error: err } = await supabase.from('forms').update(patch).eq('id', id)
    if (err) {
      forms.value = prev
      error.value = err.message
      return false
    }
    return true
  }

  /** Copy a form (fields/layout/settings) into a client — the reuse path. Cross-
   *  client copies drop the project/status link (they belong to the old client). */
  async function cloneForm(sourceId: string, targetClientId: string | null): Promise<FormRow | null> {
    const src = byId(sourceId) ?? (await load(sourceId))
    if (!src) return null
    const sameClient = targetClientId === src.client_id
    const { data, error: err } = await supabase
      .from('forms')
      .insert({
        title: src.title + ' (copy)',
        description: src.description,
        submit_label: src.submit_label,
        multi: src.multi,
        structure: JSON.parse(JSON.stringify(src.structure)),
        client_id: targetClientId,
        project_id: sameClient ? src.project_id : null,
        land_status_key: sameClient ? src.land_status_key : null,
        created_by: auth.user?.id ?? null,
      })
      .select('*')
      .single()
    if (err) { error.value = err.message; return null }
    const row = data as FormRow
    forms.value = [row, ...forms.value]
    return row
  }

  async function remove(id: string): Promise<boolean> {
    const prev = forms.value
    forms.value = forms.value.filter((f) => f.id !== id)
    const { error: err } = await supabase.from('forms').delete().eq('id', id)
    if (err) {
      forms.value = prev
      error.value = err.message
      return false
    }
    return true
  }

  /** Submissions for one form, newest first. RLS (form_responses_read) scopes
   *  this to people who can see the form. */
  async function fetchResponses(formId: string): Promise<FormResponse[]> {
    const { data, error: err } = await supabase
      .from('form_responses')
      .select('*')
      .eq('form_id', formId)
      .order('submitted_at', { ascending: false })
    if (err) {
      error.value = err.message
      return []
    }
    return (data ?? []) as FormResponse[]
  }

  return { forms, visible, unfiled, loaded, loading, error, fetchAll, byId, load, createForm, cloneForm, save, remove, fetchResponses }
})

// ── Public (anon) helpers — used by the /f/:token fill page ───────────────────
export interface PublicForm {
  id: string
  title: string
  description: string | null
  submit_label: string
  multi: boolean
  structure: FormStructure
}

export async function fetchPublicForm(token: string): Promise<PublicForm | null> {
  const { data, error } = await supabase.rpc('get_public_form', { p_token: token })
  if (error || !data) return null
  return data as PublicForm
}

export async function submitPublicForm(
  token: string,
  values: Record<string, unknown>,
): Promise<{ ok: boolean; taskCreated?: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('submit_form', { p_token: token, p_values: values })
  if (error) return { ok: false, error: error.message }
  const r = data as { ok: boolean; task_created?: boolean; error?: string }
  return { ok: r.ok, taskCreated: r.task_created, error: r.error }
}
