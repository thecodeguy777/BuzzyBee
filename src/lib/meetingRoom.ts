import { supabase } from '@/lib/supabase'

// Unguessable room token (the access key in the /meet/<token> URL).
export function randomToken(len = 12): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789' // no ambiguous chars
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

/** Create a meeting room owned by `hostId`. Returns the join token. */
export async function createMeetingRoom(hostId: string, title?: string): Promise<string> {
  const token = randomToken()
  const { error } = await supabase
    .from('meeting_rooms')
    .insert({ token, host_id: hostId, title: title?.trim() || null })
  if (error) throw error
  return token
}
