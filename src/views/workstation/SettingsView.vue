<script setup lang="ts">
import { ref, inject, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import {
  UserRound,
  IdCard,
  Volume2,
  Mic,
  Zap,
  Check,
  ChevronRight,
  Loader2
} from 'lucide-vue-next'
import { COMMS_STREAM } from '@/composables/commsStream'
import { useAuthStore } from '@/stores/auth'
import { AVAILABILITY, availabilityOf, type Availability } from '@/lib/availability'

// Settings — the findable home for "me, everywhere" preferences. The standing
// rule: scope decides the home. View-level controls (board zoom, column
// widths, view toggles) stay in their views; per-project config (statuses,
// client details) stays next to what it configures. Only person-level
// preferences live here.

const auth = useAuthStore()
const stream = inject(COMMS_STREAM, null)

// ── Availability ──────────────────────────────────────────────────────────────
const availability = ref<Availability>(availabilityOf(auth.profile?.availability))
const statusNote = ref(auth.profile?.status_note ?? '')
const savingStatus = ref(false)
const savedStatus = ref(false)
let savedTimer: ReturnType<typeof setTimeout> | undefined

const AVAILABILITY_ORDER: Availability[] = ['active', 'away', 'sleep', 'vacation']

async function saveAvailability(next?: Availability) {
  if (next) availability.value = next
  savingStatus.value = true
  try {
    await auth.updateProfile({
      availability: availability.value,
      status_note: statusNote.value.trim() || null
    })
    savedStatus.value = true
    clearTimeout(savedTimer)
    savedTimer = setTimeout(() => (savedStatus.value = false), 2500)
  } catch {
    /* auth.error carries the message */
  } finally {
    savingStatus.value = false
  }
}

// ── Audio: default microphone ─────────────────────────────────────────────────
// Same key the huddle reads on join (and MicCheck writes) — one source of truth.
const MIC_DEVICE_KEY = 'buzzybee.comms.mic-device'
const mics = ref<{ deviceId: string; label: string }[]>([])
const micId = ref(window.localStorage.getItem(MIC_DEVICE_KEY) ?? '')
const micsBlocked = ref(false)

onMounted(async () => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    mics.value = devices
      .filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default')
      .map((d) => ({ deviceId: d.deviceId, label: d.label || 'Microphone' }))
    // Without mic permission the labels come back empty — don't show a list of
    // unnamed "Microphone" entries, just point at the mic check instead.
    micsBlocked.value = mics.value.length > 0 && mics.value.every((m) => !m.label.trim() || m.label === 'Microphone')
  } catch {
    micsBlocked.value = true
  }
})

function saveMic() {
  if (micId.value) window.localStorage.setItem(MIC_DEVICE_KEY, micId.value)
  else window.localStorage.removeItem(MIC_DEVICE_KEY)
}
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-5">
    <header>
      <h1 class="font-display text-xl font-semibold">Settings</h1>
      <p class="text-sm text-base-content/55 mt-0.5">Your preferences, everywhere you sign in.</p>
    </header>

    <!-- ── Availability ── -->
    <section class="card bg-base-100 border border-base-300 shadow-sm">
      <div class="card-body p-6 space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="font-display text-base font-semibold">Availability</h2>
          <span v-if="savingStatus" class="text-xs text-base-content/40 inline-flex items-center gap-1.5">
            <Loader2 class="w-3.5 h-3.5 animate-spin" /> Saving
          </span>
          <span v-else-if="savedStatus" class="text-xs text-success inline-flex items-center gap-1">
            <Check class="w-3.5 h-3.5" :stroke-width="2.5" /> Saved
          </span>
        </div>
        <p class="text-xs text-base-content/50 -mt-2.5">
          The green presence dot says whether your app is open — this says whether to expect a reply.
          Everyone sees it on your profile and in Messages.
        </p>

        <div class="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <button
            v-for="key in AVAILABILITY_ORDER"
            :key="key"
            type="button"
            class="rounded-xl border px-3 py-3 text-left transition-colors"
            :class="availability === key ? 'border-primary ring-1 ring-primary/40 bg-primary/5' : 'border-base-300 hover:border-base-content/25'"
            @click="saveAvailability(key)"
          >
            <span class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: AVAILABILITY[key].dot }" />
              <span class="text-sm font-semibold">{{ AVAILABILITY[key].label }}</span>
            </span>
            <span class="block text-[0.68rem] text-base-content/50 mt-1">{{ AVAILABILITY[key].desc }}</span>
          </button>
        </div>

        <label class="form-control">
          <span class="label-text text-xs font-semibold text-base-content/60 mb-1.5">Status note (optional)</span>
          <div class="flex gap-2">
            <input
              v-model="statusNote"
              type="text"
              maxlength="80"
              placeholder="Back Monday / At the dentist until 3pm"
              class="input input-bordered input-sm flex-1"
              @keydown.enter="saveAvailability()"
            />
            <button type="button" class="btn btn-sm btn-primary" @click="saveAvailability()">Save</button>
          </div>
        </label>
      </div>
    </section>

    <!-- ── Notifications & sounds ── -->
    <section class="card bg-base-100 border border-base-300 shadow-sm">
      <div class="card-body p-6 space-y-4">
        <h2 class="font-display text-base font-semibold">Notifications &amp; sounds</h2>

        <label v-if="stream" class="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            class="toggle toggle-primary toggle-sm"
            :checked="!stream.soundMuted.value"
            @change="stream.toggleSounds()"
          />
          <span class="flex-1">
            <span class="block text-sm font-medium">Comms sound cues</span>
            <span class="block text-xs text-base-content/50">New messages, huddle joins and leaves, screen shares</span>
          </span>
          <Volume2 class="w-4 h-4 text-base-content/35" :stroke-width="1.75" />
        </label>

        <div class="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-base-300 bg-base-200/40">
          <Zap class="w-4 h-4 text-warning shrink-0" :stroke-width="2" />
          <p class="text-xs text-base-content/60">
            <span class="font-semibold text-base-content">Buzz always rings.</span>
            It exists to cut through everything else — there is no off switch, by design.
            Set your availability above so people know when not to expect you.
          </p>
        </div>
      </div>
    </section>

    <!-- ── Audio ── -->
    <section class="card bg-base-100 border border-base-300 shadow-sm">
      <div class="card-body p-6 space-y-4">
        <h2 class="font-display text-base font-semibold">Audio</h2>

        <label v-if="stream" class="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            class="toggle toggle-primary toggle-sm"
            :checked="stream.noiseSuppression.value"
            @change="stream.toggleNoise()"
          />
          <span class="flex-1">
            <span class="block text-sm font-medium">Noise suppression</span>
            <span class="block text-xs text-base-content/50">
              Filters keyboard, fans and street noise from your mic{{ stream.rnnoiseActive.value ? ' (RNNoise active)' : '' }}
            </span>
          </span>
          <Mic class="w-4 h-4 text-base-content/35" :stroke-width="1.75" />
        </label>

        <label class="form-control" v-if="!micsBlocked && mics.length">
          <span class="label-text text-xs font-semibold text-base-content/60 mb-1.5">Default microphone</span>
          <select v-model="micId" class="select select-bordered select-sm w-full max-w-md" @change="saveMic">
            <option value="">System default</option>
            <option v-for="m in mics" :key="m.deviceId" :value="m.deviceId">{{ m.label }}</option>
          </select>
          <span class="text-[0.68rem] text-base-content/45 mt-1">Applies from your next huddle.</span>
        </label>
        <p v-else class="text-xs text-base-content/50">
          Microphone names show up after you grant mic access — run the mic check in any huddle first.
        </p>
      </div>
    </section>

    <!-- ── Account links ── -->
    <section class="grid sm:grid-cols-2 gap-3">
      <RouterLink
        to="/app/profile"
        class="card bg-base-100 border border-base-300 shadow-sm hover:border-primary/40 transition-colors"
      >
        <div class="card-body p-5 flex-row items-center gap-3">
          <span class="w-10 h-10 rounded-xl grid place-items-center text-primary shrink-0" style="background: var(--accent-soft)">
            <UserRound class="w-5 h-5" :stroke-width="1.75" />
          </span>
          <span class="flex-1 min-w-0">
            <span class="block text-sm font-semibold">Account</span>
            <span class="block text-xs text-base-content/50">Name, avatar, timezone, password</span>
          </span>
          <ChevronRight class="w-4 h-4 text-base-content/30 shrink-0" :stroke-width="2" />
        </div>
      </RouterLink>
      <RouterLink
        :to="{ name: 'workstation-va-profile' }"
        class="card bg-base-100 border border-base-300 shadow-sm hover:border-primary/40 transition-colors"
      >
        <div class="card-body p-5 flex-row items-center gap-3">
          <span class="w-10 h-10 rounded-xl grid place-items-center text-primary shrink-0" style="background: var(--accent-soft)">
            <IdCard class="w-5 h-5" :stroke-width="1.75" />
          </span>
          <span class="flex-1 min-w-0">
            <span class="block text-sm font-semibold">VA Profile</span>
            <span class="block text-xs text-base-content/50">Your shareable resume — skills, tools, portfolio</span>
          </span>
          <ChevronRight class="w-4 h-4 text-base-content/30 shrink-0" :stroke-width="2" />
        </div>
      </RouterLink>
    </section>
  </div>
</template>
