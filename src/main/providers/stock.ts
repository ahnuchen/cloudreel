import crypto from 'crypto'
import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import type { AppSettings, MaterialCandidate, Orientation } from '@shared/types'
import { mediaExtensionFromUrl, probeMedia } from '../ffmpeg'
import { projectsDir } from '../settings'

export interface SearchRequest {
  query: string
  count?: number
  page?: number
  orientation?: Orientation
}

function orientationParam(o: Orientation | undefined): string {
  switch (o) {
    case 'landscape':
      return 'landscape'
    case 'square':
      return 'square'
    default:
      return 'portrait'
  }
}

function pixabayOrientation(o: Orientation | undefined): string {
  switch (o) {
    case 'landscape':
      return 'horizontal'
    case 'square':
      return 'horizontal'
    default:
      return 'vertical'
  }
}

function pickPexelsVideoFile(files: any[]): any | null {
  const mp4s = (files || []).filter((f) => f.file_type === 'video/mp4' && f.link)
  if (!mp4s.length) return null
  const scored = mp4s
    .map((f) => ({ f, score: (f.width >= 1080 ? 100 : f.width) + (f.height >= 1900 ? 20 : 0) }))
    .sort((a, b) => a.score - b.score)
  const suitable = scored.filter((s) => s.f.width >= 720 && s.f.width <= 1920)
  return (suitable.length ? suitable[suitable.length - 1] : scored[scored.length - 1]).f
}

function pickPexelsPreviewFile(files: any[], fallback: any): string {
  const mp4s = (files || []).filter((f) => f.file_type === 'video/mp4' && f.link)
  const small = mp4s
    .filter((f) => (f.height || 0) > 0 && f.height <= 720)
    .sort((a, b) => b.height - a.height)[0]
  return small?.link || fallback?.link || ''
}

async function searchPexels(settings: AppSettings, req: SearchRequest): Promise<MaterialCandidate[]> {
  const key = settings.stock.pexelsKey
  if (!key) throw new Error('请先在设置里填写 Pexels API Key')
  const count = req.count ?? 9
  const page = req.page ?? 1
  const orientation = orientationParam(req.orientation ?? settings.stock.orientation)
  const headers = { Authorization: key }

  const vres = await fetch(
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(req.query)}&orientation=${orientation}&per_page=${Math.min(15, count)}&page=${page}&size=medium`,
    { headers }
  )
  if (!vres.ok) throw new Error(`Pexels 视频搜索失败：HTTP ${vres.status}`)
  const vdata: any = await vres.json()
  const videos: MaterialCandidate[] = []
  for (const v of vdata.videos || []) {
    const file = pickPexelsVideoFile(v.video_files)
    if (!file) continue
    videos.push({
      id: `pexels-v-${v.id}`,
      kind: 'video',
      url: file.link,
      previewUrl: pickPexelsPreviewFile(v.video_files, file) || v.image,
      width: file.width,
      height: file.height,
      duration: v.duration,
      credit: `Pexels · ${v.user?.name || 'unknown'}`,
      source: 'Pexels'
    })
    if (videos.length >= count) break
  }

  let photos: MaterialCandidate[] = []
  if (videos.length < count) {
    const pres = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(req.query)}&orientation=${orientation}&per_page=${count - videos.length}&page=${page}`,
      { headers }
    )
    if (pres.ok) {
      const pdata: any = await pres.json()
      photos = (pdata.photos || []).map((p: any) => ({
        id: `pexels-p-${p.id}`,
        kind: 'image' as const,
        url: p.src?.large2x || p.src?.large,
        previewUrl: p.src?.medium || p.src?.small,
        width: p.width,
        height: p.height,
        duration: 0,
        credit: `Pexels · ${p.photographer || 'unknown'}`,
        source: 'Pexels'
      }))
    }
  }
  return [...videos, ...photos]
}

async function searchPixabay(settings: AppSettings, req: SearchRequest): Promise<MaterialCandidate[]> {
  const key = settings.stock.pixabayKey
  if (!key) throw new Error('请先在设置里填写 Pixabay API Key')
  const count = req.count ?? 9
  const orientation = pixabayOrientation(req.orientation ?? settings.stock.orientation)
  const vres = await fetch(
    `https://pixabay.com/api/videos/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(req.query)}&orientation=${orientation}&per_page=${Math.min(20, count)}&safesearch=true&video_type=film`
  )
  if (!vres.ok) throw new Error(`Pixabay 视频搜索失败：HTTP ${vres.status}`)
  const vdata: any = await vres.json()
  const videos: MaterialCandidate[] = (vdata.hits || []).map((h: any) => {
    const file = h.videos?.large || h.videos?.medium || h.videos?.small
    return {
      id: `pixabay-v-${h.id}`,
      kind: 'video' as const,
      url: file?.url,
      previewUrl: h.videos?.tiny?.url || file?.url,
      width: file?.width || h.videos?.medium?.width || 0,
      height: file?.height || h.videos?.medium?.height || 0,
      duration: h.duration || 0,
      credit: `Pixabay · ${h.user || 'unknown'}`,
      source: 'Pixabay'
    }
  })
  let photos: MaterialCandidate[] = []
  if (videos.length < count) {
    const pres = await fetch(
      `https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(req.query)}&image_type=photo&orientation=${orientation}&per_page=${Math.min(20, count)}&safesearch=true`
    )
    if (pres.ok) {
      const pdata: any = await pres.json()
      photos = (pdata.hits || []).map((h: any) => ({
        id: `pixabay-p-${h.id}`,
        kind: 'image' as const,
        url: h.largeImageURL || h.webformatURL,
        previewUrl: h.webformatURL,
        width: h.imageWidth,
        height: h.imageHeight,
        duration: 0,
        credit: `Pixabay · ${h.user || 'unknown'}`,
        source: 'Pixabay'
      }))
    }
  }
  return [...videos, ...photos].filter((m) => m.url)
}

export async function listLocalMaterials(dir: string): Promise<MaterialCandidate[]> {
  if (!dir || !existsSync(dir)) return []
  const files = readdirSync(dir)
    .filter((f) => /\.(mp4|mov|m4v|webm|jpg|jpeg|png|webp)$/i.test(f))
    .slice(0, 40)
  const out: MaterialCandidate[] = []
  for (const f of files) {
    const full = path.join(dir, f)
    try {
      if (!statSync(full).isFile()) continue
      const kind: 'video' | 'image' = /\.(mp4|mov|m4v|webm)$/i.test(f) ? 'video' : 'image'
      const info = kind === 'video' ? await probeMedia(full) : { duration: 0 }
      out.push({
        id: 'local-' + crypto.createHash('sha1').update(full).digest('hex').slice(0, 12),
        kind,
        url: full,
        previewUrl: '',
        width: 0,
        height: 0,
        duration: info.duration,
        credit: f,
        source: '本地素材'
      })
    } catch {
      /* skip */
    }
  }
  return out
}

export async function searchMaterials(settings: AppSettings, req: SearchRequest): Promise<MaterialCandidate[]> {
  if (settings.stock.provider === 'local') {
    return listLocalMaterials(settings.stock.localDir)
  }
  if (!req.query.trim()) return []
  return settings.stock.provider === 'pixabay' ? searchPixabay(settings, req) : searchPexels(settings, req)
}

export async function downloadMaterial(
  projectId: string,
  candidate: MaterialCandidate
): Promise<{ path: string; width: number; height: number; duration: number; kind: 'video' | 'image' }> {
  if (candidate.kind === 'image' || candidate.kind === 'video') {
    if (existsSync(candidate.url) && !/^https?:/i.test(candidate.url)) {
      const info = await probeMedia(candidate.url)
      return { path: candidate.url, width: info.width ?? 0, height: info.height ?? 0, duration: info.duration, kind: candidate.kind }
    }
  }
  const dir = path.join(projectsDir(), projectId, 'materials')
  mkdirSync(dir, { recursive: true })
  const hash = crypto.createHash('sha1').update(candidate.url).digest('hex').slice(0, 16)
  const existing = readdirSync(dir).find((f) => f.startsWith(hash + '.'))
  if (existing) {
    const full = path.join(dir, existing)
    const info = await probeMedia(full).catch(() => ({ duration: 0, width: 0, height: 0 }))
    return { path: full, width: info.width ?? 0, height: info.height ?? 0, duration: info.duration, kind: candidate.kind }
  }
  const res = await fetch(candidate.url)
  if (!res.ok || !res.body) throw new Error(`下载素材失败：HTTP ${res.status}`)
  const ext = mediaExtensionFromUrl(candidate.url, res.headers.get('content-type'))
  const dest = path.join(dir, hash + ext)
  await pipeline(Readable.fromWeb(res.body as any), createWriteStream(dest))
  const info = await probeMedia(dest).catch(() => ({ duration: 0, width: 0, height: 0 }))
  return { path: dest, width: info.width ?? 0, height: info.height ?? 0, duration: info.duration, kind: candidate.kind }
}