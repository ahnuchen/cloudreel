import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import {
  AudioLines,
  CheckCircle2,
  Clapperboard,
  FolderOpen,
  Loader2,
  Music2,
  Play,
  RotateCcw,
  Settings2,
  XCircle
} from 'lucide-react'
import type { Defaults, Orientation, RenderConfig } from '@shared/types'
import { SUBTITLE_FONTS, TRANSITIONS, VIDEO_PRESETS } from '@shared/presets'
import { useStudio } from '../studio/store'
import { useSettings } from '../lib/settings'
import { useRender } from '../lib/render'
import { useToast } from '../lib/toast'
import { api, clamp, cn, fmtDuration, mediaUrl } from '../lib/api'
import { Badge, Btn, Card, Field, Input, Segmented, Select, Toggle } from '../components/ui'
import { voiceOf } from './VoiceStep'

function presetIdOf(width: number, height: number): Orientation {
  if (width === height) return 'square'
  return width > height ? 'landscape' : 'portrait'
}

export function FinishStep({ onOpenSettings, onNewProject }: { onOpenSettings: () => void; onNewProject: () => void }): ReactElement {
  const { draft, patch: patchDraft, setStep, duration } = useStudio()
  const { settings, updateDefaults } = useSettings()
  const render = useRender()
  const toast = useToast()
  const [style, setStyle] = useState<Defaults | null>(settings?.defaults ?? null)
  const initRef = useRef(false)
  const saveTimer = useRef<number | null>(null)
  const pendingRef = useRef<Partial<Defaults>>({})
  const [outputDir, setOutputDir] = useState(settings?.defaults.outputDir ?? '')
  const [notified, setNotified] = useState<string | null>(null)

  useEffect(() => {
    if (!settings || initRef.current) return
    initRef.current = true
    setStyle(settings.defaults)
    setOutputDir(settings.defaults.outputDir)
  }, [settings])

  useEffect(() => {
    if (render.status === 'done' && render.result?.videoPath && notified !== render.result.videoPath) {
      setNotified(render.result.videoPath)
      toast.push('成片渲染完成', 'success')
    }
    if (render.status === 'error' && render.error && notified !== 'error:' + render.error) {
      setNotified('error:' + render.error)
      toast.push(render.error, 'error')
    }
    if (render.status === 'cancelled' && notified !== 'cancelled') {
      setNotified('cancelled')
      toast.push('渲染已取消')
    }
  }, [render.status, render.result, render.error, notified, toast])

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [])

  const lines = draft.script?.lines ?? []
  const allVoiced = lines.length > 0 && lines.every((l) => draft.audio[l.id])
  const matched = lines.filter((l) => draft.material[l.id]).length

  const apply = (patch: Partial<Defaults>): void => {
    setStyle((prev) => (prev ? { ...prev, ...patch } : prev))
    pendingRef.current = { ...pendingRef.current, ...patch }
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      const pending = pendingRef.current
      pendingRef.current = {}
      updateDefaults(pending).catch(() => undefined)
    }, 450)
  }

  const setPreset = (id: (typeof VIDEO_PRESETS)[number]['id']): void => {
    const preset = VIDEO_PRESETS.find((p) => p.id === id)!
    patchDraft({ videoPreset: id })
    apply({ width: preset.width, height: preset.height })
  }

  const chooseBgm = async (): Promise<void> => {
    const file = await api.pickFile([{ name: '音频', extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'] }])
    if (file) apply({ bgmPath: file })
  }

  const chooseDir = async (): Promise<void> => {
    const dir = await api.pickFolder('选择成片输出目录', outputDir)
    if (dir) {
      setOutputDir(dir)
      apply({ outputDir: dir })
    }
  }

  const startRender = async (): Promise<void> => {
    if (!settings || !style || !draft.script || !lines.length) return
    if (!allVoiced) {
      toast.push('还有句子没配音，渲染时会自动补齐，可能需要多等一会儿')
    }
    const width = style.width % 2 === 0 ? style.width : style.width - 1
    const height = style.height % 2 === 0 ? style.height : style.height - 1
    const cfg: RenderConfig = {
      projectId: draft.projectId,
      title: draft.script.title,
      lines: lines.map((l) => ({ id: l.id, text: l.text, material: draft.material[l.id] ?? null })),
      orientation: presetIdOf(width, height),
      width,
      height,
      fps: style.fps,
      transition: {
        enabled: style.transitionEnabled,
        type: style.transitionType,
        duration: style.transitionDuration
      },
      subtitles: {
        enabled: draft.subtitlesEnabled,
        fontName: style.subtitleFont,
        fontSize: style.subtitleFontSize,
        color: style.subtitleColor,
        outlineColor: style.subtitleOutlineColor,
        outline: style.subtitleOutline,
        alignment: style.subtitleAlignment
      },
      bgm: { path: style.bgmPath, volume: style.bgmVolume },
      voice:
        draft.voiceMeta ??
        { provider: settings.tts.provider, voice: voiceOf(settings, settings.tts.provider), speed: settings.tts.speed },
      outputName: draft.outputName || draft.script.title,
      outputDir
    }
    await render.start(cfg)
  }

  const progress = render.progress
  const phases = [
    { key: 'audio', label: '配音', start: 0, end: 35 },
    { key: 'visuals', label: '画面', start: 35, end: 65 },
    { key: 'subtitles', label: '字幕', start: 65, end: 68 },
    { key: 'render', label: '渲染', start: 68, end: 100 }
  ] as const

  const phaseFill = (start: number, end: number): number => {
    if (render.status === 'done') return 100
    const pct = progress?.percent ?? 0
    return clamp(((pct - start) / (end - start)) * 100, 0, 100)
  }

  const activePhase = render.status === 'done' ? 'render' : progress?.step ?? ''

  if (!settings || !style) {
    return (
      <div className="step-stack">
        <div className="empty">正在读取设置…</div>
      </div>
    )
  }

  return (
    <div className="step-stack">
      <div className="page-head">
        <div>
          <h1 className="page-title">最后一步：把素材拼成一条片子</h1>
          <p className="page-desc">字幕按句子精确入场，背景音乐自动压低、结尾淡出。</p>
        </div>
        <Badge tone={allVoiced ? 'ok' : 'warn'}>{allVoiced ? '配音就绪' : '部分句子未配音'}</Badge>
      </div>

      {render.status === 'done' && render.result?.videoPath && (
        <Card
          title="成片"
          desc={`${fmtDuration(render.result.duration ?? duration.total)} · ${style.width}×${style.height}`}
          right={
            <Badge tone="ok">
              <CheckCircle2 size={11} /> 已完成
            </Badge>
          }
        >
          <video className="result-video" src={mediaUrl(render.result.videoPath)} controls playsInline />
          <div className="path-box">
            <span title={render.result.videoPath}>{render.result.videoPath}</span>
            <Btn variant="soft" size="sm" icon={<FolderOpen size={13} />} onClick={() => api.reveal(render.result!.videoPath!)}>
              打开文件夹
            </Btn>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <Btn variant="primary" size="md" icon={<RotateCcw size={14} />} onClick={startRender}>
              按当前设置再渲染一次
            </Btn>
            <Btn variant="outline" size="md" icon={<Clapperboard size={14} />} onClick={onNewProject}>
              新建一条
            </Btn>
            <span className="grow" />
            <span className="small faint">
              {matched}/{lines.length} 句有画面素材
            </span>
          </div>
        </Card>
      )}

      {render.status === 'running' && (
        <Card
          title="正在渲染"
          desc={progress?.detail || 'ffmpeg 正在合成，请保持窗口打开。'}
          right={
            <Btn variant="danger" size="sm" onClick={render.cancel}>
              取消
            </Btn>
          }
        >
          <div className="progress-head">
            <span className="muted small">{progress?.label || '准备中'}</span>
            <span className="progress-pct mono">{progress?.percent ?? 0}%</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress?.percent ?? 0}%` }} />
          </div>
          <div className="pipeline">
            {phases.map((p) => (
              <div className="pipeline-step" key={p.key}>
                <div className="pipeline-bar">
                  <i style={{ width: `${phaseFill(p.start, p.end)}%` }} />
                </div>
                <span className={cn('pipeline-label', activePhase === p.key && 'active')}>{p.label}</span>
              </div>
            ))}
          </div>
          <div className="progress-detail">{progress?.detail ?? ''}</div>
        </Card>
      )}

      {(render.status === 'error' || render.status === 'cancelled') && (
        <div className="banner warn">
          <XCircle size={17} />
          <div className="grow">
            <div className="banner-title">{render.status === 'cancelled' ? '渲染已取消' : '渲染失败'}</div>
            <div style={{ whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto' }}>{render.error}</div>
          </div>
          <Btn variant="soft" size="sm" icon={<RotateCcw size={13} />} onClick={startRender}>
            重试
          </Btn>
        </div>
      )}

      <div className="finish-grid">
        <div className="col" style={{ gap: 16 }}>
          <Card title="画面与节奏">
            <div className="form-stack">
              <Field label="视频比例">
                <div className="chip-row">
                  {VIDEO_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      className={cn(
                        'chip',
                        Math.round(style.width / style.height * 100) === Math.round(p.width / p.height * 100) && 'active'
                      )}
                      onClick={() => setPreset(p.id)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </Field>
              <div className="grid-2">
                <Field label="帧率">
                  <Select value={style.fps} onChange={(e) => apply({ fps: Number(e.target.value) })}>
                    <option value={25}>25 fps</option>
                    <option value={30}>30 fps</option>
                    <option value={60}>60 fps（渲染更慢）</option>
                  </Select>
                </Field>
                <Field label={`分辨率 ${style.width}×${style.height}`} hint="竖屏 1080×1920 已适配抖音/视频号/小红书">
                  <div className="row">
                    <Badge>{style.width} × {style.height}</Badge>
                  </div>
                </Field>
              </div>
              <div className="divider" />
              <Toggle
                checked={style.transitionEnabled}
                onChange={(v) => apply({ transitionEnabled: v })}
                label="片段之间加转场"
                hint="关闭后直接硬切，渲染更快"
              />
              {style.transitionEnabled && (
                <div className="grid-2">
                  <Field
                    label="转场类型"
                    hint={style.transitionType === 'random' ? '每条片段交界随机选一种，不会连续重复' : undefined}
                  >
                    <Select value={style.transitionType} onChange={(e) => apply({ transitionType: e.target.value })}>
                      {TRANSITIONS.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={`转场时长 ${style.transitionDuration.toFixed(1)}s`}>
                    <input
                      type="range"
                      min={0.3}
                      max={1.5}
                      step={0.1}
                      value={style.transitionDuration}
                      onChange={(e) => apply({ transitionDuration: Number(e.target.value) })}
                    />
                  </Field>
                </div>
              )}
            </div>
          </Card>

          <Card title="字幕" desc="按口播句子精确入场，字号会随分辨率等比缩放。">
            <div className="form-stack">
              <Toggle
                checked={draft.subtitlesEnabled}
                onChange={(v) => patchDraft({ subtitlesEnabled: v })}
                label="烧录字幕"
                hint="关闭后成片不带字幕，口播照常保留"
              />
              <div className="grid-2">
                <Field label="字体">
                  <Select value={style.subtitleFont} onChange={(e) => apply({ subtitleFont: e.target.value })}>
                    {SUBTITLE_FONTS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="位置">
                  <Segmented
                    value={String(style.subtitleAlignment)}
                    options={[
                      { id: '8', label: '顶部' },
                      { id: '5', label: '居中' },
                      { id: '2', label: '底部' }
                    ]}
                    onChange={(v) => apply({ subtitleAlignment: Number(v) })}
                  />
                </Field>
              </div>
              <Field label={`字号 ${style.subtitleFontSize}px（以 1080 宽为基准）`}>
                <input
                  type="range"
                  min={36}
                  max={84}
                  step={2}
                  value={style.subtitleFontSize}
                  onChange={(e) => apply({ subtitleFontSize: Number(e.target.value) })}
                />
              </Field>
              <div className="grid-2">
                <Field label="文字颜色">
                  <input type="color" value={style.subtitleColor} onChange={(e) => apply({ subtitleColor: e.target.value })} />
                </Field>
                <Field label="描边颜色">
                  <input
                    type="color"
                    value={style.subtitleOutlineColor}
                    onChange={(e) => apply({ subtitleOutlineColor: e.target.value })}
                  />
                </Field>
              </div>
              <Field label={`描边粗细 ${style.subtitleOutline}px`}>
                <input
                  type="range"
                  min={0}
                  max={6}
                  step={1}
                  value={style.subtitleOutline}
                  onChange={(e) => apply({ subtitleOutline: Number(e.target.value) })}
                />
              </Field>
            </div>
          </Card>

          <Card title="背景音乐">
            <div className="row wrap">
              <Btn variant="soft" size="sm" icon={<Music2 size={13} />} onClick={chooseBgm}>
                {style.bgmPath ? '更换 BGM' : '选择本地 BGM'}
              </Btn>
              {style.bgmPath && (
                <>
                  <span className="small muted" style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {style.bgmPath}
                  </span>
                  <Btn variant="ghost" size="sm" onClick={() => apply({ bgmPath: '' })}>
                    移除
                  </Btn>
                </>
              )}
              {!style.bgmPath && <span className="small faint">不选 BGM 也可以，成片只有口播和画面。</span>}
            </div>
            {style.bgmPath && (
              <Field label={`BGM 音量 ${Math.round(style.bgmVolume * 100)}%`} className="field" hint="默认 18%，口播会更清楚">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={style.bgmVolume}
                  onChange={(e) => apply({ bgmVolume: Number(e.target.value) })}
                />
              </Field>
            )}
          </Card>
        </div>

        <div className="col" style={{ gap: 16 }}>
          <Card title="成片信息">
            <div className="summary-list">
              <div className="summary-item">
                <span>句子</span>
                <strong>{lines.length} 句</strong>
              </div>
              <div className="summary-item">
                <span>预计时长</span>
                <strong className="mono">{fmtDuration(duration.total)}</strong>
              </div>
              <div className="summary-item">
                <span>画面匹配</span>
                <strong>
                  {matched}/{lines.length}
                </strong>
              </div>
              <div className="summary-item">
                <span>配音</span>
                <strong>{allVoiced ? '已完成' : `缺 ${lines.filter((l) => !draft.audio[l.id]).length} 句`}</strong>
              </div>
              <div className="summary-item">
                <span>转场</span>
                <strong>{style.transitionEnabled ? TRANSITIONS.find((t) => t.id === style.transitionType)?.label : '硬切'}</strong>
              </div>
              <div className="summary-item">
                <span>BGM</span>
                <strong>{style.bgmPath ? `${Math.round(style.bgmVolume * 100)}%` : '无'}</strong>
              </div>
            </div>
            <div className="divider" />
            <Field label="输出文件名">
              <Input
                value={draft.outputName}
                onChange={(e) => patchDraft({ outputName: e.target.value })}
                placeholder={draft.script?.title || '给这条片子起个名字'}
              />
            </Field>
            <div className="field" style={{ marginTop: 12 }}>
              <span className="field-label">输出目录</span>
              <div className="row">
                <span className="small muted" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={outputDir}>
                  {outputDir || '未设置'}
                </span>
                <Btn variant="ghost" size="sm" icon={<FolderOpen size={13} />} onClick={chooseDir}>
                  更改
                </Btn>
              </div>
            </div>
            <Btn
              variant="primary"
              size="lg"
              className="grow"
              style={{ width: '100%', marginTop: 16 }}
              icon={<Play size={16} fill="currentColor" />}
              loading={render.status === 'running'}
              disabled={!lines.length || render.status === 'running'}
              onClick={startRender}
            >
              开始渲染成片
            </Btn>
            <div className="row small faint" style={{ marginTop: 8, justifyContent: 'center' }}>
              <AudioLines size={12} />
              <span>输出 H.264 / AAC · 手机端可直接播放</span>
            </div>
          </Card>

          <Card title="小提示">
            <ul className="small muted" style={{ margin: 0, paddingLeft: 16, lineHeight: 1.9 }}>
              <li>渲染时改参数不会影响正在进行的任务。</li>
              <li>素材默认静音，避免和口播打架。</li>
              <li>图片素材会自动做轻微推镜，不会死板地停着。</li>
              <li>先渲染一条 20 秒的试试节奏，再批量做长片。</li>
            </ul>
            <div className="row" style={{ marginTop: 10 }}>
              <Btn variant="ghost" size="sm" icon={<Settings2 size={13} />} onClick={onOpenSettings}>
                打开完整设置
              </Btn>
              <Btn variant="ghost" size="sm" onClick={() => setStep(2)}>
                回上一步
              </Btn>
            </div>
          </Card>
        </div>
      </div>

      <div className="action-bar">
        <div className="action-info">
          <Loader2 size={12} className={render.status === 'running' ? 'spin' : ''} style={{ opacity: render.status === 'running' ? 1 : 0 }} />
          {render.status === 'running' ? ' 正在渲染，可随时取消' : '准备就绪，开始渲染即可导出到本地'}
        </div>
        <div className="row">
          <Btn variant="ghost" size="md" onClick={() => setStep(2)}>
            上一步
          </Btn>
          <Btn
            variant="primary"
            size="md"
            icon={<Play size={14} fill="currentColor" />}
            loading={render.status === 'running'}
            disabled={!lines.length || render.status === 'running'}
            onClick={startRender}
          >
            {render.status === 'done' ? '再渲染一次' : '开始渲染'}
          </Btn>
        </div>
      </div>
    </div>
  )
}