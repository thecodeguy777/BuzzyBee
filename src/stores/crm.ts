import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useTeamStore } from '@/stores/team'
import { useClientsStore } from '@/stores/clients'
import type {
  Company, Contact, Deal, Activity, LinkedTask, StageId, Health, ActivityType,
} from '@/lib/crmData'

function initialsOf(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?'
}
function statusDot(status: string | null | undefined) {
  const s = (status ?? '').toLowerCase()
  if (s.includes('done') || s.includes('complete')) return '#15803d'
  if (s.includes('block')) return '#c2253c'
  if (s.includes('review')) return '#1d4ed8'
  if (s.includes('progress') || s.includes('doing')) return '#b45309'
  if (s.includes('cancel')) return '#8b8a93'
  return '#5b5b63'
}
// RLS scopes CRM writes to pm/admin — turn a denial into something human.
function permMsg(err: { code?: string; message: string }) {
  if (err.code === '42501' || /row-level security|permission denied/i.test(err.message)) {
    return 'you don\'t have permission to change CRM data'
  }
  return err.message
}
function mapDeal(r: any): Deal {
  return {
    id: r.id, title: r.title, companyId: r.company_id, stage: r.stage as StageId, value: Number(r.value) || 0,
    ownerId: r.owner_id, close: r.close_on ?? '—', source: r.source ?? '', health: (r.health ?? 'warm') as Health,
    priority: r.priority ?? 'Medium', channelId: r.channel_id, channelName: r.channel?.name ?? null, sort: Number(r.sort) || 0,
  }
}
function mapCompany(r: any): Company {
  return {
    id: r.id, name: r.name, initials: initialsOf(r.name), color: r.color ?? 'var(--accent)',
    industry: r.industry ?? '', isClient: !!r.is_client, clientId: r.client_id,
    channelId: r.channel_id, channelName: r.channel?.name ?? null, site: r.site ?? '',
  }
}
function mapContact(r: any): Contact {
  return {
    id: r.id, companyId: r.company_id, name: r.name, initials: initialsOf(r.name),
    role: r.role ?? '', email: r.email ?? '', phone: r.phone ?? '', color: r.color ?? 'var(--accent)',
    primary: !!r.is_primary,
  }
}

export const useCrmStore = defineStore('crm', () => {
  const companies = ref<Record<string, Company>>({})
  const contacts = ref<Contact[]>([])
  const deals = ref<Deal[]>([])
  const linkedByDeal = ref<Record<string, LinkedTask[]>>({})
  const activitiesByDeal = ref<Record<string, Activity[]>>({})
  const loaded = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const clients = useClientsStore()
  let channel: RealtimeChannel | null = null
  const pending = new Set<string>() // deal ids with an unconfirmed local write

  const company = (id: string) => companies.value[id]
  const contactsFor = (companyId: string) => contacts.value.filter((c) => c.companyId === companyId)
  const linkedTasks = (dealId: string) => linkedByDeal.value[dealId] ?? []
  const activities = (dealId: string) => activitiesByDeal.value[dealId] ?? []

  // The CRM is a per-client workspace: only ever load the selected client's
  // companies/deals (and the contacts/links that belong to them).
  async function load() {
    if (loading.value) return
    const cid = clients.currentClientId
    loading.value = true
    try {
      if (!cid) {
        companies.value = {}; contacts.value = []; deals.value = []; linkedByDeal.value = {}
        loaded.value = true
        return
      }
      const [coRes, deRes] = await Promise.all([
        supabase.from('crm_companies').select('id,name,industry,site,color,is_client,client_id,channel_id, channel:channels(name)').eq('client_id', cid),
        supabase.from('crm_deals').select('id,title,company_id,stage,value,owner_id,close_on,source,health,priority,channel_id,sort, channel:channels(name)').eq('client_id', cid).order('sort').order('created_at'),
      ])

      const coMap: Record<string, Company> = {}
      for (const r of (coRes.data ?? []) as any[]) coMap[r.id] = mapCompany(r)
      companies.value = coMap
      deals.value = ((deRes.data ?? []) as any[]).map(mapDeal)

      const companyIds = Object.keys(coMap)
      const dealIds = deals.value.map((d) => d.id)
      const [ctRes, dtRes] = await Promise.all([
        companyIds.length
          ? supabase.from('crm_contacts').select('id,company_id,name,role,email,phone,color,is_primary').in('company_id', companyIds)
          : Promise.resolve({ data: [] as any[] }),
        dealIds.length
          ? supabase.from('crm_deal_tasks').select('deal_id,task_id, task:tasks(reference_number,title,status)').in('deal_id', dealIds)
          : Promise.resolve({ data: [] as any[] }),
      ])

      contacts.value = ((ctRes.data ?? []) as any[]).map(mapContact)

      const linked: Record<string, LinkedTask[]> = {}
      for (const r of (dtRes.data ?? []) as any[]) {
        const t = r.task
        ;(linked[r.deal_id] ??= []).push({
          taskId: r.task_id, ref: t?.reference_number ?? '', title: t?.title ?? 'Linked task',
          status: t?.status ?? '', dot: statusDot(t?.status),
        })
      }
      linkedByDeal.value = linked

      const ownerIds = [...new Set(deals.value.map((d) => d.ownerId).filter(Boolean))] as string[]
      if (ownerIds.length) void useTeamStore().fetchProfiles(ownerIds)

      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  // Refetch just the deals (after an insert/delete elsewhere) without flattening
  // the whole module or clobbering an in-flight optimistic move.
  async function reloadDeals() {
    const cid = clients.currentClientId
    if (!cid) { deals.value = []; return }
    const { data } = await supabase
      .from('crm_deals')
      .select('id,title,company_id,stage,value,owner_id,close_on,source,health,priority,channel_id,sort, channel:channels(name)')
      .eq('client_id', cid)
      .order('sort').order('created_at')
    const next = ((data ?? []) as any[]).map(mapDeal)
    // Preserve any deal we have a pending local write for.
    deals.value = next.map((d) => (pending.has(d.id) ? deals.value.find((x) => x.id === d.id) ?? d : d))
  }

  async function loadActivities(dealId: string, force = false) {
    if (activitiesByDeal.value[dealId] && !force) return
    const { data } = await supabase
      .from('crm_deal_activities')
      .select('id,deal_id,type,actor_id,body,meta,created_at')
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false })
    const acts: Activity[] = ((data ?? []) as any[]).map((r) => ({
      id: r.id, dealId: r.deal_id, type: r.type as ActivityType, actorId: r.actor_id,
      body: r.body, meta: r.meta, createdAt: r.created_at,
    }))
    activitiesByDeal.value = { ...activitiesByDeal.value, [dealId]: acts }
    const ids = [...new Set(acts.map((a) => a.actorId).filter(Boolean))] as string[]
    if (ids.length) void useTeamStore().fetchProfiles(ids)
  }

  async function move(id: string, stage: StageId) {
    const idx = deals.value.findIndex((d) => d.id === id)
    if (idx === -1) return
    const prev = deals.value[idx].stage
    if (prev === stage) return
    deals.value = deals.value.map((d) => (d.id === id ? { ...d, stage } : d))
    pending.add(id)
    const patch: Record<string, unknown> = { stage }
    if (stage === 'won') patch.won_at = new Date().toISOString()
    const { error: err } = await supabase.from('crm_deals').update(patch).eq('id', id)
    pending.delete(id)
    if (err) {
      deals.value = deals.value.map((d) => (d.id === id ? { ...d, stage: prev } : d))
      error.value = "Couldn't move that deal — " + err.message
    }
  }

  // Real conversion: create (or reuse) a client record, link it, flip is_client.
  async function convert(deal: Deal): Promise<boolean> {
    const co = companies.value[deal.companyId]
    if (!co) return false
    const snapshot = { ...co }
    try {
      let clientId = co.clientId
      if (!clientId) {
        const { useClientsStore } = await import('@/stores/clients')
        const client = await useClientsStore().createClient({ name: co.name })
        clientId = client.id
      }
      companies.value = { ...companies.value, [deal.companyId]: { ...co, isClient: true, clientId } }
      const { error: err } = await supabase
        .from('crm_companies')
        .update({ is_client: true, client_id: clientId })
        .eq('id', deal.companyId)
      if (err) throw err
      return true
    } catch (e) {
      companies.value = { ...companies.value, [deal.companyId]: snapshot }
      error.value = "Couldn't convert — " + (e as Error).message
      return false
    }
  }

  async function createDeal(input: {
    title: string; companyId: string; stage: StageId; value: number; close: string; source: string
    ownerId?: string | null; health?: Health; channelId?: string | null; kickoffTask?: boolean
  }): Promise<boolean> {
    const { useAuthStore } = await import('@/stores/auth')
    const me = useAuthStore().user?.id ?? null
    const { data, error: err } = await supabase.from('crm_deals').insert({
      title: input.title.trim(), company_id: input.companyId, stage: input.stage,
      value: input.value, owner_id: input.ownerId ?? me, close_on: input.close || null,
      source: input.source || null, health: input.health ?? 'warm', channel_id: input.channelId ?? null,
      client_id: clients.currentClientId, created_by: me,
    }).select('id').single()
    if (err) {
      error.value = "Couldn't create deal — " + permMsg(err)
      return false
    }
    // Kickoff task on win — best-effort (the deal already exists; don't fail it).
    if (input.kickoffTask && input.stage === 'won' && data?.id) {
      try {
        const { useTasksStore } = await import('@/stores/tasks')
        const co = companies.value[input.companyId]
        const task = await useTasksStore().createTask({ title: 'Kickoff: ' + input.title.trim(), client_id: co?.clientId ?? undefined })
        if (task?.id) await linkTask(data.id, task.id)
      } catch (e) {
        error.value = 'Deal created, but the kickoff task could not be added — ' + (e as Error).message
      }
    }
    await reloadDeals()
    return true
  }

  // ── Deal update / delete ─────────────────────────────────────────────────────
  async function updateDeal(
    id: string,
    patch: Partial<Pick<Deal, 'title' | 'value' | 'close' | 'source' | 'health' | 'priority' | 'ownerId' | 'channelId'>>,
  ): Promise<boolean> {
    const idx = deals.value.findIndex((d) => d.id === id)
    if (idx === -1) return false
    const prev = deals.value[idx]
    deals.value = deals.value.map((d) => (d.id === id ? { ...d, ...patch } : d))
    pending.add(id)
    const db: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (patch.title !== undefined) db.title = patch.title.trim()
    if (patch.value !== undefined) db.value = patch.value
    if (patch.close !== undefined) db.close_on = patch.close || null
    if (patch.source !== undefined) db.source = patch.source || null
    if (patch.health !== undefined) db.health = patch.health
    if (patch.priority !== undefined) db.priority = patch.priority
    if (patch.ownerId !== undefined) db.owner_id = patch.ownerId
    if (patch.channelId !== undefined) db.channel_id = patch.channelId
    const { error: err } = await supabase.from('crm_deals').update(db).eq('id', id)
    pending.delete(id)
    if (err) {
      deals.value = deals.value.map((d) => (d.id === id ? prev : d))
      error.value = "Couldn't save changes — " + permMsg(err)
      return false
    }
    if (patch.ownerId !== undefined && patch.ownerId) void useTeamStore().fetchProfiles([patch.ownerId])
    return true
  }

  async function deleteDeal(id: string): Promise<boolean> {
    const removed = deals.value.find((d) => d.id === id)
    if (!removed) return false
    deals.value = deals.value.filter((d) => d.id !== id)
    const { error: err } = await supabase.from('crm_deals').delete().eq('id', id)
    if (err) {
      deals.value = [...deals.value, removed]
      error.value = "Couldn't delete that deal — " + permMsg(err)
      return false
    }
    const acts = { ...activitiesByDeal.value }; delete acts[id]; activitiesByDeal.value = acts
    const links = { ...linkedByDeal.value }; delete links[id]; linkedByDeal.value = links
    return true
  }

  // ── Companies ────────────────────────────────────────────────────────────────
  async function createCompany(input: {
    name: string; industry?: string; site?: string; color?: string; channelId?: string | null
  }): Promise<Company | null> {
    const { useAuthStore } = await import('@/stores/auth')
    const { data, error: err } = await supabase.from('crm_companies').insert({
      name: input.name.trim(), industry: input.industry || null, site: input.site || null,
      color: input.color || null, channel_id: input.channelId ?? null,
      client_id: clients.currentClientId, created_by: useAuthStore().user?.id ?? null,
    }).select('id,name,industry,site,color,is_client,client_id,channel_id, channel:channels(name)').single()
    if (err) {
      error.value = "Couldn't create company — " + permMsg(err)
      return null
    }
    const co = mapCompany(data)
    companies.value = { ...companies.value, [co.id]: co }
    return co
  }

  async function updateCompany(id: string, patch: Partial<Pick<Company, 'name' | 'industry' | 'site' | 'color' | 'channelId'>>): Promise<boolean> {
    const prev = companies.value[id]
    if (!prev) return false
    companies.value = { ...companies.value, [id]: { ...prev, ...patch, initials: patch.name ? initialsOf(patch.name) : prev.initials } }
    const db: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (patch.name !== undefined) db.name = patch.name.trim()
    if (patch.industry !== undefined) db.industry = patch.industry || null
    if (patch.site !== undefined) db.site = patch.site || null
    if (patch.color !== undefined) db.color = patch.color
    if (patch.channelId !== undefined) db.channel_id = patch.channelId
    const { error: err } = await supabase.from('crm_companies').update(db).eq('id', id)
    if (err) {
      companies.value = { ...companies.value, [id]: prev }
      error.value = "Couldn't save the company — " + permMsg(err)
      return false
    }
    return true
  }

  async function deleteCompany(id: string): Promise<boolean> {
    const prevCo = companies.value[id]
    if (!prevCo) return false
    const prevDeals = deals.value
    const prevContacts = contacts.value
    const next = { ...companies.value }; delete next[id]; companies.value = next
    deals.value = deals.value.filter((d) => d.companyId !== id) // mirror the DB cascade
    contacts.value = contacts.value.filter((c) => c.companyId !== id)
    const { error: err } = await supabase.from('crm_companies').delete().eq('id', id)
    if (err) {
      companies.value = { ...companies.value, [id]: prevCo }
      deals.value = prevDeals
      contacts.value = prevContacts
      error.value = "Couldn't delete the company — " + permMsg(err)
      return false
    }
    return true
  }

  // ── Contacts ─────────────────────────────────────────────────────────────────
  async function addContact(input: {
    companyId: string; name: string; role?: string; email?: string; phone?: string; isPrimary?: boolean
  }): Promise<Contact | null> {
    const { data, error: err } = await supabase.from('crm_contacts').insert({
      company_id: input.companyId, name: input.name.trim(), role: input.role || null,
      email: input.email || null, phone: input.phone || null, is_primary: !!input.isPrimary,
    }).select('id,company_id,name,role,email,phone,color,is_primary').single()
    if (err) {
      error.value = "Couldn't add contact — " + permMsg(err)
      return null
    }
    const c = mapContact(data)
    contacts.value = [...contacts.value, c]
    return c
  }

  async function updateContact(id: string, patch: Partial<Pick<Contact, 'name' | 'role' | 'email' | 'phone' | 'primary'>>): Promise<boolean> {
    const idx = contacts.value.findIndex((c) => c.id === id)
    if (idx === -1) return false
    const prev = contacts.value[idx]
    contacts.value = contacts.value.map((c) => (c.id === id ? { ...c, ...patch, initials: patch.name ? initialsOf(patch.name) : c.initials } : c))
    const db: Record<string, unknown> = {}
    if (patch.name !== undefined) db.name = patch.name.trim()
    if (patch.role !== undefined) db.role = patch.role || null
    if (patch.email !== undefined) db.email = patch.email || null
    if (patch.phone !== undefined) db.phone = patch.phone || null
    if (patch.primary !== undefined) db.is_primary = patch.primary
    const { error: err } = await supabase.from('crm_contacts').update(db).eq('id', id)
    if (err) {
      contacts.value = contacts.value.map((c) => (c.id === id ? prev : c))
      error.value = "Couldn't save the contact — " + permMsg(err)
      return false
    }
    return true
  }

  async function deleteContact(id: string): Promise<boolean> {
    const removed = contacts.value.find((c) => c.id === id)
    if (!removed) return false
    contacts.value = contacts.value.filter((c) => c.id !== id)
    const { error: err } = await supabase.from('crm_contacts').delete().eq('id', id)
    if (err) {
      contacts.value = [...contacts.value, removed]
      error.value = "Couldn't delete the contact — " + permMsg(err)
      return false
    }
    return true
  }

  // ── Activities ───────────────────────────────────────────────────────────────
  async function logActivity(dealId: string, a: { type: ActivityType; body: string; meta?: string | null }): Promise<boolean> {
    const { useAuthStore } = await import('@/stores/auth')
    const actor = useAuthStore().user?.id ?? null
    const { data, error: err } = await supabase.from('crm_deal_activities').insert({
      deal_id: dealId, type: a.type, actor_id: actor, body: a.body.trim(), meta: a.meta ?? null,
    }).select('id,deal_id,type,actor_id,body,meta,created_at').single()
    if (err) {
      error.value = "Couldn't log that — " + permMsg(err)
      return false
    }
    const act: Activity = {
      id: data.id, dealId: data.deal_id, type: data.type as ActivityType, actorId: data.actor_id,
      body: data.body, meta: data.meta, createdAt: data.created_at,
    }
    activitiesByDeal.value = { ...activitiesByDeal.value, [dealId]: [act, ...(activitiesByDeal.value[dealId] ?? [])] }
    return true
  }

  async function deleteActivity(dealId: string, id: string): Promise<boolean> {
    const list = activitiesByDeal.value[dealId] ?? []
    const removed = list.find((x) => x.id === id)
    if (!removed) return false
    activitiesByDeal.value = { ...activitiesByDeal.value, [dealId]: list.filter((x) => x.id !== id) }
    const { error: err } = await supabase.from('crm_deal_activities').delete().eq('id', id)
    if (err) {
      activitiesByDeal.value = { ...activitiesByDeal.value, [dealId]: list }
      error.value = "Couldn't delete that entry — " + permMsg(err)
      return false
    }
    return true
  }

  // ── Deal ↔ task links ────────────────────────────────────────────────────────
  async function linkTask(dealId: string, taskId: string): Promise<boolean> {
    if ((linkedByDeal.value[dealId] ?? []).some((t) => t.taskId === taskId)) return true
    const { error: err } = await supabase.from('crm_deal_tasks').insert({ deal_id: dealId, task_id: taskId })
    if (err) {
      error.value = "Couldn't link that task — " + permMsg(err)
      return false
    }
    const { data } = await supabase.from('tasks').select('reference_number,title,status').eq('id', taskId).single()
    const lt: LinkedTask = {
      taskId, ref: (data as any)?.reference_number ?? '', title: (data as any)?.title ?? 'Linked task',
      status: (data as any)?.status ?? '', dot: statusDot((data as any)?.status),
    }
    linkedByDeal.value = { ...linkedByDeal.value, [dealId]: [...(linkedByDeal.value[dealId] ?? []), lt] }
    return true
  }

  async function unlinkTask(dealId: string, taskId: string): Promise<boolean> {
    const prev = linkedByDeal.value[dealId] ?? []
    linkedByDeal.value = { ...linkedByDeal.value, [dealId]: prev.filter((t) => t.taskId !== taskId) }
    const { error: err } = await supabase.from('crm_deal_tasks').delete().eq('deal_id', dealId).eq('task_id', taskId)
    if (err) {
      linkedByDeal.value = { ...linkedByDeal.value, [dealId]: prev }
      error.value = "Couldn't unlink that task — " + permMsg(err)
      return false
    }
    return true
  }

  function subscribe() {
    if (channel) return
    channel = supabase
      .channel('bb-crm-deals')
      .on('postgres_changes', { event: '*', schema: 'buzzybee', table: 'crm_deals' }, (p: any) => {
        const ev = p.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
        if (ev === 'DELETE') {
          deals.value = deals.value.filter((d) => d.id !== p.old?.id)
        } else if (ev === 'UPDATE') {
          const row = p.new
          if (!row || pending.has(row.id)) return // ignore our own in-flight write
          const idx = deals.value.findIndex((d) => d.id === row.id)
          if (idx === -1) { void reloadDeals(); return }
          // Patch scalar fields; keep the embedded channelName/companyId we already have.
          const cur = deals.value[idx]
          const patched = { ...mapDeal(row), channelName: cur.channelName }
          deals.value = deals.value.map((d) => (d.id === row.id ? patched : d))
        } else {
          void reloadDeals() // INSERT — needs the channel embed
        }
      })
      .subscribe()
  }
  async function unsubscribe() {
    if (channel) {
      try { await supabase.removeChannel(channel) } catch { /* ignore */ }
      channel = null
    }
  }

  return {
    companies, contacts, deals, loaded, loading, error,
    company, contactsFor, linkedTasks, activities,
    load, loadActivities, move, convert,
    createDeal, updateDeal, deleteDeal,
    createCompany, updateCompany, deleteCompany,
    addContact, updateContact, deleteContact,
    logActivity, deleteActivity, linkTask, unlinkTask,
    subscribe, unsubscribe,
  }
})

// Hot-swap the store on edit instead of leaving a stale singleton (which caused
// "createDeal is not a function" after adding an action mid-session).
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCrmStore, import.meta.hot))
}
