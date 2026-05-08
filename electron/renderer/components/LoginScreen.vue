<script setup lang="ts">
import { ref } from 'vue'
import { Layers, Mail, Lock } from 'lucide-vue-next'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()

const email = ref('')
const password = ref('')

async function submit() {
  if (!email.value || !password.value) return
  await auth.signIn(email.value, password.value)
}
</script>

<template>
  <div class="h-screen flex items-center justify-center bg-base-100 relative overflow-hidden">
    <!-- Ambient gradient -->
    <div class="absolute top-0 right-0 w-[60%] h-[60%] pointer-events-none opacity-10 blur-3xl"
      style="background: radial-gradient(ellipse at top right, #6366f1 0%, #a855f7 40%, transparent 70%);"
    ></div>
    <div class="absolute bottom-0 left-0 w-[40%] h-[50%] pointer-events-none opacity-10 blur-3xl"
      style="background: radial-gradient(ellipse at bottom left, #2563eb 0%, transparent 70%);"
    ></div>

    <div class="relative w-full max-w-sm px-8">
      <!-- Logo -->
      <div class="flex items-center gap-2.5 mb-8 justify-center">
        <div class="w-10 h-10 rounded-md bg-hivemind flex items-center justify-center">
          <Layers class="w-5 h-5 text-white" />
        </div>
        <span class="text-xl font-semibold tracking-tight">HiveMind AI</span>
      </div>

      <h1 class="text-lg font-semibold text-center mb-1">Sign in to continue</h1>
      <p class="text-xs text-base-content/50 text-center mb-7">Use your BuzzyBee/HiveMind account.</p>

      <form @submit.prevent="submit" class="space-y-3">
        <div>
          <label class="flex items-center gap-2 text-[10px] uppercase tracking-wider text-base-content/50 mb-1">
            <Mail class="w-3 h-3" />
            Email
          </label>
          <input
            v-model="email"
            type="email"
            required
            autofocus
            class="w-full border border-base-300 rounded-md px-3 py-2 text-sm bg-base-100 focus:border-primary focus:outline-none transition-colors"
            placeholder="you@company.com"
          />
        </div>

        <div>
          <label class="flex items-center gap-2 text-[10px] uppercase tracking-wider text-base-content/50 mb-1">
            <Lock class="w-3 h-3" />
            Password
          </label>
          <input
            v-model="password"
            type="password"
            required
            class="w-full border border-base-300 rounded-md px-3 py-2 text-sm bg-base-100 focus:border-primary focus:outline-none transition-colors"
            placeholder="••••••••"
          />
        </div>

        <div v-if="auth.error" class="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md p-2.5">
          {{ auth.error }}
        </div>

        <button
          type="submit"
          :disabled="auth.loading || !email || !password"
          class="w-full bg-hivemind text-white font-medium py-2.5 rounded-md hover:opacity-90 transition-opacity text-sm disabled:opacity-50"
        >
          {{ auth.loading ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>

      <p class="text-[10px] text-base-content/40 text-center mt-6">
        Your meeting transcripts and summaries sync to the HiveMind platform.
      </p>
    </div>
  </div>
</template>
