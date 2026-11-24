import { rmSync, writeFileSync } from 'fs'
import path from 'path'
import type { RenderConfig, RenderProgress } from '@shared/types'
import { TRANSITIONS } from '@shared/presets'
import { runFfmpeg } from '../ffmpeg'

type Emit = (p: Omit<RenderProgress, 'jobId'>) => void

const XFADE_TYPES = TRANSITIONS.filter((t) => t.id !== 'random').map((t) => t.id)

function pickFadeType(configured: string, prev?: string): string {
  if (configured !== 'random') return configured
  const pool = XFADE_TYPES.filter((t) => t !== prev)
  return pool[Math.floor(Math.random() * pool.length)] || 'fade'
}

export interface ComposeArgs {
  emit: Emit
  signal: AbortSignal
  cfg: RenderConfig
  dir: string
  segments: string[]
  transition: number
  slots: number[]
  totalVideo: number
  hasBgm: boolean
  out: string
}

export function isMemoryError(e: any): boolean {
  return /allocate memory|malloc|out of memory|Cannot allocate|not enough memory/i.test(e?.message || '')
}

function rel(dir: string, file: string): string {
  return path.relative(dir, file).replace(/\\/g, '/')
}

function audioFilterTail(startIndex: number, totalVideo: number, hasBgm: boolean, volume: number): string[] {
  const filters: string[] = [`[${startIndex}:a]aresample=44100[na]`]
  if (hasBgm) {
    filters.push(
      `[${startIndex + 1}:a]volume=${volume.toFixed(2)},atrim=0:${totalVideo.toFixed(3)},asetpts=N/SR/TB,afade=t=out:st=${Math.max(
        0,
        totalVideo - 1.6
      ).toFixed(2)}:d=1.5[bg]`
    )
    filters.push('[na][bg]amix=inputs=2:duration=first:normalize=0[aout]')
  } else {
    filters.push('[na]anull[aout]')
  }
  return filters
}

export async function composeOnePass(a: ComposeArgs): Promise<void> {
  const { emit, signal, cfg, dir, segments, transition, slots, totalVideo, hasBgm } = a
  const args: string[] = ['-hide_banner', '-y']
  for (const seg of segments) args.push('-i', rel(dir, seg))
  args.push('-i', 'audio/narration.wav')
  if (hasBgm) args.push('-stream_loop', '-1', '-i', cfg.bgm.path)

  const filters: string[] = []
  for (let i = 0; i < segments.length; i++) {
    filters.push(`[${i}:v]settb=AVTB,setpts=PTS-STARTPTS[v${i}]`)
  }
  let last = 'v0'
  if (transition) {
    let offset = 0
    let prevFade: string | undefined
    for (let i = 1; i < segments.length; i++) {
      offset += slots[i - 1] - transition
      const outLabel = i === segments.length - 1 ? 'vx' : `x${i}`
      const fadeType = pickFadeType(cfg.transition.type, prevFade)
      prevFade = fadeType
      filters.push(
        `[${last}][v${i}]xfade=transition=${fadeType}:duration=${transition.toFixed(2)}:offset=${offset.toFixed(3)}[${outLabel}]`
      )
      last = outLabel
    }
  } else {
    const inputs = segments.map((_, i) => `[v${i}]`).join('')
    filters.push(`${inputs}concat=n=${segments.length}:v=1:a=0[vx]`)
    last = 'vx'
  }

  filters.push(cfg.subtitles.enabled ? `[${last}]ass=subs.ass[vout]` : `[${last}]null[vout]`)
  const volume = Math.min(1, Math.max(0, cfg.bgm.volume ?? 0.18))
  filters.push(...audioFilterTail(segments.length, totalVideo, hasBgm, volume))

  args.push(
    '-filter_complex_threads',
    '2',
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[vout]',
    '-map',
    '[aout]',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '19',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-threads',
    '4',
    '-movflags',
    '+faststart',
    '-r',
    String(cfg.fps),
    '-t',
    totalVideo.toFixed(3),
    '-progress',
    'pipe:1',
    '-nostats',
    a.out
  )

  await runFfmpeg(args, {
    cwd: dir,
    signal,
    timeoutMs: 30 * 60_000,
    onProgress: (sec) => {
      const p = Math.min(98, 68 + Math.round((sec / Math.max(1, totalVideo)) * 30))
      emit({
        step: 'render',
        label: '渲染成片',
        index: 0,
        total: 1,
        percent: p,
        detail: `${sec.toFixed(1)}s / ${totalVideo.toFixed(1)}s`
      })
    }
  })
}

export async function composeLowMemory(a: ComposeArgs): Promise<void> {
  const { emit, signal, cfg, dir, segments, transition, slots, totalVideo, hasBgm } = a
  const volume = Math.min(1, Math.max(0, cfg.bgm.volume ?? 0.18))
  emit({ step: 'render', label: '低内存合成：拼接画面', index: 0, total: segments.length, percent: 72 })

  let video = 'video-only.mp4'
  if (!transition || segments.length === 1) {
    writeFileSync(
      path.join(dir, 'segments.txt'),
      segments.map((s) => `file '${rel(dir, s)}'`).join('\n') + '\n',
      'utf8'
    )
    await runFfmpeg(['-hide_banner', '-y', '-f', 'concat', '-safe', '0', '-i', 'segments.txt', '-c', 'copy', video], {
      cwd: dir,
      signal,
      timeoutMs: 10 * 60_000
    })
  } else {
    let prev = segments[0]
    let offset = 0
    let prevFade: string | undefined
    for (let i = 1; i < segments.length; i++) {
      offset += slots[i - 1] - transition
      const out = `trans-${i}.mp4`
      const fadeType = pickFadeType(cfg.transition.type, prevFade)
      prevFade = fadeType
      await runFfmpeg(
        [
          '-hide_banner',
          '-y',
          '-i',
          rel(dir, prev),
          '-i',
          rel(dir, segments[i]),
          '-filter_complex',
          `[0:v][1:v]xfade=transition=${fadeType}:duration=${transition.toFixed(2)}:offset=${offset.toFixed(3)}[v]`,
          '-map',
          '[v]',
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '18',
          '-threads',
          '2',
          out
        ],
        { cwd: dir, signal, timeoutMs: 10 * 60_000 }
      )
      if (prev !== segments[0]) rmSync(prev, { force: true })
      prev = path.join(dir, out)
      video = out
      emit({
        step: 'render',
        label: `低内存合成：转场 ${i}/${segments.length - 1}`,
        index: i,
        total: segments.length - 1,
        percent: 72 + Math.round((i / Math.max(1, segments.length - 1)) * 10)
      })
    }
  }

  const filters: string[] = []
  filters.push(cfg.subtitles.enabled ? `[0:v]ass=subs.ass[vout]` : `[0:v]null[vout]`)
  filters.push(...audioFilterTail(1, totalVideo, hasBgm, volume))

  const args = [
    '-hide_banner',
    '-y',
    '-i',
    video,
    '-i',
    'audio/narration.wav',
    ...(hasBgm ? ['-stream_loop', '-1', '-i', cfg.bgm.path] : []),
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[vout]',
    '-map',
    '[aout]',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-threads',
    '3',
    '-movflags',
    '+faststart',
    '-r',
    String(cfg.fps),
    '-t',
    totalVideo.toFixed(3),
    '-progress',
    'pipe:1',
    '-nostats',
    a.out
  ]

  await runFfmpeg(args, {
    cwd: dir,
    signal,
    timeoutMs: 30 * 60_000,
    onProgress: (sec) => {
      const p = Math.min(99, 82 + Math.round((sec / Math.max(1, totalVideo)) * 17))
      emit({
        step: 'render',
        label: '低内存合成：最终编码',
        index: 0,
        total: 1,
        percent: p,
        detail: `${sec.toFixed(1)}s / ${totalVideo.toFixed(1)}s`
      })
    }
  })

  try {
    rmSync(path.join(dir, 'video-only.mp4'), { force: true })
    for (let i = 1; i < segments.length; i++) rmSync(path.join(dir, `trans-${i}.mp4`), { force: true })
    rmSync(path.join(dir, 'segments.txt'), { force: true })
  } catch {
    /* ignore */
  }
}