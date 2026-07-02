<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Mail } from 'lucide-vue-next'
import MeetingModal from '@/components/workstation/meetings/MeetingModal.vue'
import EmailChipsInput from '@/components/workstation/meetings/EmailChipsInput.vue'
import { useMeetingsStore, type Meeting } from '@/stores/meetings'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'
import { copyBrandedInvite, gmailComposeUrl, whenTextOf } from '@/lib/meetingDisplay'

// Invite more people to an existing meeting — Resend send or the host's own
// Gmail (compose window) while the sending domain doesn't exist yet.

const props = defineProps<{ meeting: Meeting }>()
const emit = defineEmits<{ close: [] }>()
const store = useMeetingsStore()
const auth = useAuthStore()
const clients = useClientsStore()

// Meetings linked to a client speak that client's clock in every invite line.
const clientTz = computed(() =>
  props.meeting.clientId
    ? (clients.clients.find((c) => c.id === props.meeting.clientId)?.timezone ?? null)
    : null
)

// Prefill with everyone already invited, so reopening the modal means
// "reach the same audience again" — editable before any send.
const emails = ref<string[]>([...new Set(props.meeting.invites.map((i) => i.email))])
const note = ref('')
const chips = ref<InstanceType<typeof EmailChipsInput> | null>(null)
const sending = ref(false)
const result = ref<string | null>(null)
const gmailHint = ref<string | null>(null)

// Gmail is the working channel until the sending domain exists — fire the
// compose flow the moment the modal opens (the opening click's activation
// still covers clipboard + window.open). Blocked popup → hint, button works.
onMounted(() => { void sendViaGmail() })

async function submit() {
  if (sending.value) return
  chips.value?.commit()
  if (!emails.value.length) return
  sending.value = true
  result.value = null
  try {
    const res = await store.sendInvites(
      props.meeting.id,
      emails.value.map((email) => ({ email })),
      whenTextOf(props.meeting.scheduledAt, clientTz.value),
      note.value
    )
    result.value = `Sent to ${res.sent} ${res.sent === 1 ? 'person' : 'people'}${res.failed ? ` · ${res.failed} failed` : ''}`
    emails.value = []
  } catch (e) {
    result.value = (e as Error).message
  } finally {
    sending.value = false
  }
}

async function sendViaGmail() {
  chips.value?.commit()
  // Copy the branded card BEFORE opening the tab — clipboard writes need the
  // document focused, and window.open steals focus.
  const copied = await copyBrandedInvite(props.meeting, note.value, auth.fullName || 'Your host', clientTz.value)
  const win = window.open(gmailComposeUrl(props.meeting, emails.value, note.value, !copied, clientTz.value), '_blank', 'noopener')
  gmailHint.value = !win
    ? 'Popup blocked — click "Via Gmail" to open the compose window.'
    : copied
      ? 'Gmail compose opened. Branded invite copied — click into the message body and press Ctrl+V.'
      : 'Gmail compose opened with a plain-text invite.'
}
</script>

<template>
  <MeetingModal
    :icon="Mail"
    :title="`Invite to “${meeting.title}”`"
    :subtitle="whenTextOf(meeting.scheduledAt, clientTz) + (clientTz ? ' (client time)' : '')"
    @close="emit('close')"
  >
    <form class="p-4 space-y-3.5" @submit.prevent="submit">
      <div>
        <label class="block text-[0.65rem] font-bold uppercase tracking-wider text-base-content/40 mb-1.5">Invite by email</label>
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

      <p v-if="result" class="text-xs" :class="result.startsWith('Sent') ? 'text-success' : 'text-error'">{{ result }}</p>
      <p v-if="gmailHint" class="text-xs text-primary">{{ gmailHint }}</p>

      <div class="flex justify-end gap-2 pt-1">
        <button type="button" class="btn btn-ghost btn-sm" :disabled="sending" @click="emit('close')">
          {{ result?.startsWith('Sent') ? 'Done' : 'Cancel' }}
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          :disabled="!chips?.hasInput()"
          title="Open a prefilled compose window in your own Gmail — works before the sending domain exists"
          @click="sendViaGmail"
        >
          Via Gmail
        </button>
        <button type="submit" class="btn btn-primary btn-sm gap-1.5" :disabled="sending || !chips?.hasInput()">
          <Mail class="w-3.5 h-3.5" :stroke-width="2" />
          {{ sending ? 'Sending…' : 'Send invites' }}
        </button>
      </div>
    </form>
  </MeetingModal>
</template>
