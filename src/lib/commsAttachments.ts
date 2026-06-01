import { supabase } from '@/lib/supabase'
import type { Attachment } from '@/composables/useChannelStream'

// Comms file/image uploads reuse the existing task-attachments bucket under a
// comms/ prefix. Links need no upload. (v1: 7-day signed URLs — a re-sign-on-
// render pass is a fast follow if links expire.)
const BUCKET = 'task-attachments'
const WEEK = 60 * 60 * 24 * 7

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120)
}

export async function uploadCommsFile(channelId: string, file: File): Promise<Attachment> {
  const path = `comms/${channelId}/${uuid()}-${safeName(file.name)}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
  if (error) throw error
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, WEEK)
  return {
    kind: file.type.startsWith('image/') ? 'image' : 'file',
    name: file.name,
    url: data?.signedUrl,
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
  return { kind: 'link', name: host, url }
}

export function formatBytes(n: number | undefined) {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
