import { supabase } from '@/lib/supabase'

export interface TaskAttachmentMeta {
  id: string                    // generated uuid
  path: string                  // bucket key: {client_id}/{task_id}/{uuid}-{filename}
  name: string                  // original filename
  size: number
  mime_type: string
  uploaded_at: string
  uploaded_by: string | null
}

const BUCKET = 'task-attachments'

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120)
}

export async function uploadTaskAttachment(opts: {
  clientId: string
  taskId: string
  file: File
  uploadedBy: string | null
}): Promise<TaskAttachmentMeta> {
  const id = uuid()
  const path = `${opts.clientId}/${opts.taskId}/${id}-${safeName(opts.file.name)}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, opts.file, {
    cacheControl: '3600',
    contentType: opts.file.type || 'application/octet-stream',
    upsert: false
  })
  if (error) throw error

  return {
    id,
    path,
    name: opts.file.name,
    size: opts.file.size,
    mime_type: opts.file.type || 'application/octet-stream',
    uploaded_at: new Date().toISOString(),
    uploaded_by: opts.uploadedBy
  }
}

export async function deleteTaskAttachment(path: string) {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw error
}

export async function signedAttachmentUrl(
  path: string,
  expiresInSeconds = 3600,
  transform?: { width?: number; height?: number; resize?: 'cover' | 'contain' }
) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds, transform ? { transform } : undefined)
  if (error) throw error
  return data.signedUrl
}

export function isImage(mime: string | undefined | null) {
  return !!mime && mime.startsWith('image/')
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}
