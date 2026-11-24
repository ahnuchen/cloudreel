import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import path from 'path'
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
import { dataDir, loadSettings, projectsDir, saveSettings } from './settings'
import { testLLM } from './providers/llm'
import { synthesize, testTTS } from './providers/tts'
import { listLocalMaterials, searchMaterials, downloadMaterial } from './providers/stock'
import { generateScript, type ScriptRequest } from './pipeline/script'
import { ensureLineAudio, projectDir, renderProject } from './pipeline/render'
import { ffmpegStatus } from './ffmpeg'
import { deleteProject, listProjects, loadProject, recordRenderOutput, saveProject } from './projects'

const jobs = new Map<string, AbortController>()

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('settings:get', (): AppSettings => loadSettings())
  ipcMain.handle('settings:save', (_e, patch: Partial<AppSettings>): AppSettings => saveSettings(patch))

  
  ipcMain.handle('llm:test', async (): Promise<ProviderTestResult> => testLLM(loadSettings().llm))
  ipcMain.handle('tts:test', async (): Promise<ProviderTestResult> => testTTS(loadSettings()))

  ipcMain.handle('script:generate', async (_e, req: ScriptRequest): Promise<ScriptDoc> => {
    return generateScript(loadSettings(), req)
  })

  ipcMain.handle(
    'tts:line',
    async (
      _e,
      input: { projectId: string; text: string; voice: string; provider: TTSProviderId; speed: number }
    ): Promise<{ path: string; duration: number }> => {
      const settings = loadSettings()
      const dir = projectDir(input.projectId)
      const audio = await ensureLineAudio(settings, dir, { text: input.text }, {
        provider: input.provider,
        voice: input.voice,
        speed: input.speed
      })
      return { path: audio.mp3, duration: audio.duration }
    }
  )

  ipcMain.handle(
    'tts:preview',
    async (_e, input: { text: string; voice: string; provider: TTSProviderId; speed: number }): Promise<{ path: string }> => {
      const settings = loadSettings()
      const out = path.join(projectsDir(), 'preview', `voice-${Date.now()}.mp3`)
      mkdirSync(path.dirname(out), { recursive: true })
      await synthesize(settings, {
        text: input.text || '你好，我是你的短视频配音，这是一段试听。',
        voice: input.voice,
        speed: input.speed,
        provider: input.provider,
        outFile: out
      })
      return { path: out }
    }
  )

  ipcMain.handle(
    'materials:search',
    async (
      _e,
      req: { query: string; count?: number; page?: number; orientation?: Orientation }
    ): Promise<MaterialCandidate[]> => {
      return searchMaterials(loadSettings(), req)
    }
  )
  ipcMain.handle('materials:local', async (_e, dir?: string): Promise<MaterialCandidate[]> => {
    const settings = loadSettings()
    return listLocalMaterials(dir || settings.stock.localDir)
  })
  ipcMain.handle(
    'materials:ensure',
    async (_e, input: { projectId: string; candidate: MaterialCandidate }): Promise<{ path: string }> => {
      const res = await downloadMaterial(input.projectId, input.candidate)
      return { path: res.path }
    }
  )

  ipcMain.handle('projects:list', (): ProjectSummary[] => listProjects())
  ipcMain.handle('projects:load', (_e, id: string): ProjectRecord | null => loadProject(id))
  ipcMain.handle(
    'projects:save',
    (
      _e,
      input: { id: string; title: string; topic: string; createdAt: number; updatedAt: number; draft: any }
    ): ProjectSummary | null => saveProject(input)
  )
  ipcMain.handle('projects:delete', (_e, id: string): boolean => deleteProject(id))
  ipcMain.handle('projects:reveal', async (_e, id: string): Promise<void> => {
    if (!/^[a-zA-Z0-9-]+$/.test(id)) return
    const dir = path.join(projectsDir(), id)
    if (existsSync(dir)) await shell.openPath(dir)
  })

  ipcMain.handle('dialog:pickFolder', async (_e, title?: string, defaultPath?: string): Promise<string | null> => {
    const win = getWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: title || '选择文件夹',
      defaultPath,
      properties: ['openDirectory', 'createDirectory']
    })
    return res.canceled ? null : res.filePaths[0]
  })
  ipcMain.handle(
    'dialog:pickFile',
    async (_e, filters?: { name: string; extensions: string[] }[], defaultPath?: string): Promise<string | null> => {
      const win = getWindow()
      const res = await dialog.showOpenDialog(win!, {
        title: '选择文件',
        defaultPath,
        filters,
        properties: ['openFile']
      })
      return res.canceled ? null : res.filePaths[0]
    }
  )

  ipcMain.handle('render:start', async (event, cfg: RenderConfig): Promise<RenderResult> => {
    const jobId = cfg.projectId + '-' + Date.now()
    const controller = new AbortController()
    jobs.set(jobId, controller)
    const settings = loadSettings()
    try {
      const result = await renderProject(cfg, {
        jobId,
        settings,
        signal: controller.signal,
        emit: (p: RenderProgress) => {
          if (!event.sender.isDestroyed()) event.sender.send('render:progress', p)
        }
      })
      await recordRenderOutput(cfg.projectId, { path: result.videoPath, duration: result.duration }).catch(() => undefined)
      return { ok: true, videoPath: result.videoPath, duration: result.duration }
    } catch (e: any) {
      if (e?.code === 'CANCELLED' || controller.signal.aborted) {
        return { ok: false, cancelled: true, error: '已取消' }
      }
      const msg = e?.message || String(e)
      if (/allocate memory|malloc|out of memory/i.test(msg)) {
        return {
          ok: false,
          error: '系统可用内存不足，渲染中断。请关闭其他占用内存的程序后重试；字幕、配音和素材缓存都已保留。'
        }
      }
      return { ok: false, error: msg }
    } finally {
      jobs.delete(jobId)
    }
  })

  ipcMain.handle('render:cancel', (_e, jobId?: string): void => {
    if (jobId && jobs.has(jobId)) {
      jobs.get(jobId)!.abort()
      return
    }
    for (const controller of jobs.values()) controller.abort()
  })

  ipcMain.handle('shell:reveal', async (_e, p: string): Promise<void> => {
    if (existsSync(p)) shell.showItemInFolder(p)
  })
  ipcMain.handle('shell:openPath', async (_e, p: string): Promise<void> => {
    if (existsSync(p)) await shell.openPath(p)
  })
  ipcMain.handle('shell:openExternal', async (_e, url: string): Promise<void> => {
    if (/^https?:\/\//i.test(url)) await shell.openExternal(url)
  })
  ipcMain.handle('app:info', (): { version: string; dataDir: string; projectsDir: string; ffmpeg: any } => {
    return {
      version: '0.1.0',
      dataDir: dataDir(),
      projectsDir: projectsDir(),
      ffmpeg: ffmpegStatus()
    }
  })
}