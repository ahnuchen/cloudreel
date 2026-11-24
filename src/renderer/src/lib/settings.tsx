import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import type { AppSettings, Defaults } from '@shared/types'
import { api } from './api'

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

interface SettingsApi {
  settings: AppSettings | null
  loading: boolean
  saving: boolean
  save: (patch: DeepPartial<AppSettings>) => Promise<AppSettings>
  reload: () => Promise<void>
  updateDefaults: (patch: Partial<Defaults>) => Promise<AppSettings>
  updateTts: (patch: DeepPartial<AppSettings['tts']>) => Promise<AppSettings>
}

const SettingsContext = createContext<SettingsApi>({
  settings: null,
  loading: true,
  saving: false,
  save: async () => {
    throw new Error('not ready')
  },
  reload: async () => {},
  updateDefaults: async () => {
    throw new Error('not ready')
  },
  updateTts: async () => {
    throw new Error('not ready')
  }
})

export function SettingsProvider({ children }: { children: ReactNode }): ReactElement {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const reload = useCallback(async () => {
    const s = await api.getSettings()
    setSettings(s)
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const save = useCallback(async (patch: DeepPartial<AppSettings>) => {
    setSaving(true)
    try {
      const next = await api.saveSettings(patch as Partial<AppSettings>)
      setSettings(next)
      return next
    } finally {
      setSaving(false)
    }
  }, [])

  const updateDefaults = useCallback(
    async (patch: Partial<Defaults>) => {
      const current = settings
      const next = await api.saveSettings({ defaults: { ...(current?.defaults as Defaults), ...patch } } as Partial<AppSettings>)
      setSettings(next)
      return next
    },
    [settings]
  )

  const updateTts = useCallback(
    async (patch: DeepPartial<AppSettings['tts']>) => {
      const current = settings
      const merged = {
        ...(current?.tts as AppSettings['tts']),
        ...patch,
        bailian: { ...current!.tts.bailian, ...(patch as any).bailian },
        dashscope: { ...current!.tts.dashscope, ...(patch as any).dashscope },
        nls: { ...current!.tts.nls, ...(patch as any).nls },
        openai: { ...current!.tts.openai, ...(patch as any).openai },
        azure: { ...current!.tts.azure, ...(patch as any).azure },
        tencent: { ...current!.tts.tencent, ...(patch as any).tencent }
      }
      const next = await api.saveSettings({ tts: merged } as Partial<AppSettings>)
      setSettings(next)
      return next
    },
    [settings]
  )

  const value = useMemo<SettingsApi>(
    () => ({ settings, loading, saving, save, reload, updateDefaults, updateTts }),
    [settings, loading, saving, save, reload, updateDefaults, updateTts]
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsApi {
  return useContext(SettingsContext)
}