import { contextBridge, ipcRenderer } from 'electron'
import { DIALER_WINDOW_IPC } from '../shared/ipc-channels-dialer'
import { SUPABASE_IPC, type SupabaseTokens } from '../shared/ipc-channels-supabase'

// Floating dialer window preload.
// Kept lightweight on purpose — the main app's preload (control.ts) handles
// auth/meeting/etc. The dialer window only needs window-control IPC and
// (later) the carrier token + call-log methods.

contextBridge.exposeInMainWorld('dialerAPI', {
  window: {
    show: () => ipcRenderer.invoke(DIALER_WINDOW_IPC.WINDOW_SHOW),
    hide: () => ipcRenderer.invoke(DIALER_WINDOW_IPC.WINDOW_HIDE),
    minimize: () => ipcRenderer.invoke(DIALER_WINDOW_IPC.WINDOW_MINIMIZE),
    setAlwaysOnTop: (on: boolean) =>
      ipcRenderer.invoke(DIALER_WINDOW_IPC.WINDOW_SET_ALWAYS_ON_TOP, on),
  },
  supabase: {
    getConfig: () => ipcRenderer.invoke(SUPABASE_IPC.GET_CONFIG),
    getTokens: () => ipcRenderer.invoke(SUPABASE_IPC.GET_TOKENS),
    onTokensChanged: (cb: (tokens: SupabaseTokens | null) => void) => {
      ipcRenderer.removeAllListeners(SUPABASE_IPC.TOKENS_CHANGED)
      ipcRenderer.on(SUPABASE_IPC.TOKENS_CHANGED, (_e, tokens) => cb(tokens))
    },
  },
  signalwire: {
    getJWT: () => ipcRenderer.invoke(DIALER_WINDOW_IPC.SIGNALWIRE_GET_JWT),
    getFromNumber: () => ipcRenderer.invoke(DIALER_WINDOW_IPC.SIGNALWIRE_GET_FROM),
    createCall: (toLeadE164: string) =>
      ipcRenderer.invoke(DIALER_WINDOW_IPC.SIGNALWIRE_CREATE_CALL, toLeadE164),
    getCall: (sid: string) =>
      ipcRenderer.invoke(DIALER_WINDOW_IPC.SIGNALWIRE_GET_CALL, sid),
    hangup: (sid: string) =>
      ipcRenderer.invoke(DIALER_WINDOW_IPC.SIGNALWIRE_HANGUP, sid),
    getSipCreds: () =>
      ipcRenderer.invoke(DIALER_WINDOW_IPC.SIGNALWIRE_GET_SIP_CREDS),
  },
})
