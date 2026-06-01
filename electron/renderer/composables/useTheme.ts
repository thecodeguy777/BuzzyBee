import { ref, computed } from 'vue'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'hivemind-theme'

function readStored(): Theme {
  try {
    const t = localStorage.getItem(STORAGE_KEY)
    if (t === 'dark' || t === 'light') return t
  } catch { /* localStorage unavailable (shouldn't happen in Electron) */ }
  return 'light'
}

function apply(theme: Theme) {
  // DaisyUI reads data-theme; the @custom-variant in style.css makes
  // Tailwind `dark:` utilities follow the same attribute.
  document.documentElement.dataset.theme = theme
}

// Module-scoped singleton: every window and component shares one source of
// truth (same pattern as useLeads). localStorage is per-origin and all three
// renderer windows share it, so the choice persists app-wide.
const theme = ref<Theme>(readStored())
apply(theme.value)

export function useTheme() {
  const isDark = computed(() => theme.value === 'dark')

  function setTheme(next: Theme) {
    theme.value = next
    apply(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
  }

  function toggle() {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  return { theme, isDark, setTheme, toggle }
}
