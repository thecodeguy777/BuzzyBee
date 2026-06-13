/**
 * Buzz — the attention ring. "Message" asks; Buzz interrupts: the target's
 * screen takes over, a ring loops until they acknowledge, and you get a
 * "saw it" receipt back. Built for the 10%-US / 90%-PH coordination moments
 * where someone MUST look up right now.
 *
 * Transport is the always-on bb-online broadcast channel (useOnlinePresence),
 * so a buzz lands on any page of the app — not just Comms. Reach is therefore
 * "app open in a tab"; for anyone away, the buzz degrades to a DM line they
 * see on return. Every buzz writes that DM line regardless — a buzz is never
 * anonymous and never off the record.
 */
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useChannelsStore } from '@/stores/channels'
import { onOnlineEvent, sendOnlineEvent, useOnlinePresence } from '@/composables/useOnlinePresence'

export interface IncomingBuzz {
  from: string
  fromName: string
  fromAvatar: string | null
  at: number
}

export type BuzzResult = 'sent' | 'away' | 'cooldown' | 'failed'

// One buzz per target per cooldown window, enforced sender-side. Applies to
// the away/DM fallback too, so nobody's inbox fills with "Buzzed you." spam.
const COOLDOWN_MS = 120_000

const incoming = ref<IncomingBuzz | null>(null)
const seenBy = ref<{ id: string; name: string } | null>(null)
const lastBuzzAt: Record<string, number> = {}
let seenTimer: ReturnType<typeof setTimeout> | undefined
let wired = false

function wire() {
  if (wired) return
  wired = true
  const auth = useAuthStore()
  onOnlineEvent('buzz', (payload) => {
    const p = payload as { to?: string; from?: string; fromName?: string; fromAvatar?: string | null } | undefined
    if (!p?.from || p.to !== auth.user?.id) return
    incoming.value = {
      from: p.from,
      fromName: p.fromName || 'Someone',
      fromAvatar: p.fromAvatar ?? null,
      at: Date.now(),
    }
  })
  onOnlineEvent('buzz-ack', (payload) => {
    const p = payload as { to?: string; from?: string; fromName?: string } | undefined
    if (!p?.from || p.to !== auth.user?.id) return
    seenBy.value = { id: p.from, name: p.fromName || 'They' }
    clearTimeout(seenTimer)
    seenTimer = setTimeout(() => (seenBy.value = null), 4500)
  })
}

export function useBuzz() {
  wire()
  const auth = useAuthStore()
  const channels = useChannelsStore()
  const { online } = useOnlinePresence()

  async function buzz(toUserId: string): Promise<BuzzResult> {
    const me = auth.user?.id
    if (!me || toUserId === me) return 'failed'
    if (Date.now() - (lastBuzzAt[toUserId] ?? 0) < COOLDOWN_MS) return 'cooldown'

    const targetOnline = !!online.value[toUserId]
    const delivered =
      targetOnline &&
      sendOnlineEvent('buzz', {
        to: toUserId,
        from: me,
        fromName: auth.fullName || auth.user?.email || 'Someone',
        fromAvatar: auth.profile?.avatar_url ?? null,
      })
    lastBuzzAt[toUserId] = Date.now()

    // The persistent record + the catch-up path for anyone away.
    try {
      const dmId = await channels.openDm(toUserId)
      if (dmId) {
        await supabase.from('messages').insert({
          channel_id: dmId,
          user_id: me,
          user_name: auth.fullName || null,
          body: 'Buzzed you.',
        })
      }
    } catch {
      /* best-effort — the live ring already went out */
    }

    return delivered ? 'sent' : targetOnline ? 'failed' : 'away'
  }

  /** Recipient pressed "I'm here" — close the takeover, receipt the sender. */
  function ack() {
    const b = incoming.value
    const me = auth.user?.id
    incoming.value = null
    if (b && me) {
      sendOnlineEvent('buzz-ack', { to: b.from, from: me, fromName: auth.fullName || 'Someone' })
    }
  }

  /** Timeout path — close without receipting. */
  function dismiss() {
    incoming.value = null
  }

  return { incoming, seenBy, buzz, ack, dismiss }
}
