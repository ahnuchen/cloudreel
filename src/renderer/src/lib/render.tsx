import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import type { RenderConfig, RenderProgress, RenderResult } from '@shared/types'
import { api } from './api'

export type RenderStatus = 'idle' | 'running' | 'done' | 'error' | 'cancelled'

interface RenderApi {
  status: RenderStatus
  progress: RenderProgress | null
  result: RenderResult | null
  error: string | null
  start: (cfg: RenderConfig) => Promise<void>
  cancel: () => void
  clear: () => void
}

const RenderContext = createContext<RenderApi | null>(null)

export function RenderProvider({ children }: { children: ReactNode }): ReactElement {
  const [status, setStatus] = useState<RenderStatus>('idle')
  const [progress, setProgress] = useState<RenderProgress | null>(null)
  const [result, setResult] = useState<RenderResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const jobRef = useRef<string | null>(null)
  const runningRef = useRef(false)

  useEffect(() => {
    const off = api.onRenderProgress((p) => {
      setProgress(p)
      jobRef.current = p.jobId
    })
    return off
  }, [])

  const start = useCallback(async (cfg: RenderConfig) => {
    if (runningRef.current) return
    runningRef.current = true
    setStatus('running')
    setProgress(null)
    setResult(null)
    setError(null)
    jobRef.current = null
    try {
      const res = await api.startRender(cfg)
      if (res.ok) {
        setStatus('done')
        setResult(res)
        setProgress((prev) => (prev ? { ...prev, step: 'done', percent: 100, label: '成片完成' } : prev))
      } else if (res.cancelled) {
        setStatus('cancelled')
        setError('渲染已取消')
      } else {
        setStatus('error')
        setError(res.error || '渲染失败')
      }
    } catch (e: any) {
      setStatus('error')
      setError(e?.message || String(e))
    } finally {
      runningRef.current = false
    }
  }, [])

  const cancel = useCallback(() => {
    api.cancelRender(jobRef.current ?? undefined)
  }, [])

  const clear = useCallback(() => {
    if (runningRef.current) return
    setStatus('idle')
    setProgress(null)
    setResult(null)
    setError(null)
  }, [])

  const value = useMemo<RenderApi>(
    () => ({ status, progress, result, error, start, cancel, clear }),
    [status, progress, result, error, start, cancel, clear]
  )

  return <RenderContext.Provider value={value}>{children}</RenderContext.Provider>
}

export function useRender(): RenderApi {
  const ctx = useContext(RenderContext)
  if (!ctx) throw new Error('RenderProvider missing')
  return ctx
}