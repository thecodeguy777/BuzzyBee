import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type { TranscriptChunk, CoachingPromptData } from '../shared/ipc-channels'

contextBridge.exposeInMainWorld('electronAPI', {
  onTranscriptLine: (cb: (data: TranscriptChunk) => void) => {
    ipcRenderer.removeAllListeners(IPC.OVERLAY_TRANSCRIPT)
    ipcRenderer.on(IPC.OVERLAY_TRANSCRIPT, (_e, data) => cb(data))
  },
  onCoachingPrompt: (cb: (data: CoachingPromptData) => void) => {
    ipcRenderer.removeAllListeners(IPC.OVERLAY_COACHING)
    ipcRenderer.on(IPC.OVERLAY_COACHING, (_e, data) => cb(data))
  },
  onMeetingStatus: (cb: (data: { status: 'active' | 'ended' }) => void) => {
    ipcRenderer.removeAllListeners(IPC.OVERLAY_STATUS)
    ipcRenderer.on(IPC.OVERLAY_STATUS, (_e, data) => cb(data))
  },
})
