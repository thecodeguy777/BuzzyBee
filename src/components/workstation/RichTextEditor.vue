<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  ListChecks,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  Link as LinkIcon,
  Minus
} from 'lucide-vue-next'
import { computed, onBeforeUnmount, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    autofocus?: boolean
    minHeight?: string
  }>(),
  {
    placeholder: "What needs to happen? Bold, italic, lists, links — Google-Docs style.",
    autofocus: false,
    minHeight: '7rem'
  }
)
const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'blur'): void
}>()

const editor = useEditor({
  content: props.modelValue || '',
  autofocus: props.autofocus ? 'end' : false,
  extensions: [
    StarterKit.configure({
      bulletList: { keepMarks: true },
      orderedList: { keepMarks: true },
      heading: { levels: [1, 2, 3] },
      // Tiptap v3 StarterKit ships Link by default; configure it here
      // instead of importing @tiptap/extension-link separately (which would
      // duplicate-register and warn).
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          rel: 'noopener noreferrer nofollow',
          target: '_blank',
          class: 'rt-link'
        }
      }
    }),
    Placeholder.configure({ placeholder: props.placeholder }),
    TaskList,
    TaskItem.configure({ nested: true })
  ],
  editorProps: {
    attributes: {
      class: 'rt-prose focus:outline-none'
    }
  },
  onUpdate: ({ editor }) => {
    emit('update:modelValue', editor.getHTML())
  },
  onBlur: () => {
    emit('blur')
  }
})

// Sync external changes (e.g. when the parent loads a different task).
watch(
  () => props.modelValue,
  (next) => {
    const current = editor.value?.getHTML()
    if (editor.value && next !== current) {
      editor.value.commands.setContent(next || '', { emitUpdate: false })
    }
  }
)

onBeforeUnmount(() => editor.value?.destroy())

// Toolbar action helpers
function setLink() {
  if (!editor.value) return
  const prev = editor.value.getAttributes('link').href as string | undefined
  const url = window.prompt('Link URL', prev ?? 'https://')
  if (url === null) return
  if (url === '') {
    editor.value.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }
  editor.value
    .chain()
    .focus()
    .extendMarkRange('link')
    .setLink({ href: url })
    .run()
}

const tools = computed(() => {
  const e = editor.value
  return [
    { key: 'bold',    icon: Bold,           label: 'Bold (⌘B)',         active: !!e?.isActive('bold'),                run: () => e?.chain().focus().toggleBold().run() },
    { key: 'italic',  icon: Italic,         label: 'Italic (⌘I)',       active: !!e?.isActive('italic'),              run: () => e?.chain().focus().toggleItalic().run() },
    { key: 'strike',  icon: Strikethrough,  label: 'Strikethrough',     active: !!e?.isActive('strike'),              run: () => e?.chain().focus().toggleStrike().run() },
    { key: 'code',    icon: Code,           label: 'Inline code',       active: !!e?.isActive('code'),                run: () => e?.chain().focus().toggleCode().run() },
    { key: 'sep1',    sep: true },
    { key: 'h1',      icon: Heading1,       label: 'Heading 1',         active: !!e?.isActive('heading', { level: 1 }), run: () => e?.chain().focus().toggleHeading({ level: 1 }).run() },
    { key: 'h2',      icon: Heading2,       label: 'Heading 2',         active: !!e?.isActive('heading', { level: 2 }), run: () => e?.chain().focus().toggleHeading({ level: 2 }).run() },
    { key: 'h3',      icon: Heading3,       label: 'Heading 3',         active: !!e?.isActive('heading', { level: 3 }), run: () => e?.chain().focus().toggleHeading({ level: 3 }).run() },
    { key: 'sep2',    sep: true },
    { key: 'ul',      icon: List,           label: 'Bullet list',       active: !!e?.isActive('bulletList'),          run: () => e?.chain().focus().toggleBulletList().run() },
    { key: 'ol',      icon: ListOrdered,    label: 'Numbered list',     active: !!e?.isActive('orderedList'),         run: () => e?.chain().focus().toggleOrderedList().run() },
    { key: 'task',    icon: ListChecks,     label: 'Checklist',         active: !!e?.isActive('taskList'),            run: () => e?.chain().focus().toggleTaskList().run() },
    { key: 'sep3',    sep: true },
    { key: 'quote',   icon: Quote,          label: 'Quote',             active: !!e?.isActive('blockquote'),          run: () => e?.chain().focus().toggleBlockquote().run() },
    { key: 'rule',    icon: Minus,          label: 'Divider',           active: false,                                run: () => e?.chain().focus().setHorizontalRule().run() },
    { key: 'link',    icon: LinkIcon,       label: 'Link (⌘K)',         active: !!e?.isActive('link'),                run: setLink },
  ]
})
</script>

<template>
  <div class="rt-wrap">
    <!-- Floating bubble menu — appears only when text is selected -->
    <BubbleMenu
      v-if="editor"
      :editor="editor"
      :options="{
        placement: 'top',
        offset: 8
      }"
      :should-show="
        ({ editor, view, from, to }) => {
          // Only show when there's a real text selection (not a cursor) and the
          // editor has focus. Hide inside code blocks (where bold/italic are
          // semantically irrelevant).
          if (!view.hasFocus()) return false
          if (from === to) return false
          if (editor.isActive('codeBlock')) return false
          return true
        }
      "
    >
      <div class="rt-bubble">
        <template v-for="tool in tools" :key="tool.key">
          <span v-if="tool.sep" class="rt-bubble-sep" aria-hidden="true" />
          <button
            v-else
            type="button"
            class="rt-bubble-btn"
            :class="tool.active && 'rt-bubble-btn-active'"
            :title="tool.label"
            :aria-label="tool.label"
            :aria-pressed="tool.active"
            @mousedown.prevent
            @click="tool.run"
          >
            <component :is="tool.icon" class="w-3.5 h-3.5" :stroke-width="1.75" />
          </button>
        </template>
      </div>
    </BubbleMenu>

    <!-- Editor surface — clean, no chrome until you select text -->
    <div class="rt-surface" :style="{ minHeight }">
      <EditorContent :editor="editor" />
    </div>
  </div>
</template>

<style>
/* Wrapper */
.rt-wrap {
  border: 1px solid var(--hc-divider);
  background: var(--hc-surface);
  border-radius: 12px;
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.rt-wrap:focus-within {
  border-color: var(--hc-accent);
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--hc-accent) 18%, transparent);
}

/* Floating bubble menu — appears on selection */
.rt-bubble {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  padding: 4px;
  background: var(--hc-ink);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(31, 27, 22, 0.18), 0 2px 6px rgba(31, 27, 22, 0.10);
  font-family: 'Inter Tight', 'DM Sans', sans-serif;
}
.rt-bubble-btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.72);
  transition: background 0.12s, color 0.12s;
}
.rt-bubble-btn:hover {
  background: rgba(255, 255, 255, 0.10);
  color: white;
}
.rt-bubble-btn-active {
  background: var(--hc-accent);
  color: white;
}
.rt-bubble-btn-active:hover {
  background: var(--hc-accent);
  color: white;
}
.rt-bubble-sep {
  display: inline-block;
  width: 1px;
  height: 18px;
  background: rgba(255, 255, 255, 0.14);
  margin: 0 3px;
}

/* Surface */
.rt-surface {
  padding: 12px 14px;
  font-size: 14px;
  line-height: 1.55;
  color: var(--hc-ink);
}
.rt-surface .ProseMirror {
  outline: none;
  min-height: inherit;
}

/* Prose */
.rt-prose p {
  margin: 0 0 0.5em 0;
}
.rt-prose p:last-child {
  margin-bottom: 0;
}
.rt-prose h1, .rt-prose h2, .rt-prose h3 {
  font-family: 'Fraunces', Georgia, serif;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.25;
  margin: 1.1em 0 0.4em;
  color: var(--hc-ink);
}
.rt-prose h1 { font-size: 1.45em; }
.rt-prose h2 { font-size: 1.2em; }
.rt-prose h3 { font-size: 1.05em; }
.rt-prose strong { font-weight: 600; color: var(--hc-ink); }
.rt-prose em { font-style: italic; }
.rt-prose s { text-decoration: line-through; color: var(--hc-ink-3); }
.rt-prose code {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 0.85em;
  background: var(--hc-hover);
  padding: 2px 5px;
  border-radius: 4px;
  color: var(--hc-ink-2);
}
.rt-prose pre {
  background: var(--hc-hover);
  padding: 10px 12px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 0.5em 0;
}
.rt-prose pre code {
  background: transparent;
  padding: 0;
}
.rt-prose blockquote {
  border-left: 3px solid var(--hc-accent-soft);
  padding-left: 12px;
  color: var(--hc-ink-3);
  margin: 0.6em 0;
  font-style: italic;
}
/* Re-enable list markers (Tailwind preflight strips them globally). */
.rt-prose ul {
  list-style: disc outside;
  padding-left: 1.4em;
  margin: 0.4em 0;
}
.rt-prose ul ul {
  list-style: circle outside;
}
.rt-prose ul ul ul {
  list-style: square outside;
}
.rt-prose ol {
  list-style: decimal outside;
  padding-left: 1.6em;
  margin: 0.4em 0;
}
.rt-prose ul li, .rt-prose ol li {
  margin: 0.15em 0;
  padding-left: 0.15em;
}
.rt-prose ul li::marker, .rt-prose ol li::marker {
  color: var(--hc-ink-3);
}
.rt-prose ul li p, .rt-prose ol li p {
  margin: 0;
}
.rt-prose hr {
  border: none;
  height: 1px;
  background: var(--hc-divider);
  margin: 1em 0;
}
.rt-prose a.rt-link, .rt-prose a {
  color: var(--hc-accent);
  text-decoration: underline;
  text-decoration-color: color-mix(in oklch, var(--hc-accent) 40%, transparent);
  text-underline-offset: 2px;
  cursor: pointer;
}
.rt-prose a:hover {
  text-decoration-color: var(--hc-accent);
}

/* Task lists (checklist) */
.rt-prose ul[data-type="taskList"] {
  list-style: none;
  padding-left: 0;
}
.rt-prose ul[data-type="taskList"] li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0.2em 0;
}
.rt-prose ul[data-type="taskList"] li > label {
  display: inline-flex;
  align-items: center;
  margin-top: 3px;
}
.rt-prose ul[data-type="taskList"] li > label input[type="checkbox"] {
  appearance: none;
  width: 14px;
  height: 14px;
  border: 1.5px solid var(--hc-ink-4);
  border-radius: 3px;
  cursor: pointer;
  flex-shrink: 0;
  position: relative;
  background: var(--hc-surface);
}
.rt-prose ul[data-type="taskList"] li > label input[type="checkbox"]:checked {
  background: var(--hc-accent);
  border-color: var(--hc-accent);
}
.rt-prose ul[data-type="taskList"] li > label input[type="checkbox"]:checked::after {
  content: '';
  position: absolute;
  left: 3px;
  top: 0px;
  width: 4px;
  height: 8px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
.rt-prose ul[data-type="taskList"] li[data-checked="true"] > div {
  color: var(--hc-ink-4);
  text-decoration: line-through;
}
.rt-prose ul[data-type="taskList"] li > div {
  flex: 1;
}

/* Placeholder */
.rt-prose p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: var(--hc-ink-4);
  pointer-events: none;
  height: 0;
}
</style>
