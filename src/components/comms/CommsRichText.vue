<script setup lang="ts">
import { computed } from 'vue'

// Renders message text with **bold** and highlighted @mentions, matching the
// design. Known mention names (resolved from mentioned_user_ids) are matched
// exactly so multi-word names highlight fully; a generic @word is the fallback.
const props = defineProps<{ text: string; mentionNames?: string[] }>()

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface Tok { type: 'text' | 'bold' | 'mention'; value: string }

const tokens = computed<Tok[]>(() => {
  const names = (props.mentionNames ?? [])
    .filter(Boolean)
    .map(escapeRe)
    .sort((a, b) => b.length - a.length)
  const namesAlt = names.length ? `@(?:${names.join('|')})` : ''
  const patterns = ['\\*\\*[^*]+\\*\\*', namesAlt, '@[\\w.]+'].filter(Boolean)
  const re = new RegExp(`(${patterns.join('|')})`, 'g')
  return props.text
    .split(re)
    .filter((p) => p !== undefined && p !== '')
    .map((p): Tok => {
      if (p.startsWith('**') && p.endsWith('**')) return { type: 'bold', value: p.slice(2, -2) }
      if (p.startsWith('@')) return { type: 'mention', value: p }
      return { type: 'text', value: p }
    })
})
</script>

<template>
  <span><template v-for="(tok, i) in tokens" :key="i"><strong v-if="tok.type === 'bold'" class="font-bold">{{ tok.value }}</strong><span
        v-else-if="tok.type === 'mention'"
        class="font-semibold rounded px-1 py-px"
        style="background: var(--mention-bg); color: var(--mention-fg)"
      >{{ tok.value }}</span><template v-else>{{ tok.value }}</template></template></span>
</template>
