import { createApp } from 'vue'
import LandingPage from '../src/views/shared/LandingPage.vue'
import { vReveal } from '../src/directives/reveal'
import '../src/style.css'

const app = createApp(LandingPage)
app.directive('reveal', vReveal)
app.mount('#app')
