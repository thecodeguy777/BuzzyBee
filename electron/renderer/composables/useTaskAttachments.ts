import { ref, computed, watch, onUnmounted } from 'vue'
import { getSupabase, supabaseSession } from '../lib/supabase-client'

export interface TaskAttachment {
  id: string
  taskId: string
  fileName: string
  mimeType: string | null
  sizeBytes: number | null
  storageBucket: string
  storagePath: string
  uploadedByUserId: string | null
  createdAt: string
}

const BUCKET = 'dialer-task-attachments'

function rowToAttachment(r: any): TaskAttachment {
  return {
    id: r.id,
    taskId: r.task_id,
    fileName: r.file_name,
    mimeType: r.mime_type ?? null,
    sizeBytes: r.size_bytes ?? null,
    storageBucket: r.storage_bucket ?? BUCKET,
    storagePath: r.storage_path,
    uploadedByUserId: r.uploaded_by_user_id ?? null,
    createdAt: r.created_at,
  }
}

/**
 * Per-task attachments composable. Use one instance per <TaskAttachments :taskId />
 * mount — it subscribes to that task's attachment INSERT/DELETE stream.
 */
export function useTaskAttachments(taskIdRef: () => string | null) {
  const attachments = ref<TaskAttachment[]>([])
  const isLoading = ref(false)
  const isUploading = ref(false)
  const uploadProgress = ref(0)
  const lastError = ref<string | null>(null)
  let channel: any = null

  async function load(taskId: string) {
    const client = await getSupabase()
    if (!client) return
    isLoading.value = true
    try {
      const { data, error } = await client
        .from('dialer_task_attachments')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false })
      if (error) {
        lastError.value = error.message
        console.error('[useTaskAttachments] load:', error)
        return
      }
      attachments.value = (data ?? []).map(rowToAttachment)
    } finally {
      isLoading.value = false
    }
  }

  async function subscribe(taskId: string) {
    const client = await getSupabase()
    if (!client) return
    channel = client
      .channel(`task_attachments_${taskId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'buzzybee', table: 'dialer_task_attachments', filter: `task_id=eq.${taskId}` },
        (payload: any) => {
          if (payload.eventType === 'INSERT') {
            const a = rowToAttachment(payload.new)
            if (!attachments.value.some(x => x.id === a.id)) {
              attachments.value = [a, ...attachments.value]
            }
          } else if (payload.eventType === 'DELETE') {
            attachments.value = attachments.value.filter(a => a.id !== payload.old?.id)
          }
        },
      )
      .subscribe()
  }

  function teardown() {
    if (channel) {
      try { channel.unsubscribe() } catch {}
      channel = null
    }
  }

  watch(taskIdRef, async (id, _prev, onCleanup) => {
    teardown()
    attachments.value = []
    if (!id) return
    await load(id)
    await subscribe(id)
    onCleanup(teardown)
  }, { immediate: true })

  onUnmounted(teardown)

  async function uploadFile(file: File): Promise<TaskAttachment | null> {
    const taskId = taskIdRef()
    const client = await getSupabase()
    if (!taskId || !client) return null
    const actorId = supabaseSession.value?.userId ?? null

    isUploading.value = true
    uploadProgress.value = 0
    lastError.value = null
    try {
      // Path layout: <task_id>/<timestamp>-<safe_name>
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
      const path = `${taskId}/${Date.now()}-${safeName}`

      const { error: uploadError } = await client.storage
        .from(BUCKET)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || undefined,
        })
      if (uploadError) {
        lastError.value = uploadError.message
        console.error('[useTaskAttachments] upload:', uploadError)
        return null
      }

      uploadProgress.value = 100

      const { data: meta, error: insertError } = await client
        .from('dialer_task_attachments')
        .insert({
          task_id: taskId,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
          storage_bucket: BUCKET,
          storage_path: path,
          uploaded_by_user_id: actorId,
        })
        .select()
        .single()
      if (insertError) {
        lastError.value = insertError.message
        console.error('[useTaskAttachments] metadata insert:', insertError)
        // Best-effort cleanup of orphaned storage object
        try { await client.storage.from(BUCKET).remove([path]) } catch {}
        return null
      }
      return rowToAttachment(meta)
    } finally {
      isUploading.value = false
      uploadProgress.value = 0
    }
  }

  async function uploadMany(files: FileList | File[]): Promise<number> {
    let count = 0
    for (const file of Array.from(files)) {
      const result = await uploadFile(file)
      if (result) count++
    }
    return count
  }

  async function deleteAttachment(att: TaskAttachment): Promise<boolean> {
    const client = await getSupabase()
    if (!client) return false
    // Optimistic
    attachments.value = attachments.value.filter(a => a.id !== att.id)
    const { error: storageError } = await client.storage.from(att.storageBucket).remove([att.storagePath])
    if (storageError) console.warn('[useTaskAttachments] storage delete:', storageError)
    const { error } = await client.from('dialer_task_attachments').delete().eq('id', att.id)
    if (error) {
      console.error('[useTaskAttachments] metadata delete:', error)
      return false
    }
    return true
  }

  /** Get a short-lived signed URL for viewing/downloading. */
  async function getSignedUrl(att: TaskAttachment, expiresInSec = 300): Promise<string | null> {
    const client = await getSupabase()
    if (!client) return null
    const { data, error } = await client.storage
      .from(att.storageBucket)
      .createSignedUrl(att.storagePath, expiresInSec)
    if (error) {
      console.error('[useTaskAttachments] signed url:', error)
      return null
    }
    return data?.signedUrl ?? null
  }

  const totalSize = computed(() =>
    attachments.value.reduce((sum, a) => sum + (a.sizeBytes ?? 0), 0),
  )

  return {
    attachments,
    isLoading,
    isUploading,
    uploadProgress,
    lastError,
    totalSize,
    uploadFile,
    uploadMany,
    deleteAttachment,
    getSignedUrl,
  }
}
