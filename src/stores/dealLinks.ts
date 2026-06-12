import { defineStore, acceptHMRUpdate } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import type { StageId } from '@/lib/crmData'

// Reverse side of crm_deal_tasks: which deal(s) is a task linked to? The CRM
// store only indexes deal → tasks for the selected client; the task views need
// task → deals across everything the viewer can see, kept live so drawer cards
// and row badges never go stale.
export interface TaskDealLink {
  taskId: string
  dealId: string
  dealTitle: string
  stage: StageId
  /** CRM workspace the deal lives in (crm_deals.client_id) — switch to it before deep-linking. */
  clientId: string | null
  companyName: string
}

const LINK_SELECT = 'task_id,deal_id, deal:crm_deals(title,stage,client_id, company:crm_companies(name))'

function mapLink(r: any): TaskDealLink {
  return {
    taskId: r.task_id,
    dealId: r.deal_id,
    dealTitle: r.deal?.title ?? 'Deal',
    stage: (r.deal?.stage ?? 'lead') as StageId,
    clientId: r.deal?.client_id ?? null,
    companyName: r.deal?.company?.name ?? '',
  }
}

export const useDealLinksStore = defineStore('dealLinks', () => {
  const auth = useAuthStore()
  const links = ref<TaskDealLink[]>([])
  const loaded = ref(false)
  let channel: RealtimeChannel | null = null

  const byTask = computed(() => {
    const m: Record<string, TaskDealLink[]> = {}
    for (const l of links.value) (m[l.taskId] ??= []).push(l)
    return m
  })
  const forTask = (taskId: string | null | undefined) =>
    taskId ? byTask.value[taskId] ?? [] : []

  async function fetchAll() {
    const { data, error } = await supabase.from('crm_deal_tasks').select(LINK_SELECT)
    if (error) {
      console.warn('[deal-links] fetchAll:', error.message)
      return
    }
    links.value = ((data ?? []) as any[]).map(mapLink)
    loaded.value = true
  }

  // Realtime INSERT payloads have no embeds — refetch the single row to get
  // the deal title / company name.
  async function fetchOne(dealId: string, taskId: string) {
    const { data } = await supabase
      .from('crm_deal_tasks')
      .select(LINK_SELECT)
      .eq('deal_id', dealId)
      .eq('task_id', taskId)
      .maybeSingle()
    if (!data) return
    const l = mapLink(data)
    links.value = [
      ...links.value.filter((x) => !(x.dealId === l.dealId && x.taskId === l.taskId)),
      l,
    ]
  }

  function start() {
    if (channel) return
    channel = supabase
      .channel('bb-deal-links')
      .on('postgres_changes', { event: '*', schema: 'buzzybee', table: 'crm_deal_tasks' }, (p: any) => {
        if (p.eventType === 'DELETE') {
          const { deal_id, task_id } = p.old ?? {}
          links.value = links.value.filter((l) => !(l.dealId === deal_id && l.taskId === task_id))
        } else if (p.eventType === 'INSERT' && p.new?.deal_id) {
          void fetchOne(p.new.deal_id, p.new.task_id)
        }
      })
      // Deal renames / stage moves keep the cached link rows honest.
      .on('postgres_changes', { event: 'UPDATE', schema: 'buzzybee', table: 'crm_deals' }, (p: any) => {
        const row = p.new
        if (!row?.id) return
        links.value = links.value.map((l) =>
          l.dealId === row.id
            ? { ...l, dealTitle: row.title ?? l.dealTitle, stage: (row.stage ?? l.stage) as StageId }
            : l,
        )
      })
      .subscribe()
  }
  async function stop() {
    if (channel) {
      try { await supabase.removeChannel(channel) } catch { /* ignore */ }
      channel = null
    }
  }

  watch(
    () => auth.isAuthenticated,
    (isAuthed) => {
      if (isAuthed) {
        void fetchAll()
        start()
      } else {
        links.value = []
        loaded.value = false
        void stop()
      }
    },
    { immediate: true },
  )

  return { links, loaded, byTask, forTask, fetchAll }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useDealLinksStore, import.meta.hot))
}
