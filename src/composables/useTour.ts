// Cinematic first-run product tour engine.
//
// Walks the REAL workstation UI ("one request travels the hive": message ->
// task -> assign/subtask -> notify -> pipeline -> won) pointed at the seeded
// "Northstar (Demo)" client, so every screen is populated and fast — and it
// looks identical on a brand-new empty account. On start the tour switches to
// the demo workspace (loading its data); on finish it restores the user's
// previous client.
//
// Robustness contract: each step navigates a route, WAITS for its [data-tour]
// anchor, and falls back to a centered caption if the anchor never appears.
//
// Module-level singleton state (same pattern as useNotifications).
import { computed, ref, shallowRef } from 'vue'
import type { Router } from 'vue-router'
import { useClientsStore } from '@/stores/clients'
import { useProjectsStore } from '@/stores/projects'
import { useTasksStore } from '@/stores/tasks'
import { useStatusesStore } from '@/stores/statuses'
import { DEMO_CLIENT_ID } from '@/lib/tourDemo'

export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center'

export interface TourStep {
  /** stable id, handy for keys/debugging */
  id: string
  title: string
  body: string
  /** route NAME to navigate to before resolving this step (skipped if already there) */
  route?: string
  /** [data-tour="..."] selector to spotlight; omit (or let it not resolve) for a centered caption */
  selector?: string
  /** preferred popover side relative to the spotlight */
  placement?: TourPlacement
  /** extra px around the spotlight cut-out */
  padding?: number
  /** how long to wait for the anchor before falling back to a centered caption (ms) */
  timeout?: number
  /** side-effect before navigating/measuring (switch a view, open a drawer, …) */
  before?: () => void | Promise<void>
}

// One bump to re-show the tour to everyone after a meaningful change.
const SEEN_KEY = 'buzzybee.tour.cinematic.v1'
const PREV_CLIENT_KEY = 'buzzybee.tour.prev-client'

let steps: TourStep[] = []
let boundRouter: Router | null = null
// true only while the engine itself is navigating, so a route-abandon watch can
// tell tour-driven navigation apart from the user navigating away.
let internalNav = false
// the client selected before the tour took over, restored on finish
let prevClientId: string | null = null

const active = ref(false)
const index = ref(0)
const total = computed(() => steps.length)
// shallowRef: a DOMRect is replaced wholesale on every move, never mutated.
const targetRect = shallowRef<DOMRect | null>(null)
// true while navigating / waiting for an anchor — TourHost holds the popover
// and skips the backdrop dim until the rect settles (so loads aren't blacked out).
const resolving = ref(false)

const current = computed<TourStep | null>(() => (active.value ? steps[index.value] ?? null : null))

// ---- registration (called once from TourHost setup) -------------------------

export function bindTourRouter(r: Router) {
  boundRouter = r
}

export function registerTourSteps(s: TourStep[]) {
  steps = s
}

// ---- "seen" persistence -----------------------------------------------------

export function hasSeenTour(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    /* private mode / storage disabled — non-fatal, tour just re-shows */
  }
}

// ---- helpers ----------------------------------------------------------------

function nextFrame() {
  return new Promise<void>((r) => requestAnimationFrame(() => r()))
}

/**
 * Poll for an element until it exists AND has a non-zero box, then return it.
 * Resolves null on timeout so the caller can fall back to a centered caption.
 */
function waitForElement(selector: string, timeout = 4000): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const started = performance.now()
    const tick = () => {
      const el = document.querySelector<HTMLElement>(selector)
      if (el) {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) {
          resolve(el)
          return
        }
      }
      if (performance.now() - started > timeout) {
        resolve(null)
        return
      }
      requestAnimationFrame(tick)
    }
    tick()
  })
}

/**
 * Resolve once an element's box has been stable for a few frames (or a hard
 * cap), so we measure the SETTLED position after a slide-in / smooth scroll.
 */
function waitForStableRect(el: HTMLElement, timeout = 1000): Promise<DOMRect> {
  return new Promise((resolve) => {
    const started = performance.now()
    let prev = el.getBoundingClientRect()
    let stableFrames = 0
    const tick = () => {
      const r = el.getBoundingClientRect()
      const settled =
        Math.abs(r.top - prev.top) < 0.5 &&
        Math.abs(r.left - prev.left) < 0.5 &&
        Math.abs(r.width - prev.width) < 0.5 &&
        Math.abs(r.height - prev.height) < 0.5
      stableFrames = settled ? stableFrames + 1 : 0
      prev = r
      if (stableFrames >= 3 || performance.now() - started > timeout) {
        resolve(r)
        return
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

// ---- step machine -----------------------------------------------------------

async function enter(i: number) {
  index.value = i
  const step = steps[i]
  if (!step) return

  internalNav = true
  resolving.value = true
  targetRect.value = null
  try {
    if (step.before) {
      try {
        await step.before()
      } catch (e) {
        console.warn('[tour] before() hook failed for step', step.id, e)
      }
    }

    if (step.route && boundRouter && boundRouter.currentRoute.value.name !== step.route) {
      try {
        await boundRouter.push({ name: step.route })
      } catch (e) {
        console.warn('[tour] navigation failed for step', step.id, e)
      }
    }

    // Let the destination view paint before we go looking for the anchor.
    await nextFrame()
    await nextFrame()

    if (step.selector) {
      const el = await waitForElement(step.selector, step.timeout)
      if (el) {
        el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
        targetRect.value = await waitForStableRect(el)
      } else {
        targetRect.value = null // centered fallback
      }
    }
  } finally {
    resolving.value = false
    internalNav = false
  }
}

/** True while the engine is navigating between steps (vs. the user navigating away). */
export function isTourNavigating() {
  return internalNav
}

/** Re-read the current step's anchor (on resize) without re-running the step. */
export function remeasure() {
  const step = current.value
  if (!step?.selector) return
  const el = document.querySelector<HTMLElement>(step.selector)
  if (el) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) targetRect.value = r
  }
}

// ---- enter/leave the demo workspace ----------------------------------------

async function enterDemoWorkspace() {
  const clients = useClientsStore()
  const projects = useProjectsStore()
  const tasks = useTasksStore()
  const statuses = useStatusesStore()
  // Remember the real client only if we're not already in the demo (a double
  // start must not overwrite it), and persist it so a reload mid-tour recovers.
  if (clients.currentClientId !== DEMO_CLIENT_ID) {
    prevClientId = clients.currentClientId
    try {
      localStorage.setItem(PREV_CLIENT_KEY, prevClientId ?? '')
    } catch {
      /* ignore */
    }
  }
  // Make sure the (possibly just-seeded) demo client + its data are loaded this
  // session, then select it. allSettled so one slow fetch can't block the tour.
  try {
    await clients.fetchMine()
  } catch (e) {
    console.warn('[tour] fetchMine failed', e)
  }
  clients.setCurrentClient(DEMO_CLIENT_ID)
  await Promise.allSettled([projects.fetchAll(), tasks.fetchAll(), statuses.fetchAll()])
}

function restorePreviousWorkspace() {
  // Prefer the in-memory value; fall back to the persisted marker (e.g. after a
  // reload mid-tour, when module state is gone). Empty string means "was null".
  let target = prevClientId
  let had = prevClientId !== null
  if (!had) {
    let stored: string | null = null
    try {
      stored = localStorage.getItem(PREV_CLIENT_KEY)
    } catch {
      /* ignore */
    }
    if (stored !== null) {
      target = stored === '' ? null : stored
      had = true
    }
  }
  if (had) {
    try {
      useClientsStore().setCurrentClient(target)
    } catch (e) {
      console.warn('[tour] restore client failed', e)
    }
  }
  prevClientId = null
  try {
    localStorage.removeItem(PREV_CLIENT_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Called on app load: if a prior tour didn't exit cleanly (reload/close
 * mid-tour), the demo client is still selected and our marker lingers — put the
 * user back on their real workspace.
 */
export function recoverInterruptedTour() {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(PREV_CLIENT_KEY)
  } catch {
    /* ignore */
  }
  if (stored !== null) restorePreviousWorkspace()
}

// ---- public controls --------------------------------------------------------

export async function startTour() {
  if (!steps.length || active.value) return
  // Shown once: whether they finish or abandon, don't auto-nag again (the topbar
  // button still replays on demand). Marking at start also prevents a reload
  // mid-tour from re-triggering the auto-start.
  markSeen()
  await enterDemoWorkspace()
  active.value = true
  await enter(0)
}

export async function nextStep() {
  if (!active.value) return
  if (index.value >= steps.length - 1) {
    finishTour()
    return
  }
  await enter(index.value + 1)
}

export async function prevStep() {
  if (!active.value || index.value <= 0) return
  await enter(index.value - 1)
}

export function skipTour() {
  finishTour()
}

export function finishTour() {
  active.value = false
  targetRect.value = null
  index.value = 0
  // close any drawer the tour opened, then hand the workspace back
  try {
    useTasksStore().selectTask(null)
  } catch {
    /* store not ready — ignore */
  }
  restorePreviousWorkspace()
  markSeen()
}

/** First-run auto-start: only if the steps are registered and it hasn't been seen. */
export async function maybeAutoStartTour() {
  if (hasSeenTour() || !steps.length) return
  await startTour()
}

export function useTour() {
  return {
    active,
    current,
    index,
    total,
    targetRect,
    resolving,
    startTour,
    nextStep,
    prevStep,
    skipTour,
    finishTour,
    hasSeenTour,
    maybeAutoStartTour,
    remeasure,
  }
}
