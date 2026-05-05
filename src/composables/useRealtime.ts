/**
 * useRealtime — Supabase Realtime composable for Vue 3.
 *
 * Ported from MikeSteelv2. Battle-tested for browser tab throttling,
 * silent disconnects, and zombie channels.
 *
 * Pairs with the `realtime: { worker: true, heartbeatCallback }` config
 * in lib/supabase.ts:
 *   - Full channel restart (not just reconnect) on error detection
 *   - Visibility-based reconnect on tab return
 *   - Focus-based reconnect for Alt-Tab returns
 *   - Periodic stale check as safety net
 *   - Clean teardown on unmount
 *
 * References:
 *   - https://supabase.com/docs/guides/troubleshooting/realtime-heartbeat-messages
 *   - https://github.com/orgs/supabase/discussions/5641
 *   - https://github.com/orgs/supabase/discussions/41239
 */

import { ref, onUnmounted, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface SubscriptionEntry {
  id: string
  table: string
  channel: RealtimeChannel | null
  callback: (payload: any) => void
  options: SubscribeOptions
  active: boolean
  retryCount: number
  reconnectTimer: ReturnType<typeof setTimeout> | null
}

interface SubscribeOptions {
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*'
  filter?: string
  schema?: string
}

const HEALTH_CHECK_INTERVAL = 30_000
const STALE_THRESHOLD = 120_000
const FOCUS_STALE_THRESHOLD = 15_000

// All Workstation tables live in the `buzzybee` schema by default.
const DEFAULT_SCHEMA = 'buzzybee'

export function useRealtime() {
  const subscriptions = new Map<string, SubscriptionEntry>()
  const status = ref<'connected' | 'disconnected' | 'reconnecting'>('disconnected')
  let lastActivity = Date.now()
  let healthTimer: ReturnType<typeof setInterval> | null = null
  let hadError = false

  function subscribe(
    table: string,
    callback: (payload: any) => void,
    options: SubscribeOptions = {}
  ): string {
    const id = `${table}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    const entry: SubscriptionEntry = {
      id,
      table,
      channel: null,
      callback,
      options,
      active: false,
      retryCount: 0,
      reconnectTimer: null
    }

    subscriptions.set(id, entry)
    startSubscription(id)

    if (subscriptions.size === 1) startHealthCheck()

    return id
  }

  function startSubscription(id: string) {
    const entry = subscriptions.get(id)
    if (!entry) return

    try {
      const channel = supabase
        .channel(`bb-${id}`)
        .on(
          'postgres_changes',
          {
            event: entry.options.event || '*',
            schema: entry.options.schema || DEFAULT_SCHEMA,
            table: entry.table,
            ...(entry.options.filter ? { filter: entry.options.filter } : {})
          },
          (payload) => {
            lastActivity = Date.now()
            hadError = false
            try {
              entry.callback(payload)
            } catch (err) {
              console.error('[Realtime] Callback error:', err)
            }
          }
        )
        .subscribe((subStatus) => {
          if (subStatus === 'SUBSCRIBED') {
            entry.active = true
            entry.retryCount = 0
            status.value = 'connected'
            lastActivity = Date.now()
            hadError = false
          } else if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT') {
            entry.active = false
            hadError = true
            status.value = 'reconnecting'
            scheduleRestart(id)
          } else if (subStatus === 'CLOSED') {
            entry.active = false
          }
        })

      entry.channel = channel
    } catch (err) {
      console.error('[Realtime] Failed to start:', err)
      hadError = true
      scheduleRestart(id)
    }
  }

  function scheduleRestart(id: string) {
    const entry = subscriptions.get(id)
    if (!entry) return

    if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer)

    entry.retryCount++
    const delay = Math.min(1000 * Math.pow(2, entry.retryCount), 30000)

    entry.reconnectTimer = setTimeout(() => {
      entry.reconnectTimer = null
      if (subscriptions.has(id)) fullRestart(id)
    }, delay)
  }

  async function fullRestart(id: string) {
    const entry = subscriptions.get(id)
    if (!entry) return

    if (entry.channel) {
      try {
        await supabase.removeChannel(entry.channel)
      } catch {
        /* ignore */
      }
    }

    entry.channel = null
    entry.active = false
    startSubscription(id)
  }

  async function fullRestartAll() {
    if (subscriptions.size === 0) return
    status.value = 'reconnecting'
    for (const id of Array.from(subscriptions.keys())) {
      await fullRestart(id)
    }
  }

  async function unsubscribe(id: string) {
    const entry = subscriptions.get(id)
    if (!entry) return

    if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer)
    if (entry.channel) {
      try {
        await supabase.removeChannel(entry.channel)
      } catch {
        /* ignore */
      }
    }

    subscriptions.delete(id)
    if (subscriptions.size === 0) {
      status.value = 'disconnected'
      stopHealthCheck()
    }
  }

  async function unsubscribeAll() {
    await Promise.all(Array.from(subscriptions.keys()).map((id) => unsubscribe(id)))
  }

  function healthCheck() {
    if (subscriptions.size === 0 || document.hidden) return
    if (Date.now() - lastActivity > STALE_THRESHOLD) {
      console.log('[Realtime] Health check: stale — restarting all channels')
      fullRestartAll()
    }
  }

  function startHealthCheck() {
    if (!healthTimer) {
      healthTimer = setInterval(healthCheck, HEALTH_CHECK_INTERVAL)
    }
  }

  function stopHealthCheck() {
    if (healthTimer) {
      clearInterval(healthTimer)
      healthTimer = null
    }
  }

  function onVisibilityChange() {
    if (!document.hidden && subscriptions.size > 0) {
      if (hadError || Date.now() - lastActivity > FOCUS_STALE_THRESHOLD) {
        fullRestartAll()
      }
    }
  }

  function onFocus() {
    if (
      subscriptions.size > 0 &&
      (hadError || Date.now() - lastActivity > FOCUS_STALE_THRESHOLD)
    ) {
      fullRestartAll()
    }
  }

  function onOnline() {
    if (subscriptions.size > 0) fullRestartAll()
  }

  function onOffline() {
    status.value = 'disconnected'
    hadError = true
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
  })

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('focus', onFocus)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    stopHealthCheck()
    unsubscribeAll()
  })

  return {
    subscribe,
    unsubscribe,
    unsubscribeAll,
    status
  }
}
