import { ref } from 'vue'

// Light/dark theme, driven via the `data-theme` attribute daisyUI reads. The
// design tokens (--accent, --st-*, etc.) have [data-theme="dark"] overrides in
// style.css, so flipping this recolors the whole app. Persisted across reloads.
export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'hivemind.theme'

function read(): Theme {
  if (typeof window === 'undefined') return 'light'
  return window.localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
}

function apply(t: Theme) {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = t
}

// Module-scoped so every caller shares one reactive theme. Applied on import so
// the persisted choice is in effect before first paint (import this in main.ts).
const theme = ref<Theme>(read())
apply(theme.value)

export function useTheme() {
  function setTheme(t: Theme) {
    theme.value = t
    apply(t)
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, t)
  }
  function toggle() {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }
  return { theme, setTheme, toggle }
}
