export type Orientation = 'portrait' | 'landscape' | 'square'
export type ThemeMode = 'system' | 'light' | 'dark'

export interface LLMConfig {
  presetId: string
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
}

export type TTSProviderId = 'bailian' | 'dashscope' | 'aliyun-nls' | 'openai' | 'azure' | 'tencent'

export interface TTSConfig {
  provider: TTSProviderId
  speed: number
  bailian: { baseUrl: string; apiKey: string; model: string; voice: string }
  dashscope: { apiKey: string; model: string; voice: string }
  nls: { accessKeyId: string; accessKeySecret: string; appKey: string; voice: string; region: string }
  openai: { baseUrl: string; apiKey: string; model: string; voice: string }
  azure: { key: string; region: string; voice: string }
  tencent: { secretId: string; secretKey: string; voiceType: number; region: string }
}

export type StockProviderId = 'pexels' | 'pixabay' | 'local'

export interface StockConfig {
  provider: StockProviderId
  pexelsKey: string
  pixabayKey: string
  localDir: string
  orientation: Orientation
}

export interface Defaults {
  outputDir: string
  bgmPath: string
  bgmVolume: number
  width: number
  height: number
  fps: number
  transitionEnabled: boolean
  transitionType: string
  transitionDuration: number
  subtitleFont: string
  subtitleFontSize: number
  subtitleColor: string
  subtitleOutlineColor: string
  subtitleOutline: number
  subtitleAlignment: number
  lowMemory: boolean
}

export interface AppSettings {
  theme: ThemeMode
  llm: LLMConfig
  tts: TTSConfig
  stock: StockConfig
  defaults: Defaults
}

export interface ScriptLine {
  id: string
  text: string
  visualQuery: string
}

export interface ScriptDoc {
  title: string
  lines: ScriptLine[]
  hashtags: string[]
}

export interface MaterialCandidate {
  id: string
  kind: 'video' | 'image'
  url: string
  previewUrl: string
  width: number
  height: number
  duration: number
  credit: string
  source: string
}

export type LocalMaterial = { kind: 'local'; path: string; previewUrl: string; width?: number; height?: number; duration?: number }

export type LineMaterial = MaterialCandidate | LocalMaterial

export interface LinePlan {
  id: string
  text: string
  material: LineMaterial | null
}

export interface SubtitleStyle {
  enabled: boolean
  fontName: string
  fontSize: number
  color: string
  outlineColor: string
  outline: number
  alignment: number
}

export interface RenderConfig {
  projectId: string
  title: string
  lines: LinePlan[]
  orientation: Orientation
  width: number
  height: number
  fps: number
  transition: { enabled: boolean; type: string; duration: number }
  subtitles: SubtitleStyle
  bgm: { path: string; volume: number }
  voice: { provider: TTSProviderId; voice: string; speed: number }
  outputName: string
  outputDir?: string
}

export interface RenderProgress {
  jobId: string
  step: 'audio' | 'visuals' | 'subtitles' | 'render' | 'done' | 'error' | 'cancelled'
  label: string
  index: number
  total: number
  percent: number
  detail?: string
}

export interface RenderResult {
  ok: boolean
  videoPath?: string
  error?: string
  cancelled?: boolean
  duration?: number
}

export interface ProviderTestResult {
  ok: boolean
  message: string
  latency?: number
}


export interface ProjectOutput {
  path: string
  createdAt: number
  duration: number
  size: number
}

export interface ProjectRecord {
  id: string
  title: string
  topic: string
  createdAt: number
  updatedAt: number
  draft: any
  poster?: string
  outputs: ProjectOutput[]
}

export interface ProjectSummary {
  id: string
  title: string
  topic: string
  createdAt: number
  updatedAt: number
  poster?: string
  cover?: string
  lines: number
  duration: number
  outputs: number
  lastOutput?: string
  lastOutputAt?: number
  outputList: ProjectOutput[]
}
