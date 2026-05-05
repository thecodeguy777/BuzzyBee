import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import { vReveal } from './directives/reveal'
import { useAuthStore } from './stores/auth'
import { installDiagnostics, recordRoute } from './lib/diagnostics'
import './style.css'

installDiagnostics()

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.directive('reveal', vReveal)

// Restore session before the router mounts so guards see the right state.
const auth = useAuthStore(pinia)
auth.init().finally(() => {
  router.afterEach((to) => recordRoute(to.fullPath))
  app.use(router)
  app.mount('#app')
})
