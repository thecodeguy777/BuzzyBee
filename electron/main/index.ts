// Load env vars from electron/.env (SignalWire credentials etc.).
// Resolved at runtime relative to the compiled main entry: dist-main/main/index.js
// → ../../  is the electron/ root, where .env lives.
import * as dotenv from 'dotenv'
import * as path from 'path'
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') })

import { app, BrowserWindow, globalShortcut } from 'electron'
import { createControlWindow, toggleDialer } from './windows'
import { registerIpcHandlers } from './ipc-handlers'
import { registerDialerWindowIpc } from './dialer/window-ipc'
import { registerSupabaseBridge } from './supabase-bridge'

app.whenReady().then(() => {
  registerIpcHandlers()
  registerDialerWindowIpc()
  registerSupabaseBridge()
  createControlWindow()

  // Global hotkey: Ctrl+Shift+D summons / hides the floating dialer.
  // (Mac Cmd+Shift+D works automatically thanks to the CommandOrControl alias.)
  globalShortcut.register('CommandOrControl+Shift+D', () => {
    toggleDialer()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createControlWindow()
    }
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  app.quit()
})
