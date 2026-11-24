import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  MaterialCandidate,
  Orientation,
  ProviderTestResult,
  RenderConfig,
  RenderProgress,
  RenderResult,
  ScriptDoc,
  TTSProviderId,
  ProjectRecord,
  ProjectSummary
} from '@shared/types'

function mediaUrl(filePath: string): string {
  if (!filePath) return ''
  if (/^(https?|data|blob):/i.test(filePath)) return filePath
  const encoded = Buffer.from(filePath, 'utf8').toString('base64url')
  return 'crfile://media/' + encodeURIComponent(encoded)
}

const api = {
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke('settings:save', patch),
    testLLM: (): Promise<ProviderTestResult> => ipcRenderer.invoke('llm:test'),
  testTTS: (): Promise<ProviderTestResult> => ipcRenderer.invoke('tts:test'),
  generateScript: (req: {
    topic: string
    style: string
    styleId: string
    language: string
    chars: number
  }): Promise<ScriptDoc> => ipcRenderer.invoke('script:generate', req),
  synthesizeLine: (input: {
    projectId: string
    text: string
    voice: string
    provider: TTSProviderId
    speed: number
  }): Promise<{ path: string; duration: number }> => ipcRenderer.invoke('tts:line', input),
  previewVoice: (input: {
    text: string
    voice: string
    provider: TTSProviderId
    speed: number
  }): Promise<{ path: string }> => ipcRenderer.invoke('tts:preview', input),
  searchMaterials: (req: {
    query: string
    count?: number
    page?: number
    orientation?: Orientation
  }): Promise<MaterialCandidate[]> => ipcRenderer.invoke('materials:search', req),
  listLocalMaterials: (dir?: string): Promise<MaterialCandidate[]> => ipcRenderer.invoke('materials:local', dir),
  ensureMaterial: (projectId: string, candidate: MaterialCandidate): Promise<{ path: string }> =>
    ipcRenderer.invoke('materials:ensure', { projectId, candidate }),
  projectsList: (): Promise<ProjectSummary[]> => ipcRenderer.invoke('projects:list'),
  projectLoad: (id: string): Promise<ProjectRecord | null> => ipcRenderer.invoke('projects:load', id),
  projectSave: (input: {
    id: string
    title: string
    topic: string
    createdAt: number
    updatedAt: number
    draft: any
  }): Promise<ProjectSummary | null> => ipcRenderer.invoke('projects:save', input),
  projectDelete: (id: string): Promise<boolean> => ipcRenderer.invoke('projects:delete', id),
  projectReveal: (id: string): Promise<void> => ipcRenderer.invoke('projects:reveal', id),
  pickFolder: (title?: string, defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:pickFolder', title, defaultPath),
  pickFile: (filters?: { name: string; extensions: string[] }[], defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:pickFile', filters, defaultPath),
  startRender: (cfg: RenderConfig): Promise<RenderResult> => ipcRenderer.invoke('render:start', cfg),
  cancelRender: (jobId?: string): Promise<void> => ipcRenderer.invoke('render:cancel', jobId),
  onRenderProgress: (cb: (p: RenderProgress) => void): (() => void) => {
    const listener = (_e: unknown, p: RenderProgress): void => cb(p)
    ipcRenderer.on('render:progress', listener)
    return () => ipcRenderer.removeListener('render:progress', listener)
  },
  reveal: (p: string): Promise<void> => ipcRenderer.invoke('shell:reveal', p),
  openPath: (p: string): Promise<void> => ipcRenderer.invoke('shell:openPath', p),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
  appInfo: (): Promise<{ version: string; dataDir: string; projectsDir: string; ffmpeg: { ok: boolean; path: string; version: string } }> =>
    ipcRenderer.invoke('app:info'),
  mediaUrl
}

export type CloudReelApi = typeof api

contextBridge.exposeInMainWorld('cloudreel', api)