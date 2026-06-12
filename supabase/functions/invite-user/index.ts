// invite-user: account provisioning by invitation (Pillar B, docs/roles.md).
//
// Admins invite staff (va/pm/sales) and, in Phase 1, client users; only
// superadmins can mint admins. Sends through Supabase's admin invite API
// (service role — the browser never could), records the invite, and supports
// revoke/resend while the invite is still unaccepted.

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      db: { schema: 'buzzybee' },
    })

    // ── Caller must be an active admin ───────────────────────────────────────
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Not authenticated' }, 401)
    const { data: caller } = await admin
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single()
    if (!caller?.is_active || !['admin', 'superadmin'].includes(caller.role)) {
      return json({ error: 'Only admins can manage invitations' }, 403)
    }

    const body = await req.json()
    const action = body.action as 'invite' | 'revoke' | 'resend'

    // ── invite ────────────────────────────────────────────────────────────────
    if (action === 'invite') {
      const email = String(body.email ?? '').trim().toLowerCase()
      const role = String(body.role ?? '')
      const clientId = body.clientId ? String(body.clientId) : null
      const fullName = body.fullName ? String(body.fullName).trim() : null

      if (!EMAIL_RE.test(email)) return json({ error: 'That email address doesn\'t look valid.' }, 400)
      const allowed = caller.role === 'superadmin'
        ? ['va', 'pm', 'admin', 'sales', 'client']
        : ['va', 'pm', 'sales', 'client'] // only superadmins mint admins
      if (!allowed.includes(role)) return json({ error: 'You can\'t invite that role.' }, 403)
      if (role === 'client' && !clientId) return json({ error: 'Client users need a client workspace.' }, 400)

      const redirectTo = (req.headers.get('origin') ?? '') + '/app/profile'
      const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
        data: {
          full_name: fullName,
          role,
          client_id: role === 'client' ? clientId : null,
        },
        redirectTo,
      })
      if (invErr) {
        const msg = /already.*registered|already.*exists/i.test(invErr.message)
          ? 'That email already has an account.'
          : invErr.message
        return json({ error: msg }, 400)
      }

      const { data: row, error: rowErr } = await admin.from('invitations').insert({
        email,
        role,
        client_id: role === 'client' ? clientId : null,
        full_name: fullName,
        invited_by: user.id,
        user_id: invited.user?.id ?? null,
      }).select('*').single()
      if (rowErr) console.warn('[invite-user] audit row failed:', rowErr.message)

      return json({ ok: true, invitation: row ?? null })
    }

    // ── revoke / resend need an unaccepted invite ─────────────────────────────
    const invitationId = String(body.invitationId ?? '')
    if (!invitationId) return json({ error: 'invitationId is required' }, 400)
    const { data: invite } = await admin.from('invitations').select('*').eq('id', invitationId).single()
    if (!invite) return json({ error: 'Invitation not found' }, 404)
    if (invite.status !== 'sent') return json({ error: 'That invitation is already ' + invite.status + '.' }, 409)

    if (invite.user_id) {
      const { data: target } = await admin.auth.admin.getUserById(invite.user_id)
      if (target?.user?.last_sign_in_at) {
        // They're in — the account is real now. Deactivation is the tool.
        await admin.from('invitations').update({ status: 'accepted', accepted_at: target.user.last_sign_in_at }).eq('id', invitationId)
        return json({ error: 'That invite was already accepted — deactivate the account instead.' }, 409)
      }
    }

    if (action === 'revoke') {
      if (invite.user_id) await admin.auth.admin.deleteUser(invite.user_id)
      await admin.from('invitations').update({ status: 'revoked' }).eq('id', invitationId)
      return json({ ok: true })
    }

    if (action === 'resend') {
      // Supabase won't re-invite an existing user — recreate them.
      if (invite.user_id) await admin.auth.admin.deleteUser(invite.user_id)
      const redirectTo = (req.headers.get('origin') ?? '') + '/app/profile'
      const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(invite.email, {
        data: { full_name: invite.full_name, role: invite.role, client_id: invite.client_id },
        redirectTo,
      })
      if (invErr) return json({ error: invErr.message }, 400)
      await admin.from('invitations').update({ user_id: invited.user?.id ?? null, created_at: new Date().toISOString() }).eq('id', invitationId)
      return json({ ok: true })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
