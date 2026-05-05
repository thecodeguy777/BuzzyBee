/**
 * Lightweight runtime diagnostics: capture recent console errors and route
 * navigations so they can be attached to a beta ticket.
 *
 * Singleton ring buffers — kept small (last 20 entries each).
 */

interface ConsoleEntry {
  ts: string
  level: 'error' | 'warn'
  message: string
}
interface RouteEntry {
  ts: string
  path: string
}

const MAX = 20

const consoleLog: ConsoleEntry[] = []
const routeLog: RouteEntry[] = []

function pushConsole(level: ConsoleEntry['level'], args: any[]) {
  try {
    const message = args
      .map((a) => {
        if (a instanceof Error) return `${a.name}: ${a.message}`
        if (typeof a === 'object') {
          try {
            return JSON.stringify(a).slice(0, 500)
          } catch {
            return String(a)
          }
        }
        return String(a)
      })
      .join(' ')
      .slice(0, 1000)
    consoleLog.push({ ts: new Date().toISOString(), level, message })
    if (consoleLog.length > MAX) consoleLog.shift()
  } catch {
    /* never let diagnostics throw */
  }
}

let installed = false
export function installDiagnostics() {
  if (installed || typeof window === 'undefined') return
  installed = true

  // Wrap console.error / console.warn
  const origErr = console.error.bind(console)
  const origWarn = console.warn.bind(console)
  console.error = (...args) => {
    pushConsole('error', args)
    origErr(...args)
  }
  console.warn = (...args) => {
    pushConsole('warn', args)
    origWarn(...args)
  }

  window.addEventListener('error', (e) => {
    pushConsole('error', [`${e.message}${e.filename ? ' @ ' + e.filename + ':' + e.lineno : ''}`])
  })
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const reason = e.reason
    pushConsole('error', ['Unhandled rejection:', reason instanceof Error ? reason.message : String(reason)])
  })
}

export function recordRoute(path: string) {
  routeLog.push({ ts: new Date().toISOString(), path })
  if (routeLog.length > MAX) routeLog.shift()
}

export function snapshotDiagnostics() {
  return {
    console: [...consoleLog],
    routes: [...routeLog],
    viewport:
      typeof window === 'undefined'
        ? null
        : `${window.innerWidth}x${window.innerHeight}`,
    user_agent: typeof navigator === 'undefined' ? null : navigator.userAgent,
    page_url: typeof window === 'undefined' ? null : window.location.pathname + window.location.search,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    timestamp: new Date().toISOString()
  }
}
