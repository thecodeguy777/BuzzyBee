<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { UserPlus, X } from 'lucide-vue-next'
import { useAddLead } from '../composables/useAddLead'
import { useLeads } from '../composables/useLeads'
import { useToast } from '../composables/useToast'

const addLead = useAddLead()
const leads = useLeads()
const toast = useToast()

const fullName = ref('')
const phone = ref('')
const email = ref('')
const company = ref('')
const notes = ref('')
const source = ref('')

const submitting = ref(false)
const nameInputRef = ref<HTMLInputElement | null>(null)

const phoneE164 = computed(() => normalizeE164(phone.value))
const phoneLooksValid = computed(() => {
  const e164 = phoneE164.value
  // E.164: leading +, country code, total 8–15 digits.
  return /^\+\d{8,15}$/.test(e164)
})

const canSubmit = computed(() =>
  fullName.value.trim().length > 0 && phoneLooksValid.value && !submitting.value,
)

function normalizeE164(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('+')) return '+' + trimmed.slice(1).replace(/\D/g, '')
  const digits = trimmed.replace(/\D/g, '')
  // Assume US/Canada if 10 digits, otherwise treat as already-prefixed
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return `+${digits}`
}

watch(() => addLead.isOpen.value, async (open) => {
  if (open) {
    // Pre-fill source if the opener passed one
    source.value = addLead.defaultSource.value ?? ''
    await nextTick()
    nameInputRef.value?.focus()
  } else {
    // Reset on close
    fullName.value = ''
    phone.value = ''
    email.value = ''
    company.value = ''
    notes.value = ''
    source.value = ''
    submitting.value = false
  }
})

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  try {
    const lead = await leads.addLead({
      fullName: fullName.value.trim(),
      phoneE164: phoneE164.value,
      email: email.value.trim() || undefined,
      company: company.value.trim() || undefined,
      notes: notes.value.trim() || undefined,
      source: source.value.trim() || undefined,
    })
    if (!lead) {
      toast.error('Failed to add lead', 'Database returned no row — check connection.')
      submitting.value = false
      return
    }
    toast.success('Lead added', lead.fullName)
    addLead.close()
  } catch (err: any) {
    console.error('[AddLeadModal] submit failed:', err)
    toast.error('Failed to add lead', err?.message ?? String(err))
    submitting.value = false
  }
}

function onBackdropClick() {
  if (!submitting.value) addLead.close()
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && !submitting.value) addLead.close()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="addLead.isOpen.value"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      @click="onBackdropClick"
      @keydown="onKeyDown"
    >
      <div
        class="bg-base-100 border border-base-300 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        @click.stop
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-3 border-b border-base-300">
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <UserPlus class="w-4 h-4 text-primary" />
            </div>
            <h2 class="text-sm font-semibold text-base-content">Add new lead</h2>
          </div>
          <button
            class="p-1 rounded hover:bg-base-200 text-base-content/50 hover:text-base-content transition-colors"
            :disabled="submitting"
            @click="addLead.close()"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- Form -->
        <div class="px-5 py-4 space-y-3">
          <!-- Required fields -->
          <div>
            <label class="block text-[10px] uppercase tracking-wider text-base-content/50 mb-1">
              Full name <span class="text-red-500">*</span>
            </label>
            <input
              ref="nameInputRef"
              v-model="fullName"
              type="text"
              placeholder="Sarah Chen"
              class="w-full text-sm px-3 py-2 rounded border border-base-300 bg-base-100 focus:border-primary focus:outline-none"
              @keydown.enter="submit"
            />
          </div>

          <div>
            <label class="block text-[10px] uppercase tracking-wider text-base-content/50 mb-1">
              Phone <span class="text-red-500">*</span>
            </label>
            <input
              v-model="phone"
              type="tel"
              placeholder="+1 (555) 123-4567"
              class="w-full text-sm px-3 py-2 rounded border bg-base-100 focus:outline-none transition-colors"
              :class="phone && !phoneLooksValid
                ? 'border-red-500/50 focus:border-red-500'
                : 'border-base-300 focus:border-primary'"
              @keydown.enter="submit"
            />
            <div v-if="phone && phoneLooksValid" class="text-[10px] text-base-content/40 mt-1">
              Will be saved as <span class="font-mono">{{ phoneE164 }}</span>
            </div>
            <div v-else-if="phone && !phoneLooksValid" class="text-[10px] text-red-500 mt-1">
              Doesn't look like a valid phone number
            </div>
          </div>

          <!-- Optional fields -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[10px] uppercase tracking-wider text-base-content/50 mb-1">
                Email
              </label>
              <input
                v-model="email"
                type="email"
                placeholder="sarah@acme.com"
                class="w-full text-sm px-3 py-2 rounded border border-base-300 bg-base-100 focus:border-primary focus:outline-none"
                @keydown.enter="submit"
              />
            </div>
            <div>
              <label class="block text-[10px] uppercase tracking-wider text-base-content/50 mb-1">
                Company
              </label>
              <input
                v-model="company"
                type="text"
                placeholder="Acme Corp"
                class="w-full text-sm px-3 py-2 rounded border border-base-300 bg-base-100 focus:border-primary focus:outline-none"
                @keydown.enter="submit"
              />
            </div>
          </div>

          <div>
            <label class="block text-[10px] uppercase tracking-wider text-base-content/50 mb-1">
              Source
            </label>
            <input
              v-model="source"
              type="text"
              placeholder="LinkedIn, referral, website..."
              class="w-full text-sm px-3 py-2 rounded border border-base-300 bg-base-100 focus:border-primary focus:outline-none"
              @keydown.enter="submit"
            />
          </div>

          <div>
            <label class="block text-[10px] uppercase tracking-wider text-base-content/50 mb-1">
              Notes
            </label>
            <textarea
              v-model="notes"
              placeholder="What you know about this lead..."
              rows="2"
              class="w-full text-sm px-3 py-2 rounded border border-base-300 bg-base-100 focus:border-primary focus:outline-none resize-none"
            />
          </div>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-end gap-2 px-5 py-3 border-t border-base-300 bg-base-200/40">
          <button
            class="text-xs px-3 py-1.5 rounded text-base-content/70 hover:bg-base-200 transition-colors disabled:opacity-50"
            :disabled="submitting"
            @click="addLead.close()"
          >
            Cancel
          </button>
          <button
            class="text-xs font-semibold px-4 py-1.5 rounded bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="!canSubmit"
            @click="submit"
          >
            <span v-if="submitting">Adding…</span>
            <span v-else>Add lead</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
