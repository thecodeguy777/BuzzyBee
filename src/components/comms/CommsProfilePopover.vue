<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { MessageSquare, Mail, Clock, Zap } from 'lucide-vue-next'
import HexAvatar from '@/components/shared/HexAvatar.vue'
import { userColor } from '@/lib/userColor'
import { useTeamStore } from '@/stores/team'
import { useAuthStore } from '@/stores/auth'
import { useBuzz, type BuzzResult } from '@/composables/useBuzz'
import { AVAILABILITY, availabilityOf } from '@/lib/availability'

// Slack-style profile card. Presentational + driven by useProfileHover(): pass
// the active userId and computed style; emits `start-dm` for the Message action
// and hover/leave so the parent can keep it open while the cursor is inside.
const props = defineProps<{ userId: string | null; cardStyle: Record<string, string> }>()
const emit = defineEmits<{
  (e: 'start-dm', userId: string): void
  (e: 'hover'): void
  (e: 'leave'): void
}>()

const team = useTeamStore()
const auth = useAuthStore()
const p = computed(() => (props.userId ? team.profiles[props.userId] : null))
const name = computed(() => p.value?.full_name || 'Member')
const avatarUrl = computed(() => p.value?.avatar_url ?? null)
const nameColor = computed(() => (props.userId ? userColor(props.userId) : undefined))
const isSelf = computed(() => props.userId === auth.user?.id)
const role = computed(() => (p.value?.role ? p.value.role.replace(/_/g, ' ') : 'Member'))
const email = computed(() => p.value?.email ?? '')
// Person-set availability — only shown when it actually says something.
const avail = computed(() => {
  const a = availabilityOf(p.value?.availability)
  return a === 'active' ? null : AVAILABILITY[a]
})
const statusNote = computed(() => p.value?.status_note ?? '')
const localTime = computed(() => {
  const tz = p.value?.timezone
  if (!tz) return ''
  try {
    return new Date().toLocaleTimeString(undefined, { timeZone: tz, hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
})

// Buzz — ring their screen. One line of feedback under the actions.
const { buzz } = useBuzz()
const buzzNote = ref('')
const BUZZ_NOTES: Record<BuzzResult, string> = {
  sent: 'Buzzing their screen now',
  away: 'They are away — left a note in your DM',
  cooldown: 'You buzzed them just now — give it a minute',
  failed: 'Could not buzz right now'
}
async function doBuzz() {
  if (!props.userId) return
  buzzNote.value = BUZZ_NOTES[await buzz(props.userId)]
}
watch(() => props.userId, () => (buzzNote.value = ''))
</script>

<template>
  <Teleport to="body">
    <Transition name="profile-pop">
      <div
        v-if="userId"
        class="fixed z-[80] w-64 rounded-2xl border border-base-300 bg-base-100 shadow-2xl shadow-black/20 p-4"
        :style="cardStyle"
        @mouseenter="emit('hover')"
        @mouseleave="emit('leave')"
      >
        <div class="flex items-center gap-3">
          <HexAvatar :avatar-url="avatarUrl" :name="name" :color-key="userId" :size="52" />
          <div class="min-w-0">
            <div class="text-base font-bold truncate" :style="{ color: nameColor }">{{ name }}</div>
            <div class="text-[0.72rem] text-base-content/50 capitalize">{{ role }}</div>
          </div>
        </div>

        <div
          v-if="avail"
          class="mt-3 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-base-200/70 text-[0.72rem]"
        >
          <span class="w-2 h-2 rounded-full shrink-0" :style="{ background: avail.dot }" />
          <span class="font-semibold">{{ avail.label }}</span>
          <span v-if="statusNote" class="text-base-content/55 truncate">— {{ statusNote }}</span>
        </div>

        <div class="mt-3 space-y-1.5 text-[0.72rem] text-base-content/60">
          <div v-if="email" class="flex items-center gap-2 min-w-0">
            <Mail class="w-3.5 h-3.5 shrink-0 text-base-content/40" :stroke-width="1.75" />
            <span class="truncate">{{ email }}</span>
          </div>
          <div v-if="localTime" class="flex items-center gap-2">
            <Clock class="w-3.5 h-3.5 shrink-0 text-base-content/40" :stroke-width="1.75" />
            <span>{{ localTime }} local time</span>
          </div>
        </div>

        <div v-if="!isSelf" class="mt-3.5 flex gap-2">
          <button
            type="button"
            class="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-content hover:opacity-90"
            @click="emit('start-dm', userId!)"
          >
            <MessageSquare class="w-4 h-4" :stroke-width="2" /> Message
          </button>
          <button
            type="button"
            class="w-10 rounded-lg border border-base-300 grid place-items-center text-base-content/60 hover:text-warning hover:border-warning/50"
            title="Buzz — ring their screen"
            @click="doBuzz"
          >
            <Zap class="w-4 h-4" :stroke-width="2" />
          </button>
        </div>
        <div v-if="!isSelf && buzzNote" class="mt-2 text-center text-[0.7rem] text-base-content/50">{{ buzzNote }}</div>
        <div v-if="isSelf" class="mt-3.5 text-center text-[0.7rem] text-base-content/40">This is you</div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.profile-pop-enter-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.profile-pop-leave-active {
  transition: opacity 0.1s ease;
}
.profile-pop-enter-from {
  opacity: 0;
  transform: translateY(4px) scale(0.98);
}
.profile-pop-leave-to {
  opacity: 0;
}
</style>
