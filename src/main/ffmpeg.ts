import { spawn, spawnSync } from 'child_process'
import { app } from 'electron'
import { existsSync, readFileSync, statSync } from 'fs'
import path from 'path'
import ffmpegStatic from 'ffmpeg-static'

let resolved: string | null = null
let probed = false

export function ffmpegPath(): string {
  if (resolved) return resolved
  const candidates: string[] = []
  if (process.env.FFMPEG_PATH) candidates.push(process.env.FFMPEG_PATH)
  if (app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, 'ffmpeg.exe'))
    candidates.push(path.join(process.resourcesPath, 'ffmpeg'))
  }
  if (ffmpegStatic) candidates.push(ffmpegStatic)
  candidates.push('ffmpeg')
  for (const c of candidates) {
    if (c === 'ffmpeg') {
      const test = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' })
      if (test.status === 0) {
        resolved = 'ffmpeg'
        return resolved
      }
      continue
    }
    if (existsSync(c)) {
      const unpacked = c.replace('app.asar', 'app.asar.unpacked')
      resolved = app.isPackaged && existsSync(unpacked) ? unpacked : c
      return resolved
    }
  }
  resolved = 'ffmpeg'
  return resolved
}

export function ffmpegStatus(): { ok: boolean; path: string; version: string } {
  if (probed && resolved) {
    return { ok: true, path: resolved, version: '' }
  }
  const bin = ffmpegPath()
  const res = spawnSync(bin, ['-version'], { encoding: 'utf8' })
  probed = res.status === 0
  const version = (res.stdout || '').split('\n')[0] || ''
  return { ok: res.status === 0, path: bin, version }
}

export interface RunOptions {
  cwd?: string
  signal?: AbortSignal
  onProgress?: (seconds: number, speed?: string) => void
  timeoutMs?: number
}

export function runFfmpeg(args: string[], opts: RunOptions = {}): Promise<{ stderr: string }> {
  const bin = ffmpegPath()
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: opts.cwd, windowsHide: true })
    let stderr = ''
    let stdout = ''
    let killedByAbort = false

    const onAbort = (): void => {
      killedByAbort = true
      child.kill('SIGKILL')
    }
    opts.signal?.addEventListener('abort', onAbort, { once: true })

    const timer = opts.timeoutMs
      ? setTimeout(() => {
          child.kill('SIGKILL')
          reject(new Error('ffmpeg 执行超时'))
        }, opts.timeoutMs)
      : null

    child.stderr.on('data', (buf) => {
      stderr += buf.toString()
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000)
    })
    child.stdout.on('data', (buf) => {
      stdout += buf.toString()
      if (opts.onProgress) {
        const text = stdout
        const matches = [...text.matchAll(/out_time_ms=(\d+)/g)]
        if (matches.length) {
          const sec = Number(matches[matches.length - 1][1]) / 1_000_000
          const speedMatch = [...text.matchAll(/speed=([\d.]+x|N\/A)/g)].pop()
          opts.onProgress(sec, speedMatch?.[1])
          stdout = ''
        }
      }
    })
    child.on('error', (err) => {
      if (timer) clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
      reject(err)
    })
    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
      if (killedByAbort || opts.signal?.aborted) {
        reject(Object.assign(new Error('cancelled'), { code: 'CANCELLED' }))
        return
      }
      if (code === 0) resolve({ stderr })
      else reject(new Error(extractFfmpegError(stderr) || `ffmpeg 退出码 ${code}`))
    })
  })
}

function extractFfmpegError(stderr: string): string {
  const lines = stderr.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith(' '))
  const bad = lines.filter((l) => /error|invalid|failed|unable|no such/i.test(l))
  return (bad.length ? bad : lines.slice(-3)).slice(-4).join('\n').slice(0, 800)
}

interface MediaInfo {
  duration: number
  width?: number
  height?: number
}

const infoCache = new Map<string, MediaInfo>()

export async function probeMedia(file: string): Promise<MediaInfo> {
  if (!existsSync(file)) throw new Error(`文件不存在：${file}`)
  const st = statSync(file)
  const key = `${file}:${st.size}:${st.mtimeMs}`
  const hit = infoCache.get(key)
  if (hit) return hit
  const bin = ffmpegPath()
  const res = spawnSync(bin, ['-hide_banner', '-i', file], { encoding: 'utf8', windowsHide: true })
  const text = `${res.stderr || ''}\n${res.stdout || ''}`
  const durMatch = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  const duration = durMatch
    ? Number(durMatch[1]) * 3600 + Number(durMatch[2]) * 60 + Number(durMatch[3])
    : 0
  const videoMatch = text.match(/Video:.*?(\d{2,5})x(\d{2,5})/)
  const info: MediaInfo = {
    duration,
    width: videoMatch ? Number(videoMatch[1]) : undefined,
    height: videoMatch ? Number(videoMatch[2]) : undefined
  }
  infoCache.set(key, info)
  return info
}

export function readWavDuration(file: string): number {
  try {
    const buf = readFileSync(file)
    if (buf.length < 44) return 0
    let offset = 12
    let sampleRate = 0
    let byteRate = 0
    let dataSize = 0
    while (offset + 8 <= buf.length) {
      const id = buf.toString('ascii', offset, offset + 4)
      const size = buf.readUInt32LE(offset + 4)
      if (id === 'fmt ') {
        sampleRate = buf.readUInt32LE(offset + 12)
        byteRate = buf.readUInt32LE(offset + 16)
      } else if (id === 'data') {
        dataSize = size
        break
      }
      offset += 8 + size + (size % 2)
    }
    if (byteRate > 0) return dataSize / byteRate
    if (sampleRate > 0) return 0
    return 0
  } catch {
    return 0
  }
}

export async function makeSilenceWav(file: string, seconds: number): Promise<void> {
  await runFfmpeg(
    ['-hide_banner', '-y', '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=mono`, '-t', seconds.toFixed(3), '-c:a', 'pcm_s16le', file],
    { timeoutMs: 30_000 }
  )
}

export function mediaExtensionFromUrl(url: string, contentType?: string | null): string {
  const clean = url.split('?')[0].toLowerCase()
  const m = clean.match(/\.(mp4|webm|mov|m4v|jpg|jpeg|png|webp)$/)
  if (m) return '.' + (m[1] === 'jpeg' ? 'jpg' : m[1])
  if (contentType?.includes('video')) return '.mp4'
  if (contentType?.includes('png')) return '.png'
  if (contentType?.includes('webp')) return '.webp'
  return '.jpg'
}