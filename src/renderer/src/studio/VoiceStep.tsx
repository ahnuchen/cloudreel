import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { AudioLines, Play, RefreshCw, Settings2, Square, Volume2 } from 'lucide-react'
import { TTS_PROVIDERS, voicesFor } from '@shared/presets'
import type { TTSProviderId } from '@shared/types'
import { useStudio } from '../studio/store'
import { useSettings } from '../lib/settings'
import { useToast } from '../lib/toast'
import { api, cn, fmtDuration, mediaUrl } from '../lib/api'
import { Badge, Btn, Card, Field, Select } from '../components/ui'
import { VoicePicker } from '../components/VoicePicker'

export function ttsConfigReady(settings: ReturnType<typeof useSettings>['settings']): boolean {
  if (!settings) return false
  const t = settings.tts
  switch (t.provider) {
    case 'bailian':
      return Boolean(t.bailian.apiKey || (settings.llm.baseUrl.includes('token-plan.') && settings.llm.apiKey))
    case 'dashscope':
      return Boolean(t.dashscope.apiKey)
    case 'aliyun-nls':
      return Boolean(t.nls.accessKeyId && t.nls.accessKeySecret && t.nls.appKey)
    case 'openai':
      return Boolean(t.openai.apiKey && t.openai.baseUrl)
    case 'azure':
      return Boolean(t.azure.key && t.azure.region)
    case 'tencent':
      return Boolean(t.tencent.secretId && t.tencent.secretKey)
    default:
      return false
  }
}

export function voiceOf(settings: ReturnType<typeof useSettings>['settings'], provider: TTSProviderId): string {
  if (!settings) return ''
  const t = settings.tts
  switch (provider) {
    case 'bailian':
      return t.bailian.voice
    case 'dashscope':
      return t.dashscope.voice
    case 'aliyun-nls':
      return t.nls.voice
    case 'openai':
      return t.openai.voice
    case 'azure':
      return t.azure.voice
    default:
      return String(t.tencent.voiceType)
  }
}

export function VoiceStep({ onOpenSettings }: { onOpenSettings: () => void }): ReactElement {
  const { draft, patch, setAudio, clearAudio, setActiveLine, setStep, duration } = useStudio()
  const { settings, updateTts } = useSettings()
  const toast = useToast()
  const lines = draft.script?.lines ?? []
  const provider = (settings?.tts.provider ?? 'bailian') as TTSProviderId
  const voices = useMemo(() => voicesFor(provider), [provider])
  const [voice, setVoice] = useState('')
  const [speed, setSpeed] = useState(1)
  const [testing, setTesting] = useState(false)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [bulk, setBulk] = useState<{ running: boolean; done: number; total: number } | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const cancelRef = useRef(false)
  const ready = ttsConfigReady(settings)

  useEffect(() => {
    if (!settings) return
    setVoice(voiceOf(settings, provider))
    setSpeed(settings.tts.speed || 1)
  }, [settings?.tts.provider, settings?.tts.speed, provider, settings])

  useEffect(() => {
    return () => audioRef.current?.pause()
  }, [])

  useEffect(() => {
    if (!settings) return
    if (Math.abs(speed - (settings.tts.speed || 1)) < 0.001) return
    const timer = window.setTimeout(() => {
      updateTts({ speed }).catch(() => undefined)
    }, 500)
    return () => window.clearTimeout(timer)
  }, [speed, settings, updateTts])

  const playFile = (path: string, id?: string): void => {
    audioRef.current?.pause()
    const el = new Audio(mediaUrl(path))
    audioRef.current = el
    setPlayingId(id ?? null)
    el.onended = () => setPlayingId(null)
    el.play().catch(() => toast.push('音频播放失败', 'error'))
  }

  const persistVoice = (v: string): void => {
    setVoice(v)
    const patch =
      provider === 'bailian'
        ? { bailian: { voice: v } }
        : provider === 'dashscope'
          ? { dashscope: { voice: v } }
        : provider === 'aliyun-nls'
          ? { nls: { voice: v } }
          : provider === 'openai'
            ? { openai: { voice: v } }
            : provider === 'azure'
              ? { azure: { voice: v } }
              : { tencent: { voiceType: Number(v) || 101001 } }
    updateTts(patch as any).catch(() => undefined)
  }

  const test = async (): Promise<void> => {
    if (!ready) {
      toast.push('先完善当前语音服务商的配置', 'error')
      onOpenSettings()
      return
    }
    setTesting(true)
    try {
      const res = await api.previewVoice({ text: '你好，我是你的短视频配音，这是一段试听。', voice, provider, speed })
      playFile(res.path)
    } catch (e: any) {
      toast.push(e.message || String(e), 'error')
    } finally {
      setTesting(false)
    }
  }

  const synthOne = async (lineId: string, text: string): Promise<boolean> => {
    patch({ voiceMeta: { provider, voice, speed } })
    setBusy((prev) => ({ ...prev, [lineId]: true }))
    try {
      const res = await api.synthesizeLine({ projectId: draft.projectId, text, voice, provider, speed })
      setAudio(lineId, { path: res.path, duration: res.duration })
      return true
    } catch (e: any) {
      toast.push(`「${text.slice(0, 12)}…」配音失败：${e.message || e}`, 'error')
      return false
    } finally {
      setBusy((prev) => {
        const next = { ...prev }
        delete next[lineId]
        return next
      })
    }
  }

  const generateAll = async (force = false): Promise<void> => {
    if (!ready) {
      toast.push('先完善当前语音服务商的配置', 'error')
      onOpenSettings()
      return
    }
    const targets = lines.filter((l) => l.text.trim() && (force || !draft.audio[l.id]))
    if (!targets.length) {
      toast.push('所有句子都已经配过音了')
      return
    }
    cancelRef.current = false
    setBulk({ running: true, done: 0, total: targets.length })
    let cursor = 0
    let done = 0
    let failed = 0
    const workers = Array.from({ length: Math.min(2, targets.length) }, async () => {
      while (!cancelRef.current) {
        const index = cursor++
        if (index >= targets.length) break
        const line = targets[index]
        const ok = await synthOne(line.id, line.text)
        if (!ok) failed++
        done++
        setBulk({ running: true, done, total: targets.length })
      }
    })
    await Promise.all(workers)
    setBulk(null)
    if (cancelRef.current) toast.push('已停止剩余配音')
    else if (failed) toast.push(`配音完成，${failed} 句失败，可单独重试`, 'error')
    else toast.push(`配音完成，共 ${done} 句`, 'success')
  }

  const stop = (): void => {
    cancelRef.current = true
  }

  const allVoiced = lines.length > 0 && lines.every((l) => draft.audio[l.id])
  const missing = lines.filter((l) => !draft.audio[l.id]).length

  return (
    <div className="step-stack">
      <div className="page-head">
        <div>
          <h1 className="page-title">给稿子配上一个对的声音</h1>
          <p className="page-desc">逐句合成，时长精确到 0.01 秒 —— 字幕不用再靠语音识别对齐。</p>
        </div>
        <Badge tone={allVoiced ? 'ok' : ready ? 'accent' : 'warn'}>
          {allVoiced ? '全部已配音' : ready ? `待配音 ${missing} 句` : '语音服务未配置'}
        </Badge>
      </div>

      <Card
        title="音色"
        desc={TTS_PROVIDERS.find((p) => p.id === provider)?.desc}
        right={
          <Btn variant="ghost" size="sm" icon={<Settings2 size={13} />} onClick={onOpenSettings}>
            配置
          </Btn>
        }
      >
        <div className="voice-top">
          <Field label="语音服务商">
            <Select
              value={provider}
              onChange={(e) => updateTts({ provider: e.target.value as TTSProviderId }).catch(() => undefined)}
            >
              {TTS_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="音色（可搜索名称或 ID，也可直接输入）">
            <VoicePicker value={voice} voices={voices} onChange={persistVoice} placeholder="点击展开，搜索音色" />
          </Field>
          <div className="row" style={{ gap: 8 }}>
            <Btn variant="outline" size="md" loading={testing} icon={<Volume2 size={15} />} onClick={test}>
              试听
            </Btn>
          </div>
        </div>
        <div className="row" style={{ marginTop: 14, gap: 14 }}>
          <span className="field-label" style={{ flex: 'none' }}>
            语速 × {speed.toFixed(2)}
          </span>
          <input
            type="range"
            min={0.7}
            max={1.4}
            step={0.05}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            onMouseUp={() => updateTts({ speed }).catch(() => undefined)}
            onTouchEnd={() => updateTts({ speed }).catch(() => undefined)}
            style={{ maxWidth: 280 }}
          />
          <span className="small faint">默认 1.00，1.15 左右更适合短视频口播</span>
        </div>
        <div className="row" style={{ marginTop: 16 }}>
          <Btn variant="primary" size="md" loading={Boolean(bulk?.running)} icon={<AudioLines size={15} />} onClick={() => generateAll(false)}>
            {missing === lines.length ? '生成全部配音' : `补齐 ${missing} 句配音`}
          </Btn>
          <Btn variant="soft" size="md" disabled={Boolean(bulk?.running)} icon={<RefreshCw size={14} />} onClick={() => generateAll(true)}>
            全部重配
          </Btn>
          {bulk?.running && (
            <>
              <span className="small muted">
                {bulk.done}/{bulk.total}
              </span>
              <Btn variant="ghost" size="sm" onClick={stop}>
                停止
              </Btn>
            </>
          )}
          <span className="grow" />
          <span className="small faint">总时长 {fmtDuration(duration.voiced)}</span>
        </div>
        {!ready && <div className="inline-error" style={{ marginTop: 10 }}>当前语音服务商还缺配置，去「设置 → 语音合成」补齐。</div>}
      </Card>

      <Card title="逐句配音" desc="点句子可在右侧预览；单句失败不影响其他句子。">
        <div className="voice-list">
          {lines.map((line, index) => {
            const audio = draft.audio[line.id]
            return (
              <div
                key={line.id}
                className={cn('voice-row')}
                onClick={() => setActiveLine(line.id)}
                style={{ cursor: 'pointer' }}
              >
                <span className="script-num">{String(index + 1).padStart(2, '0')}</span>
                <span className="voice-text" title={line.text}>
                  {line.text}
                </span>
                <span className="voice-act">
                  {audio ? <Badge tone="ok">{audio.duration.toFixed(1)}s</Badge> : <Badge>未配音</Badge>}
                  <button
                    className="icon-btn"
                    title={playingId === line.id ? '停止' : '播放'}
                    disabled={!audio}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!audio) return
                      if (playingId === line.id) {
                        audioRef.current?.pause()
                        setPlayingId(null)
                      } else playFile(audio.path, line.id)
                    }}
                  >
                    {playingId === line.id ? <Square size={12} /> : <Play size={13} />}
                  </button>
                  <button
                    className="icon-btn"
                    title="重新生成这一句"
                    disabled={busy[line.id] || Boolean(bulk?.running)}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (audio) {
                        clearAudio(line.id)
                      }
                      synthOne(line.id, line.text)
                    }}
                  >
                    {busy[line.id] ? <RefreshCw size={13} className="spin" /> : <RefreshCw size={13} />}
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      </Card>

      <div className="action-bar">
        <div className="action-info">
          已配音 <strong>{lines.filter((l) => draft.audio[l.id]).length}</strong> / {lines.length} 句
          {!allVoiced && <span className="faint"> · 建议补全后再进入下一步</span>}
        </div>
        <div className="row">
          <Btn variant="ghost" size="md" onClick={() => setStep(0)}>
            上一步
          </Btn>
          <Btn variant="primary" size="md" disabled={!allVoiced} onClick={() => setStep(2)}>
            下一步：画面
          </Btn>
        </div>
      </div>
    </div>
  )
}