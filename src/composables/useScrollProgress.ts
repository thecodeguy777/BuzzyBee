import { ref, onMounted, onUnmounted, type Ref } from 'vue'

/**
 * Tracks how far the user has scrolled *through* an element, normalized 0→1.
 *
 * Designed for "scrollytelling": give the target a tall height (e.g. h-[300vh])
 * with a `sticky` child, and `progress` reports 0 when the element's top hits
 * the viewport top and 1 when its bottom reaches the viewport bottom — i.e. the
 * full travel of the sticky child. rAF-throttled; cleans up its own listeners.
 */
export function useScrollProgress(el: Ref<HTMLElement | null>) {
  const progress = ref(0)
  let raf = 0

  const update = () => {
    raf = 0
    const node = el.value
    if (!node) return
    const rect = node.getBoundingClientRect()
    const travel = rect.height - window.innerHeight
    const scrolled = -rect.top
    progress.value = travel > 0 ? Math.min(1, Math.max(0, scrolled / travel)) : 0
  }

  const onScroll = () => {
    if (!raf) raf = requestAnimationFrame(update)
  }

  onMounted(() => {
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
  })

  onUnmounted(() => {
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onScroll)
    if (raf) cancelAnimationFrame(raf)
  })

  return { progress }
}
