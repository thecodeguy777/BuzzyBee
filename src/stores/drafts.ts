import { reactive } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from '@/stores/auth'

const KEY_PREFIX = 'buzzybee.comms.drafts.'
// Generous cap so abandoned drafts never grow localStorage unbounded.
const MAX_DRAFTS = 100

/**
 * Messenger-style per-conversation drafts. Composers bind to a conversation
 * key (channel id, or `thread:{parentId}` for thread replies) and every
 * keystroke lands here — switch channels or reload and the half-typed
 * message is waiting where you left it.
 *
 * Local-only by design (like Messenger): drafts are per-device scratch
 * space, keyed by user so shared machines don't leak them across accounts.
 */
export const useDraftsStore = defineStore('drafts', () => {
  const auth = useAuthStore()
  const drafts = reactive<Record<string, string>>({})
  let loadedFor: string | null = null

  function storageKey() {
    return auth.user?.id ? `${KEY_PREFIX}${auth.user.id}` : null
  }

  function ensureLoaded() {
    const key = storageKey()
    if (!key || loadedFor === key || typeof window === 'undefined') return
    for (const k of Object.keys(drafts)) delete drafts[k]
    try {
      const raw = window.localStorage.getItem(key)
      if (raw) Object.assign(drafts, JSON.parse(raw))
    } catch {
      /* corrupted payload — start fresh */
    }
    loadedFor = key
  }

  function persist() {
    const key = storageKey()
    if (!key || typeof window === 'undefined') return
    // Insertion order ≈ age; drop the oldest past the cap.
    const keys = Object.keys(drafts)
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_DRAFTS))) delete drafts[k]
    try {
      window.localStorage.setItem(key, JSON.stringify(drafts))
    } catch {
      /* quota — drafts are best-effort */
    }
  }

  function get(id: string | null | undefined): string {
    if (!id) return ''
    ensureLoaded()
    return drafts[id] ?? ''
  }

  function set(id: string | null | undefined, text: string) {
    if (!id) return
    ensureLoaded()
    if (text.trim()) drafts[id] = text
    else delete drafts[id]
    persist()
  }

  function clear(id: string | null | undefined) {
    set(id, '')
  }

  function has(id: string | null | undefined): boolean {
    return !!get(id).trim()
  }

  return { drafts, get, set, clear, has }
})
