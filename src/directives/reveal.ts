import type { Directive } from 'vue'

type RevealValue = number | { delay?: number; direction?: 'up' | 'down' | 'left' | 'right' } | undefined

/**
 * v-reveal — fades + slides an element into view when it scrolls into the viewport.
 *
 * Usage:
 *   <div v-reveal>...</div>                             default: fade-up, no delay
 *   <div v-reveal="150">...</div>                       number = delay in ms
 *   <div v-reveal="{ delay: 200, direction: 'left' }"> full form
 *   <div v-reveal.down>...</div>                        direction via modifier
 */
export const vReveal: Directive<HTMLElement, RevealValue> = {
  mounted(el, binding) {
    const value = binding.value
    const delay =
      typeof value === 'number' ? value :
      typeof value === 'object' && value?.delay ? value.delay : 0

    const directionFromModifier =
      binding.modifiers.down ? 'down' :
      binding.modifiers.left ? 'left' :
      binding.modifiers.right ? 'right' :
      binding.modifiers.up ? 'up' : null

    const direction =
      (typeof value === 'object' && value?.direction) ||
      directionFromModifier ||
      'up'

    el.classList.add('reveal', `reveal-${direction}`)
    if (delay) el.style.transitionDelay = `${delay}ms`

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('revealed')
          io.disconnect()
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    )
    io.observe(el)
  }
}
