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

// Client-side allowlist mirrors the storage bucket's server-side allowed_mime_types
// (defense in depth — the bucket rejects anything not on the list regardless).
// Deliberately excludes image/svg+xml (stored-XSS via signed URL) and octet-stream.
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
export const ALLOWED_ATTACHMENT_MIME = new Set<string>([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/heic', 'image/avif',
  'application/pdf',
  'text/plain', 'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip', 'application/x-zip-compressed'
])

/** Returns an error message if the file is too big or a disallowed type, else null. */
export function validateAttachment(file: File): string | null {
  if (file.size > MAX_ATTACHMENT_BYTES) return `${file.name} is over 25 MB`
  const mime = file.type || ''
  if (!ALLOWED_ATTACHMENT_MIME.has(mime)) {
    return `${file.name}: ${mime || 'unknown type'} isn't an allowed file type`
  }
  return null
}

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
  const invalid = validateAttachment(opts.file)
  if (invalid) throw new Error(invalid)

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
