import { BrowserWindow, screen } from 'electron'
import { getRendererPath, getPreloadPath } from './env'

let controlWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null

export function getControlWindow(): BrowserWindow | null {
  return controlWindow
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow
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
    title: 'HiveMind AI',
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
