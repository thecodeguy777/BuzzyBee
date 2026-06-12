import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'

// Invitations + deactivation (Pillar B). Sending/revoking goes through the
// invite-user edge function (admin invite API needs the service role); this
// store reads the audit table and toggles profiles.is_active.

export type InviteRole = 'va' | 'pm' | 'admin' | 'sales' | 'client'
export type InviteStatus = 'sent' | 'accepted' | 'revoked'

export interface Invitation {
  id: string
  email: string
  role: InviteRole
  client_id: string | null
  full_name: string | null
  invited_by: string | null
  user_id: string | null
  status: InviteStatus
  accepted_at: string | null
  created_at: string
}

async function fnError(err: unknown): Promise<string> {
  let msg = (err as Error).message
  try {
    const ctx = await (err as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.()
    if (ctx?.error) msg = ctx.error
  } catch { /* keep generic */ }
  return msg
}

export const useInvitesStore = defineStore('invites', () => {
  const invites = ref<Invitation[]>([])
  const loaded = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    const { data, error: err } = await supabase
      .from('invitations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (err) {
      // Non-admins simply see nothing (RLS) — don't surface that as an error.
      if (!/row-level security|permission denied/i.test(err.message)) {
        console.warn('[invites] load:', err.message)
      }
      return
    }
    invites.value = (data ?? []) as Invitation[]
    loaded.value = true
  }

  async function invite(input: {
    email: string
    role: InviteRole
    clientId?: string | null
    fullName?: string
  }): Promise<boolean> {
    const { data, error: err } = await supabase.functions.invoke('invite-user', {
      body: { action: 'invite', ...input },
    })
    if (err) {
      error.value = "Couldn't send the invite — " + (await fnError(err))
      return false
    }
    if (data?.invitation) invites.value = [data.invitation as Invitation, ...invites.value]
    return true
  }

  async function revoke(invitationId: string): Promise<boolean> {
    const { error: err } = await supabase.functions.invoke('invite-user', {
      body: { action: 'revoke', invitationId },
    })
    if (err) {
      error.value = "Couldn't revoke the invite — " + (await fnError(err))
      void load() // it may have flipped to accepted server-side
      return false
    }
    invites.value = invites.value.map((i) =>
      i.id === invitationId ? { ...i, status: 'revoked' as InviteStatus } : i)
    return true
  }

  async function resend(invitationId: string): Promise<boolean> {
    const { error: err } = await supabase.functions.invoke('invite-user', {
      body: { action: 'resend', invitationId },
    })
    if (err) {
      error.value = "Couldn't resend the invite — " + (await fnError(err))
      void load()
      return false
    }
    return true
  }

  /** Offboard/restore a person. RLS: admins only; deactivated users fail
   *  closed everywhere via the active-gated role helpers. */
  async function setActive(userId: string, active: boolean): Promise<boolean> {
    const { error: err } = await supabase
      .from('profiles')
      .update({ is_active: active })
      .eq('id', userId)
    if (err) {
      error.value = "Couldn't " + (active ? 'reactivate' : 'deactivate') + ' — ' + err.message
      return false
    }
    return true
  }

  return { invites, loaded, error, load, invite, revoke, resend, setActive }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useInvitesStore, import.meta.hot))
}
