import { defineStore, acceptHMRUpdate } from 'pinia'
import { computed, ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useClientsStore } from '@/stores/clients'
import type { StoredDesign } from '@/lib/emailDoc'

// Saved email templates — reusable campaign content (subject/body/layout), no
// audience. Strictly client-scoped: workspaces can belong to different
// companies, so one client's templates must never surface in another's
// (RLS enforces this server-side; the visible filter is belt-and-braces).

export interface EmailTemplate {
  id: string
  clientId: string
  name: string
  subject: string
  bodyHtml: string
  bodyBlocks: StoredDesign | null
  layout: string
  accent: string
  timesUsed: number
  createdBy: string | null
}

const COLS = 'id,client_id,name,subject,body_html,body_blocks,layout,accent,times_used,created_by'

function mapTemplate(r: any): EmailTemplate {
  return {
    id: r.id, clientId: r.client_id, name: r.name,
    subject: r.subject ?? '', bodyHtml: r.body_html,
    bodyBlocks: (r.body_blocks as StoredDesign | null) ?? null,
    layout: r.layout ?? 'clean', accent: r.accent ?? '',
    timesUsed: r.times_used ?? 0, createdBy: r.created_by ?? null,
  }
}
function permMsg(err: { code?: string; message: string }) {
  if (err.code === '42501' || /row-level security|permission denied/i.test(err.message)) {
    return 'you don\'t have permission to manage templates'
  }
  return err.message
}

export const useEmailTemplatesStore = defineStore('emailTemplates', () => {
  const clients = useClientsStore()
  const templates = ref<EmailTemplate[]>([])
  const loaded = ref(false)
  const error = ref<string | null>(null)

  // This workspace's templates only, most-used first.
  const visible = computed(() =>
    templates.value
      .filter((t) => t.clientId === clients.currentClientId)
      .sort((a, b) => b.timesUsed - a.timesUsed || a.name.localeCompare(b.name)))

  async function load(force = false) {
    if (loaded.value && !force) return
    const { data, error: err } = await supabase
      .from('crm_email_templates')
      .select(COLS)
      .order('times_used', { ascending: false })
    if (err) {
      console.warn('[email-templates] load:', err.message)
      return
    }
    templates.value = ((data ?? []) as any[]).map(mapTemplate)
    loaded.value = true
  }

  async function save(input: {
    name: string
    subject: string
    bodyHtml: string
    bodyBlocks: StoredDesign | null
    layout: string
    accent: string
  }): Promise<EmailTemplate | null> {
    if (!clients.currentClientId) {
      error.value = 'Select a client workspace first.'
      return null
    }
    const { useAuthStore } = await import('@/stores/auth')
    const { data, error: err } = await supabase.from('crm_email_templates').insert({
      client_id: clients.currentClientId,
      name: input.name.trim(),
      subject: input.subject.trim() || null,
      body_html: input.bodyHtml,
      body_blocks: input.bodyBlocks,
      layout: input.layout,
      accent: input.accent || null,
      created_by: useAuthStore().user?.id ?? null,
    }).select(COLS).single()
    if (err) {
      error.value = "Couldn't save the template — " + permMsg(err)
      return null
    }
    const t = mapTemplate(data)
    templates.value = [t, ...templates.value]
    return t
  }

  // Full edit from the design studio.
  async function update(id: string, input: {
    name: string
    subject: string
    bodyHtml: string
    bodyBlocks: StoredDesign | null
    layout: string
    accent: string
  }): Promise<boolean> {
    const { data, error: err } = await supabase.from('crm_email_templates').update({
      name: input.name.trim(),
      subject: input.subject.trim() || null,
      body_html: input.bodyHtml,
      body_blocks: input.bodyBlocks,
      layout: input.layout,
      accent: input.accent || null,
    }).eq('id', id).select(COLS).single()
    if (err) {
      error.value = "Couldn't save the design — " + permMsg(err)
      return false
    }
    const t = mapTemplate(data)
    templates.value = templates.value.map((x) => (x.id === id ? t : x))
    return true
  }

  async function rename(id: string, name: string): Promise<boolean> {
    const prev = templates.value
    templates.value = templates.value.map((t) => (t.id === id ? { ...t, name: name.trim() } : t))
    const { error: err } = await supabase.from('crm_email_templates').update({ name: name.trim() }).eq('id', id)
    if (err) {
      templates.value = prev
      error.value = "Couldn't rename the template — " + permMsg(err)
      return false
    }
    return true
  }

  async function remove(id: string): Promise<boolean> {
    const prev = templates.value
    templates.value = templates.value.filter((t) => t.id !== id)
    const { error: err } = await supabase.from('crm_email_templates').delete().eq('id', id)
    if (err) {
      templates.value = prev
      error.value = "Couldn't delete the template — " + permMsg(err)
      return false
    }
    return true
  }

  // Fire-and-forget popularity bump on apply (sorts the picker over time).
  function bumpUsage(id: string) {
    const t = templates.value.find((x) => x.id === id)
    if (!t) return
    templates.value = templates.value.map((x) => (x.id === id ? { ...x, timesUsed: x.timesUsed + 1 } : x))
    void supabase.from('crm_email_templates').update({ times_used: t.timesUsed + 1 }).eq('id', id)
  }

  return { templates, visible, loaded, error, load, save, update, rename, remove, bumpUsage }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useEmailTemplatesStore, import.meta.hot))
}
