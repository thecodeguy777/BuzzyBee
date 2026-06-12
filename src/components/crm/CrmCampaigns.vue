<script setup lang="ts">
import { ref, computed } from 'vue'
import { Mail, Plus, Send, Trash2, Users, Calendar, Eye, MousePointerClick, Copy, Pencil, TrendingUp } from 'lucide-vue-next'
import { useCampaignsStore, type Campaign, type CampaignStatus } from '@/stores/campaigns'
import { fmtDate } from '@/lib/crmData'

// Campaigns list per the Claude Design handoff: performance summary strip,
// filter tabs, and rows that carry real engagement meters (open/click) fed by
// the resend-webhook function.

const emit = defineEmits<{
  (e: 'new'): void
  (e: 'open', campaign: Campaign): void
  (e: 'duplicate', campaign: Campaign): void
}>()

const campaigns = useCampaignsStore()

const STATUS_META: Record<CampaignStatus, { label: string; dot: string }> = {
  draft: { label: 'Draft', dot: '#8b8a93' },
  sending: { label: 'Sending', dot: '#2f6fed' },
  sent: { label: 'Sent', dot: '#15803d' },
  failed: { label: 'Failed', dot: '#c2253c' },
}

const rate = (num: number, den: number) => (den ? Math.round((num / den) * 100) : 0)

// ── Summary strip: aggregates over sent campaigns ─────────────────────────────
const summary = computed(() => {
  const sent = campaigns.campaigns.filter((c) => c.status === 'sent')
  const delivered = sent.reduce((s, c) => s + c.counts.sent, 0)
  const opens = sent.reduce((s, c) => s + c.counts.opens, 0)
  const clicks = sent.reduce((s, c) => s + c.counts.clicks, 0)
  return [
    { label: 'Campaigns sent', value: String(sent.length), icon: Send, col: 'var(--accent-fg)' },
    { label: 'Total delivered', value: delivered.toLocaleString(), icon: Users, col: '#2f6fed' },
    { label: 'Avg. open rate', value: rate(opens, delivered) + '%', icon: Eye, col: '#15803d' },
    { label: 'Avg. click rate', value: rate(clicks, delivered) + '%', icon: MousePointerClick, col: '#c2700c' },
  ]
})

// ── Filter tabs ───────────────────────────────────────────────────────────────
type Filter = 'all' | 'sent' | 'draft' | 'failed'
const filter = ref<Filter>('all')
const tabs: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'sent', label: 'Sent' },
  { id: 'draft', label: 'Drafts' },
  { id: 'failed', label: 'Failed' },
]
const countFor = (f: Filter) =>
  f === 'all' ? campaigns.campaigns.length : campaigns.campaigns.filter((c) => c.status === f).length
const rows = computed(() =>
  filter.value === 'all'
    ? campaigns.campaigns
    : campaigns.campaigns.filter((c) => c.status === filter.value))

const previewText = (c: Campaign) => {
  const text = c.bodyHtml.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length > 110 ? text.slice(0, 110) + '…' : text
}
const openRate = (c: Campaign) => rate(c.counts.opens, c.counts.sent)
const clickRate = (c: Campaign) => rate(c.counts.clicks, c.counts.sent)
const sendPct = (c: Campaign) =>
  c.counts.total ? Math.round(((c.counts.sent + c.counts.failed) / c.counts.total) * 100) : 0

async function remove(c: Campaign, e: MouseEvent) {
  e.stopPropagation()
  if (!window.confirm('Delete "' + c.subject + '"?' + (c.status === 'sent' ? ' Its delivery history goes with it.' : ''))) return
  await campaigns.deleteCampaign(c.id)
}
function duplicate(c: Campaign, e: MouseEvent) {
  e.stopPropagation()
  emit('duplicate', c)
}
</script>

<template>
  <div class="flex-1 min-h-0 overflow-y-auto px-5 pb-6">
    <!-- intro + new -->
    <div class="flex items-center gap-3.5 pb-2.5">
      <div class="flex-1 text-[12.5px] text-base-content/60">
        Blast an email to this workspace's contacts —
        <span class="text-base-content/40">deduped, validated, opt-outs excluded.</span>
      </div>
      <button
        type="button"
        class="flex items-center gap-[7px] h-[34px] px-3.5 rounded-[9px] text-[13.5px] font-bold text-white whitespace-nowrap"
        :style="{ background: 'var(--accent)' }"
        @click="emit('new')"
      >
        <Plus :size="16" /> New campaign
      </button>
    </div>

    <!-- performance summary strip -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-2.5 pb-3">
      <div
        v-for="s in summary"
        :key="s.label"
        class="flex items-center gap-[11px] px-[13px] py-2.5 rounded-[11px] border border-base-300 bg-base-100 shadow-sm"
      >
        <span
          class="w-8 h-8 rounded-[9px] grid place-items-center flex-none"
          :style="{ background: `color-mix(in oklab, ${s.col} 13%, var(--color-base-100))`, color: s.col }"
        >
          <component :is="s.icon" :size="16" />
        </span>
        <div>
          <div class="text-[18px] font-extrabold text-base-content leading-none tracking-tight">{{ s.value }}</div>
          <div class="text-[11px] font-semibold text-base-content/40 mt-0.5 whitespace-nowrap">{{ s.label }}</div>
        </div>
      </div>
    </div>

    <!-- filter tabs -->
    <div class="flex items-center gap-1.5 pb-[11px]">
      <button
        v-for="t in tabs"
        :key="t.id"
        type="button"
        class="inline-flex items-center gap-1.5 px-[11px] py-[5px] rounded-full text-[12.5px] font-semibold whitespace-nowrap transition-colors"
        :class="filter === t.id ? 'text-white' : 'bg-base-200 text-base-content/60 hover:text-base-content'"
        :style="filter === t.id ? { background: 'var(--accent)' } : {}"
        @click="filter = t.id"
      >
        {{ t.label }}
        <span class="text-[11.5px] font-bold" :class="filter === t.id ? 'opacity-80' : 'opacity-60'">{{ countFor(t.id) }}</span>
      </button>
    </div>

    <!-- empty -->
    <div v-if="!rows.length && filter === 'all'" class="rounded-xl border-[1.5px] border-dashed border-base-300 px-6 py-14 text-center">
      <span class="inline-grid place-items-center w-11 h-11 rounded-xl mb-3" :style="{ background: 'var(--accent-soft)', color: 'var(--accent-fg)' }">
        <Mail :size="20" />
      </span>
      <div class="text-[14px] font-bold text-base-content mb-1">No campaigns yet</div>
      <div class="text-[12.5px] text-base-content/40 mb-4">Write one email, send it to every contact that should get it.</div>
      <button type="button" class="inline-flex items-center gap-[7px] h-[34px] px-3.5 rounded-[9px] text-[13.5px] font-bold text-white" :style="{ background: 'var(--accent)' }" @click="emit('new')">
        <Plus :size="16" /> Create your first campaign
      </button>
    </div>
    <div v-else-if="!rows.length" class="text-center text-[13.5px] text-base-content/40 py-10">
      No {{ filter }} campaigns.
    </div>

    <!-- rows -->
    <div class="flex flex-col gap-[7px]">
      <button
        v-for="c in rows"
        :key="c.id"
        type="button"
        class="crm-camp group grid items-center gap-3.5 px-3.5 py-[9px] rounded-[11px] border border-base-300 bg-base-100 text-left"
        style="grid-template-columns: 1fr 196px 96px"
        @click="emit('open', c)"
      >
        <!-- left: subject + meta -->
        <span class="flex gap-[11px] min-w-0">
          <span
            class="w-8 h-8 rounded-[9px] grid place-items-center flex-none"
            :style="{ background: `color-mix(in oklab, ${STATUS_META[c.status].dot} 13%, var(--color-base-100))`, color: STATUS_META[c.status].dot }"
          >
            <Send :size="16" />
          </span>
          <span class="min-w-0">
            <span class="block text-[13.5px] font-bold text-base-content truncate">{{ c.subject }}</span>
            <span class="block text-[12px] text-base-content/40 truncate mt-px">{{ previewText(c) || '—' }}</span>
            <span class="flex items-center gap-2 mt-1 text-[11px] text-base-content/40">
              <span class="inline-flex items-center gap-1 whitespace-nowrap">
                <Users :size="12" :stroke-width="1.9" /> {{ c.counts.total.toLocaleString() }} · {{ c.audience || 'Custom audience' }}
              </span>
              <span class="w-[3px] h-[3px] rounded-full bg-base-content/40 flex-none" />
              <span class="inline-flex items-center gap-1 whitespace-nowrap">
                <Calendar :size="12" :stroke-width="1.9" />
                {{ c.status === 'sent' ? 'Sent ' + fmtDate(c.sentAt) : c.status === 'draft' ? 'Not sent yet' : fmtDate(c.createdAt) }}
              </span>
            </span>
          </span>
        </span>

        <!-- middle: engagement / progress -->
        <span>
          <span v-if="c.status === 'sent'" class="flex gap-3">
            <span class="block min-w-[72px]">
              <span class="flex items-baseline gap-1">
                <span class="text-[13.5px] font-extrabold text-base-content tabular-nums tracking-tight">{{ openRate(c) }}%</span>
                <span class="text-[9.5px] font-bold text-base-content/40 uppercase tracking-wide">Open</span>
              </span>
              <span class="block h-[3px] rounded-full bg-base-200 overflow-hidden mt-1">
                <span class="block h-full rounded-full" :style="{ width: Math.min(openRate(c), 100) + '%', background: '#15803d' }" />
              </span>
              <span class="block text-[10px] text-base-content/40 mt-[3px]">{{ c.counts.opens.toLocaleString() }} opens</span>
            </span>
            <span class="block min-w-[72px]">
              <span class="flex items-baseline gap-1">
                <span class="text-[13.5px] font-extrabold text-base-content tabular-nums tracking-tight">{{ clickRate(c) }}%</span>
                <span class="text-[9.5px] font-bold text-base-content/40 uppercase tracking-wide">Click</span>
              </span>
              <span class="block h-[3px] rounded-full bg-base-200 overflow-hidden mt-1">
                <span class="block h-full rounded-full" :style="{ width: Math.min(clickRate(c), 100) + '%', background: '#c2700c' }" />
              </span>
              <span class="block text-[10px] text-base-content/40 mt-[3px]">{{ c.counts.clicks.toLocaleString() }} clicks</span>
            </span>
          </span>
          <span v-else-if="c.status === 'sending'" class="block min-w-[120px]">
            <span class="text-[11.5px] font-semibold text-base-content/60 tabular-nums">
              {{ c.counts.sent }} / {{ c.counts.total }} sent
            </span>
            <span class="block h-[5px] rounded-full bg-base-200 overflow-hidden mt-1">
              <span class="block h-full rounded-full transition-[width] duration-500" :style="{ width: sendPct(c) + '%', background: '#2f6fed' }" />
            </span>
          </span>
          <span v-else-if="c.status === 'failed'" class="text-[12px] font-semibold" style="color: #c2253c">
            {{ c.counts.failed.toLocaleString() }} failed — open for details
          </span>
          <span v-else class="text-[12.5px] text-base-content/40 italic">Draft — not sent</span>
        </span>

        <!-- right: status chip ⇄ hover actions -->
        <span class="flex items-center justify-end gap-1.5">
          <span class="crm-camp-actions items-center gap-0.5 hidden group-hover:flex" @click.stop>
            <span
              role="button"
              class="w-[30px] h-[30px] rounded-lg grid place-items-center text-base-content/40 hover:text-base-content hover:bg-base-200 cursor-pointer"
              :title="c.status === 'sent' ? 'View report' : c.status === 'draft' ? 'Edit draft' : 'View details'"
              @click="emit('open', c)"
            >
              <component :is="c.status === 'sent' ? TrendingUp : c.status === 'draft' ? Pencil : TrendingUp" :size="16" />
            </span>
            <span
              role="button"
              class="w-[30px] h-[30px] rounded-lg grid place-items-center text-base-content/40 hover:text-base-content hover:bg-base-200 cursor-pointer"
              title="Duplicate"
              @click="duplicate(c, $event)"
            >
              <Copy :size="16" />
            </span>
            <span
              role="button"
              class="w-[30px] h-[30px] rounded-lg grid place-items-center text-base-content/40 hover:text-[#c2253c] hover:bg-base-200 cursor-pointer"
              title="Delete"
              @click="remove(c, $event)"
            >
              <Trash2 :size="16" />
            </span>
          </span>
          <span
            class="inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-full text-[12px] font-semibold whitespace-nowrap group-hover:hidden"
            :style="{
              background: `color-mix(in oklab, ${STATUS_META[c.status].dot} 14%, var(--color-base-100))`,
              color: STATUS_META[c.status].dot,
            }"
          >
            <span
              class="w-1.5 h-1.5 rounded-full"
              :class="c.status === 'sending' && 'animate-pulse'"
              :style="{ background: STATUS_META[c.status].dot }"
            />
            {{ STATUS_META[c.status].label }}
          </span>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.crm-camp { transition: border-color 0.12s, background 0.12s, box-shadow 0.12s; }
.crm-camp:hover { border-color: var(--accent-bord); background: var(--color-base-200); }
</style>
