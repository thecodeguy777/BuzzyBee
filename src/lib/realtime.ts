import { REALTIME_CHANNEL_STATES, type RealtimeChannel } from '@supabase/supabase-js'

/**
 * Broadcast over the websocket ONLY when the channel is actually joined.
 *
 * Calling `channel.send({ type: 'broadcast' })` while the socket can't push
 * makes realtime-js silently fall back to a REST POST — and (as of
 * realtime-js 2.105) log a deprecation warning telling you to use `httpSend()`.
 * For our signals (typing, presence pings, WebRTC signaling, buzz, reactions,
 * in-call chat) REST delivery is the wrong transport anyway: they're ephemeral,
 * so if we're not connected the right thing is to drop them, not POST them.
 *
 * Returns true if the send was attempted (channel joined), false otherwise.
 */
export function broadcast(
  channel: RealtimeChannel | null | undefined,
  event: string,
  payload: unknown,
): boolean {
  if (!channel || channel.state !== REALTIME_CHANNEL_STATES.joined) return false
  void channel.send({ type: 'broadcast', event, payload })
  return true
}
