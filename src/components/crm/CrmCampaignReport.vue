<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { X, Copy, Clock, BookmarkPlus, CheckCircle2 } from 'lucide-vue-next'
import { useTeamStore } from '@/stores/team'
import { type Campaign, type CampaignStatus } from '@/stores/campaigns'
import { useEmailTemplatesStore } from '@/stores/emailTemplates'
import CrmAvatar from './CrmAvatar.vue'

// Report panel for a campaign (Claude Design handoff): open/click/CTOR/bounce
// stat cards + an engagement funnel. Engagement comes from the resend-webhook
// stamps on recipient rows, aggregated into campaign.counts.

const props = defineProps<{ campaign: Campaign }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'duplicate', campaign: Campaign): void
}>()

const team = useTeamStore()
const tplStore = useEmailTemplatesStore()
const visible = ref(false)

// One click turns a campaign that performed into a reusable template.
const tplState = ref<'idle' | 'saving' | 'saved'>('idle')
async function saveAsTemplate() {
  if (tplState.value !== 'idle') return
  const name = window.prompt('Template name', props.campaign.subject)
  if (!name?.trim()) return
  tplState.value = 'saving'
  const t = await tplStore.save({
    name,
    subject: props.campaign.subject,
    bodyHtml: props.campaign.bodyHtml,
    bodyBlocks: props.campaign.bodyBlocks,
    layout: props.campaign.layout,
    accent: props.campaign.accent,
  })
  tplState.value = t ? 'saved' : 'idle'
}

const STATUS_META: Record<CampaignStatus, { label: string; dot: string }> = {
  draft: { label: 'Draft', dot: '#8b8a93' },
  sending: { label: 'Sending', dot: '#2f6fed' },
  sent: { label: 'Sent', dot: '#15803d' },
  failed: { label: 'Failed', dot: '#c2253c' },
}
const meta = computed(() => STATUS_META[props.campaign.status])

const rate = (num: number, den: number) => (den ? Math.round((num / den) * 100) : 0)
const c = computed(() => props.campaign.counts)
const openR = computed(() => rate(c.value.opens, c.value.sent))
const clickR = computed(() => rate(c.value.clicks, c.value.sent))
const ctor = computed(() => rate(c.value.clicks, c.value.opens))

const funnel = computed(() => [
  { label: 'Delivered', n: c.value.sent, pct: rate(c.value.sent, c.value.total), color: '#2f6fed' },
  { label: 'Opened', n: c.value.opens, pct: openR.value, color: '#15803d' },
  { label: 'Clicked', n: c.value.clicks, pct: clickR.value, color: '#c2700c' },
])

const sender = computed(() =>
  props.campaign.createdBy ? team.profiles[props.campaign.createdBy] : null)

function requestClose() {
  visible.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') requestClose()
}
onMounted(() => {
  document.addEventListener('keydown', onKey)
  visible.value = true
  if (props.campaign.createdBy && !team.profiles[props.campaign.createdBy]) {
    void team.fetchProfiles([props.campaign.createdBy])
  }
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition name="crm-scrim">
      <div v-if="visible" class="fixed inset-0 z-[90]" style="background: rgba(0,0,0,.35)" @click="requestClose" />
    </Transition>
    <Transition name="crm-panel" @after-leave="emit('close')">
      <div
        v-if="visible"
        class="fixed top-0 right-0 bottom-0 z-[95] w-[460px] max-w-[94vw] flex flex-col bg-base-100 border-l border-base-300"
        style="box-shadow: -12px 0 40px -12px rgba(0,0,0,.4)"
        role="dialog"
        aria-modal="true"
        :aria-label="campaign.subject + ' — campaign report'"
      >
        <!-- header -->
        <div class="flex items-center gap-2.5 px-4 py-3.5 border-b border-base-300">
          <span
            class="inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-full text-[12px] font-semibold"
            :style="{ background: `color-mix(in oklab, ${meta.dot} 14%, var(--color-base-100))`, color: meta.dot }"
          >
            <span class="w-1.5 h-1.5 rounded-full" :class="campaign.status === 'sending' && 'animate-pulse'" :style="{ background: meta.dot }" />
            {{ meta.label }}
          </span>
          <span class="flex-1" />
          <button
            type="button"
            class="w-[30px] h-[30px] rounded-lg grid place-items-center text-base-content/40 hover:text-base-content hover:bg-base-200"
            :title="tplState === 'saved' ? 'Saved to templates' : 'Save as template'"
            @click="saveAsTemplate"
          >
            <component :is="tplState === 'saved' ? CheckCircle2 : BookmarkPlus" :size="16" :style="tplState === 'saved' ? { color: '#15803d' } : {}" />
          </button>
          <button
            type="button"
            class="w-[30px] h-[30px] rounded-lg grid place-items-center text-base-content/40 hover:text-base-content hover:bg-base-200"
            title="Duplicate & edit"
            @click="emit('duplicate', campaign)"
          >
            <Copy :size="16" />
          </button>
          <button type="button" class="w-[30px] h-[30px] rounded-lg grid place-items-center text-base-content/60 hover:bg-base-200" aria-label="Close" @click="requestClose">
            <X :size="17" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-5 py-[18px]">
          <h2 class="m-0 mb-2 text-[19px] font-bold text-base-content leading-snug">{{ campaign.subject }}</h2>
          <div class="flex items-center gap-2 text-[12.5px] text-base-content/40 mb-[18px]">
            <template v-if="sender">
              <CrmAvatar :name="sender.full_name ?? undefined" :avatar-url="sender.avatar_url" :size="20" :radius="6" />
              {{ (sender.full_name ?? '').split(' ')[0] }} ·
            </template>
            {{ campaign.audience || 'Custom audience' }} · {{ campaign.counts.total.toLocaleString() }} contacts
          </div>

          <template v-if="campaign.status === 'sent' || campaign.status === 'sending' || campaign.status === 'failed'">
            <!-- stat cards -->
            <div class="flex gap-2.5 mb-2.5">
              <div class="flex-1 px-[15px] py-[13px] rounded-[11px] border border-base-300 bg-base-100">
                <div class="text-[24px] font-extrabold leading-none tracking-tight" style="color: #15803d">{{ openR }}%</div>
                <div class="text-[12px] font-semibold text-base-content/60 mt-1.5">Open rate</div>
                <div class="text-[11px] text-base-content/40">{{ c.opens.toLocaleString() }} opens</div>
              </div>
              <div class="flex-1 px-[15px] py-[13px] rounded-[11px] border border-base-300 bg-base-100">
                <div class="text-[24px] font-extrabold leading-none tracking-tight" style="color: #c2700c">{{ clickR }}%</div>
                <div class="text-[12px] font-semibold text-base-content/60 mt-1.5">Click rate</div>
                <div class="text-[11px] text-base-content/40">{{ c.clicks.toLocaleString() }} clicks</div>
              </div>
            </div>
            <div class="flex gap-2.5 mb-5">
              <div class="flex-1 px-[15px] py-[13px] rounded-[11px] border border-base-300 bg-base-100">
                <div class="text-[24px] font-extrabold text-base-content leading-none tracking-tight">{{ ctor }}%</div>
                <div class="text-[12px] font-semibold text-base-content/60 mt-1.5">Click-to-open</div>
              </div>
              <div class="flex-1 px-[15px] py-[13px] rounded-[11px] border border-base-300 bg-base-100">
                <div class="text-[24px] font-extrabold leading-none tracking-tight" :style="{ color: c.bounces ? '#c2253c' : 'var(--color-base-content)' }">{{ c.bounces }}</div>
                <div class="text-[12px] font-semibold text-base-content/60 mt-1.5">Bounced</div>
              </div>
              <div class="flex-1 px-[15px] py-[13px] rounded-[11px] border border-base-300 bg-base-100">
                <div class="text-[24px] font-extrabold leading-none tracking-tight" :style="{ color: c.failed ? '#c2253c' : 'var(--color-base-content)' }">{{ c.failed }}</div>
                <div class="text-[12px] font-semibold text-base-content/60 mt-1.5">Failed</div>
              </div>
            </div>

            <!-- engagement funnel -->
            <div class="text-[12.5px] font-bold text-base-content mb-3">Engagement funnel</div>
            <div class="flex flex-col gap-[11px] mb-2">
              <div v-for="f in funnel" :key="f.label">
                <div class="flex items-baseline gap-2 mb-[5px]">
                  <span class="text-[13px] font-semibold text-base-content/60 w-[78px]">{{ f.label }}</span>
                  <span class="text-[14px] font-bold text-base-content">{{ f.n.toLocaleString() }}</span>
                  <span class="ml-auto text-[12.5px] font-bold" :style="{ color: f.color }">{{ f.pct }}%</span>
                </div>
                <div class="h-2 rounded-[5px] bg-base-200 overflow-hidden">
                  <div class="h-full rounded-[5px] transition-[width] duration-500" :style="{ width: f.pct + '%', background: f.color }" />
                </div>
              </div>
            </div>
            <div class="text-[11px] text-base-content/40 mt-3 leading-relaxed">
              Opens are estimates — mail apps pre-load tracking pixels. Clicks are the reliable signal.
            </div>
          </template>

          <div v-else class="py-8 text-center text-base-content/40">
            <Clock :size="30" class="inline opacity-50" />
            <div class="text-[14px] font-semibold text-base-content/60 mt-2.5">This campaign is still a draft</div>
            <div class="text-[12.5px] mt-1">Metrics appear here once it's sent.</div>
          </div>
        </div>

        <!-- footer -->
        <div class="px-4 py-3 border-t border-base-300 flex gap-2">
          <button
            type="button"
            class="flex-1 py-2.5 rounded-[10px] text-[13.5px] font-semibold text-base-content/60 border border-base-300 hover:bg-base-200"
            @click="requestClose"
          >
            Close
          </button>
          <button
            type="button"
            class="flex-1 flex items-center justify-center gap-[7px] py-2.5 rounded-[10px] text-[13.5px] font-bold text-white"
            :style="{ background: 'var(--accent)' }"
            @click="emit('duplicate', campaign)"
          >
            <Copy :size="15" /> Duplicate &amp; edit
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.crm-scrim-enter-active, .crm-scrim-leave-active { transition: opacity 0.2s ease; }
.crm-scrim-enter-from, .crm-scrim-leave-to { opacity: 0; }
.crm-panel-enter-active { transition: transform 0.24s cubic-bezier(0.2, 0.8, 0.3, 1), opacity 0.24s ease; }
.crm-panel-leave-active { transition: transform 0.18s ease-in, opacity 0.18s ease-in; }
.crm-panel-enter-from, .crm-panel-leave-to { transform: translateX(28px); opacity: 0; }
</style>
