// Shared @-mention autocomplete for plain <textarea>/<input> composers.
// Ported from the proven inline implementation in CommsView.vue so the
// task-chat and DM composers behave identically: caret-aware @token detection,
// keyboard nav, a teleported popover (rendered by <MentionPopover>), and an
// id capture that survives the round-trip into mentioned_user_ids.
//
// Pairs with src/components/shared/MentionPopover.vue. The DB triggers
// (tg_task_comments_notify / tg_messages_notify) intersect ids against real
// profiles, so over-collecting here is harmless; resolveMentions() still trims
// ids whose @handle the user deleted before sending.
import { ref, computed, nextTick, onMounted, onUnmounted, type Ref } from 'vue'

export interface MentionCandidate {
  id: string
  name: string
  avatarUrl: string | null
}

export function useMentionAutocomplete(opts: {
  /** The composer element (textarea or input). */
  el: Ref<HTMLTextAreaElement | HTMLInputElement | null>
  /** v-model of the composer text. */
  text: Ref<string>
  /** Candidate people (already self-excluded by the caller). */
  candidates: () => MentionCandidate[]
  /** Max rows to show. Default 6. */
  max?: number
}) {
  const open = ref(false)
  const query = ref('')
  const start = ref(-1)
  const activeIndex = ref(0)
  const style = ref<Record<string, string>>({})
  // id -> the exact name inserted, so reconcile can check the @handle survives.
  const picked = ref<Map<string, string>>(new Map())

  const matches = computed<MentionCandidate[]>(() => {
    if (!open.value) return []
    const q = query.value.toLowerCase()
    const all = opts.candidates()
    return (q ? all.filter((p) => p.name.toLowerCase().includes(q)) : all).slice(
      0,
      opts.max ?? 6
    )
  })

  function position() {
    const el = opts.el.value
    if (!el) return
    const r = el.getBoundingClientRect()
    // Anchor above the composer (opens upward), matching the comms popover.
    style.value = { left: `${r.left}px`, bottom: `${window.innerHeight - r.top + 6}px` }
  }

  /** Call from the composer's @input. Detects an "@token" under the caret. */
  function onInput() {
    const el = opts.el.value
    if (!el) {
      open.value = false
      return
    }
    const caret = el.selectionStart ?? opts.text.value.length
    const m = opts.text.value.slice(0, caret).match(/(?:^|\s)@([\p{L}\p{N}._-]*)$/u)
    if (m) {
      start.value = caret - m[1].length - 1
      query.value = m[1]
      activeIndex.value = 0
      open.value = true
      void nextTick(position)
    } else {
      open.value = false
    }
  }

  function pick(p: MentionCandidate) {
    const el = opts.el.value
    const caret = el?.selectionStart ?? opts.text.value.length
    const before = opts.text.value.slice(0, start.value)
    const after = opts.text.value.slice(caret)
    const insert = `@${p.name} `
    opts.text.value = before + insert + after
    picked.value.set(p.id, p.name)
    open.value = false
    void nextTick(() => {
      el?.focus()
      const pos = (before + insert).length
      el?.setSelectionRange(pos, pos)
    })
  }

  /** Call from the composer's @keydown. Returns true if it consumed the key
   *  (the caller must then NOT send/insert a newline). */
  function onKeydown(e: KeyboardEvent): boolean {
    if (e.isComposing) return false // let IME commit (Enter/Tab) pass through
    if (!open.value || !matches.value.length) return false
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      activeIndex.value = (activeIndex.value + 1) % matches.value.length
      return true
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      activeIndex.value =
        (activeIndex.value - 1 + matches.value.length) % matches.value.length
      return true
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      pick(matches.value[activeIndex.value])
      return true
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      open.value = false
      return true
    }
    return false
  }

  /** Insert a bare "@" at the caret and open the picker (for a toolbar button). */
  function insertTrigger() {
    const el = opts.el.value
    el?.focus()
    const caret = el?.selectionStart ?? opts.text.value.length
    opts.text.value =
      opts.text.value.slice(0, caret) + '@' + opts.text.value.slice(caret)
    void nextTick(() => {
      el?.setSelectionRange(caret + 1, caret + 1)
      onInput()
    })
  }

  /** Ids to send: a picked id is kept only if its @handle still appears in the
   *  final text — so deleting "@Alice" drops her id. Full inserted name always
   *  counts; first-name alone only when it's unambiguous among the picked set
   *  (else removing one of two "Alice"s would keep both). */
  function resolveMentions(finalText: string): string[] {
    const entries = [...picked.value.entries()]
    const firstCount = new Map<string, number>()
    for (const [, name] of entries) {
      const f = name.split(' ')[0]
      firstCount.set(f, (firstCount.get(f) ?? 0) + 1)
    }
    const out: string[] = []
    for (const [id, name] of entries) {
      const first = name.split(' ')[0]
      const firstUnambiguous = (firstCount.get(first) ?? 0) === 1
      if (
        finalText.includes('@' + name) ||
        (firstUnambiguous && finalText.includes('@' + first))
      ) {
        out.push(id)
      }
    }
    return out
  }

  function reset() {
    open.value = false
    picked.value = new Map()
  }

  // Close on blur (e.g. a mobile soft-keyboard dismiss, which fires no outside
  // click for onDocMouseDown). Deferred so a popover-row mousedown still picks
  // first (its @mousedown.prevent keeps focus, but the delay is belt-and-braces).
  function onBlur() {
    window.setTimeout(() => {
      open.value = false
    }, 120)
  }

  // Close on an outside mousedown. Clicking a popover row picks first (its
  // @mousedown.prevent fires at the target before this bubbles to document and
  // sets open=false), so we only need to ignore clicks inside the composer.
  function onDocMouseDown(e: MouseEvent) {
    if (!open.value) return
    if (opts.el.value?.contains(e.target as Node)) return
    open.value = false
  }
  onMounted(() => document.addEventListener('mousedown', onDocMouseDown))
  onUnmounted(() => document.removeEventListener('mousedown', onDocMouseDown))

  return {
    open,
    query,
    matches,
    activeIndex,
    style,
    onInput,
    onKeydown,
    onBlur,
    pick,
    insertTrigger,
    resolveMentions,
    reset
  }
}
