<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Eye, EyeOff, Loader2, ArrowRight } from 'lucide-vue-next'
import { useAuthStore, type UserRole } from '@/stores/auth'
import hivemindMark from '@/assets/landing/hivemind-mark-dark.svg'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

type Mode = 'signin' | 'signup'
const mode = ref<Mode>('signin')

const email = ref('')
const password = ref('')
const fullName = ref('')
const role = ref<UserRole>('va')
const info = ref('')
const showPw = ref(false)
const capsOn = ref(false)

// PH shift-aware greeting — most sign-ins here are "good evening".
const hour = new Date().getHours()
const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

// Deep links bounced through the auth guard carry where the user was headed.
const redirectTo = computed(() =>
  typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/')
    ? route.query.redirect
    : null
)

function toggleMode() {
  mode.value = mode.value === 'signin' ? 'signup' : 'signin'
  info.value = ''
  auth.error = null
}

function onPwKey(e: KeyboardEvent) {
  capsOn.value = e.getModifierState?.('CapsLock') ?? false
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
      await router.push(redirectTo.value ?? { name: 'workstation-home' })
    } else {
      const data = await auth.signUp(email.value, password.value, fullName.value, role.value)
      if (data?.session) {
        await router.push(redirectTo.value ?? { name: 'workstation-home' })
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

// ── Parallax — the landscape leans away from the cursor, just a little. ──────
const px = ref(0)
const py = ref(0)
function onPanelMove(e: MouseEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  px.value = (e.clientX - r.left) / r.width - 0.5
  py.value = (e.clientY - r.top) / r.height - 0.5
}
function onPanelLeave() {
  px.value = 0
  py.value = 0
}
const layer = (depth: number) => ({
  transform: `translate(${(-px.value * depth).toFixed(1)}px, ${(-py.value * depth * 0.6).toFixed(1)}px)`,
  transition: 'transform 0.35s ease-out'
})
</script>

<template>
  <div class="min-h-screen flex bg-base-200">
    <div
      class="hidden md:flex flex-col justify-between flex-1 px-12 py-10 relative overflow-hidden bg-[#0b1120]"
      @mousemove="onPanelMove"
      @mouseleave="onPanelLeave"
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

        <!-- Stars — each twinkles on its own clock -->
        <g fill="#ffffff" class="lg-stars">
          <circle cx="70" cy="80" r="1.4" />
          <circle cx="140" cy="50" r="1" />
          <circle cx="220" cy="110" r="1.6" />
          <circle cx="300" cy="60" r="1.1" />
          <circle cx="370" cy="130" r="1" />
          <circle cx="480" cy="70" r="1.5" />
          <circle cx="540" cy="150" r="1.2" />
          <circle cx="110" cy="180" r="1.2" />
          <circle cx="250" cy="200" r="1" />
          <circle cx="430" cy="200" r="1.3" />
          <circle cx="560" cy="240" r="1" />
          <circle cx="40" cy="250" r="1.1" />
        </g>

        <!-- Drifting hexagons — the hive, faint, rising like embers.
             Position lives on the wrapper <g> (SVG attribute) so the CSS
             animation on the path can own `transform` without a fight. -->
        <g stroke="#e9d5ff" fill="none" stroke-width="1">
          <g transform="translate(120 620)"><path class="lg-hex lg-hex-1" d="M0 -14 L12 -7 L12 7 L0 14 L-12 7 L-12 -7 Z" /></g>
          <g transform="translate(480 660)"><path class="lg-hex lg-hex-2" d="M0 -10 L8.6 -5 L8.6 5 L0 10 L-8.6 5 L-8.6 -5 Z" /></g>
          <g transform="translate(310 740)"><path class="lg-hex lg-hex-3" d="M0 -18 L15.5 -9 L15.5 9 L0 18 L-15.5 9 L-15.5 -9 Z" /></g>
          <g transform="translate(60 690)"><path class="lg-hex lg-hex-4" d="M0 -8 L7 -4 L7 4 L0 8 L-7 4 L-7 -4 Z" /></g>
        </g>

        <!-- Sun glow + disc -->
        <g :style="layer(8)">
          <circle cx="420" cy="300" r="150" fill="url(#lg-sun-glow)" class="lg-sun-glow" />
          <circle cx="420" cy="300" r="46" fill="url(#lg-sun-disc)" />
        </g>

        <!-- Horizon haze -->
        <rect x="0" y="430" width="600" height="120" fill="url(#lg-haze)" />

        <!-- Mountain layers (far → near), leaning away from the cursor -->
        <g :style="layer(5)">
          <path
            d="M0,490 C120,440 200,470 300,450 C400,430 500,475 600,455 L600,800 L0,800 Z"
            fill="#7c3aed"
            opacity="0.4"
          />
        </g>
        <g :style="layer(9)">
          <path
            d="M0,540 C100,500 220,545 320,515 C430,485 520,540 600,520 L600,800 L0,800 Z"
            fill="#5b21b6"
            opacity="0.6"
          />
        </g>
        <g :style="layer(14)">
          <path
            d="M0,600 C130,560 240,610 360,575 C460,545 540,605 600,585 L600,800 L0,800 Z"
            fill="#3730a3"
            opacity="0.85"
          />
        </g>
        <g :style="layer(20)">
          <path
            d="M0,680 C90,640 200,700 320,665 C450,630 540,690 600,675 L600,800 L0,800 Z"
            fill="#0f172a"
          />
        </g>
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
      <form class="w-full max-w-sm space-y-5 login-enter" @submit.prevent="handleSubmit">
        <div>
          <h1 class="font-display text-3xl font-semibold">
            {{ mode === 'signin' ? greeting : 'Create your account' }}
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
            autofocus
            required
          />
        </label>

        <label class="form-control w-full">
          <span class="label-text text-sm font-medium mb-1">Password</span>
          <div class="relative">
            <input
              v-model="password"
              :type="showPw ? 'text' : 'password'"
              :autocomplete="mode === 'signin' ? 'current-password' : 'new-password'"
              placeholder="Your password"
              class="input input-bordered w-full pr-11"
              required
              minlength="6"
              @keyup="onPwKey"
              @blur="capsOn = false"
            />
            <button
              type="button"
              tabindex="-1"
              class="absolute right-0 top-0 h-full w-11 grid place-items-center text-base-content/40 hover:text-base-content"
              :title="showPw ? 'Hide password' : 'Show password'"
              @click="showPw = !showPw"
            >
              <EyeOff v-if="showPw" class="w-[18px] h-[18px]" :stroke-width="1.75" />
              <Eye v-else class="w-[18px] h-[18px]" :stroke-width="1.75" />
            </button>
          </div>
          <span v-if="capsOn" class="text-[0.72rem] text-warning mt-1">Caps Lock is on</span>
        </label>

        <label v-if="mode === 'signup'" class="form-control w-full">
          <span class="label-text text-sm font-medium mb-1">Role</span>
          <select v-model="role" class="select select-bordered w-full">
            <option value="va">Virtual Assistant</option>
            <option value="pm">Project Manager</option>
            <option value="admin">Admin</option>
          </select>
        </label>

        <p v-if="auth.error" :key="auth.error" class="text-sm text-error login-shake">{{ auth.error }}</p>
        <p v-else-if="info" class="text-sm text-success">{{ info }}</p>

        <button
          type="submit"
          class="btn btn-primary w-full group"
          :disabled="auth.loading"
        >
          <Loader2 v-if="auth.loading" class="w-4 h-4 animate-spin" />
          <template v-else>
            {{ mode === 'signin' ? 'Sign in' : 'Create account' }}
            <ArrowRight class="w-4 h-4 transition-transform group-hover:translate-x-0.5" :stroke-width="2" />
          </template>
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

<style scoped>
/* Stars twinkle on staggered clocks */
.lg-stars circle {
  animation: lg-twinkle 3.4s ease-in-out infinite;
}
.lg-stars circle:nth-of-type(3n) { animation-duration: 4.6s; animation-delay: 0.8s; }
.lg-stars circle:nth-of-type(3n + 1) { animation-duration: 3.8s; animation-delay: 1.7s; }
.lg-stars circle:nth-of-type(4n) { animation-duration: 5.2s; animation-delay: 2.4s; }
@keyframes lg-twinkle {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 0.85; }
}

/* The sun breathes, slowly */
.lg-sun-glow {
  animation: lg-breathe 7s ease-in-out infinite;
  transform-origin: 420px 300px;
}
@keyframes lg-breathe {
  0%, 100% { transform: scale(1); opacity: 0.9; }
  50% { transform: scale(1.06); opacity: 1; }
}

/* Hexagons drift up like embers, fading in and out */
.lg-hex { opacity: 0; }
.lg-hex-1 { animation: lg-drift 16s linear infinite; }
.lg-hex-2 { animation: lg-drift 13s linear 3s infinite; }
.lg-hex-3 { animation: lg-drift 19s linear 6s infinite; }
.lg-hex-4 { animation: lg-drift 14s linear 9s infinite; }
@keyframes lg-drift {
  0% { opacity: 0; transform: translateY(0) rotate(0deg); }
  8% { opacity: 0.35; }
  80% { opacity: 0.12; }
  100% { opacity: 0; transform: translateY(-520px) rotate(120deg); }
}

/* Form entrance + error shake */
.login-enter {
  animation: lg-rise 0.45s ease-out both;
}
@keyframes lg-rise {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.login-shake {
  animation: lg-shake 0.4s ease-in-out;
}
@keyframes lg-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  50% { transform: translateX(4px); }
  75% { transform: translateX(-2px); }
}

@media (prefers-reduced-motion: reduce) {
  .lg-stars circle,
  .lg-sun-glow,
  .lg-hex,
  .login-enter,
  .login-shake {
    animation: none;
  }
  .lg-hex { opacity: 0.18; }
}
</style>
