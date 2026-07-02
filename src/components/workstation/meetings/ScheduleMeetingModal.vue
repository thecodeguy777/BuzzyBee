<script setup lang="ts">
import { computed, ref } from 'vue'
import { Video, CalendarClock, Mail, Copy, Check } from 'lucide-vue-next'
import MeetingModal from '@/components/workstation/meetings/MeetingModal.vue'
import EmailChipsInput from '@/components/workstation/meetings/EmailChipsInput.vue'
import { useMeetingsStore, type Meeting } from '@/stores/meetings'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'
import { copyBrandedInvite, gcalUrl, gmailComposeUrl, joinLinkOf, whenTextOf } from '@/lib/meetingDisplay'

// Schedule form → created panel (link + invite outcome). Mounted only while
// open, so all of this state is born fresh per use and dies on close.
// Prefills serve "Rebook" on past meetings.

const props = defineProps<{ prefillTitle?: string; prefillDuration?: number; prefillClientId?: string | null }>()
const emit = defineEmits<{ close: [] }>()
const store = useMeetingsStore()
const auth = useAuthStore()
const clients = useClientsStore()

const DURATIONS = [15, 30, 45, 60, 90, 120]

const title = ref(props.prefillTitle ?? '')
const date = ref('')
const time = ref('')
const duration = ref(props.prefillDuration && DURATIONS.includes(props.prefillDuration) ? props.prefillDuration : 60)
const note = ref('')
// "For client" — defaults to the workspace's current client. When that
// client has a timezone, invite emails speak THEIR clock, not the host's.
const clientId = ref<string | null>(props.prefillClientId ?? clients.currentClientId)
const clientOptions = computed(() => clients.clients.filter((c) => c.status !== 'archived'))
const clientTz = computed(() =>
  clientId.value ? (clients.clients.find((c) => c.id === clientId.value)?.timezone ?? null) : null
)
const clientName = computed(() =>
  clientId.value ? (clients.clients.find((c) => c.id === clientId.value)?.name ?? '') : ''
)
// Live "that's 9:00 AM EDT for Acme" preview while picking the slot.
const clientTimePreview = computed(() => {
  if (!clientTz.value || !date.value || !time.value) return null
  const d = new Date(`${date.value}T${time.value}`)
  if (isNaN(d.getTime())) return null
  return whenTextOf(d.toISOString(), clientTz.value)
})
const emails = ref<string[]>([])
const chips = ref<InstanceType<typeof EmailChipsInput> | null>(null)

const submitting = ref(false)
const submitError = ref<string | null>(null)
const created = ref<Meeting | null>(null)
const inviteSummary = ref<string | null>(null)
const copied = ref(false)
const gmailHint = ref<string | null>(null)

// Default to the next full hour.
{
  const d = new Date(Date.now() + 60 * 60_000)
  d.setMinutes(0, 0, 0)
  date.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  time.value = `${String(d.getHours()).padStart(2, '0')}:00`
}

const valid = computed(() => {
  if (!date.value || !time.value) return false
  return new Date(`${date.value}T${time.value}`).getTime() > Date.now()
})

async function submit() {
  chips.value?.commit()
  if (!valid.value || submitting.value) return
  submitting.value = true
  submitError.value = null
  try {
    const m = await store.schedule({
      title: title.value.trim() || 'BuzzyHive meeting',
      scheduledAt: new Date(`${date.value}T${time.value}`),
      durationMinutes: duration.value,
      clientId: clientId.value
    })
    created.value = m
    if (emails.value.length) {
      try {
        const res = await store.sendInvites(
          m.id,
          emails.value.map((email) => ({ email })),
          whenTextOf(m.scheduledAt, clientTz.value),
          note.value
        )
        inviteSummary.value = `Invites sent to ${res.sent} ${res.sent === 1 ? 'person' : 'people'}${res.failed ? ` · ${res.failed} failed` : ''}`
      } catch (e) {
        inviteSummary.value = 'Meeting created, but invites failed: ' + (e as Error).message
      }
    }
  } catch (e) {
    submitError.value = (e as Error).message
  } finally {
    submitting.value = false
  }
}

async function copyLink() {
  if (!created.value) return
  await navigator.clipboard.writeText(joinLinkOf(created.value))
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}

async function sendViaGmail() {
  if (!created.value) return
  chips.value?.commit()
  // Copy the branded card BEFORE opening the tab — clipboard writes need the
  // document focused, and window.open steals focus.
  const ok = await copyBrandedInvite(created.value, note.value, auth.fullName || 'Your host', clientTz.value)
  window.open(gmailComposeUrl(created.value, emails.value, note.value, !ok, clientTz.value), '_blank', 'noopener')
  gmailHint.value = ok
    ? 'Branded invite copied — click into the Gmail message body and press Ctrl+V.'
    : null
}
</script>

<template>
  <MeetingModal
    :icon="Video"
    :title="created ? 'Meeting scheduled' : 'Schedule a meeting'"
    :subtitle="created ? whenTextOf(created.scheduledAt) : 'Invitees get the link by email with a calendar attachment.'"
    @close="emit('close')"
  >
    <!-- Created: show the link -->
    <div v-if="created" class="p-4 space-y-3">
      <div class="flex items-center gap-2 rounded-lg border border-base-300 bg-base-200/40 px-3 py-2.5">
        <span class="flex-1 text-sm font-mono truncate">{{ joinLinkOf(created) }}</span>
        <button type="button" class="btn btn-ghost btn-xs gap-1 shrink-0" @click="copyLink">
          <component :is="copied ? Check : Copy" class="w-3 h-3" :stroke-width="2" />
          {{ copied ? 'Copied' : 'Copy' }}
        </button>
      </div>
      <p v-if="inviteSummary" class="text-xs" :class="inviteSummary.includes('failed') ? 'text-warning' : 'text-success'">
        {{ inviteSummary }}
      </p>
      <p class="text-xs text-base-content/50">The link works right away — early joiners just wait in the room. It expires 24 hours after the start time.</p>
      <p v-if="gmailHint" class="text-xs text-primary">{{ gmailHint }}</p>
      <div class="flex items-center gap-2">
        <a :href="gcalUrl(created)" target="_blank" rel="noopener" class="text-xs text-primary hover:underline">
          Add to my calendar
        </a>
        <div class="flex-1" />
        <button type="button" class="btn btn-ghost btn-sm gap-1.5" @click="sendViaGmail">
          <Mail class="w-3.5 h-3.5" :stroke-width="2" />
          Send via Gmail
        </button>
        <button type="button" class="btn btn-primary btn-sm" @click="emit('close')">Done</button>
      </div>
    </div>

    <!-- Form -->
    <form v-else class="p-4 space-y-3.5" @submit.prevent="submit">
      <div class="grid grid-cols-[1fr_170px] gap-3">
        <div>
          <label class="block text-[0.65rem] font-bold uppercase tracking-wider text-base-content/40 mb-1.5">Title</label>
          <input
            v-model="title"
            type="text"
            placeholder="e.g. Candidate interview — Maria"
            class="w-full h-10 px-3 rounded-lg border border-base-300 bg-base-200/40 text-sm outline-none focus:border-primary"
          />
        </div>
        <div>
          <label class="block text-[0.65rem] font-bold uppercase tracking-wider text-base-content/40 mb-1.5">For client</label>
          <select
            v-model="clientId"
            class="w-full h-10 px-2 rounded-lg border border-base-300 bg-base-200/40 text-sm outline-none focus:border-primary"
          >
            <option :value="null">No client</option>
            <option v-for="c in clientOptions" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
      </div>
      <div class="grid grid-cols-3 gap-3">
        <div>
          <label class="block text-[0.65rem] font-bold uppercase tracking-wider text-base-content/40 mb-1.5">Date</label>
          <input v-model="date" type="date" class="w-full h-10 px-2.5 rounded-lg border border-base-300 bg-base-200/40 text-sm outline-none focus:border-primary" />
        </div>
        <div>
          <label class="block text-[0.65rem] font-bold uppercase tracking-wider text-base-content/40 mb-1.5">Time</label>
          <input v-model="time" type="time" class="w-full h-10 px-2.5 rounded-lg border border-base-300 bg-base-200/40 text-sm outline-none focus:border-primary" />
        </div>
        <div>
          <label class="block text-[0.65rem] font-bold uppercase tracking-wider text-base-content/40 mb-1.5">Duration</label>
          <select v-model.number="duration" class="w-full h-10 px-2 rounded-lg border border-base-300 bg-base-200/40 text-sm outline-none focus:border-primary">
            <option v-for="d in DURATIONS" :key="d" :value="d">{{ d >= 60 ? (d / 60) + 'h' + (d % 60 ? ' ' + (d % 60) + 'm' : '') : d + 'm' }}</option>
          </select>
        </div>
      </div>
      <p v-if="clientTimePreview" class="text-xs text-base-content/55 -mt-1.5">
        For {{ clientName }}, that's
        <span class="font-medium text-base-content/75 tabular-nums">{{ clientTimePreview }}</span>
        — invites will show their time.
      </p>

      <div>
        <label class="block text-[0.65rem] font-bold uppercase tracking-wider text-base-content/40 mb-1.5">Invite by email (optional)</label>
        <EmailChipsInput ref="chips" v-model="emails" />
      </div>

      <div>
        <label class="block text-[0.65rem] font-bold uppercase tracking-wider text-base-content/40 mb-1.5">Note (optional)</label>
        <textarea
          v-model="note"
          rows="2"
          placeholder="Anything they should prepare or know beforehand."
          class="w-full px-3 py-2 rounded-lg border border-base-300 bg-base-200/40 text-sm outline-none focus:border-primary resize-none"
        />
      </div>

      <p v-if="submitError" class="text-xs text-error">{{ submitError }}</p>

      <div class="flex justify-end gap-2 pt-1">
        <button type="button" class="btn btn-ghost btn-sm" :disabled="submitting" @click="emit('close')">Cancel</button>
        <button type="submit" class="btn btn-primary btn-sm gap-1.5" :disabled="!valid || submitting">
          <CalendarClock class="w-3.5 h-3.5" :stroke-width="2" />
          {{ submitting ? 'Scheduling…' : 'Schedule' }}
        </button>
      </div>
    </form>
  </MeetingModal>
</template>
