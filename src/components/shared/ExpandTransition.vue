<script setup lang="ts">
// Smoothly animates a single child's height on enter/leave (e.g. an expanding
// list or inline panel). Pairs with the `.expand-*` classes in style.css.
// Sets an explicit pixel height for the transition, then clears it to `auto`
// so content can reflow freely once expanded. Reduced-motion is handled
// globally by the transition-duration guard in style.css.

function enter(el: Element) {
  const e = el as HTMLElement
  e.style.height = 'auto'
  const target = e.scrollHeight
  e.style.height = '0px'
  // Force reflow so the browser registers the starting height.
  void e.offsetHeight
  e.style.height = `${target}px`
}

function afterEnter(el: Element) {
  ;(el as HTMLElement).style.height = 'auto'
}

function leave(el: Element) {
  const e = el as HTMLElement
  e.style.height = `${e.scrollHeight}px`
  void e.offsetHeight
  e.style.height = '0px'
}
</script>

<template>
  <Transition name="expand" @enter="enter" @after-enter="afterEnter" @leave="leave">
    <slot />
  </Transition>
</template>
