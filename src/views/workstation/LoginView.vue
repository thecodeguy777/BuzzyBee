<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore, type UserRole } from '@/stores/auth'
import beeSvg from '@/assets/bee-laptop.svg?raw'
import { prefixSvgIds } from '@/utils/svg'

const auth = useAuthStore()
const router = useRouter()

type Mode = 'signin' | 'signup'
const mode = ref<Mode>('signin')

const email = ref('')
const password = ref('')
const fullName = ref('')
const role = ref<UserRole>('va')
const info = ref('')

const beeMarkup = prefixSvgIds(beeSvg, 'login-bee')

function toggleMode() {
  mode.value = mode.value === 'signin' ? 'signup' : 'signin'
  info.value = ''
  auth.error = null
}

async function handleSubmit() {
  info.value = ''
  auth.error = null
  if (!email.value.trim() || !password.value) {
    auth.error = 'Email and password are required.'
    return
  }
  try {
    if (mode.value === 'signin') {
      await auth.signIn(email.value, password.value)
      await router.push({ name: 'workstation-home' })
    } else {
      const data = await auth.signUp(email.value, password.value, fullName.value, role.value)
      if (data?.session) {
        await router.push({ name: 'workstation-home' })
      } else {
        info.value = 'Check your inbox to confirm your email, then sign in.'
        mode.value = 'signin'
        password.value = ''
      }
    }
  } catch {
    // error already surfaced via auth.error
  }
}
</script>

<template>
  <div class="min-h-screen flex bg-base-200">
    <div
      class="hidden md:flex flex-col justify-between flex-1 bg-primary/10 px-12 py-10 relative overflow-hidden"
    >
      <div class="flex items-center gap-2 relative z-10">
        <span class="text-3xl" aria-hidden="true">🐝</span>
        <span class="font-display text-2xl font-semibold">BuzzyBee</span>
      </div>

      <div class="relative z-10 max-w-md">
        <p class="font-display text-4xl leading-tight">
          Where <em class="text-primary">focused</em> work
          <br />
          gets done.
        </p>
        <p class="mt-4 text-base-content/70">
          One workspace for your shift — clients, tasks, comms, and end-of-day
          reports, all in one place.
        </p>
      </div>

      <div
        class="absolute inset-0 flex items-end justify-end pointer-events-none opacity-80"
        v-html="beeMarkup"
      />
    </div>

    <div class="flex-1 flex items-center justify-center px-6 py-10">
      <form class="w-full max-w-sm space-y-5" @submit.prevent="handleSubmit">
        <div>
          <h1 class="font-display text-3xl font-semibold">
            {{ mode === 'signin' ? 'Welcome back' : 'Create your account' }}
          </h1>
          <p class="text-sm text-base-content/60 mt-1">
            {{
              mode === 'signin'
                ? 'Sign in to start your shift.'
                : 'Set up your BuzzyBee Workstation profile.'
            }}
          </p>
        </div>

        <label v-if="mode === 'signup'" class="form-control w-full">
          <span class="label-text text-sm font-medium mb-1">Full name</span>
          <input
            v-model="fullName"
            type="text"
            autocomplete="name"
            placeholder="Jaymark Cruz"
            class="input input-bordered w-full"
          />
        </label>

        <label class="form-control w-full">
          <span class="label-text text-sm font-medium mb-1">Work email</span>
          <input
            v-model="email"
            type="email"
            autocomplete="email"
            placeholder="you@buzzybee.ph"
            class="input input-bordered w-full"
            required
          />
        </label>

        <label class="form-control w-full">
          <span class="label-text text-sm font-medium mb-1">Password</span>
          <input
            v-model="password"
            type="password"
            :autocomplete="mode === 'signin' ? 'current-password' : 'new-password'"
            placeholder="••••••••"
            class="input input-bordered w-full"
            required
            minlength="6"
          />
        </label>

        <label v-if="mode === 'signup'" class="form-control w-full">
          <span class="label-text text-sm font-medium mb-1">Role</span>
          <select v-model="role" class="select select-bordered w-full">
            <option value="va">Virtual Assistant</option>
            <option value="pm">Project Manager</option>
            <option value="admin">Admin</option>
          </select>
        </label>

        <p v-if="auth.error" class="text-sm text-error">{{ auth.error }}</p>
        <p v-else-if="info" class="text-sm text-success">{{ info }}</p>

        <button
          type="submit"
          class="btn btn-primary w-full"
          :disabled="auth.loading"
        >
          {{
            auth.loading
              ? 'Working…'
              : mode === 'signin'
                ? 'Sign in'
                : 'Create account'
          }}
        </button>

        <p class="text-xs text-base-content/60 text-center">
          {{ mode === 'signin' ? 'New to BuzzyBee?' : 'Already have an account?' }}
          <button
            type="button"
            class="link link-primary"
            @click="toggleMode"
          >
            {{ mode === 'signin' ? 'Create one' : 'Sign in' }}
          </button>
        </p>
      </form>
    </div>
  </div>
</template>
