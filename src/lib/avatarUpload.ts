import { supabase } from '@/lib/supabase'

// Profile pictures live in the public `avatars` bucket under {user_id}/{uuid}.ext.
// Everything renders at 20–64px, so images are downscaled client-side before
// upload — nobody needs a 4 MB original behind a chat avatar.
const BUCKET = 'avatars'
const MAX_INPUT_BYTES = 5 * 1024 * 1024
const TARGET_SIZE = 512

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/** Downscale to a square-fitting target webp. Animated GIFs are kept
 *  as-is (canvas would freeze the first frame). */
async function prepare(file: File, target = TARGET_SIZE): Promise<{ blob: Blob; ext: string; mime: string }> {
  if (file.type === 'image/gif') return { blob: file, ext: 'gif', mime: 'image/gif' }

  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, target / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return { blob: file, ext: extOf(file), mime: file.type }
    ctx.drawImage(bitmap, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.85),
    )
    if (!blob) return { blob: file, ext: extOf(file), mime: file.type }
    return { blob, ext: 'webp', mime: 'image/webp' }
  } finally {
    bitmap.close()
  }
}

function extOf(file: File) {
  return file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
}

/** Upload a new profile picture; returns its public URL. */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Pick an image file (JPG, PNG, WebP or GIF).')
  if (file.size > MAX_INPUT_BYTES) throw new Error('Image is over 5 MB — pick a smaller one.')

  const { blob, ext, mime } = await prepare(file)
  const path = `${userId}/${uuid()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    cacheControl: '31536000',
    contentType: mime,
    upsert: false,
  })
  if (error) throw error
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/** Upload a portfolio/work-sample image (VA profile). Same own-folder bucket
 *  as avatars, larger downscale target since these render as gallery tiles. */
export async function uploadPortfolioImage(userId: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Pick an image file (JPG, PNG, WebP or GIF).')
  if (file.size > MAX_INPUT_BYTES) throw new Error('Image is over 5 MB — pick a smaller one.')

  const { blob, ext, mime } = await prepare(file, 1280)
  const path = `${userId}/portfolio-${uuid()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    cacheControl: '31536000',
    contentType: mime,
    upsert: false,
  })
  if (error) throw error
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/** Best-effort delete of a previous avatar — only touches our own bucket;
 *  external URLs (the old paste-a-URL era) are left alone. */
export async function removeAvatarFile(url: string | null | undefined) {
  if (!url) return
  const marker = `/object/public/${BUCKET}/`
  const i = url.indexOf(marker)
  if (i === -1) return
  const path = decodeURIComponent(url.slice(i + marker.length).split('?')[0])
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) console.warn('[avatar] cleanup:', error.message)
}
