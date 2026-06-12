<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronLeft, Pencil, Eye, Share2, Globe2, Check, Copy } from 'lucide-vue-next'
import HexAvatar from '@/components/shared/HexAvatar.vue'
import VaProfileBody from '@/components/vaprofile/VaProfileBody.vue'
import { useAuthStore } from '@/stores/auth'
import { useTeamStore } from '@/stores/team'
import { useChannelsStore } from '@/stores/channels'
import { useVaProfileStore, suggestHandle, type VaProfile } from '@/stores/vaProfile'
import { uploadAvatar, removeAvatarFile } from '@/lib/avatarUpload'
import { displayName } from '@/lib/format'

const props = defineProps<{ userId?: string }>()

const auth = useAuthStore()
const team = useTeamStore()
const channels = useChannelsStore()
const store = useVaProfileStore()
const router = useRouter()

const targetId = computed(() => props.userId || auth.user?.id || '')
const isOwn = computed(() => targetId.value === auth.user?.id)
const editing = ref(false)
const loading = ref(true)

const profile = computed(() => store.byUser[targetId.value] ?? null)
const stats = computed(() => store.statsByUser[targetId.value] ?? null)
const person = computed(() => team.profiles[targetId.value] ?? (isOwn.value ? auth.profile : null))
const identity = computed(() => ({
  name: displayName(person.value ?? undefined, 'Member'),
  avatarUrl: person.value?.avatar_url ?? null,
  timezone: person.value?.timezone ?? null,
}))

watch(
  targetId,
  async (id) => {
    if (!id) return
    editing.value = false
    loading.value = true
    if (!team.profiles[id]) void team.fetchProfiles([id])
    await Promise.all([store.fetchFor(id), store.fetchStats(id)])
    loading.value = false
  },
  { immediate: true },
)

function patch(p: Partial<VaProfile>) {
  if (isOwn.value) void store.saveMine(p)
}

// First time entering edit mode: seed a handle so Share works out of the box.
watch(editing, (on) => {
  if (on && isOwn.value && profile.value && !profile.value.handle) {
    void store.saveMine({ handle: suggestHandle(identity.value.name, person.value?.email ?? null) })
  }
})

// ── Share ─────────────────────────────────────────────────────────────────────
const shareOpen = ref(false)
const copied = ref(false)
const publicUrl = computed(() =>
  profile.value?.handle ? `${window.location.origin}/va/${profile.value.handle}` : null,
)
async function copyLink() {
  if (!publicUrl.value) return
  await navigator.clipboard.writeText(publicUrl.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 1600)
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') shareOpen.value = false
}
document.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))

// ── Photo (reuses the avatar pipeline) ────────────────────────────────────────
const photoInput = ref<HTMLInputElement | null>(null)
async function onPhoto(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file || !auth.user) return
  const previous = auth.profile?.avatar_url
  try {
    const url = await uploadAvatar(auth.user.id, file)
    await auth.updateProfile({ avatar_url: url })
    void removeAvatarFile(previous)
  } catch (err) {
    console.warn('[va profile] photo:', (err as Error).message)
  }
}

async function message() {
  if (isOwn.value) return
  try {
    const id = await channels.openDm(targetId.value)
    if (id) {
      channels.select(id)
      await router.push({ path: '/app/comms' })
    }
  } catch (e) {
    console.warn('[va profile] dm:', (e as Error).message)
  }
}
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-4">
    <!-- chrome -->
    <div class="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        class="w-8 h-8 rounded-lg grid place-items-center text-base-content/60 hover:bg-base-200 hover:text-base-content"
        title="Back to Team"
        @click="router.push({ name: 'workstation-team' })"
      >
        <ChevronLeft class="w-5 h-5" :stroke-width="1.9" />
      </button>
      <div class="flex items-center gap-2.5 min-w-0">
        <HexAvatar :avatar-url="identity.avatarUrl" :name="identity.name" :size="26" tint="primary" />
        <span class="text-[0.9rem] font-bold whitespace-nowrap">{{ identity.name }}</span>
        <span
          v-if="profile?.handle"
          class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-base-200 text-base-content/60 text-xs font-semibold"
        >
          <Globe2 class="w-3 h-3" :stroke-width="1.75" /> /va/{{ profile.handle }}
        </span>
      </div>
      <div class="flex-1" />

      <span v-if="editing && store.saving" class="text-xs text-base-content/50 italic">Saving…</span>
      <span v-else-if="editing" class="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
        <span class="w-[7px] h-[7px] rounded-full bg-primary" /> Editing — changes auto-save
      </span>

      <div v-if="isOwn" class="flex gap-0.5 bg-base-200 p-[3px] rounded-lg">
        <button
          v-for="[on, label, icon] in ([[true, 'Edit', Pencil], [false, 'Public preview', Eye]] as const)"
          :key="label"
          type="button"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all"
          :class="editing === on ? 'bg-base-100 shadow-sm text-base-content' : 'text-base-content/55'"
          @click="editing = on"
        >
          <component :is="icon" class="w-3.5 h-3.5" :stroke-width="1.9" /> {{ label }}
        </button>
      </div>

      <div v-if="isOwn" class="relative">
        <button type="button" class="btn btn-primary btn-sm gap-1.5" @click="shareOpen = !shareOpen">
          <Share2 class="w-3.5 h-3.5" :stroke-width="2" /> Share
        </button>
        <div
          v-if="shareOpen"
          class="absolute right-0 top-full mt-2 z-30 w-80 rounded-xl bg-base-100 border border-base-300 shadow-xl p-4"
        >
          <div class="text-[0.84rem] font-bold mb-0.5">Share this profile</div>
          <p class="text-xs text-base-content/50 mb-3">Anyone with the link can view the public profile.</p>

          <label class="flex items-center justify-between gap-3 py-2 cursor-pointer">
            <span class="text-xs font-semibold">Public link enabled</span>
            <input
              type="checkbox"
              class="toggle toggle-primary toggle-sm"
              :checked="profile?.is_public"
              @change="patch({ is_public: ($event.target as HTMLInputElement).checked })"
            />
          </label>

          <label class="block mt-1 mb-3">
            <span class="text-[0.65rem] font-bold uppercase tracking-wider text-base-content/40">Handle</span>
            <div class="flex items-center gap-1 mt-1">
              <span class="text-xs text-base-content/40 shrink-0">/va/</span>
              <input
                type="text"
                class="input input-bordered input-sm flex-1 min-w-0 font-mono"
                :value="profile?.handle ?? ''"
                placeholder="your-handle"
                @blur="patch({ handle: ($event.target as HTMLInputElement).value.trim().toLowerCase() || null })"
              />
            </div>
          </label>

          <div class="flex gap-2">
            <div class="flex-1 flex items-center gap-1.5 px-2.5 h-9 rounded-lg border border-base-300 bg-base-200/40 min-w-0">
              <Globe2 class="w-3.5 h-3.5 text-base-content/40 shrink-0" :stroke-width="1.75" />
              <span class="text-xs font-semibold truncate">{{ publicUrl ?? 'Set a handle first' }}</span>
            </div>
            <button type="button" class="btn btn-primary btn-sm gap-1" :disabled="!publicUrl" @click="copyLink">
              <component :is="copied ? Check : Copy" class="w-3.5 h-3.5" :stroke-width="2" />
              {{ copied ? 'Copied' : 'Copy' }}
            </button>
          </div>
          <p v-if="store.error" class="text-xs text-error mt-2">{{ store.error }}</p>
          <p v-else-if="profile && !profile.is_public" class="text-[0.7rem] text-base-content/45 mt-2">
            The link 404s for outsiders until you flip it public.
          </p>
        </div>
      </div>
    </div>

    <div v-if="loading" class="py-16 text-center text-sm text-base-content/50">Loading profile…</div>
    <template v-else-if="profile">
      <VaProfileBody
        :profile="profile"
        :identity="identity"
        :stats="stats"
        :editing="isOwn && editing"
        @patch="patch"
        @message="message"
        @change-photo="photoInput?.click()"
      />
      <p class="text-center text-xs text-base-content/40 pb-6 pt-2">Verified profile · Powered by HiveMind</p>
    </template>
    <input ref="photoInput" type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="hidden" @change="onPhoto" />
  </div>
</template>
