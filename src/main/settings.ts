import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import type { AppSettings, TTSProviderId } from '@shared/types'
import { LLM_PRESETS } from '@shared/presets'

let cached: AppSettings | null = null

const SECRET_PATHS = [
  'llm.apiKey',
  'tts.bailian.apiKey',
  'tts.dashscope.apiKey',
  'tts.nls.accessKeySecret',
  'tts.openai.apiKey',
  'tts.azure.key',
  'tts.tencent.secretKey',
  'stock.pexelsKey',
  'stock.pixabayKey'
]

function defaultSettings(): AppSettings {
  let outputDir = ''
  try {
    outputDir = path.join(app.getPath('videos'), 'CloudReel')
  } catch {
    outputDir = path.join(app.getPath('documents'), 'CloudReel')
  }
  return {
    theme: 'system',
    llm: {
      presetId: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: '',
      model: 'deepseek-chat',
      temperature: 0.8
    },
    tts: {
      provider: 'bailian',
      speed: 1,
      bailian: {
        baseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com',
        apiKey: '',
        model: 'qwen-audio-3.0-tts-plus',
        voice: 'longanhuan_v3.6'
      },
      dashscope: { apiKey: '', model: 'qwen-tts', voice: 'Cherry' },
      nls: {
        accessKeyId: '',
        accessKeySecret: '',
        appKey: '',
        voice: 'aixia',
        region: 'cn-shanghai'
      },
      openai: { baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini-tts', voice: 'alloy' },
      azure: { key: '', region: 'eastasia', voice: 'zh-CN-XiaoxiaoNeural' },
      tencent: { secretId: '', secretKey: '', voiceType: 101001, region: 'ap-guangzhou' }
    },
    stock: {
      provider: 'pexels',
      pexelsKey: '',
      pixabayKey: '',
      localDir: '',
      orientation: 'portrait'
    },
    defaults: {
      outputDir,
      bgmPath: '',
      bgmVolume: 0.18,
      width: 1080,
      height: 1920,
      fps: 30,
      transitionEnabled: true,
      transitionType: 'fade',
      transitionDuration: 0.6,
      subtitleFont: 'Microsoft YaHei',
      subtitleFontSize: 56,
      subtitleColor: '#FFFFFF',
      subtitleOutlineColor: '#0B0C10',
      subtitleOutline: 3,
      subtitleAlignment: 2,
      lowMemory: false
    }
  }
}

function settingsFile(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

function getByPath(obj: any, dotted: string): any {
  return dotted.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj)
}

function setByPath(obj: any, dotted: string, value: any): void {
  const parts = dotted.split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null) cur[parts[i]] = {}
    cur = cur[parts[i]]
  }
  cur[parts[parts.length - 1]] = value
}

function deepMerge<T>(base: T, patch: any): T {
  if (patch == null || typeof patch !== 'object' || Array.isArray(patch)) return (patch ?? base) as T
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) }
  for (const key of Object.keys(patch)) {
    out[key] = deepMerge((base as any)?.[key], patch[key])
  }
  return out
}

function encryptSecrets(settings: AppSettings): any {
  const clone: any = JSON.parse(JSON.stringify(settings))
  if (!safeStorage.isEncryptionAvailable()) return clone
  for (const p of SECRET_PATHS) {
    const value = getByPath(clone, p)
    if (typeof value === 'string' && value && !value.startsWith('enc:')) {
      setByPath(clone, p, 'enc:' + safeStorage.encryptString(value).toString('base64'))
    }
  }
  return clone
}

function decryptSecrets(raw: any): void {
  if (!safeStorage.isEncryptionAvailable()) {
    for (const p of SECRET_PATHS) {
      const value = getByPath(raw, p)
      if (typeof value === 'string' && value.startsWith('enc:')) setByPath(raw, p, '')
    }
    return
  }
  for (const p of SECRET_PATHS) {
    const value = getByPath(raw, p)
    if (typeof value === 'string' && value.startsWith('enc:')) {
      try {
        setByPath(raw, p, safeStorage.decryptString(Buffer.from(value.slice(4), 'base64')))
      } catch {
        setByPath(raw, p, '')
      }
    }
  }
}

export function loadSettings(): AppSettings {
  if (cached) return cached
  const base = defaultSettings()
  const file = settingsFile()
  if (!existsSync(file)) {
    cached = base
    return cached
  }
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    decryptSecrets(raw)
    cached = deepMerge(base, raw)
    if (cached.llm.presetId === 'dashscope' && cached.llm.baseUrl.includes('token-plan.')) {
      cached.llm.presetId = 'bailian-token'
    }
  } catch {
    cached = base
  }
  return cached!
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const current = loadSettings()
  cached = deepMerge(current, patch)
  const file = settingsFile()
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(encryptSecrets(cached), null, 2), 'utf8')
  return cached
}

export function getTtsVoice(settings: AppSettings): { provider: TTSProviderId; voice: string } {
  const p = settings.tts.provider
  const voice =
    p === 'bailian'
      ? settings.tts.bailian.voice
      : p === 'dashscope'
        ? settings.tts.dashscope.voice
        : p === 'aliyun-nls'
          ? settings.tts.nls.voice
          : p === 'openai'
            ? settings.tts.openai.voice
            : p === 'azure'
              ? settings.tts.azure.voice
              : String(settings.tts.tencent.voiceType)
  return { provider: p, voice }
}

export function projectsDir(): string {
  const dir = path.join(app.getPath('userData'), 'projects')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function dataDir(): string {
  return app.getPath('userData')
}