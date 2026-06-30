import { BrowserWindow, screen } from 'electron'
import Store from 'electron-store'
import { getRendererPath, getPreloadPath } from './env'

// Bind reliable zoom shortcuts on a window:
//   Ctrl/Cmd + (=, +, NumpadAdd) → zoom in
//   Ctrl/Cmd + (-, NumpadSubtract) → zoom out
//   Ctrl/Cmd + 0 → reset
// Handles cases the default menu accelerators miss (frameless windows,
// non-US keyboards where Ctrl+= is captured weirdly).
const ZOOM_STEP = 0.5
const ZOOM_MIN = -3
const ZOOM_MAX = 5
function bindZoomShortcuts(win: BrowserWindow): void {
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const mod = input.control || input.meta
    if (!mod) return
    const key = input.key

    if (key === '=' || key === '+' || key === 'Add') {
      event.preventDefault()
      const z = win.webContents.getZoomLevel()
      win.webContents.setZoomLevel(Math.min(z + ZOOM_STEP, ZOOM_MAX))
    } else if (key === '-' || key === 'Subtract') {
      event.preventDefault()
      const z = win.webContents.getZoomLevel()
      win.webContents.setZoomLevel(Math.max(z - ZOOM_STEP, ZOOM_MIN))
    } else if (key === '0') {
      event.preventDefault()
      win.webContents.setZoomLevel(0)
    }
  })
}

let controlWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let dialerWindow: BrowserWindow | null = null

const windowStore = new Store({ name: 'window-positions' })

export function getControlWindow(): BrowserWindow | null {
  return controlWindow
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow
}

export function getDialerWindow(): BrowserWindow | null {
  return dialerWindow
}

export function createControlWindow(): BrowserWindow {
  const preloadPath = getPreloadPath('control')
  console.log('[Main] Preload path:', preloadPath)
  console.log('[Main] Preload exists:', require('fs').existsSync(preloadPath))

  controlWindow = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 700,
    minHeight: 500,
    title: 'BuzzyHive AI',
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Open DevTools automatically in dev for easier debugging
  if (process.argv.includes('--dev')) {
    controlWindow.webContents.openDevTools({ mode: 'detach' })
  }

  controlWindow.loadURL(getRendererPath('index.html'))
  bindZoomShortcuts(controlWindow)

  controlWindow.on('closed', () => {
    controlWindow = null
    // Close overlay when control window closes
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.close()
    }
  })

  return controlWindow
}

export function createOverlayWindow(): BrowserWindow {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize

  overlayWindow = new BrowserWindow({
    width: 420,
    height: 500,
    x: screenWidth - 440,
    y: screenHeight - 520,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: getPreloadPath('overlay'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  overlayWindow.loadURL(getRendererPath('overlay.html'))
  bindZoomShortcuts(overlayWindow)

  // Make the body click-through, but keep the header draggable
  overlayWindow.setIgnoreMouseEvents(false)

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  return overlayWindow
}

export function toggleOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    if (overlayWindow.isVisible()) {
      overlayWindow.hide()
    } else {
      overlayWindow.show()
    }
  } else {
    createOverlayWindow()
  }
}

// ── Floating Dialer Window ──

const DIALER_DEFAULT_WIDTH = 380
const DIALER_DEFAULT_HEIGHT = 640

export function createDialerWindow(): BrowserWindow {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize

  // Restore saved position; fall back to bottom-right.
  const saved = windowStore.get('dialer') as { x: number; y: number; width: number; height: number } | undefined
  const bounds = saved ?? {
    x: screenWidth - DIALER_DEFAULT_WIDTH - 24,
    y: screenHeight - DIALER_DEFAULT_HEIGHT - 24,
    width: DIALER_DEFAULT_WIDTH,
    height: DIALER_DEFAULT_HEIGHT,
  }

  dialerWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 300,
    minHeight: 480,
    maxWidth: 460,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    title: 'BuzzyHive Dialer',
    webPreferences: {
      preload: getPreloadPath('dialer'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  dialerWindow.loadURL(getRendererPath('dialer.html'))
  bindZoomShortcuts(dialerWindow)

  // Persist position/size on move + resize
  const persist = () => {
    if (!dialerWindow || dialerWindow.isDestroyed()) return
    const [x, y] = dialerWindow.getPosition()
    const [width, height] = dialerWindow.getSize()
    windowStore.set('dialer', { x, y, width, height })
  }
  dialerWindow.on('moved', persist)
  dialerWindow.on('resized', persist)

  dialerWindow.on('closed', () => {
    dialerWindow = null
  })

  return dialerWindow
}

export function toggleDialer(): void {
  if (dialerWindow && !dialerWindow.isDestroyed()) {
    if (dialerWindow.isVisible()) {
      dialerWindow.hide()
    } else {
      dialerWindow.show()
      dialerWindow.focus()
    }
  } else {
    createDialerWindow()
  }
}

export function showDialer(): void {
  if (dialerWindow && !dialerWindow.isDestroyed()) {
    dialerWindow.show()
    dialerWindow.focus()
  } else {
    createDialerWindow()
  }
}
