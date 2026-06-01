import { ref } from 'vue'

// Singleton controller for the global Add-Lead modal.
// Any surface (dialer LeadsPanel, CRMView, OpsActivityPanel) can call
// useAddLead().open() to surface the modal. The modal itself is mounted
// once at App level (AddLeadModalContainer) and reads this state.

const isOpen = ref(false)

// Optional context — e.g., source of where the open happened, for analytics
// or default-source field on the lead.
const defaultSource = ref<string | null>(null)

export function useAddLead() {
  function open(opts?: { source?: string }): void {
    defaultSource.value = opts?.source ?? null
    isOpen.value = true
  }

  function close(): void {
    isOpen.value = false
    defaultSource.value = null
  }

  return {
    isOpen,
    defaultSource,
    open,
    close,
  }
}
