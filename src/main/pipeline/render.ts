import crypto from 'crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import path from 'path'
import type { AppSettings, LinePlan, RenderConfig, RenderProgress } from '@shared/types'
import { makeSilenceWav, probeMedia, readWavDuration, runFfmpeg } from '../ffmpeg'
import { synthesize } from '../providers/tts'
import { downloadMaterial } from '../providers/stock'
import { projectsDir } from '../settings'
import { composeLowMemory, composeOnePass, isMemoryError } from './compose'

export const GAP_SECONDS = 0.16
export const TAIL_SECONDS = 0.45

export interface RenderContext {
  jobId: string
  settings: AppSettings
  signal: AbortSignal
  emit: (p: RenderProgress) => void
}

export interface RenderOutput {
  videoPath: string
  duration: number
}

export function audioKey(text: string, provider: string, voice: string, speed: number): string {
  return crypto.createHash('sha1').update(`${provider}|${voice}|${speed}|${text}`).digest('hex').slice(0, 20)
}

export function projectDir(projectId: string): string {
  const safe = projectId.replace(/[^a-zA-Z0-9-]/g, '')
  const dir = path.join(projectsDir(), safe || 'default')
  mkdirSync(path.join(dir, 'audio'), { recursive: true })
  mkdirSync(path.join(dir, 'segments'), { recursive: true })
  mkdirSync(path.join(dir, 'materials'), { recursive: true })
  return dir
}

function emit(ctx: RenderContext, data: Omit<RenderProgress, 'jobId'>): void {
  ctx.emit({ jobId: ctx.jobId, ...data })
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

async function encodeSegment(args: string[], opts: { cwd?: string; signal?: AbortSignal; timeoutMs?: number }): Promise<void> {
  try {
    await runFfmpeg(args, { ...opts, timeoutMs: opts.timeoutMs ?? 300_000 })
  } catch (e: any) {
    if (!/allocate memory|malloc|out of memory|Cannot allocate/i.test(e?.message || '')) throw e
    const retry = args.map((a) => (a === 'veryfast' ? 'ultrafast' : a))
    const insertAt = retry.length - 1
    retry.splice(insertAt, 0, '-threads', '1')
    await runFfmpeg(retry, { ...opts, timeoutMs: opts.timeoutMs ?? 300_000 })
  }
}

export interface LineAudio {
  mp3: string
  wav: string
  duration: number
}

export async function ensureLineAudio(
  settings: AppSettings,
  dir: string,
  line: { text: string },
  voice: { provider: RenderConfig['voice']['provider']; voice: string; speed: number },
  signal?: AbortSignal
): Promise<LineAudio> {
  const key = audioKey(line.text, voice.provider, voice.voice, voice.speed)
  const mp3 = path.join(dir, 'audio', key + '.mp3')
  const wav = path.join(dir, 'audio', key + '.wav')

  if (!existsSync(mp3) || readFileSync(mp3).length < 1000) {
    await synthesize(settings, {
      text: line.text,
      voice: voice.voice,
      speed: voice.speed,
      provider: voice.provider,
      outFile: mp3,
      signal
    })
  }

  if (!existsSync(wav) || readWavDuration(wav) < 0.1) {
    const speed = Math.min(2, Math.max(0.5, voice.speed || 1))
    const filters = [`atempo=${speed.toFixed(2)}`, 'loudnorm=I=-16:LRA=11:TP=-1.5', 'aresample=44100']
    await runFfmpeg(
      ['-hide_banner', '-y', '-i', mp3, '-af', filters.join(','), '-ac', '1', '-c:a', 'pcm_s16le', wav],
      { signal, timeoutMs: 120_000 }
    )
  }

  const duration = readWavDuration(wav)
  if (!duration) throw new Error(`音频时长解析失败：${path.basename(mp3)}`)
  return { mp3, wav, duration }
}

function assTime(seconds: number): string {
  const cs = Math.max(0, Math.round(seconds * 100))
  const h = Math.floor(cs / 360000)
  const m = Math.floor((cs % 360000) / 6000)
  const s = Math.floor((cs % 6000) / 100)
  const c = cs % 100
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`
}

function assColor(hex: string): string {
  const clean = (hex || '#FFFFFF').replace('#', '').padEnd(6, 'F').slice(0, 6)
  const r = clean.slice(0, 2)
  const g = clean.slice(2, 4)
  const b = clean.slice(4, 6)
  return `&H00${b}${g}${r}`.toUpperCase()
}

function escapeAss(text: string): string {
  return text.replace(/\\/g, '／').replace(/[{}]/g, '').replace(/\r?\n/g, ' ')
}

const BREAK_AFTER = /[，。、；：！？,.;:!?）)」』》"'\s]/
const BREAK_BEFORE = /[（(「『《"'\s]/

function splitBalanced(text: string, maxChars: number): { text: string; shrink?: number } {
  const chars = [...text]
  const len = chars.length
  if (len <= maxChars) return { text }

  const maxLines = 4
  const lineCount = Math.min(maxLines, Math.ceil(len / maxChars))
  const target = Math.ceil(len / lineCount)
  const window = Math.max(2, Math.floor(target / 3))
  const lines: string[] = []
  let start = 0
  for (let i = 0; i < lineCount - 1; i++) {
    let end = Math.min(len, start + target)
    for (let off = 0; off < window; off++) {
      const after = chars[end + off] ?? ''
      if (BREAK_AFTER.test(after)) {
        end = Math.min(len, end + off + 1)
        break
      }
      const before = chars[end - off - 1] ?? ''
      if (BREAK_BEFORE.test(before)) {
        end = end - off
        break
      }
    }
    if (end <= start) end = Math.min(len, start + target)
    lines.push(chars.slice(start, end).join('').trim())
    start = end
  }
  lines.push(chars.slice(start).join('').trim())

  const kept = lines.filter(Boolean)
  const widest = Math.max(...kept.map((l) => [...l].length))
  const shrink = widest > maxChars ? Math.max(0.6, maxChars / widest) : 1
  return { text: kept.join('\\N'), shrink: shrink < 1 ? shrink : undefined }
}

function buildAss(cfg: RenderConfig, timings: { start: number; end: number; text: string }[]): string {
  const W = cfg.width
  const H = cfg.height
  const scale = W / 1080
  const baseSize = Math.max(20, Math.round(cfg.subtitles.fontSize * scale))
  const maxChars = Math.max(6, Math.floor((W - 160) / (baseSize * 1.02)))
  const marginV = Math.round(H * 0.085)
  const font = cfg.subtitles.fontName || 'Microsoft YaHei'

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${font},${baseSize},${assColor(cfg.subtitles.color)},&H000000FF,${assColor(cfg.subtitles.outlineColor)},&H64000000,-1,0,0,0,100,100,0,0,1,${cfg.subtitles.outline},0,${cfg.subtitles.alignment},100,100,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`

  const events = timings
    .map((t) => {
      const { text, shrink } = splitBalanced(escapeAss(t.text), maxChars)
      const size = shrink ? `\\fs${Math.max(24, Math.round(baseSize * shrink))}` : ''
      const override = `{${size}\\fad(120,120)}`
      return `Dialogue: 0,${assTime(t.start)},${assTime(t.end)},Default,,0,0,0,,${override}${text}`
    })
    .join('\n')
  return `${header}\n${events}\n`
}

function sanitizeName(name: string, fallback: string): string {
  const clean = (name || fallback).replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim()
  return clean.slice(0, 60) || fallback
}

function uniqueOutput(dir: string, base: string): string {
  let candidate = path.join(dir, base + '.mp4')
  let i = 2
  while (existsSync(candidate)) {
    candidate = path.join(dir, `${base}-${i}.mp4`)
    i++
  }
  return candidate
}

async function makeSegments(
  ctx: RenderContext,
  cfg: RenderConfig,
  dir: string,
  lines: LinePlan[],
  lineAudio: { duration: number }[],
  slots: number[],
  transition: number
): Promise<string[]> {
  const files: string[] = []
  for (let i = 0; i < lines.length; i++) {
    if (ctx.signal.aborted) throw Object.assign(new Error('cancelled'), { code: 'CANCELLED' })
    emit(ctx, {
      step: 'visuals',
      label: `准备画面 ${i + 1}/${lines.length}`,
      index: i,
      total: lines.length,
      percent: 35 + Math.round(((i + 0.2) / lines.length) * 30),
      detail: lines[i].text.slice(0, 24)
    })

    const media = lines[i].material
    const slot = slots[i]
    const out = path.join(dir, 'segments', `seg-${String(i).padStart(2, '0')}.mp4`)
    const base = [
      '-hide_banner',
      '-y',
      '-t',
      slot.toFixed(3),
      '-r',
      String(cfg.fps)
    ]

    if (!media) {
      await encodeSegment(
        [
          '-hide_banner',
          '-y',
          '-f',
          'lavfi',
          '-i',
          `color=c=0x101318:s=${cfg.width}x${cfg.height}:d=${slot.toFixed(3)}:r=${cfg.fps}`,
          '-vf',
          'format=yuv420p',
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '18',
          '-threads',
          '3',
          out
        ],
        { signal: ctx.signal, timeoutMs: 300_000 }
      )
      files.push(out)
      continue
    }

    let localPath: string
    let kind: 'video' | 'image'
    if (media.kind === 'local') {
      localPath = media.path
      kind = /\.(mp4|mov|m4v|webm)$/i.test(localPath) ? 'video' : 'image'
    } else {
      const downloaded = await downloadMaterial(cfg.projectId, media)
      localPath = downloaded.path
      kind = downloaded.kind
    }

    const scaleFilter = `scale=${cfg.width}:${cfg.height}:force_original_aspect_ratio=increase,crop=${cfg.width}:${cfg.height},setsar=1`
    if (kind === 'image') {
      await encodeSegment(
        [
          '-hide_banner',
          '-y',
          '-loop',
          '1',
          '-i',
          localPath,
          ...base,
          '-vf',
          `${scaleFilter},zoompan=z='min(zoom+0.00045,1.09)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${cfg.width}x${cfg.height}:fps=${cfg.fps},format=yuv420p`,
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '18',
          '-threads',
          '3',
          out
        ],
        { signal: ctx.signal, timeoutMs: 300_000 }
      )
    } else {
      await encodeSegment(
        [
          '-hide_banner',
          '-y',
          '-stream_loop',
          '-1',
          '-i',
          localPath,
          ...base,
          '-an',
          '-vf',
          `${scaleFilter},fps=${cfg.fps},format=yuv420p`,
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '18',
          '-threads',
          '3',
          out
        ],
        { signal: ctx.signal, timeoutMs: 300_000 }
      )
    }
    files.push(out)
    emit(ctx, {
      step: 'visuals',
      label: `画面 ${i + 1}/${lines.length} 完成`,
      index: i,
      total: lines.length,
      percent: 35 + Math.round(((i + 1) / lines.length) * 30)
    })
    void transition
  }
  return files
}

export async function renderProject(cfg: RenderConfig, ctx: RenderContext): Promise<RenderOutput> {
  const settings = ctx.settings
  const dir = projectDir(cfg.projectId)
  const lines = cfg.lines.filter((l) => l.text.trim())
  if (!lines.length) throw new Error('没有可渲染的文案')
  if (lines.length > 30) throw new Error('单条视频最多 30 句')

  emit(ctx, { step: 'audio', label: '开始合成配音', index: 0, total: lines.length, percent: 2 })

  let audioDone = 0
  const lineAudio = await mapLimit(lines, 3, async (line, index) => {
    const audio = await ensureLineAudio(settings, dir, line, cfg.voice, ctx.signal)
    audioDone++
    emit(ctx, {
      step: 'audio',
      label: `配音 ${index + 1}/${lines.length}`,
      index,
      total: lines.length,
      percent: 2 + Math.round((audioDone / lines.length) * 33),
      detail: `${line.text.slice(0, 20)} · ${audio.duration.toFixed(1)}s`
    })
    return audio
  })

  const silence = path.join(dir, 'audio', 'silence.wav')
  if (!existsSync(silence)) await makeSilenceWav(silence, GAP_SECONDS)

  const narrationList = path.join(dir, 'audio', 'concat.txt')
  const listLines: string[] = []
  lineAudio.forEach((a, i) => {
    listLines.push(`file '${a.wav.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
    if (i < lineAudio.length - 1) listLines.push(`file '${silence.replace(/\\/g, '/')}'`)
  })
  writeFileSync(narrationList, listLines.join('\n') + '\n', 'utf8')
  const narration = path.join(dir, 'audio', 'narration.wav')
  await runFfmpeg(
    ['-hide_banner', '-y', '-f', 'concat', '-safe', '0', '-i', 'audio/concat.txt', '-c:a', 'pcm_s16le', 'audio/narration.wav'],
    { cwd: dir, signal: ctx.signal, timeoutMs: 120_000 }
  )
  const narrationDuration = readWavDuration(narration)

  const transition = cfg.transition.enabled && lines.length > 1 ? Math.min(1.5, Math.max(0.3, cfg.transition.duration)) : 0
  const slots: number[] = lineAudio.map((a, i) => {
    const baseDur = a.duration + (i < lineAudio.length - 1 ? GAP_SECONDS : TAIL_SECONDS)
    return baseDur + (transition && i < lineAudio.length - 1 ? transition : 0)
  })

  const timings = lineAudio.map((a, i) => {
    const start = lineAudio.slice(0, i).reduce((sum, x) => sum + x.duration + GAP_SECONDS, 0)
    return { start, end: start + a.duration + 0.08, text: lines[i].text }
  })

  emit(ctx, { step: 'visuals', label: '准备画面素材', index: 0, total: lines.length, percent: 35 })
  const segments = await makeSegments(ctx, cfg, dir, lines, lineAudio, slots, transition)

  emit(ctx, { step: 'subtitles', label: '生成字幕', index: 0, total: 1, percent: 66 })
  const assPath = path.join(dir, 'subs.ass')
  if (cfg.subtitles.enabled) {
    writeFileSync(assPath, buildAss(cfg, timings), 'utf8')
  }

  const totalVideo = slots.reduce((a, b) => a + b, 0) - (transition ? (lines.length - 1) * transition : 0)
  const outDir = cfg.outputDir || settings.defaults.outputDir
  mkdirSync(outDir, { recursive: true })
  const output = uniqueOutput(outDir, sanitizeName(cfg.outputName || cfg.title, 'cloudreel'))

  const hasBgm = Boolean(cfg.bgm.path && existsSync(cfg.bgm.path))
  const tempOut = path.join(outDir, `.cloudreel-${Date.now()}.mp4`)
  const composeArgs = {
    emit: (p: Omit<RenderProgress, 'jobId'>) => emit(ctx, p),
    signal: ctx.signal,
    cfg,
    dir,
    segments,
    transition,
    slots,
    totalVideo,
    hasBgm,
    out: tempOut
  }

  emit(ctx, { step: 'render', label: '渲染成片', index: 0, total: 1, percent: 68 })
  try {
    if (process.env.CLOUDREEL_LOWMEM === '1' || settings.defaults.lowMemory) {
      throw new Error('low-memory mode requested (Cannot allocate memory)')
    }
    await composeOnePass(composeArgs)
  } catch (e: any) {
    if (!isMemoryError(e)) {
      rmSync(tempOut, { force: true })
      throw e
    }
    emit(ctx, {
      step: 'render',
      label: '内存紧张，切换低内存合成',
      index: 0,
      total: 1,
      percent: 70,
      detail: '逐段合成，速度稍慢但内存占用更低'
    })
    rmSync(tempOut, { force: true })
    await composeLowMemory(composeArgs)
  }
  renameSync(tempOut, output)

  try {
    for (const f of segments) rmSync(f, { force: true })
  } catch {
    /* ignore */
  }

  const narrationOk = narrationDuration > 0
  emit(ctx, {
    step: 'done',
    label: '成片完成',
    index: 1,
    total: 1,
    percent: 100,
    detail: path.basename(output)
  })
  return { videoPath: output, duration: totalVideo || (narrationOk ? narrationDuration : 0) }
}