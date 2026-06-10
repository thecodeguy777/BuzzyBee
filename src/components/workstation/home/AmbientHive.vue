<script setup lang="ts">
import { computed, inject, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Headphones, Clock, Hexagon } from 'lucide-vue-next'
import HexAvatar from '@/components/shared/HexAvatar.vue'
import { useTeamStore } from '@/stores/team'
import { useClientsStore } from '@/stores/clients'
import { useHivePresence } from '@/composables/useHivePresence'
import { COMMS_STREAM } from '@/composables/commsStream'
import { displayName, firstName } from '@/lib/format'

const team = useTeamStore()
const clients = useClientsStore()
const router = useRouter()
const { running, ready: hiveReady } = useHivePresence()

// Hold a skeleton until every source has landed, then reveal the hive all at
// once (no grey-cells-then-fill pop-in).
const loading = computed(() => team.loading || !clients.loaded || !hiveReady.value)
// Comms presence is channel-scoped, so it only adds "on a call" info for the
// channel currently bound. Optional — the hive works on clock state alone.
const stream = inject(COMMS_STREAM, null)

// Ticking clock for the live "on the clock" timers.
const now = ref(Date.now())
const tick = window.setInterval(() => (now.value = Date.now()), 30_000)
onUnmounted(() => window.clearInterval(tick))

type Status = 'call' | 'focus' | 'free' | 'off'
interface Cell {
  id: string
  name: string
  avatarUrl: string | null
  email: string | null
  status: Status
  clientName: string | null
  since: number | null
}

const huddleIds = computed(
  () => new Set((stream?.online.value ?? []).filter((p) => p.inHuddle).map((p) => p.userId))
)
const onlineIds = computed(() => new Set((stream?.online.value ?? []).map((p) => p.userId)))

const ORDER: Record<Status, number> = { call: 0, focus: 1, free: 2, off: 3 }
const cells = computed<Cell[]>(() =>
  team.myTeam
    .map((m) => {
      const r = running.value[m.id]
      let status: Status = 'off'
      if (huddleIds.value.has(m.id)) status = 'call'
      else if (r) status = 'focus'
      else if (onlineIds.value.has(m.id)) status = 'free'
      return {
        id: m.id,
        name: displayName(m, 'VA'),
        avatarUrl: m.avatar_url,
        email: m.email,
        status,
        clientName: r ? clients.clients.find((c) => c.id === r.client_id)?.name ?? null : null,
        since: r ? new Date(r.started_at).getTime() : null
      }
    })
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name))
)

const counts = computed(() => {
  let inHive = 0, call = 0, free = 0
  for (const c of cells.value) {
    if (c.status !== 'off') inHive++
    if (c.status === 'call') call++
    if (c.status === 'free') free++
  }
  return { inHive, call, free }
})

const META: Record<Status, { label: string; dot: string; chip: string }> = {
  call: { label: 'on a call', dot: 'bg-info', chip: 'text-info' },
  focus: { label: 'heads-down', dot: 'bg-violet-500', chip: 'text-violet-600' },
  free: { label: 'free to grab', dot: 'bg-success', chip: 'text-success' },
  off: { label: 'clocked out', dot: 'bg-base-content/25', chip: 'text-base-content/40' }
}

function elapsed(since: number | null): string {
  if (!since) return ''
  const s = Math.max(0, Math.floor((now.value - since) / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

function openVa(id: string) {
  router.push({ name: 'workstation-team', params: { vaId: id } })
}
</script>

<template>
  <section
    class="rounded-2xl border p-5 shadow-hc-1"
    style="background: linear-gradient(135deg, var(--hc-surface) 0%, var(--hc-surface-warm) 100%); border-color: var(--hc-divider);"
  >
    <!-- header -->
    <div class="flex items-center gap-2 mb-4">
      <Hexagon class="w-4 h-4" :stroke-width="1.75" style="color: var(--hc-accent)" />
      <h2 class="text-sm font-semibold">The Hive</h2>
      <span class="relative flex h-2 w-2 ml-0.5">
        <span class="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 animate-ping" />
        <span class="relative inline-flex rounded-full h-2 w-2 bg-success" />
      </span>
      <div class="flex-1" />
      <span v-if="loading" class="text-[0.7rem] text-base-content/40">syncing…</span>
      <div v-else class="text-[0.7rem] text-base-content/55 tabular-nums flex items-center gap-2">
        <span><strong class="text-base-content font-semibold">{{ counts.inHive }}</strong> in the hive</span>
        <span v-if="counts.call" class="text-base-content/30">·</span>
        <span v-if="counts.call" class="text-info">{{ counts.call }} on call{{ counts.call === 1 ? '' : 's' }}</span>
        <span v-if="counts.free" class="text-base-content/30">·</span>
        <span v-if="counts.free" class="text-success">{{ counts.free }} free</span>
      </div>
    </div>

    <Transition name="hive" mode="out-in">
      <!-- skeleton -->
      <div v-if="loading" key="sk" class="flex flex-wrap gap-x-1 gap-y-3">
        <div v-for="n in 7" :key="n" class="w-[88px] flex flex-col items-center px-1 py-1.5">
          <div class="w-12 h-12 rounded-2xl bg-base-200 animate-pulse" />
          <div class="mt-1.5 h-3 w-12 rounded bg-base-200 animate-pulse" />
          <div class="mt-1 h-2.5 w-10 rounded bg-base-200 animate-pulse" />
        </div>
      </div>

      <!-- honeycomb -->
      <div v-else-if="cells.length" key="data" class="flex flex-wrap gap-x-1 gap-y-3">
      <button
        v-for="c in cells"
        :key="c.id"
        type="button"
        class="group w-[88px] flex flex-col items-center text-center px-1 py-1.5 rounded-xl hover:bg-base-200/50 transition-colors"
        :class="c.status === 'off' ? 'opacity-55 hover:opacity-100' : ''"
        :aria-label="`${c.name} — ${META[c.status].label}`"
        @click="openVa(c.id)"
      >
        <span class="relative">
          <HexAvatar :name="c.name" :avatar-url="c.avatarUrl" :email="c.email" :color-key="c.id" :size="48" />
          <!-- status dot -->
          <span
            class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full ring-2 ring-base-100 flex items-center justify-center"
            :class="META[c.status].dot"
          >
            <span v-if="c.status === 'call'" class="absolute inline-flex h-full w-full rounded-full bg-info opacity-75 animate-ping" />
          </span>
        </span>

        <span class="mt-1.5 text-xs font-medium truncate w-full">{{ firstName(c.name) }}</span>

        <!-- status line -->
        <span
          v-if="c.status === 'focus'"
          class="mt-0.5 inline-flex items-center gap-0.5 text-[0.6rem] font-medium tabular-nums"
          :class="META[c.status].chip"
        >
          <Clock class="w-2.5 h-2.5" :stroke-width="2" />{{ elapsed(c.since) }}
        </span>
        <span
          v-else-if="c.status === 'call'"
          class="mt-0.5 inline-flex items-center gap-0.5 text-[0.6rem] font-medium"
          :class="META[c.status].chip"
        >
          <Headphones class="w-2.5 h-2.5" :stroke-width="2" />on a call
        </span>
        <span v-else class="mt-0.5 text-[0.6rem] font-medium" :class="META[c.status].chip">
          {{ META[c.status].label }}
        </span>

        <!-- client chip -->
        <span
          v-if="c.clientName"
          class="mt-0.5 max-w-full truncate text-[0.58rem] text-base-content/45"
        >
          {{ c.clientName }}
        </span>
      </button>
      </div>

      <!-- empty -->
      <p v-else key="empty" class="text-xs italic text-base-content/40 py-2">
        No one in your hive yet — assign VAs to clients to see them here.
      </p>
    </Transition>
  </section>
</template>

<style scoped>
.hive-enter-active,
.hive-leave-active {
  transition: opacity 0.35s ease;
}
.hive-enter-from,
.hive-leave-to {
  opacity: 0;
}
</style>
