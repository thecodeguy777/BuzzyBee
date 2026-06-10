<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore, type UserRole } from '@/stores/auth'
import hivemindMark from '@/assets/landing/hivemind-mark-dark.svg'

const auth = useAuthStore()
const router = useRouter()

type Mode = 'signin' | 'signup'
const mode = ref<Mode>('signin')

const email = ref('')
const password = ref('')
const fullName = ref('')
const role = ref<UserRole>('va')
const info = ref('')

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
      class="hidden md:flex flex-col justify-between flex-1 px-12 py-10 relative overflow-hidden bg-[#0b1120]"
    >
      <!-- Landscape backdrop -->
      <svg
        class="absolute inset-0 w-full h-full"
        viewBox="0 0 600 800"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="lg-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#0b1120" />
            <stop offset="30%" stop-color="#172554" />
            <stop offset="55%" stop-color="#3730a3" />
            <stop offset="78%" stop-color="#6d28d9" />
            <stop offset="100%" stop-color="#a855f7" />
          </linearGradient>
          <radialGradient id="lg-sun-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#f5d0fe" stop-opacity="0.75" />
            <stop offset="45%" stop-color="#c084fc" stop-opacity="0.25" />
            <stop offset="100%" stop-color="#c084fc" stop-opacity="0" />
          </radialGradient>
          <radialGradient id="lg-sun-disc" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stop-color="#faf5ff" />
            <stop offset="100%" stop-color="#ddd6fe" />
          </radialGradient>
          <linearGradient id="lg-haze" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#c4b5fd" stop-opacity="0.45" />
            <stop offset="100%" stop-color="#c4b5fd" stop-opacity="0" />
          </linearGradient>
        </defs>

        <!-- Sky -->
        <rect x="0" y="0" width="600" height="800" fill="url(#lg-sky)" />

        <!-- Stars -->
        <g fill="#ffffff">
          <circle cx="70" cy="80" r="1.4" opacity="0.7" />
          <circle cx="140" cy="50" r="1" opacity="0.5" />
          <circle cx="220" cy="110" r="1.6" opacity="0.8" />
          <circle cx="300" cy="60" r="1.1" opacity="0.6" />
          <circle cx="370" cy="130" r="1" opacity="0.5" />
          <circle cx="480" cy="70" r="1.5" opacity="0.75" />
          <circle cx="540" cy="150" r="1.2" opacity="0.6" />
          <circle cx="110" cy="180" r="1.2" opacity="0.55" />
          <circle cx="250" cy="200" r="1" opacity="0.5" />
          <circle cx="430" cy="200" r="1.3" opacity="0.65" />
          <circle cx="560" cy="240" r="1" opacity="0.5" />
          <circle cx="40" cy="250" r="1.1" opacity="0.55" />
        </g>

        <!-- Sun glow + disc -->
        <circle cx="420" cy="300" r="150" fill="url(#lg-sun-glow)" />
        <circle cx="420" cy="300" r="46" fill="url(#lg-sun-disc)" />

        <!-- Horizon haze -->
        <rect x="0" y="430" width="600" height="120" fill="url(#lg-haze)" />

        <!-- Mountain layers (far → near) -->
        <path
          d="M0,490 C120,440 200,470 300,450 C400,430 500,475 600,455 L600,800 L0,800 Z"
          fill="#7c3aed"
          opacity="0.4"
        />
        <path
          d="M0,540 C100,500 220,545 320,515 C430,485 520,540 600,520 L600,800 L0,800 Z"
          fill="#5b21b6"
          opacity="0.6"
        />
        <path
          d="M0,600 C130,560 240,610 360,575 C460,545 540,605 600,585 L600,800 L0,800 Z"
          fill="#3730a3"
          opacity="0.85"
        />
        <path
          d="M0,680 C90,640 200,700 320,665 C450,630 540,690 600,675 L600,800 L0,800 Z"
          fill="#0f172a"
        />
      </svg>

      <!-- Legibility overlay -->
      <div
        class="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/30 pointer-events-none"
      />

      <div class="flex items-center gap-2.5 relative z-10">
        <img :src="hivemindMark" alt="HiveMind" class="w-8 h-auto" />
        <span class="font-display text-2xl font-semibold text-white">HiveMind</span>
      </div>

      <div class="relative z-10 max-w-md">
        <p class="font-display text-4xl leading-tight text-white">
          Where <em class="text-violet-300 not-italic font-semibold">focused</em> work
          <br />
          gets done.
        </p>
        <p class="mt-4 text-white/70">
          One workspace for your shift — clients, tasks, comms, and end-of-day
          reports, all in one place.
        </p>
      </div>
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
                : 'Set up your HiveMind profile.'
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
            placeholder="you@hivemind.ph"
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
          {{ mode === 'signin' ? 'New to HiveMind?' : 'Already have an account?' }}
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
