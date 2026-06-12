import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useClientsStore } from '@/stores/clients'
import type { StoredDesign } from '@/lib/emailDoc'

// Email blasts: campaign rows live in crm_campaigns, one recipient row per
// address in crm_campaign_recipients. Sending happens in the send-campaign
// edge function; this store only writes drafts, kicks the function, and keeps
// the list live (campaign status via realtime, recipient counts via polling
// while a send is in flight).

export type CampaignStatus = 'draft' | 'sending' | 'sent' | 'failed'

export interface CampaignCounts {
  total: number
  sent: number
  failed: number
  pending: number
  /** Webhook-fed engagement (resend-webhook stamps recipient rows). */
  opens: number
  clicks: number
  bounces: number
}

export interface Campaign {
  id: string
  clientId: string
  subject: string
  fromName: string
  fromEmail: string
  bodyHtml: string
  /** Present when the email was built in the block editor — reopens there. */
  bodyBlocks: StoredDesign | null
  status: CampaignStatus
  audience: string
  layout: string
  accent: string
  createdBy: string | null
  sentAt: string | null
  createdAt: string
  counts: CampaignCounts
}

export interface CampaignRecipientInput {
  contactId: string | null
  email: string
  name: string
}

const CAMPAIGN_COLS = 'id,client_id,subject,from_name,from_email,body_html,body_blocks,status,audience,layout,accent,created_by,sent_at,created_at'

const emptyCounts = (): CampaignCounts =>
  ({ total: 0, sent: 0, failed: 0, pending: 0, opens: 0, clicks: 0, bounces: 0 })

function mapCampaign(r: any): Campaign {
  return {
    id: r.id, clientId: r.client_id, subject: r.subject,
    fromName: r.from_name ?? '', fromEmail: r.from_email ?? '',
    bodyHtml: r.body_html, bodyBlocks: (r.body_blocks as StoredDesign | null) ?? null,
    status: r.status as CampaignStatus,
    audience: r.audience ?? '', layout: r.layout ?? 'plain', accent: r.accent ?? '',
    createdBy: r.created_by ?? null,
    sentAt: r.sent_at ?? null, createdAt: r.created_at,
    counts: emptyCounts(),
  }
}
// RLS scopes campaign writes to pm/admin — same wording as the CRM store.
function permMsg(err: { code?: string; message: string }) {
  if (err.code === '42501' || /row-level security|permission denied/i.test(err.message)) {
    return 'you don\'t have permission to manage campaigns'
  }
  return err.message
}

export const useCampaignsStore = defineStore('campaigns', () => {
  const clients = useClientsStore()
  const campaigns = ref<Campaign[]>([])
  const loaded = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)
  let channel: RealtimeChannel | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null

  async function load() {
    const cid = clients.currentClientId
    if (!cid) {
      campaigns.value = []
      loaded.value = true
      return
    }
    loading.value = true
    try {
      const { data, error: err } = await supabase
        .from('crm_campaigns')
        .select(CAMPAIGN_COLS)
        .eq('client_id', cid)
        .order('created_at', { ascending: false })
      if (err) throw err
      campaigns.value = ((data ?? []) as any[]).map(mapCampaign)
      await refreshCounts()
      loaded.value = true
    } catch (e) {
      error.value = "Couldn't load campaigns — " + (e as Error).message
    } finally {
      loading.value = false
    }
    syncPolling()
  }

  // One sweep over this client's recipients, reduced to delivery + engagement counts.
  async function refreshCounts() {
    const ids = campaigns.value.map((c) => c.id)
    if (!ids.length) return
    const { data } = await supabase
      .from('crm_campaign_recipients')
      .select('campaign_id,status,opened_at,clicked_at,bounced_at')
      .in('campaign_id', ids)
    const agg: Record<string, CampaignCounts> = {}
    for (const r of (data ?? []) as {
      campaign_id: string; status: string
      opened_at: string | null; clicked_at: string | null; bounced_at: string | null
    }[]) {
      const c = (agg[r.campaign_id] ??= emptyCounts())
      c.total++
      if (r.status === 'sent') c.sent++
      else if (r.status === 'failed') c.failed++
      else c.pending++
      if (r.opened_at) c.opens++
      if (r.clicked_at) c.clicks++
      if (r.bounced_at) c.bounces++
    }
    campaigns.value = campaigns.value.map((c) => ({
      ...c,
      counts: agg[c.id] ?? emptyCounts(),
    }))
  }

  // Poll recipient counts only while something is actually sending.
  function syncPolling() {
    const active = campaigns.value.some((c) => c.status === 'sending')
    if (active && !pollTimer) {
      pollTimer = setInterval(() => void refreshCounts(), 2500)
    } else if (!active && pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  async function createCampaign(input: {
    subject: string
    fromName: string
    fromEmail: string
    bodyHtml: string
    bodyBlocks: StoredDesign | null
    audience: string
    layout: string
    accent: string
    recipients: CampaignRecipientInput[]
  }): Promise<Campaign | null> {
    const cid = clients.currentClientId
    if (!cid) {
      error.value = 'Select a client workspace first.'
      return null
    }
    const { useAuthStore } = await import('@/stores/auth')
    const { data, error: err } = await supabase.from('crm_campaigns').insert({
      client_id: cid,
      subject: input.subject.trim(),
      from_name: input.fromName.trim() || null,
      from_email: input.fromEmail.trim() || null,
      body_html: input.bodyHtml,
      body_blocks: input.bodyBlocks,
      audience: input.audience || null,
      layout: input.layout,
      accent: input.accent || null,
      created_by: useAuthStore().user?.id ?? null,
    }).select(CAMPAIGN_COLS).single()
    if (err) {
      error.value = "Couldn't create the campaign — " + permMsg(err)
      return null
    }
    const campaign = mapCampaign(data)

    const rows = input.recipients.map((r) => ({
      campaign_id: campaign.id,
      contact_id: r.contactId,
      email: r.email,
      name: r.name || null,
    }))
    for (let i = 0; i < rows.length; i += 500) {
      const { error: rErr } = await supabase.from('crm_campaign_recipients').insert(rows.slice(i, i + 500))
      if (rErr) {
        // Half-written recipient lists are worse than no campaign — roll back.
        await supabase.from('crm_campaigns').delete().eq('id', campaign.id)
        error.value = "Couldn't add recipients — " + permMsg(rErr)
        return null
      }
    }
    campaign.counts = { ...emptyCounts(), total: rows.length, pending: rows.length }
    campaigns.value = [campaign, ...campaigns.value]
    return campaign
  }

  // Re-saving a draft replaces its recipient snapshot wholesale — the audience
  // may have changed since it was first written.
  async function updateDraft(id: string, input: {
    subject: string
    fromName: string
    fromEmail: string
    bodyHtml: string
    bodyBlocks: StoredDesign | null
    audience: string
    layout: string
    accent: string
    recipients: CampaignRecipientInput[]
  }): Promise<boolean> {
    const { error: err } = await supabase.from('crm_campaigns').update({
      subject: input.subject.trim(),
      from_name: input.fromName.trim() || null,
      from_email: input.fromEmail.trim() || null,
      body_html: input.bodyHtml,
      body_blocks: input.bodyBlocks,
      audience: input.audience || null,
      layout: input.layout,
      accent: input.accent || null,
    }).eq('id', id).eq('status', 'draft')
    if (err) {
      error.value = "Couldn't update the draft — " + permMsg(err)
      return false
    }
    const { error: dErr } = await supabase.from('crm_campaign_recipients').delete().eq('campaign_id', id)
    if (dErr) {
      error.value = "Couldn't update the draft's recipients — " + permMsg(dErr)
      return false
    }
    const rows = input.recipients.map((r) => ({
      campaign_id: id, contact_id: r.contactId, email: r.email, name: r.name || null,
    }))
    for (let i = 0; i < rows.length; i += 500) {
      const { error: rErr } = await supabase.from('crm_campaign_recipients').insert(rows.slice(i, i + 500))
      if (rErr) {
        error.value = "Couldn't update the draft's recipients — " + permMsg(rErr)
        return false
      }
    }
    campaigns.value = campaigns.value.map((c) => c.id === id
      ? {
          ...c,
          subject: input.subject.trim(), fromName: input.fromName.trim(), fromEmail: input.fromEmail.trim(),
          bodyHtml: input.bodyHtml, bodyBlocks: input.bodyBlocks, audience: input.audience,
          layout: input.layout, accent: input.accent,
          counts: { ...emptyCounts(), total: rows.length, pending: rows.length },
        }
      : c)
    return true
  }

  // One real email to yourself — same sender pipeline, no campaign rows.
  async function sendTest(input: {
    subject: string; fromName: string; fromEmail: string; bodyHtml: string; to: string
    layout: string; accent: string
  }): Promise<boolean> {
    const { error: err } = await supabase.functions.invoke('send-campaign', {
      body: { test: input },
    })
    if (err) {
      let msg = err.message
      try {
        const ctx = await (err as any).context?.json?.()
        if (ctx?.error) msg = ctx.error
      } catch { /* keep the generic message */ }
      error.value = "Couldn't send the test — " + msg
      return false
    }
    return true
  }

  async function send(campaignId: string): Promise<{ sent: number; failed: number } | null> {
    campaigns.value = campaigns.value.map((c) =>
      c.id === campaignId ? { ...c, status: 'sending' as CampaignStatus } : c)
    syncPolling()
    const { data, error: err } = await supabase.functions.invoke('send-campaign', {
      body: { campaignId },
    })
    if (err) {
      // The function returns structured errors; surface its message when present.
      let msg = err.message
      try {
        const ctx = await (err as any).context?.json?.()
        if (ctx?.error) msg = ctx.error
      } catch { /* keep the generic message */ }
      error.value = "Couldn't send — " + msg
      await load()
      return null
    }
    await load()
    return data as { sent: number; failed: number }
  }

  async function deleteCampaign(id: string): Promise<boolean> {
    const removed = campaigns.value.find((c) => c.id === id)
    if (!removed) return false
    campaigns.value = campaigns.value.filter((c) => c.id !== id)
    const { error: err } = await supabase.from('crm_campaigns').delete().eq('id', id)
    if (err) {
      campaigns.value = [removed, ...campaigns.value]
      error.value = "Couldn't delete that campaign — " + permMsg(err)
      return false
    }
    return true
  }

  function subscribe() {
    if (channel) return
    channel = supabase
      .channel('bb-crm-campaigns')
      .on('postgres_changes', { event: '*', schema: 'buzzybee', table: 'crm_campaigns' }, (p: any) => {
        const ev = p.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
        if (ev === 'DELETE') {
          campaigns.value = campaigns.value.filter((c) => c.id !== p.old?.id)
        } else if (ev === 'UPDATE' && p.new?.id) {
          const idx = campaigns.value.findIndex((c) => c.id === p.new.id)
          if (idx !== -1) {
            const next = { ...mapCampaign(p.new), counts: campaigns.value[idx].counts }
            campaigns.value = campaigns.value.map((c) => (c.id === next.id ? next : c))
            if (next.status !== 'sending') void refreshCounts()
          }
        } else if (ev === 'INSERT' && p.new?.client_id === clients.currentClientId) {
          if (!campaigns.value.some((c) => c.id === p.new.id)) {
            campaigns.value = [mapCampaign(p.new), ...campaigns.value]
          }
        }
        syncPolling()
      })
      .subscribe()
  }
  async function unsubscribe() {
    if (channel) {
      try { await supabase.removeChannel(channel) } catch { /* ignore */ }
      channel = null
    }
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  return {
    campaigns, loaded, loading, error,
    load, refreshCounts, createCampaign, updateDraft, send, sendTest, deleteCampaign,
    subscribe, unsubscribe,
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCampaignsStore, import.meta.hot))
}
