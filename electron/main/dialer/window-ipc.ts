import { ipcMain, BrowserWindow } from 'electron'
import { DIALER_WINDOW_IPC } from '../../shared/ipc-channels-dialer'
import { getDialerWindow, showDialer } from '../windows'
import {
  generateSignalWireJWT,
  getFromNumber,
  createOutboundCall,
  getCallInfo,
  hangupCall,
  getSipCredentials,
} from './signalwire-service'

// Registers IPC handlers for the floating dialer window.
// Wire-up: called once from main/index.ts on app ready.

export function registerDialerWindowIpc(): void {
  ipcMain.handle(DIALER_WINDOW_IPC.WINDOW_SHOW, () => {
    showDialer()
  })

  ipcMain.handle(DIALER_WINDOW_IPC.WINDOW_HIDE, () => {
    const win = getDialerWindow()
    if (win && !win.isDestroyed()) win.hide()
  })

  ipcMain.handle(DIALER_WINDOW_IPC.WINDOW_MINIMIZE, () => {
    const win = getDialerWindow()
    if (win && !win.isDestroyed()) win.minimize()
  })

  ipcMain.handle(DIALER_WINDOW_IPC.WINDOW_SET_ALWAYS_ON_TOP, (_e, on: boolean) => {
    const win = getDialerWindow()
    if (win && !win.isDestroyed()) win.setAlwaysOnTop(!!on)
  })

  ipcMain.handle(DIALER_WINDOW_IPC.SIGNALWIRE_GET_JWT, async () => {
    return generateSignalWireJWT('hivemind-dialer')
  })

  ipcMain.handle(DIALER_WINDOW_IPC.SIGNALWIRE_GET_FROM, () => {
    return getFromNumber()
  })

  ipcMain.handle(DIALER_WINDOW_IPC.SIGNALWIRE_CREATE_CALL, async (_e, toLeadE164: string) => {
    if (typeof toLeadE164 !== 'string' || toLeadE164.length < 5) {
      return { error: 'Invalid lead number' }
    }
    return createOutboundCall(toLeadE164)
  })

  ipcMain.handle(DIALER_WINDOW_IPC.SIGNALWIRE_GET_CALL, async (_e, sid: string) => {
    if (typeof sid !== 'string' || !sid) return { error: 'Missing sid' }
    return getCallInfo(sid)
  })

  ipcMain.handle(DIALER_WINDOW_IPC.SIGNALWIRE_HANGUP, async (_e, sid: string) => {
    if (typeof sid !== 'string' || !sid) return { error: 'Missing sid' }
    return hangupCall(sid)
  })

  ipcMain.handle(DIALER_WINDOW_IPC.SIGNALWIRE_GET_SIP_CREDS, () => {
    return getSipCredentials()
  })
}

// Convenience helper if you want to broadcast to the dialer window from main:
export function sendToDialer(channel: string, payload: unknown): void {
  const win = getDialerWindow()
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

// Re-export so callers can `import { BrowserWindow } from 'electron'` if needed.
export type { BrowserWindow }
