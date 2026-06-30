// The cinematic first-run tour: "one request travels the hive."
//
// message (Comms) -> tracked work (Tasks) -> assign & discuss -> notify ->
// pipeline -> won (CRM). Each step navigates a REAL route and spotlights a
// real [data-tour] anchor; the tour runs over the seeded "Northstar (Demo)"
// workspace (see useTour.startTour) so every screen is populated. If an anchor
// can't be found the engine shows the same caption centered, so it never breaks.
//
// View modes are component-local refs that read localStorage on mount, and the
// app re-mounts views on navigation, so writing the key before we navigate is
// enough to land on the right view.
import type { TourStep } from '@/composables/useTour'
import { useTasksStore } from '@/stores/tasks'
import { DEMO_SHOWCASE_TASK_ID } from '@/lib/tourDemo'

function setLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode — non-fatal, the view keeps its current mode */
  }
}

export const cinematicTourSteps: TourStep[] = [
  {
    id: 'welcome',
    route: 'workstation-comms',
    title: 'Watch one request travel the hive',
    body: 'In about a minute you’ll see how a single message becomes tracked work, gets assigned, and turns into a won deal — all in one place. Use Next, or press → to move along.',
    placement: 'center',
  },
  {
    id: 'comms-message',
    route: 'workstation-comms',
    selector: '[data-tour="comms-message"]',
    title: 'It starts as a message',
    body: 'Every request lands here in Comms — a note from a client, a teammate, or a channel. This is where the work begins.',
    placement: 'bottom',
    timeout: 6000,
  },
  {
    id: 'comms-make-task',
    route: 'workstation-comms',
    // The "Task" action is revealed on hover over the message, so we spotlight
    // the message itself and explain the action.
    selector: '[data-tour="comms-message"]',
    title: 'Turn it into tracked work',
    body: 'Hover any message and hit Task — or type /task in the composer — and it becomes a tracked task linked right back to this conversation. Nothing gets lost in the scroll.',
    placement: 'bottom',
    timeout: 6000,
  },
  {
    id: 'tasks-board',
    route: 'workstation-tasks',
    selector: '[data-tour="task-board"]',
    title: 'Now it’s coordinated work',
    body: 'The request becomes a card on the board. Drag it across columns as it moves — to do, in progress, done — and everyone sees it move in real time.',
    placement: 'bottom',
    timeout: 5000,
    before: () => setLocal('buzzybee.workstation.tasks-view', 'board'),
  },
  {
    id: 'tasks-drawer',
    route: 'workstation-tasks',
    selector: '[data-tour="task-drawer"]',
    title: 'Assign it, break it down, talk it out',
    body: 'Open a task to add the people on it, split it into subtasks, and discuss inline — every assignment and @mention pings the right person instantly.',
    placement: 'left',
    timeout: 5000,
    before: () => useTasksStore().selectTask(DEMO_SHOWCASE_TASK_ID),
  },
  {
    id: 'notif-bell',
    route: 'workstation-tasks',
    selector: '[data-tour="notif-bell"]',
    title: 'Nothing happens in the dark',
    body: 'Every handoff, comment, and mention shows up here — with a toast and a chime — so your team always knows what just moved and who owns it.',
    placement: 'bottom',
    // close the drawer so the bell isn't behind the open panel
    before: () => useTasksStore().selectTask(null),
  },
  {
    id: 'crm-pipeline',
    route: 'workstation-crm',
    selector: '[data-tour="crm-pipeline"]',
    title: 'It turns into revenue',
    body: 'The same hive runs your pipeline. Deals sit in stages you can drag across — and it scales to your entire book of leads.',
    placement: 'bottom',
    timeout: 6000,
    before: () => {
      setLocal('crm.view', 'pipeline')
      setLocal('crm.pipelineMode', 'board')
    },
  },
  {
    id: 'crm-win',
    route: 'workstation-crm',
    selector: '[data-tour="crm-deal"]',
    title: 'Drag to Won — loop closed',
    body: 'Move a deal to Won and the whole journey — message, task, handoff, close — lived in one system. That’s BuzzyHive. You’re ready to fly. 🐝',
    placement: 'right',
    timeout: 6000,
  },
]
