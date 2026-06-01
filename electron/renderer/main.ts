import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { getSupabase } from './lib/supabase-client'
import './style.css'

// Warm up the renderer's Supabase client (separate from main process's auth
// client) so composables can use it ASAP after sign-in.
getSupabase().catch(err => console.error('[main] Supabase init failed:', err))

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
