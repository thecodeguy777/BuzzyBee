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
    address: r.address ?? '', city: r.city ?? '', country: r.country ?? '',
    employees: r.employees ?? null, annualRevenue: r.annual_revenue != null ? Number(r.annual_revenue) : null,
    linkedin: r.linkedin ?? '', createdAt: r.created_at, lastActivityAt: r.last_activity_at ?? null,
  }
}
function mapContact(r: any): Contact {
  return {
    id: r.id, companyId: r.company_id, name: r.name, initials: initialsOf(r.name),
    role: r.role ?? '', email: r.email ?? '', phone: r.phone ?? '', color: r.color ?? 'var(--accent)',
    primary: !!r.is_primary,
    address: r.address ?? '', city: r.city ?? '', country: r.country ?? '',
    createdAt: r.created_at, lastActivityAt: r.last_activity_at ?? null,
    unsubscribedAt: r.unsubscribed_at ?? null,
  }
}
function mapActivity(r: any): Activity {
  return {
    id: r.id, dealId: r.deal_id ?? null, companyId: r.company_id, contactId: r.contact_id ?? null,
    type: r.type as ActivityType, actorId: r.actor_id, body: r.body, meta: r.meta, createdAt: r.created_at,
  }
}

const COMPANY_COLS = 'id,name,industry,site,color,is_client,client_id,channel_id,address,city,country,employees,annual_revenue,linkedin,created_at,last_activity_at'
const CONTACT_COLS = 'id,company_id,name,role,email,phone,color,is_primary,address,city,country,created_at,last_activity_at,unsubscribed_at'
const ACTIVITY_COLS = 'id,deal_id,company_id,contact_id,type,actor_id,body,meta,created_at'
const DEALS_SELECT = 'id,title,company_id,stage,value,owner_id,close_on,source,health,priority,channel_id,sort, channel:channels(name)'

const PAGE_SIZE = 1000

// Page through a client-scoped query, invoking onPage after EACH page so the UI
// can render progressively instead of waiting for the whole book. startFrom lets
// the first page be fetched on the critical path (fast first paint) while the
// rest streams in the background. A stable secondary sort by id keeps .range()
// pages from overlapping when many rows share created_at (the bulk import does).
async function pageFrom(
  build: (from: number, to: number) => any,
  onPage: (rows: any[]) => void,
  startFrom = 0,
  abort?: () => boolean,
): Promise<void> {
  for (let from = startFrom; ; from += PAGE_SIZE) {
    if (abort?.()) return // a client switch superseded us — stop fetching
    const { data, error } = await build(from, from + PAGE_SIZE - 1)
    if (error) { console.warn('[crm] paged fetch:', error.message); break }
    const rows = (data ?? []) as any[]
    if (rows.length) onPage(rows)
    if (rows.length < PAGE_SIZE) break
  }
}

// PostgREST encodes .in() lists in the URL, so a client with thousands of
// companies/deals overflows the URL length limit. Fetch in parallel batches
// and concatenate so load() scales (e.g. the 6k+ imported dialer leads).
async function fetchIn(table: string, columns: string, column: string, ids: string[], chunk = 200): Promise<any[]> {
  if (!ids.length) return []
  const batches: any[] = []
  for (let i = 0; i < ids.length; i += chunk) {
    batches.push(supabase.from(table).select(columns).in(column, ids.slice(i, i + chunk)))
  }
  const results = await Promise.all(batches)
  const out: any[] = []
  for (const r of results) if (r.data) out.push(...(r.data as any[]))
  return out
}

export const useCrmStore = defineStore('crm', () => {
  const companies = ref<Record<string, Company>>({})
  const contacts = ref<Contact[]>([])
  const deals = ref<Deal[]>([])
  const linkedByDeal = ref<Record<string, LinkedTask[]>>({})
  const activitiesByDeal = ref<Record<string, Activity[]>>({})
  const activitiesByCompany = ref<Record<string, Activity[]>>({})
  const loaded = ref(false) // first paint ready (first page of deals + companies)
  const fullyLoaded = ref(false) // whole book (+ contacts + links) in memory
  const loading = ref(false)
  const error = ref<string | null>(null)
  const clients = useClientsStore()
  let channel: RealtimeChannel | null = null
  const pending = new Set<string>() // deal ids with an unconfirmed local write
  let loadSeq = 0 // bumped per load() so a superseded client's background stream aborts
  let loadingCid: string | null | undefined // in-flight client, to dedupe concurrent load()s
  let activeLoad: Promise<void> = Promise.resolve() // current load()'s Phase-1 promise (joined by concurrent callers)
  let pendingStream: Promise<void> = Promise.resolve() // background: rest of pages + contacts + links

  const company = (id: string) => companies.value[id]
  const contactsFor = (companyId: string) => contacts.value.filter((c) => c.companyId === companyId)
  const linkedTasks = (dealId: string) => linkedByDeal.value[dealId] ?? []
  const activities = (dealId: string) => activitiesByDeal.value[dealId] ?? []
  const companyActivities = (companyId: string) => activitiesByCompany.value[companyId] ?? []
  const dealsFor = (companyId: string) => deals.value.filter((d) => d.companyId === companyId)

  function prefetchOwners(ds: Deal[]) {
    const ids = [...new Set(ds.map((d) => d.ownerId).filter(Boolean))] as string[]
    if (ids.length) void useTeamStore().fetchProfiles(ids)
  }

  // The CRM is a per-client workspace. Load in chunks for a fast first paint:
  //   Phase 1 — first page of companies + deals -> render immediately.
  //   Phase 2 — remaining pages, then contacts + deal->task links -> stream in
  //             the background (card badges / counts fill in live; nothing else
  //             blocks the screen). contacts + links aren't needed for the
  //             Overview/Pipeline first paint, so they never gate it.
  function load(): Promise<void> {
    const cid = clients.currentClientId
    if (loading.value && loadingCid === cid) return activeLoad // join the in-flight same-client load
    activeLoad = doLoad(cid)
    return activeLoad
  }

  async function doLoad(cid: string | null) {
    const seq = ++loadSeq
    loadingCid = cid
    loading.value = true
    loaded.value = false
    fullyLoaded.value = false
    companies.value = {}; deals.value = []; contacts.value = []; linkedByDeal.value = {}
    try {
      if (!cid) {
        loaded.value = true; fullyLoaded.value = true
        pendingStream = Promise.resolve()
        return
      }
      const coBuild = (f: number, t: number) => supabase.from('crm_companies')
        .select(COMPANY_COLS + ', channel:channels(name)')
        .eq('client_id', cid).order('created_at').order('id').range(f, t)
      const deBuild = (f: number, t: number) => supabase.from('crm_deals')
        .select(DEALS_SELECT)
        .eq('client_id', cid).order('sort').order('created_at').order('id').range(f, t)

      // Phase 1 — first page of each, in parallel, then paint.
      const [co0, de0] = await Promise.all([coBuild(0, PAGE_SIZE - 1), deBuild(0, PAGE_SIZE - 1)])
      if (seq !== loadSeq) return // a newer load (client switch) superseded us
      if (co0.error) console.warn('[crm] companies:', co0.error.message)
      if (de0.error) console.warn('[crm] deals:', de0.error.message)
      const coMap: Record<string, Company> = {}
      for (const r of (co0.data ?? []) as any[]) coMap[r.id] = mapCompany(r)
      companies.value = coMap
      deals.value = ((de0.data ?? []) as any[]).map(mapDeal)
      loaded.value = true
      prefetchOwners(deals.value)

      const coDone = (co0.data?.length ?? 0) < PAGE_SIZE
      const deDone = (de0.data?.length ?? 0) < PAGE_SIZE

      // Phase 2 — stream the rest + contacts + links in the background.
      pendingStream = (async () => {
        const jobs: Promise<void>[] = []
        if (!coDone) jobs.push(pageFrom(coBuild, (rows) => {
          if (seq !== loadSeq) return
          const m = { ...companies.value }
          for (const r of rows) m[r.id] = mapCompany(r)
          companies.value = m
        }, PAGE_SIZE, () => seq !== loadSeq))
        if (!deDone) jobs.push(pageFrom(deBuild, (rows) => {
          if (seq !== loadSeq) return
          // Dedup against rows a realtime event may have already pulled in
          // (fetchDealInto) during the stream, so a card never doubles.
          const have = new Set(deals.value.map((d) => d.id))
          const mapped = (rows as any[]).map(mapDeal).filter((d) => !have.has(d.id))
          if (mapped.length) {
            deals.value = [...deals.value, ...mapped]
            prefetchOwners(mapped)
          }
        }, PAGE_SIZE, () => seq !== loadSeq))
        await Promise.all(jobs)
        if (seq !== loadSeq) return

        // Full company/deal sets are in memory now — scope contacts + links.
        const companyIds = Object.keys(companies.value)
        const dealIds = deals.value.map((d) => d.id)
        const [ctData, dtData] = await Promise.all([
          fetchIn('crm_contacts', CONTACT_COLS, 'company_id', companyIds),
          fetchIn('crm_deal_tasks', 'deal_id,task_id, task:tasks(reference_number,title,status)', 'deal_id', dealIds),
        ])
        if (seq !== loadSeq) return
        contacts.value = (ctData as any[]).map(mapContact)
        const linked: Record<string, LinkedTask[]> = {}
        for (const r of (dtData as any[])) {
          const t = r.task
          ;(linked[r.deal_id] ??= []).push({
            taskId: r.task_id, ref: t?.reference_number ?? '', title: t?.title ?? 'Linked task',
            status: t?.status ?? '', dot: statusDot(t?.status),
          })
        }
        linkedByDeal.value = linked
        fullyLoaded.value = true
      })()
    } finally {
      loading.value = false
    }
  }

  // Await the FULL book — used before bulk import, which dedups against the
  // complete companies + contacts set (a partial set would create duplicates).
  async function ensureFullyLoaded() {
    if (loading.value) await activeLoad // join an in-flight Phase 1 (so pendingStream is the right one)
    else if (!loaded.value) await load()
    await pendingStream
  }

  // Pull a SINGLE deal (with its channel embed) into the list — used by the
  // realtime INSERT / late-UPDATE paths and create. Never refetch the whole
  // pipeline; at thousands of rows that locks the UI (it made create feel frozen).
  async function fetchDealInto(id: string) {
    const { data } = await supabase.from('crm_deals').select(DEALS_SELECT).eq('id', id).single()
    if (data && !deals.value.some((d) => d.id === (data as any).id)) {
      deals.value = [...deals.value, mapDeal(data)]
    }
  }

  async function loadActivities(dealId: string, force = false) {
    if (activitiesByDeal.value[dealId] && !force) return
    const { data } = await supabase
      .from('crm_deal_activities')
      .select(ACTIVITY_COLS)
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false })
    const acts = ((data ?? []) as any[]).map(mapActivity)
    activitiesByDeal.value = { ...activitiesByDeal.value, [dealId]: acts }
    const ids = [...new Set(acts.map((a) => a.actorId).filter(Boolean))] as string[]
    if (ids.length) void useTeamStore().fetchProfiles(ids)
  }

  // Company timeline: every activity on the company, deal-linked or not.
  async function loadCompanyActivities(companyId: string, force = false) {
    if (activitiesByCompany.value[companyId] && !force) return
    const { data } = await supabase
      .from('crm_deal_activities')
      .select(ACTIVITY_COLS)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
    const acts = ((data ?? []) as any[]).map(mapActivity)
    activitiesByCompany.value = { ...activitiesByCompany.value, [companyId]: acts }
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
    const ownerId = input.ownerId ?? me
    const { data, error: err } = await supabase.from('crm_deals').insert({
      title: input.title.trim(), company_id: input.companyId, stage: input.stage,
      value: input.value, owner_id: ownerId, close_on: input.close || null,
      source: input.source || null, health: input.health ?? 'warm', channel_id: input.channelId ?? null,
      client_id: clients.currentClientId, created_by: me,
    }).select(DEALS_SELECT).single()
    if (err) {
      error.value = "Couldn't create deal — " + permMsg(err)
      return false
    }
    // Optimistic insert of just the new row — never refetch the whole pipeline
    // (it can be thousands of deals; that round-trip is what made create freeze).
    if (data && !deals.value.some((d) => d.id === (data as any).id)) {
      deals.value = [...deals.value, mapDeal(data)]
    }
    if (ownerId) void useTeamStore().fetchProfiles([ownerId])
    // Kickoff task on win — best-effort (the deal already exists; don't fail it).
    if (input.kickoffTask && input.stage === 'won' && (data as any)?.id) {
      try {
        const { useTasksStore } = await import('@/stores/tasks')
        const co = companies.value[input.companyId]
        const task = await useTasksStore().createTask({ title: 'Kickoff: ' + input.title.trim(), client_id: co?.clientId ?? undefined })
        if (task?.id) await linkTask((data as any).id, task.id)
      } catch (e) {
        error.value = 'Deal created, but the kickoff task could not be added — ' + (e as Error).message
      }
    }
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
    address?: string; city?: string; country?: string; employees?: number | null
    annualRevenue?: number | null; linkedin?: string
  }): Promise<Company | null> {
    const { useAuthStore } = await import('@/stores/auth')
    const { data, error: err } = await supabase.from('crm_companies').insert({
      name: input.name.trim(), industry: input.industry || null, site: input.site || null,
      color: input.color || null, channel_id: input.channelId ?? null,
      address: input.address || null, city: input.city || null, country: input.country || null,
      employees: input.employees ?? null, annual_revenue: input.annualRevenue ?? null,
      linkedin: input.linkedin || null,
      client_id: clients.currentClientId, created_by: useAuthStore().user?.id ?? null,
    }).select(COMPANY_COLS + ', channel:channels(name)').single()
    if (err) {
      error.value = "Couldn't create company — " + permMsg(err)
      return null
    }
    const co = mapCompany(data)
    companies.value = { ...companies.value, [co.id]: co }
    return co
  }

  async function updateCompany(id: string, patch: Partial<Pick<Company,
    'name' | 'industry' | 'site' | 'color' | 'channelId'
    | 'address' | 'city' | 'country' | 'employees' | 'annualRevenue' | 'linkedin'>>): Promise<boolean> {
    const prev = companies.value[id]
    if (!prev) return false
    companies.value = { ...companies.value, [id]: { ...prev, ...patch, initials: patch.name ? initialsOf(patch.name) : prev.initials } }
    const db: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (patch.name !== undefined) db.name = patch.name.trim()
    if (patch.industry !== undefined) db.industry = patch.industry || null
    if (patch.site !== undefined) db.site = patch.site || null
    if (patch.color !== undefined) db.color = patch.color
    if (patch.channelId !== undefined) db.channel_id = patch.channelId
    if (patch.address !== undefined) db.address = patch.address || null
    if (patch.city !== undefined) db.city = patch.city || null
    if (patch.country !== undefined) db.country = patch.country || null
    if (patch.employees !== undefined) db.employees = patch.employees
    if (patch.annualRevenue !== undefined) db.annual_revenue = patch.annualRevenue
    if (patch.linkedin !== undefined) db.linkedin = patch.linkedin || null
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
    address?: string; city?: string; country?: string
  }): Promise<Contact | null> {
    const { data, error: err } = await supabase.from('crm_contacts').insert({
      company_id: input.companyId, name: input.name.trim(), role: input.role || null,
      email: input.email || null, phone: input.phone || null, is_primary: !!input.isPrimary,
      address: input.address || null, city: input.city || null, country: input.country || null,
    }).select(CONTACT_COLS).single()
    if (err) {
      error.value = "Couldn't add contact — " + permMsg(err)
      return null
    }
    const c = mapContact(data)
    contacts.value = [...contacts.value, c]
    return c
  }

  async function updateContact(id: string, patch: Partial<Pick<Contact,
    'name' | 'role' | 'email' | 'phone' | 'primary' | 'address' | 'city' | 'country'>>): Promise<boolean> {
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
    if (patch.address !== undefined) db.address = patch.address || null
    if (patch.city !== undefined) db.city = patch.city || null
    if (patch.country !== undefined) db.country = patch.country || null
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
  // Insert + merge into whichever timelines (deal / company / contact-bumps) are
  // loaded. company_id is derived server-side from deal_id when omitted.
  async function insertActivity(row: {
    deal_id?: string | null; company_id?: string | null; contact_id?: string | null
    type: ActivityType; body: string; meta?: string | null
  }): Promise<boolean> {
    const { useAuthStore } = await import('@/stores/auth')
    const actor = useAuthStore().user?.id ?? null
    const { data, error: err } = await supabase.from('crm_deal_activities').insert({
      deal_id: row.deal_id ?? null, company_id: row.company_id ?? null, contact_id: row.contact_id ?? null,
      type: row.type, actor_id: actor, body: row.body.trim(), meta: row.meta ?? null,
    }).select(ACTIVITY_COLS).single()
    if (err) {
      error.value = "Couldn't log that — " + permMsg(err)
      return false
    }
    const act = mapActivity(data)
    if (act.dealId && activitiesByDeal.value[act.dealId]) {
      activitiesByDeal.value = { ...activitiesByDeal.value, [act.dealId]: [act, ...activitiesByDeal.value[act.dealId]] }
    }
    if (activitiesByCompany.value[act.companyId]) {
      activitiesByCompany.value = { ...activitiesByCompany.value, [act.companyId]: [act, ...activitiesByCompany.value[act.companyId]] }
    }
    // Mirror the DB last-activity triggers locally.
    const co = companies.value[act.companyId]
    if (co) companies.value = { ...companies.value, [act.companyId]: { ...co, lastActivityAt: act.createdAt } }
    if (act.contactId) {
      contacts.value = contacts.value.map((c) => (c.id === act.contactId ? { ...c, lastActivityAt: act.createdAt } : c))
    }
    return true
  }

  async function logActivity(dealId: string, a: {
    type: ActivityType; body: string; meta?: string | null; contactId?: string | null
  }): Promise<boolean> {
    return insertActivity({ deal_id: dealId, contact_id: a.contactId ?? null, type: a.type, body: a.body, meta: a.meta })
  }

  async function logCompanyActivity(companyId: string, a: {
    type: ActivityType; body: string; meta?: string | null; contactId?: string | null
  }): Promise<boolean> {
    return insertActivity({ company_id: companyId, contact_id: a.contactId ?? null, type: a.type, body: a.body, meta: a.meta })
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
    if (activitiesByCompany.value[removed.companyId]) {
      activitiesByCompany.value = {
        ...activitiesByCompany.value,
        [removed.companyId]: activitiesByCompany.value[removed.companyId].filter((x) => x.id !== id),
      }
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

  // ── Bulk import (HubSpot CSV → this client's workspace) ──────────────────────
  // Companies dedupe by name (case-insensitive) or website domain; contacts by
  // email, falling back to name+company for email-less rows. Matches enrich
  // blank fields only — an import never overwrites data someone typed in.
  async function bulkImport(input: {
    companies: Array<{ name: string; industry?: string; site?: string; address?: string; city?: string
      country?: string; employees?: number | null; annualRevenue?: number | null; linkedin?: string }>
    contacts: Array<{ name: string; company?: string; role?: string; email?: string; phone?: string
      address?: string; city?: string; country?: string }>
  }): Promise<{ companiesCreated: number; companiesEnriched: number; contactsCreated: number; contactsSkipped: number } | null> {
    const cid = clients.currentClientId
    if (!cid) {
      error.value = 'Select a client workspace before importing.'
      return null
    }
    await ensureFullyLoaded()
    const { useAuthStore } = await import('@/stores/auth')
    const me = useAuthStore().user?.id ?? null

    const norm = (s: string | undefined | null) => (s ?? '').trim().toLowerCase()
    const domain = (url: string | undefined | null) =>
      norm(url).replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]

    const byName = new Map<string, Company>()
    const byDomain = new Map<string, Company>()
    for (const co of Object.values(companies.value)) {
      byName.set(norm(co.name), co)
      if (domain(co.site)) byDomain.set(domain(co.site), co)
    }

    const stats = { companiesCreated: 0, companiesEnriched: 0, contactsCreated: 0, contactsSkipped: 0 }
    const toInsert: Record<string, unknown>[] = []
    const pendingNames = new Set<string>()

    // Contacts may reference companies that aren't in the companies file —
    // collect every company mentioned anywhere.
    const wanted = [...input.companies]
    for (const ct of input.contacts) {
      const cn = (ct.company ?? '').trim()
      if (cn && !byName.has(norm(cn)) && !wanted.some((w) => norm(w.name) === norm(cn))) wanted.push({ name: cn })
    }

    for (const row of wanted) {
      const name = row.name?.trim()
      if (!name) continue
      const existing = byName.get(norm(name)) ?? (domain(row.site) ? byDomain.get(domain(row.site)) : undefined)
      if (existing) {
        const patch: Parameters<typeof updateCompany>[1] = {}
        if (!existing.industry && row.industry) patch.industry = row.industry
        if (!existing.site && row.site) patch.site = row.site
        if (!existing.address && row.address) patch.address = row.address
        if (!existing.city && row.city) patch.city = row.city
        if (!existing.country && row.country) patch.country = row.country
        if (existing.employees == null && row.employees != null) patch.employees = row.employees
        if (existing.annualRevenue == null && row.annualRevenue != null) patch.annualRevenue = row.annualRevenue
        if (!existing.linkedin && row.linkedin) patch.linkedin = row.linkedin
        if (Object.keys(patch).length && (await updateCompany(existing.id, patch))) stats.companiesEnriched++
        continue
      }
      if (pendingNames.has(norm(name))) continue
      pendingNames.add(norm(name))
      toInsert.push({
        name, industry: row.industry || null, site: row.site || null, address: row.address || null,
        city: row.city || null, country: row.country || null, employees: row.employees ?? null,
        annual_revenue: row.annualRevenue ?? null, linkedin: row.linkedin || null,
        client_id: cid, created_by: me,
      })
    }

    for (let i = 0; i < toInsert.length; i += 200) {
      const chunk = toInsert.slice(i, i + 200)
      const { data, error: err } = await supabase.from('crm_companies').insert(chunk).select(COMPANY_COLS)
      if (err) {
        error.value = "Import stopped on companies — " + permMsg(err)
        return null
      }
      for (const r of (data ?? []) as any[]) {
        const co = mapCompany(r)
        companies.value = { ...companies.value, [co.id]: co }
        byName.set(norm(co.name), co)
        if (domain(co.site)) byDomain.set(domain(co.site), co)
        stats.companiesCreated++
      }
    }

    const byEmail = new Set(contacts.value.map((c) => norm(c.email)).filter(Boolean))
    const byNameCo = new Set(contacts.value.map((c) => norm(c.name) + '|' + c.companyId))
    let fallbackCo: Company | null = null
    const contactRows: Record<string, unknown>[] = []
    for (const row of input.contacts) {
      const name = row.name?.trim()
      if (!name) { stats.contactsSkipped++; continue }
      let co = row.company ? byName.get(norm(row.company)) : undefined
      if (!co) {
        // Rows with no (or unknown) company land in one catch-all the team can re-file from.
        if (!fallbackCo) fallbackCo = byName.get('unsorted contacts') ?? (await createCompany({ name: 'Unsorted contacts' }))
        if (!fallbackCo) return null // createCompany already set error
        co = fallbackCo
      }
      const emailKey = norm(row.email)
      const nameKey = norm(name) + '|' + co.id
      if ((emailKey && byEmail.has(emailKey)) || (!emailKey && byNameCo.has(nameKey))) {
        stats.contactsSkipped++
        continue
      }
      if (emailKey) byEmail.add(emailKey)
      byNameCo.add(nameKey)
      contactRows.push({
        company_id: co.id, name, role: row.role || null, email: row.email || null, phone: row.phone || null,
        address: row.address || null, city: row.city || null, country: row.country || null,
      })
    }

    for (let i = 0; i < contactRows.length; i += 200) {
      const chunk = contactRows.slice(i, i + 200)
      const { data, error: err } = await supabase.from('crm_contacts').insert(chunk).select(CONTACT_COLS)
      if (err) {
        error.value = "Import stopped on contacts — " + permMsg(err)
        return null
      }
      contacts.value = [...contacts.value, ...((data ?? []) as any[]).map(mapContact)]
      stats.contactsCreated += (data ?? []).length
    }

    return stats
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
          if (idx === -1) {
            // A deal we don't have yet (e.g. a missed insert). Pull just that row
            // if it's this client's — never refetch the whole pipeline.
            if (row.client_id === clients.currentClientId) void fetchDealInto(row.id)
            return
          }
          // Patch scalar fields; keep the embedded channelName/companyId we already have.
          const cur = deals.value[idx]
          const patched = { ...mapDeal(row), channelName: cur.channelName }
          deals.value = deals.value.map((d) => (d.id === row.id ? patched : d))
        } else {
          // INSERT — pull just the new row (with its channel embed), scoped to
          // this client. Our own create already added it optimistically.
          const row = p.new
          if (!row || pending.has(row.id) || deals.value.some((d) => d.id === row.id)) return
          if (row.client_id === clients.currentClientId) void fetchDealInto(row.id)
        }
      })
      // Keep the deal panel's linked-task list in sync when links are made or
      // removed elsewhere (another tab, the task drawer, another teammate).
      .on('postgres_changes', { event: '*', schema: 'buzzybee', table: 'crm_deal_tasks' }, (p: any) => {
        if (p.eventType === 'DELETE') {
          const { deal_id, task_id } = p.old ?? {}
          if (!deal_id || !linkedByDeal.value[deal_id]) return
          linkedByDeal.value = {
            ...linkedByDeal.value,
            [deal_id]: linkedByDeal.value[deal_id].filter((t) => t.taskId !== task_id),
          }
        } else if (p.eventType === 'INSERT') {
          const { deal_id, task_id } = p.new ?? {}
          // Only this client's deals; linkTask already added our own writes.
          if (!deal_id || !deals.value.some((d) => d.id === deal_id)) return
          if ((linkedByDeal.value[deal_id] ?? []).some((t) => t.taskId === task_id)) return
          void supabase.from('tasks').select('reference_number,title,status').eq('id', task_id).single().then(({ data }) => {
            if (!data || (linkedByDeal.value[deal_id] ?? []).some((t) => t.taskId === task_id)) return
            const lt: LinkedTask = {
              taskId: task_id, ref: (data as any).reference_number ?? '', title: (data as any).title ?? 'Linked task',
              status: (data as any).status ?? '', dot: statusDot((data as any).status),
            }
            linkedByDeal.value = { ...linkedByDeal.value, [deal_id]: [...(linkedByDeal.value[deal_id] ?? []), lt] }
          })
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
    companies, contacts, deals, loaded, fullyLoaded, loading, error,
    company, contactsFor, linkedTasks, activities, companyActivities, dealsFor,
    load, loadActivities, loadCompanyActivities, move, convert,
    createDeal, updateDeal, deleteDeal,
    createCompany, updateCompany, deleteCompany,
    addContact, updateContact, deleteContact,
    logActivity, logCompanyActivity, deleteActivity, linkTask, unlinkTask,
    bulkImport, subscribe, unsubscribe,
  }
})

// Hot-swap the store on edit instead of leaving a stale singleton (which caused
// "createDeal is not a function" after adding an action mid-session).
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCrmStore, import.meta.hot))
}
