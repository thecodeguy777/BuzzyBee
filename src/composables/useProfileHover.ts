import { ref } from 'vue'

/**
 * Hover-intent + viewport placement for the message profile popover. Tracks a
 * single active target at a time, so one instance drives a whole list of
 * messages (the dock) or a single message (CommsMessage). Pair with
 * <CommsProfilePopover>.
 */
export function useProfileHover() {
  const userId = ref<string | null>(null)
  const style = ref<Record<string, string>>({})
  let openTimer: ReturnType<typeof setTimeout> | undefined
  let closeTimer: ReturnType<typeof setTimeout> | undefined

  function place(el: HTMLElement) {
    const r = el.getBoundingClientRect()
    const W = 256
    const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8))
    // Prefer below the anchor; flip above if it would overflow the viewport.
    const below = r.bottom + 6
    const flipUp = below + 180 > window.innerHeight
    style.value = flipUp
      ? { left: `${left}px`, bottom: `${window.innerHeight - r.top + 6}px` }
      : { left: `${left}px`, top: `${below}px` }
  }
  function open(id: string, ev: MouseEvent) {
    clearTimeout(closeTimer)
    const el = ev.currentTarget as HTMLElement
    openTimer = setTimeout(() => {
      place(el)
      userId.value = id
    }, 320)
  }
  function scheduleClose() {
    clearTimeout(openTimer)
    closeTimer = setTimeout(() => (userId.value = null), 180)
  }
  function cancelClose() {
    clearTimeout(closeTimer)
  }
  function close() {
    clearTimeout(openTimer)
    clearTimeout(closeTimer)
    userId.value = null
  }

  return { userId, style, open, scheduleClose, cancelClose, close }
}
