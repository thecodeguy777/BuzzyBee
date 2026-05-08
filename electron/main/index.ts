import { app, BrowserWindow } from 'electron'
import { createControlWindow } from './windows'
import { registerIpcHandlers } from './ipc-handlers'

app.whenReady().then(() => {
  registerIpcHandlers()
  createControlWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createControlWindow()
    }
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
