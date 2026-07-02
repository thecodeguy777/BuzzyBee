<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { Radio, ExternalLink } from 'lucide-vue-next'
import { supabase } from '@/lib/supabase'
import { firstName } from '@/lib/format'

// Admin oversight: every meeting happening RIGHT NOW across the org, with
// who's in the room (live meeting_participants roster — server-reaped, so a
// row means they're actually there). Backed by the meeting_rooms admin read
// policy; renders nothing when no meeting is live. Parent gates to admins.

interface LiveRoom {
  id: string
  token: string
  title: string
  people: string[]
}

const rooms = ref<LiveRoom[]>([])

async function refresh() {
  try {
    const { data, error } = await supabase
      .from('meeting_rooms')
      .select('id,token,title, participants:meeting_participants(user_id,name)')
      .is('ended_at', null)
      .gt('expires_at', new Date().toISOString())
      .limit(50)
    if (error) throw error
    rooms.value = ((data ?? []) as any[])
      .filter((r) => (r.participants ?? []).length > 0)
      .map((r) => ({
        id: r.id,
        token: r.token,
        title: r.title ?? 'Meeting',
        people: (r.participants as { name: string }[]).map((p) => firstName(p.name, 'Guest'))
      }))
  } catch (e) {
    console.warn('[live meetings]', (e as Error).message)
  }
}

// Poll while mounted — occupancy changes constantly and this is glanceable
// oversight, not a control surface, so 45s freshness is plenty.
let timer: number | undefined
onMounted(() => {
  void refresh()
  timer = window.setInterval(() => void refresh(), 45_000)
})
onUnmounted(() => window.clearInterval(timer))

function peek(r: LiveRoom) {
  window.open('/meet/' + r.token, '_blank', 'noopener')
}
</script>

<template>
  <section
    v-if="rooms.length"
    class="rounded-2xl border p-4 shadow-hc-1"
    style="background: var(--hc-surface-warm); border-color: var(--hc-divider);"
  >
    <div class="flex items-center gap-2 mb-3">
      <Radio class="w-4 h-4 text-success" :stroke-width="1.75" />
      <h2 class="text-sm font-semibold">Happening now</h2>
      <span class="text-[0.7rem] text-base-content/50">{{ rooms.length }} meeting{{ rooms.length === 1 ? '' : 's' }} live</span>
    </div>

    <ul class="divide-y divide-base-200">
      <li v-for="r in rooms" :key="r.id" class="py-2 flex items-center gap-3">
        <span class="relative flex h-2 w-2 shrink-0">
          <span class="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 animate-ping" />
          <span class="relative inline-flex rounded-full h-2 w-2 bg-success" />
        </span>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium truncate">{{ r.title }}</div>
          <div class="text-[0.7rem] text-base-content/55 truncate">
            {{ r.people.length }} in the room — {{ r.people.join(', ') }}
          </div>
        </div>
        <button type="button" class="btn btn-ghost btn-xs gap-1 shrink-0" @click="peek(r)">
          <ExternalLink class="w-3 h-3" :stroke-width="2" />
          Open
        </button>
      </li>
    </ul>
  </section>
</template>
