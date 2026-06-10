import { supabase } from '@/lib/supabase'
import type { Attachment } from '@/composables/useChannelStream'

// Comms file/image uploads go to a dedicated public bucket so URLs are stable
// (no signing/expiry). Paths use unguessable uuids. Links need no upload.
const BUCKET = 'comms-attachments'

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120)
}

export async function uploadCommsFile(channelId: string, file: File): Promise<Attachment> {
  const path = `${channelId}/${uuid()}-${safeName(file.name)}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
  if (error) throw error
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return {
    id: uuid(),
    kind: file.type.startsWith('image/') ? 'image' : 'file',
    name: file.name,
    url: data.publicUrl,
    size: file.size,
    mime: file.type || 'application/octet-stream',
  }
}

export function linkAttachment(rawUrl: string): Attachment | null {
  let url = rawUrl.trim()
  if (!url) return null
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  let host = url
  try {
    host = new URL(url).host
  } catch {
    return null
  }
  return { id: uuid(), kind: 'link', name: host, url }
}

export function formatBytes(n: number | undefined) {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
