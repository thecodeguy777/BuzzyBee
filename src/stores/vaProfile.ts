import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

export interface VaSkill {
  name: string
  level: number // 0–100
  tag: string // Expert / Advanced / Proficient
}
export interface VaTool {
  name: string
  level: string // Expert / Advanced / Proficient / Daily / Familiar
}
export interface VaExperience {
  client: string
  role: string
  period: string
  blurb: string
}
export interface VaPortfolioItem {
  id: string
  title: string
  tag: string
  image_url: string | null
}

export interface VaProfile {
  user_id: string
  handle: string | null
  role_title: string | null
  pronouns: string | null
  tagline: string | null
  location: string | null
  about: string | null
  contact_email: string | null
  availability_status: 'open' | 'limited' | 'closed'
  availability_hours: number
  availability_note: string | null
  skills: VaSkill[]
  tools: VaTool[]
  experience: VaExperience[]
  portfolio: VaPortfolioItem[]
  languages: string[]
  is_public: boolean
}

export interface VaStats {
  hours_12mo_seconds: number
  tasks_done: number
  ontime_90d_pct: number | null
  member_since: string | null
}

/** Suggest a handle from a name/email: "Mary Aquino" → "mary-aquino". */
export function suggestHandle(name: string | null, email: string | null) {
  const base = (name || email?.split('@')[0] || 'member')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
  return base.length >= 3 ? base : base + '-va'
}

export const useVaProfileStore = defineStore('vaProfile', () => {
  const auth = useAuthStore()
  const byUser = ref<Record<string, VaProfile | null>>({})
  const statsByUser = ref<Record<string, VaStats | null>>({})
  const saving = ref(false)
  const error = ref<string | null>(null)

  function blank(userId: string): VaProfile {
    return {
      user_id: userId,
      handle: null,
      role_title: null,
      pronouns: null,
      tagline: null,
      location: null,
      about: null,
      contact_email: null,
      availability_status: 'open',
      availability_hours: 10,
      availability_note: null,
      skills: [],
      tools: [],
      experience: [],
      portfolio: [],
      languages: [],
      is_public: false,
    }
  }

  async function fetchFor(userId: string): Promise<VaProfile> {
    const { data, error: err } = await supabase
      .from('va_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (err) {
      error.value = err.message
      throw err
    }
    const row = (data as VaProfile | null) ?? blank(userId)
    byUser.value = { ...byUser.value, [userId]: row }
    return row
  }

  async function fetchStats(userId: string): Promise<VaStats | null> {
    const { data, error: err } = await supabase.rpc('va_profile_stats', { p_user_id: userId })
    if (err) {
      console.warn('[va profile] stats:', err.message)
      return null
    }
    const stats = data as VaStats
    statsByUser.value = { ...statsByUser.value, [userId]: stats }
    return stats
  }

  /** Upsert a patch on the signed-in user's own profile (auto-save on blur). */
  async function saveMine(patch: Partial<VaProfile>) {
    const uid = auth.user?.id
    if (!uid) return
    const current = byUser.value[uid] ?? blank(uid)
    const next = { ...current, ...patch, user_id: uid }
    byUser.value = { ...byUser.value, [uid]: next }
    saving.value = true
    error.value = null
    try {
      const { error: err } = await supabase.from('va_profiles').upsert(next, { onConflict: 'user_id' })
      if (err) throw err
    } catch (e) {
      const msg = (e as Error).message
      error.value = msg.includes('va_profiles_handle_key')
        ? 'That handle is taken — pick another.'
        : msg.includes('handle_check') || msg.includes('violates check constraint')
          ? 'Handles are 3–32 chars: lowercase letters, numbers, dashes.'
          : msg
      // Re-sync from the server so the UI doesn't show a phantom save.
      void fetchFor(uid)
    } finally {
      saving.value = false
    }
  }

  return { byUser, statsByUser, saving, error, fetchFor, fetchStats, saveMine, blank }
})
