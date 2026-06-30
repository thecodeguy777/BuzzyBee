<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-vue-next'
import FormFieldBody from '@/components/forms/FormFieldBody.vue'
import { fetchPublicForm, submitPublicForm, type PublicForm } from '@/stores/forms'

// The anonymous fill page at /f/:token. Resolves the form via the public RPC,
// runs the (possibly multi-step) flow, and submits — which creates a task
// server-side. No auth required; the token is the access key.
const props = defineProps<{ token: string }>()

const status = ref<'loading' | 'ready' | 'notfound' | 'submitting' | 'done' | 'error'>('loading')
const form = ref<PublicForm | null>(null)
const step = ref(0)
const vals = ref<Record<string, unknown>>({})
const errMsg = ref('')

onMounted(async () => {
  const f = await fetchPublicForm(props.token)
  if (!f) { status.value = 'notfound'; return }
  form.value = f
  status.value = 'ready'
})

const curStep = computed(() => form.value?.structure.steps[step.value])
const isLast = computed(() => !!form.value && step.value === form.value.structure.steps.length - 1)

// Required-field guard for the current step before advancing/submitting.
const stepError = ref<string | null>(null)
function validateStep(): boolean {
  for (const f of curStep.value?.fields ?? []) {
    if (!f.props.required) continue
    const v = vals.value[f.id]
    const empty = v == null || v === '' || (Array.isArray(v) && v.length === 0)
    if (empty) { stepError.value = `Please fill in "${f.props.label || 'a required field'}".`; return false }
  }
  stepError.value = null
  return true
}

async function next() {
  if (!validateStep()) return
  if (!isLast.value) { step.value++; return }
  status.value = 'submitting'
  const r = await submitPublicForm(props.token, vals.value)
  if (r.ok) {
    status.value = 'done'
  } else {
    errMsg.value = r.error === 'not_found' ? 'This form is no longer accepting responses.' : 'Something went wrong submitting your response.'
    status.value = 'error'
  }
}
</script>

<template>
  <div class="min-h-screen bg-base-200 flex flex-col items-center px-4 py-10">
    <!-- loading -->
    <div v-if="status === 'loading'" class="flex-1 grid place-items-center">
      <Loader2 class="w-6 h-6 animate-spin text-base-content/30" />
    </div>

    <!-- not found -->
    <div v-else-if="status === 'notfound'" class="flex-1 grid place-items-center">
      <div class="text-center max-w-sm">
        <AlertCircle class="w-10 h-10 mx-auto text-base-content/30 mb-3" :stroke-width="1.5" />
        <p class="font-display text-lg font-semibold mb-1">Form not available</p>
        <p class="text-sm text-base-content/55">This link is invalid or the form is no longer published. Ask whoever sent it for a fresh link.</p>
      </div>
    </div>

    <!-- done -->
    <div v-else-if="status === 'done'" class="flex-1 grid place-items-center">
      <div class="text-center max-w-sm">
        <CheckCircle2 class="w-12 h-12 mx-auto text-success mb-3" :stroke-width="1.5" />
        <p class="font-display text-xl font-bold mb-1.5">Thank you!</p>
        <p class="text-sm text-base-content/60">Your response was received. The team will pick it up from here.</p>
      </div>
    </div>

    <!-- error -->
    <div v-else-if="status === 'error'" class="flex-1 grid place-items-center">
      <div class="text-center max-w-sm">
        <AlertCircle class="w-10 h-10 mx-auto text-error mb-3" :stroke-width="1.5" />
        <p class="font-display text-lg font-semibold mb-1">Couldn't submit</p>
        <p class="text-sm text-base-content/55 mb-4">{{ errMsg }}</p>
        <button class="btn btn-sm btn-ghost" @click="status = 'ready'">Try again</button>
      </div>
    </div>

    <!-- form -->
    <div v-else-if="form" class="w-full max-w-[600px]">
      <div class="bg-base-100 border border-base-300 rounded-2xl overflow-hidden shadow-sm">
        <div class="h-1.5 bg-primary" />
        <div class="px-7 pb-7 pt-6">
          <h1 class="text-2xl font-extrabold tracking-tight mb-1.5">{{ form.title }}</h1>
          <p v-if="form.description" class="text-sm text-base-content/70 leading-relaxed">{{ form.description }}</p>

          <div v-if="form.multi" class="flex items-center gap-1.5 my-5">
            <template v-for="(st, i) in form.structure.steps" :key="st.id">
              <span class="w-6 h-6 rounded-full grid place-items-center text-xs font-bold" :class="i <= step ? 'bg-primary text-primary-content' : 'bg-base-300 text-base-content/50'">{{ i < step ? '✓' : i + 1 }}</span>
              <div v-if="i < form.structure.steps.length - 1" class="flex-1 h-0.5" :class="i < step ? 'bg-primary' : 'bg-base-300'" />
            </template>
          </div>

          <div class="flex flex-col gap-5 mt-5">
            <FormFieldBody
              v-for="f in curStep?.fields ?? []"
              :key="f.id"
              :field="f"
              :edit="false"
              :model-value="vals[f.id]"
              @update:model-value="vals[f.id] = $event"
            />
          </div>

          <p v-if="stepError" class="text-sm text-error mt-4">{{ stepError }}</p>

          <div class="flex gap-2.5 mt-6">
            <button v-if="form.multi && step > 0" class="btn btn-ghost" :disabled="status === 'submitting'" @click="step--; stepError = null">Back</button>
            <div class="flex-1" />
            <button class="btn btn-primary gap-1.5" :disabled="status === 'submitting'" @click="next">
              <Loader2 v-if="status === 'submitting'" class="w-4 h-4 animate-spin" />
              {{ isLast ? (form.submit_label || 'Submit') : 'Next →' }}
            </button>
          </div>
        </div>
      </div>
      <div class="text-center mt-4 text-[11.5px] text-base-content/40">Powered by BuzzyHive Forms</div>
    </div>
  </div>
</template>
