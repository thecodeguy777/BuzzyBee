import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AuthSession } from '../../shared/ipc-channels'

export const useAuthStore = defineStore('auth', () => {
  const session = ref<AuthSession | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => session.value !== null)

  async function init() {
    loading.value = true
    try {
      session.value = await window.electronAPI.auth.getSession()
    } catch (err) {
      console.error('[Auth] init error:', err)
    } finally {
      loading.value = false
    }
  }

  async function signIn(email: string, password: string): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      const res = await window.electronAPI.auth.signIn(email, password)
      if (!res.success) {
        error.value = res.error ?? 'Sign in failed'
        return false
      }
      session.value = res.session ?? null
      return true
    } finally {
      loading.value = false
    }
  }

  async function signOut() {
    await window.electronAPI.auth.signOut()
    session.value = null
  }

  return { session, loading, error, isAuthenticated, init, signIn, signOut }
})
