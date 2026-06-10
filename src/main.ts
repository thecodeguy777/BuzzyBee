import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import { vReveal } from './directives/reveal'
import { useAuthStore } from './stores/auth'
import { installDiagnostics, recordRoute } from './lib/diagnostics'
// Side-effect import: applies the persisted light/dark theme before first paint.
import './composables/useTheme'
import './style.css'

installDiagnostics()

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.directive('reveal', vReveal)

// Restore session before the router mounts so guards see the right state.
const auth = useAuthStore(pinia)
auth.init().finally(async () => {
  router.afterEach((to) => recordRoute(to.fullPath))
  app.use(router)
  // Wait for the initial route to resolve so the first paint has the correct
  // layout meta — otherwise App.vue briefly renders the admin layout before
  // the route settles (admin nav flashes over the landing page).
  await router.isReady()
  app.mount('#app')
})
