<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Hexagon } from 'lucide-vue-next'
import { supabase } from '@/lib/supabase'
import VaProfileBody from '@/components/vaprofile/VaProfileBody.vue'
import type { VaProfile, VaStats } from '@/stores/vaProfile'

const props = defineProps<{ handle: string }>()

const loading = ref(true)
const notFound = ref(false)
const profile = ref<VaProfile | null>(null)
const stats = ref<VaStats | null>(null)
const identity = ref({ name: '', avatarUrl: null as string | null, timezone: null as string | null })

onMounted(async () => {
  const { data, error } = await supabase.rpc('public_va_profile', { p_handle: props.handle })
  loading.value = false
  if (error || !data) {
    notFound.value = true
    if (error) console.warn('[public va]', error.message)
    return
  }
  const d = data as { profile: VaProfile; name: string | null; avatar_url: string | null; timezone: string | null; stats: VaStats }
  profile.value = d.profile
  stats.value = d.stats
  identity.value = { name: d.name ?? 'HiveMind VA', avatarUrl: d.avatar_url, timezone: d.timezone }
  document.title = `${identity.value.name} — HiveMind`
})

function contact() {
  if (profile.value?.contact_email) {
    window.location.href = `mailto:${profile.value.contact_email}?subject=Working with ${identity.value.name}`
  }
}
</script>

<template>
  <div class="min-h-screen bg-base-200 text-base-content">
    <!-- minimal public header -->
    <header class="h-14 px-5 flex items-center gap-2.5 bg-base-100 border-b border-base-300">
      <Hexagon class="w-5 h-5 text-primary" :stroke-width="2" />
      <span class="font-display font-bold text-[0.95rem]">HiveMind</span>
      <span class="text-xs text-base-content/40">· Verified team profile</span>
    </header>

    <main class="max-w-5xl mx-auto px-4 py-6">
      <div v-if="loading" class="py-24 text-center text-sm text-base-content/50">Loading profile…</div>

      <div v-else-if="notFound" class="py-24 text-center">
        <Hexagon class="w-10 h-10 mx-auto text-base-content/20" :stroke-width="1.5" />
        <h1 class="mt-4 text-lg font-bold">Profile not found</h1>
        <p class="mt-1 text-sm text-base-content/50">This profile doesn't exist or isn't public.</p>
      </div>

      <template v-else-if="profile">
        <VaProfileBody
          :profile="profile"
          :identity="identity"
          :stats="stats"
          :editing="false"
          @message="contact"
        />
        <p class="text-center text-xs text-base-content/40 py-8">
          Verified profile · Powered by <a href="/" class="font-semibold text-primary hover:underline">HiveMind</a>
        </p>
      </template>
    </main>
  </div>
</template>
