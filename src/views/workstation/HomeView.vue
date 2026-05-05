<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import PMHome from '@/components/workstation/PMHome.vue'

const auth = useAuthStore()

// PM/Admin/Superadmin get the dashboard. VAs get the original day-view shell
// for now (their dedicated home is a follow-up).
const isManagerial = computed(
  () => auth.role === 'pm' || auth.isAdmin
)

// VA fallback bits
const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 5) return 'Working late'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
})
const todayLabel = computed(() =>
  new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  })
)
</script>

<template>
  <PMHome v-if="isManagerial" />

  <div v-else class="space-y-6 max-w-3xl">
    <header>
      <p class="text-sm text-base-content/60">{{ todayLabel }}</p>
      <h1 class="font-display text-xl font-semibold mt-1">
        {{ greeting }},
        <span class="text-primary">{{ auth.firstName || 'there' }}</span>.
      </h1>
      <p v-if="auth.user?.email" class="text-xs text-base-content/60 mt-0.5">
        Signed in as {{ auth.user.email }} · {{ auth.role.toUpperCase() }}
      </p>
      <p class="text-base-content/70 mt-2">
        Open <RouterLink :to="{ name: 'workstation-my-tasks' }" class="text-primary hover:underline">My tasks</RouterLink>
        to see what's on your plate, or jump to
        <RouterLink :to="{ name: 'workstation-time' }" class="text-primary hover:underline">Time</RouterLink>
        to clock in.
      </p>
    </header>
  </div>
</template>
