import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export type UserRole = 'va' | 'pm' | 'admin' | 'superadmin'

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  role: UserRole
  timezone: string | null
  avatar_url: string | null
  is_active: boolean
  availability: string | null
  status_note: string | null
}

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const user = ref<User | null>(null)
  const profile = ref<Profile | null>(null)
  const ready = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => session.value !== null)
  const isAdmin = computed(
    () => profile.value?.role === 'admin' || profile.value?.role === 'superadmin'
  )
  const isSuperadmin = computed(() => profile.value?.role === 'superadmin')
  const fullName = computed(
    () =>
      profile.value?.full_name ??
      user.value?.user_metadata?.full_name ??
      user.value?.email?.split('@')[0] ??
      ''
  )
  const firstName = computed(() => fullName.value.split(' ')[0] ?? '')
  const role = computed<UserRole>(() => profile.value?.role ?? 'va')
  const initials = computed(() => {
    const name = fullName.value
    return (
      name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((p: string) => p.charAt(0).toUpperCase())
        .join('') || 'BB'
    )
  })

  async function refreshProfile() {
    if (!user.value) {
      profile.value = null
      return
    }
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, timezone, avatar_url, is_active, availability, status_note')
      .eq('id', user.value.id)
      .maybeSingle()

    if (err) {
      // Non-fatal: schema might not be exposed yet, or trigger hasn't run.
      // Surface in console; UI falls back to user_metadata / email.
      console.warn('[auth] profile fetch failed:', err.message)
      profile.value = null
      return
    }
    profile.value = (data as Profile) ?? null

    // Deactivated accounts fail closed server-side (role helpers return
    // nothing); sign them out client-side too so they land on the login page.
    if (profile.value && profile.value.is_active === false) {
      console.warn('[auth] account is deactivated — signing out')
      await supabase.auth.signOut({ scope: 'local' })
      profile.value = null
    }
  }

  function setSession(next: Session | null) {
    session.value = next
    user.value = next?.user ?? null
  }

  async function init() {
    if (ready.value) return
    const { data } = await supabase.auth.getSession()
    setSession(data.session)
    await refreshProfile()

    supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      void refreshProfile()
    })

    ready.value = true
  }

  async function signIn(email: string, password: string) {
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      })
      if (err) throw err
      setSession(data.session)
      await refreshProfile()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Sign-in failed.'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function signUp(email: string, password: string, fullNameInput?: string, roleInput: UserRole = 'va') {
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullNameInput?.trim() || undefined,
            role: roleInput
          }
        }
      })
      if (err) throw err
      // If email confirmation is OFF, session is returned immediately.
      if (data.session) {
        setSession(data.session)
        await refreshProfile()
      }
      return data
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Sign-up failed.'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function signOut() {
    // scope:'local' signs out THIS device only. The default ('global') revokes
    // refresh tokens everywhere — signing out at home killed the office tab and
    // the dialer within the hour, which read as "the app randomly logs us out".
    await supabase.auth.signOut({ scope: 'local' })
    setSession(null)
    profile.value = null
  }

  async function updateProfile(patch: {
    full_name?: string | null
    timezone?: string | null
    avatar_url?: string | null
    role?: UserRole
    availability?: string
    status_note?: string | null
  }) {
    if (!user.value) throw new Error('Not authenticated')
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', user.value.id)
        .select('id, email, full_name, role, timezone, avatar_url, is_active, availability, status_note')
        .single()
      if (err) throw err
      profile.value = data as Profile
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Could not update profile.'
      throw e
    } finally {
      loading.value = false
    }
  }

  return {
    session,
    user,
    profile,
    ready,
    loading,
    error,
    isAuthenticated,
    isAdmin,
    isSuperadmin,
    fullName,
    firstName,
    role,
    initials,
    init,
    refreshProfile,
    signIn,
    signUp,
    signOut,
    updateProfile
  }
})
