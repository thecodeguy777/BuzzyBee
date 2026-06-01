import { createApp } from 'vue'
import { createPinia } from 'pinia'
import DialerApp from './DialerApp.vue'
import { getSupabase } from './lib/supabase-client'
import './style.css'

// Warm up the renderer's Supabase client so composables can use it ASAP.
getSupabase().catch(err => console.error('[dialer-main] Supabase init failed:', err))

const app = createApp(DialerApp)
app.use(createPinia())
app.mount('#app')
