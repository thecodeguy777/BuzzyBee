import { ref, onMounted, onUnmounted, type Ref } from 'vue'

/**
 * Progress of an element *through* the viewport, normalized 0→1, WITHOUT pinning.
 *
 * 0 = the element's top has just reached the bottom of the viewport (entering);
 * ~0.5 = the element is centered; 1 = its bottom has passed the top (leaving).
 *
 * Use for scroll-reactive effects on normal-flow sections (e.g. a grayscale→color
 * flood) where you don't want a tall sticky `h-[Nvh]` pin. rAF-throttled, self-cleaning.
 */
export function useInViewProgress(el: Ref<HTMLElement | null>) {
  const progress = ref(0)
  let raf = 0

  const update = () => {
    raf = 0
    const node = el.value
    if (!node) return
    const rect = node.getBoundingClientRect()
    const vh = window.innerHeight
    const total = vh + rect.height
    const seen = vh - rect.top
    progress.value = Math.min(1, Math.max(0, seen / total))
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
