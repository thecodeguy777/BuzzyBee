import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import { vReveal } from './directives/reveal'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.directive('reveal', vReveal)
app.mount('#app')
