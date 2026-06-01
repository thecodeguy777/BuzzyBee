import { ref } from 'vue'

// Global lead search modal — open/close state shared across components.
// Triggered by Ctrl+K (Cmd+K on Mac) anywhere in the app.

const isOpen = ref(false)
const query = ref('')

export function useGlobalSearch() {
  function open() {
    isOpen.value = true
  }
  function close() {
    isOpen.value = false
    query.value = ''
  }
  function toggle() {
    isOpen.value ? close() : open()
  }
  return { isOpen, query, open, close, toggle }
}

/** Register Ctrl/Cmd+K to toggle the modal — call once per renderer at setup. */
export function registerGlobalSearchHotkey() {
  if (typeof window === 'undefined') return
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault()
      const gs = useGlobalSearch()
      gs.toggle()
    }
  })
}
