import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

export type PostingType = 'ongoing' | 'project' | 'task' | 'trial'

export interface JobPosting {
  id: string
  client_id: string | null
  /** Snapshot for display — VAs can't read clients they're not assigned to. */
  client_name: string | null
  role_title: string
  type: PostingType
  hours: string | null
  rate: string | null
  urgency: string | null
  description: string | null
  responsibilities: string[]
  skills: string[]
  status: 'open' | 'closed'
  posted_by: string | null
  created_at: string
}

export interface JobApplication {
  id: string
  posting_id: string
  va_id: string
  note: string | null
  status: 'sent' | 'reviewed' | 'accepted' | 'declined'
  created_at: string
}

export const useJobsStore = defineStore('jobs', () => {
  const auth = useAuthStore()

  const postings = ref<JobPosting[]>([])
  const applicantCounts = ref<Record<string, number>>({})
  const myApplications = ref<JobApplication[]>([])
  const savedIds = ref<Set<string>>(new Set())
  const loaded = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const appliedIds = computed(() => new Set(myApplications.value.map((a) => a.posting_id)))

  async function fetchAll() {
    if (!auth.user) return
    loading.value = true
    error.value = null
    try {
      const [posts, stats, apps, saves] = await Promise.all([
        supabase.from('job_postings').select('*').order('created_at', { ascending: false }),
        supabase.from('job_posting_stats').select('*'),
        supabase.from('job_applications').select('*').eq('va_id', auth.user.id),
        supabase.from('job_saves').select('posting_id').eq('va_id', auth.user.id),
      ])
      if (posts.error) throw posts.error
      postings.value = (posts.data ?? []) as JobPosting[]
      applicantCounts.value = Object.fromEntries(
        ((stats.data ?? []) as { posting_id: string; applicants: number }[]).map((s) => [s.posting_id, s.applicants]),
      )
      myApplications.value = (apps.data ?? []) as JobApplication[]
      savedIds.value = new Set(((saves.data ?? []) as { posting_id: string }[]).map((s) => s.posting_id))
      loaded.value = true
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  /** One-click apply — the VA Profile *is* the application. */
  async function apply(postingId: string, note?: string) {
    if (!auth.user || appliedIds.value.has(postingId)) return false
    const { data, error: err } = await supabase
      .from('job_applications')
      .insert({ posting_id: postingId, va_id: auth.user.id, note: note || null })
      .select('*')
      .single()
    if (err) {
      error.value = err.message
      return false
    }
    myApplications.value = [...myApplications.value, data as JobApplication]
    applicantCounts.value = {
      ...applicantCounts.value,
      [postingId]: (applicantCounts.value[postingId] ?? 0) + 1,
    }
    return true
  }

  /** Withdraw an unreviewed application (RLS blocks once it's been reviewed). */
  async function withdraw(postingId: string) {
    if (!auth.user) return false
    const app = myApplications.value.find((a) => a.posting_id === postingId)
    if (!app) return false
    const { error: err, count } = await supabase
      .from('job_applications')
      .delete({ count: 'exact' })
      .eq('id', app.id)
    if (err || !count) {
      error.value = err?.message ?? 'This application was already reviewed — ask the PM to release it.'
      return false
    }
    myApplications.value = myApplications.value.filter((a) => a.id !== app.id)
    applicantCounts.value = {
      ...applicantCounts.value,
      [postingId]: Math.max(0, (applicantCounts.value[postingId] ?? 1) - 1),
    }
    return true
  }

  async function toggleSave(postingId: string) {
    if (!auth.user) return
    const next = new Set(savedIds.value)
    if (next.has(postingId)) {
      next.delete(postingId)
      savedIds.value = next
      await supabase.from('job_saves').delete().eq('posting_id', postingId).eq('va_id', auth.user.id)
    } else {
      next.add(postingId)
      savedIds.value = next
      await supabase.from('job_saves').insert({ posting_id: postingId, va_id: auth.user.id })
    }
  }

  async function createPosting(input: Partial<JobPosting> & { role_title: string }) {
    const { data, error: err } = await supabase
      .from('job_postings')
      .insert({ ...input, posted_by: auth.user?.id ?? null })
      .select('*')
      .single()
    if (err) {
      error.value = err.message
      return null
    }
    postings.value = [data as JobPosting, ...postings.value]
    return data as JobPosting
  }

  async function setStatus(postingId: string, status: 'open' | 'closed') {
    const prev = postings.value
    postings.value = postings.value.map((p) => (p.id === postingId ? { ...p, status } : p))
    const { error: err } = await supabase.from('job_postings').update({ status }).eq('id', postingId)
    if (err) {
      postings.value = prev
      error.value = err.message
    }
  }

  /** Applicants for one posting — RLS only answers for the poster/admins. */
  async function fetchApplicants(postingId: string) {
    const { data, error: err } = await supabase
      .from('job_applications')
      .select('*')
      .eq('posting_id', postingId)
      .order('created_at', { ascending: true })
    if (err) {
      console.warn('[jobs] applicants:', err.message)
      return []
    }
    return (data ?? []) as JobApplication[]
  }

  return {
    postings,
    applicantCounts,
    myApplications,
    savedIds,
    appliedIds,
    loaded,
    loading,
    error,
    fetchAll,
    apply,
    withdraw,
    toggleSave,
    createPosting,
    setStatus,
    fetchApplicants,
  }
})

/** Match score: share of the posting's asked skills the VA actually has
 *  (skills + tools from their VA Profile, case-insensitive). Null when the
 *  profile lists nothing — no profile, no score, no fake numbers. */
export function matchScore(posting: JobPosting, mySkills: Set<string>): number | null {
  if (!mySkills.size || !posting.skills.length) return null
  const have = posting.skills.filter((s) => mySkills.has(s.trim().toLowerCase())).length
  return Math.round((have / posting.skills.length) * 100)
}

export function matchTone(m: number) {
  if (m >= 88) return { fg: 'var(--st-done-fg)', bg: 'var(--st-done-bg)', label: 'Great match' }
  if (m >= 70) return { fg: 'var(--st-rev-fg)', bg: 'var(--st-rev-bg)', label: 'Good match' }
  if (m >= 50) return { fg: 'var(--st-prog-fg)', bg: 'var(--st-prog-bg)', label: 'Partial match' }
  return { fg: 'var(--st-todo-fg)', bg: 'var(--st-todo-bg)', label: 'Low match' }
}

export const POSTING_TYPES: Record<PostingType, { label: string; color: string }> = {
  ongoing: { label: 'Ongoing role', color: '#2f6fed' },
  project: { label: 'Project', color: '#7b2d86' },
  task: { label: 'Task pickups', color: '#0d9488' },
  trial: { label: 'Trial / overflow', color: '#c2700c' },
}
