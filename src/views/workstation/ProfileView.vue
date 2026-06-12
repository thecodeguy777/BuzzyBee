<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAuthStore, type UserRole } from '@/stores/auth'
import { Save, Check, KeyRound, Camera, Trash2, IdCard } from 'lucide-vue-next'
import { supabase } from '@/lib/supabase'
import { uploadAvatar, removeAvatarFile } from '@/lib/avatarUpload'
import HexAvatar from '@/components/shared/HexAvatar.vue'

const auth = useAuthStore()

// ── Profile picture upload ────────────────────────────────────────────────────
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const avatarError = ref<string | null>(null)

async function onPickAvatar(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file || !auth.user || uploading.value) return
  avatarError.value = null
  uploading.value = true
  const previous = auth.profile?.avatar_url
  try {
    const url = await uploadAvatar(auth.user.id, file)
    await auth.updateProfile({ avatar_url: url })
    void removeAvatarFile(previous)
  } catch (err) {
    avatarError.value = (err as Error).message
  } finally {
    uploading.value = false
  }
}

async function removeAvatar() {
  if (!auth.profile?.avatar_url || uploading.value) return
  avatarError.value = null
  uploading.value = true
  const previous = auth.profile.avatar_url
  try {
    await auth.updateProfile({ avatar_url: null })
    void removeAvatarFile(previous)
  } catch (err) {
    avatarError.value = (err as Error).message
  } finally {
    uploading.value = false
  }
}

// ── Password (invited users land here from the email link with a session but
// no password yet — this is where they set one) ──────────────────────────────
const newPassword = ref('')
const confirmPassword = ref('')
const pwState = ref<'idle' | 'saving' | 'saved'>('idle')
const pwError = ref<string | null>(null)

async function savePassword() {
  pwError.value = null
  if (newPassword.value.length < 8) {
    pwError.value = 'Use at least 8 characters.'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    pwError.value = "Passwords don't match."
    return
  }
  pwState.value = 'saving'
  const { error } = await supabase.auth.updateUser({ password: newPassword.value })
  if (error) {
    pwError.value = error.message
    pwState.value = 'idle'
    return
  }
  newPassword.value = ''
  confirmPassword.value = ''
  pwState.value = 'saved'
  setTimeout(() => (pwState.value = 'idle'), 2500)
}

const fullName = ref('')
const timezone = ref('')
const role = ref<UserRole>('va')
const saved = ref(false)

const canEditRole = computed(() => auth.isAdmin)
const dirty = computed(
  () =>
    fullName.value !== (auth.profile?.full_name ?? '') ||
    timezone.value !== (auth.profile?.timezone ?? '') ||
    role.value !== (auth.profile?.role ?? 'va')
)

const timezones = [
  'Asia/Manila',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'UTC'
]

function syncFromProfile() {
  fullName.value = auth.profile?.full_name ?? ''
  timezone.value = auth.profile?.timezone ?? 'Asia/Manila'
  role.value = auth.profile?.role ?? 'va'
}

watch(
  () => auth.profile,
  () => syncFromProfile(),
  { immediate: true }
)

async function handleSave() {
  saved.value = false
  const patch: {
    full_name?: string | null
    timezone?: string | null
    role?: UserRole
  } = {
    full_name: fullName.value.trim() || null,
    timezone: timezone.value || null
  }
  if (canEditRole.value) patch.role = role.value
  try {
    await auth.updateProfile(patch)
    saved.value = true
    setTimeout(() => (saved.value = false), 2000)
  } catch {
    // surfaced via auth.error
  }
}
</script>

<template>
  <div class="max-w-2xl space-y-6">
    <header class="flex items-end gap-4">
      <div>
        <h1 class="font-display text-xl font-semibold">Profile</h1>
        <p class="text-xs text-base-content/60 mt-0.5">
          How you appear across the Workstation.
        </p>
      </div>
      <div class="flex-1" />
      <RouterLink
        :to="{ name: 'workstation-va-profile' }"
        class="btn btn-outline btn-sm gap-1.5"
        title="Your shareable résumé — skills, portfolio, live stats"
      >
        <IdCard class="w-4 h-4" :stroke-width="1.75" />
        My VA Profile
      </RouterLink>
    </header>

    <div class="card bg-base-100 border border-base-300 shadow-sm">
      <div class="card-body p-6 space-y-5">
        <div class="flex items-center gap-4">
          <button
            type="button"
            class="group/av relative shrink-0 rounded-full"
            :disabled="uploading"
            title="Change photo"
            @click="fileInput?.click()"
          >
            <HexAvatar
              :avatar-url="auth.profile?.avatar_url"
              :name="fullName"
              :label="auth.profile?.avatar_url ? undefined : auth.initials"
              :size="64"
              tint="primary"
              :class="uploading && 'opacity-40'"
            />
            <span
              class="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white transition-opacity"
              :class="uploading ? 'opacity-100' : 'opacity-0 group-hover/av:opacity-100'"
            >
              <span v-if="uploading" class="loading loading-spinner loading-sm" />
              <Camera v-else class="w-5 h-5" :stroke-width="1.9" />
            </span>
          </button>
          <div class="min-w-0 flex-1">
            <div class="font-medium truncate">{{ auth.user?.email }}</div>
            <div class="text-xs text-base-content/60">Email is managed by your sign-in account.</div>
            <div class="flex items-center gap-2 mt-2">
              <button
                type="button"
                class="btn btn-outline btn-xs gap-1.5"
                :disabled="uploading"
                @click="fileInput?.click()"
              >
                <Camera class="w-3 h-3" :stroke-width="2" />
                {{ uploading ? 'Uploading…' : 'Upload photo' }}
              </button>
              <button
                v-if="auth.profile?.avatar_url"
                type="button"
                class="btn btn-ghost btn-xs gap-1 text-base-content/60 hover:text-error"
                :disabled="uploading"
                @click="removeAvatar"
              >
                <Trash2 class="w-3 h-3" :stroke-width="2" />
                Remove
              </button>
              <span class="text-[0.65rem] text-base-content/40">JPG, PNG, WebP or GIF · up to 5 MB</span>
            </div>
            <p v-if="avatarError" class="text-xs text-error mt-1.5">{{ avatarError }}</p>
          </div>
          <input
            ref="fileInput"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            class="hidden"
            @change="onPickAvatar"
          />
        </div>

        <form class="grid gap-4 sm:grid-cols-2" @submit.prevent="handleSave">
          <label class="form-control sm:col-span-2">
            <span class="label-text text-sm font-medium mb-1">Full name</span>
            <input
              v-model="fullName"
              type="text"
              autocomplete="name"
              placeholder="Jayson Remigio"
              class="input input-bordered w-full"
            />
          </label>

          <label class="form-control">
            <span class="label-text text-sm font-medium mb-1">Role</span>
            <select
              v-model="role"
              class="select select-bordered w-full"
              :disabled="!canEditRole"
            >
              <option value="va">Virtual Assistant</option>
              <option value="pm">Project Manager</option>
              <option value="admin">Admin</option>
              <option v-if="auth.isSuperadmin" value="superadmin">Superadmin</option>
            </select>
            <span v-if="!canEditRole" class="text-xs text-base-content/50 mt-1">
              Only admins can change roles.
            </span>
          </label>

          <label class="form-control">
            <span class="label-text text-sm font-medium mb-1">Timezone</span>
            <select v-model="timezone" class="select select-bordered w-full">
              <option v-for="tz in timezones" :key="tz" :value="tz">{{ tz }}</option>
            </select>
          </label>

          <div class="sm:col-span-2 flex items-center gap-3 pt-2">
            <button
              type="submit"
              class="btn btn-primary gap-2"
              :disabled="!dirty || auth.loading"
            >
              <Save class="w-4 h-4" :stroke-width="2" />
              {{ auth.loading ? 'Saving…' : 'Save changes' }}
            </button>
            <span v-if="saved" class="text-sm text-success flex items-center gap-1">
              <Check class="w-4 h-4" :stroke-width="2.5" />
              Saved
            </span>
            <span v-else-if="auth.error" class="text-sm text-error">{{ auth.error }}</span>
          </div>
        </form>
      </div>
    </div>

    <!-- Password -->
    <div class="card bg-base-100 border border-base-300 shadow-sm">
      <div class="card-body p-6 space-y-4">
        <div class="flex items-center gap-2">
          <KeyRound class="w-4 h-4 text-base-content/60" :stroke-width="1.75" />
          <h2 class="font-display text-base font-semibold">Password</h2>
        </div>
        <p class="text-xs text-base-content/60 -mt-2">
          Just accepted an invite? Set a password here so you can sign in next time.
        </p>
        <form class="grid gap-4 sm:grid-cols-2" @submit.prevent="savePassword">
          <label class="form-control">
            <span class="label-text text-sm font-medium mb-1">New password</span>
            <input
              v-model="newPassword"
              type="password"
              autocomplete="new-password"
              minlength="8"
              class="input input-bordered w-full"
            />
          </label>
          <label class="form-control">
            <span class="label-text text-sm font-medium mb-1">Confirm</span>
            <input
              v-model="confirmPassword"
              type="password"
              autocomplete="new-password"
              class="input input-bordered w-full"
            />
          </label>
          <div class="sm:col-span-2 flex items-center gap-3">
            <button
              type="submit"
              class="btn btn-primary btn-sm gap-2"
              :disabled="!newPassword || pwState === 'saving'"
            >
              <KeyRound class="w-3.5 h-3.5" :stroke-width="2" />
              {{ pwState === 'saving' ? 'Saving…' : 'Set password' }}
            </button>
            <span v-if="pwState === 'saved'" class="text-sm text-success flex items-center gap-1">
              <Check class="w-4 h-4" :stroke-width="2.5" />
              Password set
            </span>
            <span v-else-if="pwError" class="text-sm text-error">{{ pwError }}</span>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
