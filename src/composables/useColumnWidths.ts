import { ref, watch } from 'vue'

/**
 * Excel-style column resize state, persisted to localStorage.
 *
 * Usage:
 *   const { width, beginDrag, isDragging } = useColumnWidths('tasks-table')
 *
 *   <th :style="{ width: width('name', 320) + 'px' }">
 *     Name
 *     <span class="resize-handle" @mousedown="(e) => beginDrag('name', e)" />
 *   </th>
 *
 * Each column is keyed by a stable string. Default widths are passed at
 * read time so the composable doesn't need a registration pass.
 */
export function useColumnWidths(storageKey: string) {
  const STORAGE_KEY = `buzzybee.col-widths.${storageKey}`

  function load(): Record<string, number> {
    if (typeof window === 'undefined') return {}
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return {}
      const parsed = JSON.parse(raw)
      return typeof parsed === 'object' && parsed !== null ? parsed : {}
    } catch {
      return {}
    }
  }

  const widths = ref<Record<string, number>>(load())
  const isDragging = ref(false)
  const draggingKey = ref<string | null>(null)

  function persist() {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(widths.value))
    } catch {
      /* quota or disabled — ignore */
    }
  }

  // Single shared persist watcher across renames/edits
  watch(widths, persist, { deep: true })

  /** Read width for a column, falling back to the supplied default. */
  function width(key: string, fallback: number): number {
    return widths.value[key] ?? fallback
  }

  /** Reset a single column to its default (deletes the override). */
  function reset(key: string) {
    if (key in widths.value) {
      const next = { ...widths.value }
      delete next[key]
      widths.value = next
    }
  }

  /** Reset all columns. */
  function resetAll() {
    widths.value = {}
  }

  /**
   * Begin a drag from a mousedown on a resize handle. The handle should
   * stop propagation; this attaches mousemove/mouseup to the document so
   * the cursor can travel outside the cell.
   */
  function beginDrag(
    key: string,
    e: MouseEvent,
    options: { min?: number; max?: number; defaultWidth?: number } = {}
  ) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startWidth = widths.value[key] ?? options.defaultWidth ?? 160
    const min = options.min ?? 60
    const max = options.max ?? 1200

    isDragging.value = true
    draggingKey.value = key
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    function onMove(ev: MouseEvent) {
      const delta = ev.clientX - startX
      const next = Math.max(min, Math.min(max, startWidth + delta))
      widths.value = { ...widths.value, [key]: next }
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      isDragging.value = false
      draggingKey.value = null
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return {
    widths,
    width,
    beginDrag,
    reset,
    resetAll,
    isDragging,
    draggingKey
  }
}
