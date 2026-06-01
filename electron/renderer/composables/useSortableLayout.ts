import { ref, watch, onMounted, onBeforeUnmount, nextTick, type Ref } from 'vue'
import Sortable from 'sortablejs'

// Generic vertical-sortable layout composable.
// Attaches SortableJS to a container, persists the section order to
// localStorage per user, and exposes a reactive `order` array driving v-for.
//
// Pattern of use:
//   <div ref="container">
//     <div v-for="key in order" :key="key"
//          class="sortable-section" :data-section="key">
//       <button class="section-drag-handle">⋮⋮</button>
//       <!-- section markup -->
//     </div>
//   </div>

export interface UseSortableLayoutOptions {
  containerRef: Ref<HTMLElement | null>
  storageKey: string
  defaultOrder: string[]
  handleSelector?: string
  itemSelector?: string
}

export function useSortableLayout(opts: UseSortableLayoutOptions) {
  const order = ref<string[]>(loadOrder())
  const isCustomized = ref(orderDiffersFromDefault())
  let sortable: Sortable | null = null

  function loadOrder(): string[] {
    try {
      const raw = localStorage.getItem(opts.storageKey)
      if (!raw) return [...opts.defaultOrder]
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return [...opts.defaultOrder]
      // Keep only known keys (filter stale ones); append any new keys at the end
      const valid: string[] = parsed.filter(
        (k: any) => typeof k === 'string' && opts.defaultOrder.includes(k),
      )
      const missing = opts.defaultOrder.filter(k => !valid.includes(k))
      return [...valid, ...missing]
    } catch {
      return [...opts.defaultOrder]
    }
  }

  function saveOrder() {
    try { localStorage.setItem(opts.storageKey, JSON.stringify(order.value)) } catch {}
    isCustomized.value = orderDiffersFromDefault()
  }

  function orderDiffersFromDefault(): boolean {
    const a = order?.value ?? []
    const b = opts.defaultOrder
    if (a.length !== b.length) return true
    return a.some((k, i) => k !== b[i])
  }

  async function attach() {
    await nextTick()
    if (!opts.containerRef.value) return
    detach()
    sortable = Sortable.create(opts.containerRef.value, {
      animation: 200,
      handle: opts.handleSelector ?? '.section-drag-handle',
      draggable: opts.itemSelector ?? '.sortable-section',
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      forceFallback: true,
      fallbackClass: 'sortable-fallback',
      onEnd: (evt) => {
        if (evt.oldIndex == null || evt.newIndex == null) return
        if (evt.oldIndex === evt.newIndex) return
        const newOrder = [...order.value]
        const [item] = newOrder.splice(evt.oldIndex, 1)
        newOrder.splice(evt.newIndex, 0, item)
        order.value = newOrder
        saveOrder()
      },
    })
  }

  function detach() {
    if (sortable) {
      sortable.destroy()
      sortable = null
    }
  }

  function reset() {
    order.value = [...opts.defaultOrder]
    saveOrder()
  }

  onMounted(attach)
  onBeforeUnmount(detach)

  // Re-attach when container ref swaps (component remount via :key etc.)
  watch(opts.containerRef, (el, oldEl) => {
    if (el !== oldEl && el) attach()
  })

  return { order, isCustomized, reset }
}
