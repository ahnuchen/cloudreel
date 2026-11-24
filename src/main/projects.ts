import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs'
import path from 'path'
import type { ProjectOutput, ProjectRecord, ProjectSummary } from '@shared/types'
import { projectsDir } from './settings'
import { runFfmpeg } from './ffmpeg'

export type { ProjectOutput, ProjectRecord, ProjectSummary }

function safeId(id: string): string {
  return String(id || '').replace(/[^a-zA-Z0-9-]/g, '')
}

function projectPath(id: string): string {
  return path.join(projectsDir(), safeId(id))
}

function projectFile(id: string): string {
  return path.join(projectPath(id), 'project.json')
}

export function loadProject(id: string): ProjectRecord | null {
  const file = projectFile(id)
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as ProjectRecord
  } catch {
    return null
  }
}

function summarize(record: ProjectRecord): ProjectSummary {
  const lines = Array.isArray(record.draft?.script?.lines) ? record.draft.script.lines.length : 0
  const audio = record.draft?.audio ?? {}
  let duration = 0
  for (const key of Object.keys(audio)) duration += Number(audio[key]?.duration) || 0
  if (lines > 1) duration += (lines - 1) * 0.16
  if (lines) duration += 0.45
  const last = record.outputs?.[0]
  const poster = record.poster && existsSync(record.poster) ? record.poster : undefined
  const material = record.draft?.material ?? {}
  const firstMaterial = Object.values(material).find((m: any) => m) as any
  const cover =
    poster ||
    (firstMaterial?.previewUrl && /^https?:/i.test(firstMaterial.previewUrl) ? firstMaterial.previewUrl : undefined) ||
    (firstMaterial?.previewUrl ? firstMaterial.previewUrl : undefined) ||
    (firstMaterial?.url && /^https?:/i.test(firstMaterial.url) ? firstMaterial.url : undefined)
  return {
    id: record.id,
    title: record.title || '未命名项目',
    topic: record.topic || '',
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    poster,
    cover,
    lines,
    duration: last?.duration || duration,
    outputs: record.outputs?.length || 0,
    lastOutput: last?.path,
    lastOutputAt: last?.createdAt,
    outputList: record.outputs ?? []
  }
}

export function listProjects(): ProjectSummary[] {
  const dir = projectsDir()
  const ids = readdirSync(dir).filter((name) => /^[a-zA-Z0-9-]+$/.test(name))
  const list: ProjectSummary[] = []
  for (const id of ids) {
    const record = loadProject(id)
    if (!record) continue
    try {
      list.push(summarize(record))
    } catch {
      /* skip broken record */
    }
  }
  return list.sort((a, b) => b.updatedAt - a.updatedAt)
}

export function saveProject(input: {
  id: string
  title: string
  topic: string
  createdAt: number
  updatedAt: number
  draft: any
}): ProjectSummary | null {
  const id = safeId(input.id)
  if (!id) return null
  const dir = projectPath(id)
  mkdirSync(dir, { recursive: true })
  const existing = loadProject(id)
  const record: ProjectRecord = {
    id,
    title: input.title || '未命名项目',
    topic: input.topic || '',
    createdAt: existing?.createdAt || input.createdAt || Date.now(),
    updatedAt: Date.now(),
    draft: input.draft,
    poster: existing?.poster && existsSync(existing.poster) ? existing.poster : undefined,
    outputs: existing?.outputs ?? []
  }
  writeFileSync(projectFile(id), JSON.stringify(record), 'utf8')
  return summarize(record)
}

export async function recordRenderOutput(
  id: string,
  output: { path: string; duration: number }
): Promise<ProjectSummary | null> {
  const record = loadProject(id)
  if (!record) return null
  let size = 0
  try {
    size = statSync(output.path).size
  } catch {
    /* ignore */
  }
  const entry: ProjectOutput = {
    path: output.path,
    createdAt: Date.now(),
    duration: Math.round(output.duration * 100) / 100,
    size
  }
  record.outputs = [entry, ...(record.outputs ?? []).filter((o) => o.path !== output.path)].slice(0, 20)
  record.updatedAt = Date.now()

  const poster = path.join(projectPath(id), 'poster.jpg')
  try {
    const ss = Math.min(1.2, Math.max(0, output.duration / 3)).toFixed(2)
    await runFfmpeg(
      ['-hide_banner', '-y', '-ss', ss, '-i', output.path, '-frames:v', '1', '-vf', 'scale=540:-2', poster],
      { timeoutMs: 30_000 }
    )
    if (existsSync(poster)) record.poster = poster
  } catch {
    /* poster is optional */
  }

  writeFileSync(projectFile(id), JSON.stringify(record), 'utf8')
  return summarize(record)
}

export function deleteProject(id: string): boolean {
  const dir = projectPath(id)
  if (!dir || !existsSync(dir)) return false
  const root = projectsDir()
  if (!path.resolve(dir).startsWith(path.resolve(root) + path.sep)) return false
  rmSync(dir, { recursive: true, force: true })
  return true
}