import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import type { LineMaterial, MaterialCandidate, ProjectRecord, ScriptDoc, ScriptLine, TTSProviderId } from '@shared/types'
import { api } from '../lib/api'
import { estimateSeconds, uid } from '../lib/api'

export type Step = 0 | 1 | 2 | 3
export type VideoPresetId = 'portrait' | 'landscape' | 'square'

export interface AudioState {
  path: string
  duration: number
}

export interface StudioDraft {
  projectId: string
  createdAt: number
  step: Step
  topic: string
  styleId: string
  customStyle: string
  chars: number
  language: 'zh-CN' | 'zh-TW' | 'en'
  scriptSource: 'ai' | 'manual'
  manualText: string
  script: ScriptDoc | null
  audio: Record<string, AudioState>
  material: Record<string, LineMaterial | null>
  candidates: Record<string, MaterialCandidate[]>
  page: Record<string, number>
  videoPreset: VideoPresetId
  outputName: string
  voiceMeta: { provider: TTSProviderId; voice: string; speed: number } | null
  subtitlesEnabled: boolean
  activeLineId: string | null
  updatedAt: number
}

const STORAGE_KEY = 'cloudreel.studio.v1'

function createDraft(): StudioDraft {
  return {
    projectId: uid(),
    createdAt: Date.now(),
    step: 0,
    topic: '',
    styleId: 'knowledge',
    customStyle: '',
    chars: 120,
    language: 'zh-CN',
    scriptSource: 'ai',
    manualText: '',
    script: null,
    audio: {},
    material: {},
    candidates: {},
    page: {},
    videoPreset: 'portrait',
    outputName: '',
    voiceMeta: null,
    subtitlesEnabled: true,
    activeLineId: null,
    updatedAt: Date.now()
  }
}

function loadDraft(): StudioDraft {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createDraft()
    const parsed = JSON.parse(raw)
    return { ...createDraft(), ...parsed }
  } catch {
    return createDraft()
  }
}

export interface DurationInfo {
  total: number
  voiced: number
  allVoiced: boolean
}

export function draftDuration(draft: StudioDraft): DurationInfo {
  const lines = draft.script?.lines ?? []
  const gap = 0.16
  let total = 0
  let voiced = 0
  let allVoiced = lines.length > 0
  lines.forEach((line, i) => {
    const audio = draft.audio[line.id]
    if (audio?.duration) {
      total += audio.duration
      voiced += audio.duration
    } else {
      total += estimateSeconds(line.text)
      allVoiced = false
    }
    if (i < lines.length - 1) total += gap
  })
  if (lines.length) total += 0.45
  return { total, voiced, allVoiced }
}

interface StudioApi {
  draft: StudioDraft
  patch: (partial: Partial<StudioDraft>) => void
  setStep: (step: Step) => void
  setScript: (doc: ScriptDoc, advance?: boolean) => void
  updateLine: (id: string, patch: Partial<ScriptLine>) => void
  addLine: () => void
  removeLine: (id: string) => void
  moveLine: (id: string, dir: -1 | 1) => void
  setAudio: (id: string, audio: AudioState) => void
  clearAudio: (id: string) => void
  setMaterial: (id: string, material: LineMaterial | null) => void
  setCandidates: (id: string, candidates: MaterialCandidate[], page: number) => void
  setActiveLine: (id: string | null) => void
  reset: () => void
  loadRecord: (record: ProjectRecord) => void
  duration: DurationInfo
}

const StudioContext = createContext<StudioApi | null>(null)

export function StudioProvider({ children }: { children: ReactNode }): ReactElement {
  const [draft, setDraft] = useState<StudioDraft>(() => loadDraft())
  const saveTimer = useRef<number | null>(null)

  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
      } catch {
        /* ignore quota errors */
      }
    }, 250)
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [draft])

  useEffect(() => {
    if (!draft.topic && !draft.script) return
    const timer = window.setTimeout(() => {
      api
        .projectSave({
          id: draft.projectId,
          title: draft.script?.title || draft.topic.slice(0, 30) || '未命名项目',
          topic: draft.topic,
          createdAt: draft.createdAt,
          updatedAt: draft.updatedAt,
          draft
        })
        .catch(() => undefined)
    }, 900)
    return () => window.clearTimeout(timer)
  }, [draft])

  const patch = useCallback((partial: Partial<StudioDraft>) => {
    setDraft((prev) => ({ ...prev, ...partial, updatedAt: Date.now() }))
  }, [])

  const setStep = useCallback((step: Step) => {
    setDraft((prev) => ({ ...prev, step, updatedAt: Date.now() }))
  }, [])

  const setScript = useCallback((doc: ScriptDoc, advance = false) => {
    setDraft((prev) => {
      const keptAudio: Record<string, AudioState> = {}
      const keptMaterial: Record<string, LineMaterial | null> = {}
      doc.lines.forEach((l) => {
        if (prev.audio[l.id]) keptAudio[l.id] = prev.audio[l.id]
        if (prev.material[l.id]) keptMaterial[l.id] = prev.material[l.id]
      })
      return {
        ...prev,
        script: doc,
        audio: keptAudio,
        material: keptMaterial,
        candidates: {},
        page: {},
        activeLineId: doc.lines[0]?.id ?? null,
        outputName: prev.outputName || doc.title,
        step: advance ? 1 : prev.step,
        updatedAt: Date.now()
      }
    })
  }, [])

  const updateLine = useCallback((id: string, linePatch: Partial<ScriptLine>) => {
    setDraft((prev) => {
      if (!prev.script) return prev
      const lines = prev.script.lines.map((l) => (l.id === id ? { ...l, ...linePatch } : l))
      const audio = { ...prev.audio }
      const candidates = { ...prev.candidates }
      if (linePatch.text !== undefined) delete audio[id]
      if (linePatch.visualQuery !== undefined) delete candidates[id]
      return { ...prev, script: { ...prev.script, lines }, audio, candidates, updatedAt: Date.now() }
    })
  }, [])

  const addLine = useCallback(() => {
    setDraft((prev) => {
      if (!prev.script) return prev
      const line: ScriptLine = { id: uid(), text: '', visualQuery: '' }
      const lines = [...prev.script.lines, line]
      return {
        ...prev,
        script: { ...prev.script, lines },
        activeLineId: line.id,
        updatedAt: Date.now()
      }
    })
  }, [])

  const removeLine = useCallback((id: string) => {
    setDraft((prev) => {
      if (!prev.script) return prev
      const lines = prev.script.lines.filter((l) => l.id !== id)
      const audio = { ...prev.audio }
      const material = { ...prev.material }
      delete audio[id]
      delete material[id]
      return {
        ...prev,
        script: { ...prev.script, lines },
        audio,
        material,
        activeLineId: prev.activeLineId === id ? lines[0]?.id ?? null : prev.activeLineId,
        updatedAt: Date.now()
      }
    })
  }, [])

  const moveLine = useCallback((id: string, dir: -1 | 1) => {
    setDraft((prev) => {
      if (!prev.script) return prev
      const lines = [...prev.script.lines]
      const index = lines.findIndex((l) => l.id === id)
      const target = index + dir
      if (index < 0 || target < 0 || target >= lines.length) return prev
      const [item] = lines.splice(index, 1)
      lines.splice(target, 0, item)
      return { ...prev, script: { ...prev.script, lines }, updatedAt: Date.now() }
    })
  }, [])

  const setAudio = useCallback((id: string, audio: AudioState) => {
    setDraft((prev) => ({ ...prev, audio: { ...prev.audio, [id]: audio }, updatedAt: Date.now() }))
  }, [])

  const clearAudio = useCallback((id: string) => {
    setDraft((prev) => {
      const audio = { ...prev.audio }
      delete audio[id]
      return { ...prev, audio, updatedAt: Date.now() }
    })
  }, [])

  const setMaterial = useCallback((id: string, material: LineMaterial | null) => {
    setDraft((prev) => ({ ...prev, material: { ...prev.material, [id]: material }, updatedAt: Date.now() }))
  }, [])

  const setCandidates = useCallback((id: string, candidates: MaterialCandidate[], page: number) => {
    setDraft((prev) => ({
      ...prev,
      candidates: { ...prev.candidates, [id]: candidates },
      page: { ...prev.page, [id]: page },
      updatedAt: Date.now()
    }))
  }, [])

  const setActiveLine = useCallback((id: string | null) => {
    setDraft((prev) => ({ ...prev, activeLineId: id }))
  }, [])

  const loadRecord = useCallback((record: ProjectRecord) => {
    const base = createDraft()
    const incoming = record.draft || {}
    setDraft({
      ...base,
      ...incoming,
      projectId: record.id,
      createdAt: record.createdAt || incoming.createdAt || Date.now(),
      updatedAt: Date.now(),
      step: 0
    })
  }, [])

  const reset = useCallback(() => {
    setDraft(createDraft())
  }, [])

  const duration = useMemo(() => draftDuration(draft), [draft])

  const value = useMemo<StudioApi>(
    () => ({
      draft,
      patch,
      setStep,
      setScript,
      updateLine,
      addLine,
      removeLine,
      moveLine,
      setAudio,
      clearAudio,
      setMaterial,
      setCandidates,
      setActiveLine,
      reset,
      loadRecord,
      duration
    }),
    [
      draft,
      patch,
      setStep,
      setScript,
      updateLine,
      addLine,
      removeLine,
      moveLine,
      setAudio,
      clearAudio,
      setMaterial,
      setCandidates,
      setActiveLine,
      reset,
      loadRecord,
      duration
    ]
  )

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>
}

export function useStudio(): StudioApi {
  const ctx = useContext(StudioContext)
  if (!ctx) throw new Error('StudioProvider missing')
  return ctx
}