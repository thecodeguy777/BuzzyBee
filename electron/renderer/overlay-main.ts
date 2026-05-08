import { createApp } from 'vue'
import { createPinia } from 'pinia'
import OverlayApp from './OverlayApp.vue'
import './style.css'

const app = createApp(OverlayApp)
app.use(createPinia())
app.mount('#app')
