import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import { Play, Square } from 'lucide-react'
import { useStudio } from '../studio/store'
import { useSettings } from '../lib/settings'
import { fmtDuration, mediaUrl } from '../lib/api'
import { MaterialMedia } from './Media'
import { cn } from '../lib/api'

export function PhonePreview(): ReactElement {
  const { draft } = useStudio()
  const { settings } = useSettings()
  const lines = draft.script?.lines ?? []
  const active = lines.find((l) => l.id === draft.activeLineId) ?? lines[0]
  const index = active ? lines.findIndex((l) => l.id === active.id) : -1
  const material = active ? draft.material[active.id] : null
  const audio = active ? draft.audio[active.id] : undefined
  const defaults = settings?.defaults
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

  useEffect(() => {
    audioRef.current?.pause()
    setPlaying(false)
  }, [active?.id])

  const togglePlay = (): void => {
    if (!audio) return
    if (playing && audioRef.current) {
      audioRef.current.pause()
      setPlaying(false)
      return
    }
    const el = new Audio(mediaUrl(audio.path))
    audioRef.current?.pause()
    audioRef.current = el
    el.onended = () => setPlaying(false)
    el.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
  }

  const alignment = defaults?.subtitleAlignment ?? 2
  const posClass = alignment === 8 ? 'top' : alignment === 5 ? 'center' : 'bottom'
  const showSubs = draft.subtitlesEnabled
  const fontSize = defaults ? `${((defaults.subtitleFontSize / 1080) * 100).toFixed(2)}cqw` : '16px'
  const outline = defaults?.subtitleOutline ?? 3
  const subtitleStyle = {
    color: defaults?.subtitleColor || '#FFFFFF',
    fontSize,
    WebkitTextStroke: outline > 0 ? `${(outline * 0.4).toFixed(2)}px ${defaults?.subtitleOutlineColor || '#000'}` : undefined,
    textShadow: '0 1px 4px rgba(0,0,0,.55), 0 0 18px rgba(0,0,0,.35)'
  } as CSSProperties

  const preset = draft.videoPreset
  const materialLabel = material
    ? 'source' in material
      ? material.source
      : '本地素材'
    : '未选画面'

  return (
    <div className="phone-col">
      <div className="phone-cap">
        <span>实时预览</span>
        <span className="mono">
          {active ? `${index + 1}/${lines.length}` : '—'} · {preset === 'portrait' ? '9:16' : preset === 'landscape' ? '16:9' : '1:1'}
        </span>
      </div>
      <div className={cn('phone', preset === 'landscape' && 'landscape', preset === 'square' && 'square')}>
        <div className="phone-screen">
          {material ? (
            <MaterialMedia material={material} className="phone-bg" animateImage />
          ) : (
            <div className="phone-fallback">
              <div className="big">{String(Math.max(index + 1, 1)).padStart(2, '0')}</div>
              <div className="line">
                {active?.text || '输入一个主题，AI 会写成适合口播的短句。这里会实时预览画面、字幕和配音。'}
              </div>
            </div>
          )}
          <div className="phone-scrim" />
          <div className="phone-top">
            <span className="phone-chip">{draft.script ? `第 ${index + 1} 句` : 'CloudReel'}</span>
            <span className="phone-chip">{materialLabel}</span>
          </div>
          {active?.text && showSubs && (
            <div className={cn('phone-subtitle', posClass)} style={subtitleStyle}>
              {active.text}
            </div>
          )}
          <div className="phone-bottom">
            <button className="phone-play" onClick={togglePlay} disabled={!audio} title={audio ? '播放配音' : '尚未生成配音'}>
              {playing ? <Square size={13} fill="currentColor" /> : <Play size={15} fill="currentColor" style={{ marginLeft: 2 }} />}
            </button>
            <span className="phone-time mono">
              {audio ? `${audio.duration.toFixed(1)}s` : active ? '未配音' : '0.0s'}
            </span>
          </div>
        </div>
      </div>
      <div className="preview-note">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
          <span className="muted">成片预估</span>
          <span className="mono" style={{ color: 'var(--text)' }}>
            {fmtDuration(
              lines.reduce((sum, l, i) => {
                const a = draft.audio[l.id]
                return sum + (a?.duration ?? 1.5) + (i < lines.length - 1 ? 0.16 : 0.45)
              }, 0)
            )}
          </span>
        </div>
        视频素材会直接播放；图片素材用缓慢推拉模拟成片的 zoompan 效果。最终以 ffmpeg 渲染结果为准，字幕会按视频分辨率等比缩放。
      </div>
    </div>
  )
}