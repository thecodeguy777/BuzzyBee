import { ref, watch } from 'vue'

// Shared, persisted preference: when ON, the huddle's shared screen shows in the
// floating dock (HuddleScreenDock) even on the Comms page, so the chat area is
// free to type in. CommsView (the "Pop out" / "Bring back" buttons) and
// HuddleScreenDock (its visibility) both read this single ref.
const KEY = 'buzzybee.huddle.screen-popout'

function load(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export const screenPoppedOut = ref(load())

watch(screenPoppedOut, (v) => {
  try {
    localStorage.setItem(KEY, v ? '1' : '0')
  } catch {
    /* ignore */
  }
})
