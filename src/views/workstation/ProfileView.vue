<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAuthStore, type UserRole } from '@/stores/auth'
import { Save, Check } from 'lucide-vue-next'

const auth = useAuthStore()

const fullName = ref('')
const timezone = ref('')
const avatarUrl = ref('')
const role = ref<UserRole>('va')
const saved = ref(false)

const canEditRole = computed(() => auth.isAdmin)
const dirty = computed(
  () =>
    fullName.value !== (auth.profile?.full_name ?? '') ||
    timezone.value !== (auth.profile?.timezone ?? '') ||
    avatarUrl.value !== (auth.profile?.avatar_url ?? '') ||
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
  avatarUrl.value = auth.profile?.avatar_url ?? ''
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
    avatar_url?: string | null
    role?: UserRole
  } = {
    full_name: fullName.value.trim() || null,
    timezone: timezone.value || null,
    avatar_url: avatarUrl.value.trim() || null
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
    <header>
      <h1 class="font-display text-xl font-semibold">Profile</h1>
      <p class="text-xs text-base-content/60 mt-0.5">
        How you appear across the Workstation.
      </p>
    </header>

    <div class="card bg-base-100 border border-base-300 shadow-sm">
      <div class="card-body p-6 space-y-5">
        <div class="flex items-center gap-4">
          <div
            class="w-16 h-16 rounded-full bg-primary/20 text-primary flex items-center justify-center font-semibold text-xl shrink-0 overflow-hidden"
          >
            <img
              v-if="avatarUrl"
              :src="avatarUrl"
              :alt="fullName"
              class="w-full h-full object-cover"
              @error="avatarUrl = ''"
            />
            <span v-else>{{ auth.initials }}</span>
          </div>
          <div class="min-w-0">
            <div class="font-medium truncate">{{ auth.user?.email }}</div>
            <div class="text-xs text-base-content/60">Email is managed by your sign-in account.</div>
          </div>
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

          <label class="form-control sm:col-span-2">
            <span class="label-text text-sm font-medium mb-1">Avatar URL</span>
            <input
              v-model="avatarUrl"
              type="url"
              placeholder="https://…"
              class="input input-bordered w-full"
            />
            <span class="text-xs text-base-content/50 mt-1">
              Optional. Direct image URL — uploads come later.
            </span>
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
  </div>
</template>
