<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import PMHome from '@/components/workstation/PMHome.vue'
import VaHome from '@/components/workstation/VaHome.vue'

const auth = useAuthStore()

// PM/Admin/Superadmin get the managerial dashboard; everyone else (VA, and
// any sales/client accounts that land here) gets the personal day view —
// it degrades to empty states when there are no assignments.
const isManagerial = computed(
  () => auth.role === 'pm' || auth.isAdmin
)
</script>

<template>
  <PMHome v-if="isManagerial" />
  <VaHome v-else />
</template>
