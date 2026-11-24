import type { ReactElement } from 'react'
import { Check, Clapperboard, FolderOpen, LibraryBig, RotateCcw, Settings2 } from 'lucide-react'
import { cn } from '../lib/api'
import { draftDuration, useStudio, type Step } from '../studio/store'
import { useSettings } from '../lib/settings'

const STEPS: { title: string; desc: string }[] = [
  { title: '文案脚本', desc: '一个主题，AI 写成口播稿' },
  { title: '配音', desc: '云端音色，逐句试听' },
  { title: '画面素材', desc: '按句匹配可拍摄画面' },
  { title: '成片导出', desc: '字幕、BGM、转场一步到位' }
]

export function Sidebar({
  onSettings,
  onNewProject,
  onStudio,
  onLibrary,
  libraryActive,
  studioActive,
  renderDone
}: {
  onSettings: () => void
  onNewProject: () => void
  onStudio: () => void
  onLibrary: () => void
  libraryActive: boolean
  studioActive: boolean
  renderDone: boolean
}): ReactElement {
  const { draft, setStep } = useStudio()
  const { settings } = useSettings()
  const duration = draftDuration(draft)
  const lines = draft.script?.lines ?? []
  const hasScript = lines.length > 0
  const allVoiced = hasScript && lines.every((l) => draft.audio[l.id])
  const allVisual = hasScript && lines.every((l) => draft.material[l.id])

  const done = [hasScript, allVoiced, allVisual, renderDone]
  const reachable = (index: Step): boolean => index === 0 || hasScript

  return (
    <aside className="sidebar">
      <div className="brand" onClick={onStudio} style={{ cursor: 'pointer' }}>
        <div className="brand-mark">
          <Clapperboard size={19} strokeWidth={2.2} />
        </div>
        <div>
          <div className="brand-name">CloudReel</div>
          <div className="brand-sub">云剪 · 成片工作台</div>
        </div>
      </div>

      <div className="steps">
        <div className="nav-label">制作流程</div>
        {STEPS.map((s, index) => (
          <button
            key={s.title}
            className={cn('step-item', studioActive && draft.step === index && 'active', done[index] && 'done')}
            onClick={() => {
              if (!reachable(index as Step)) return
              onStudio()
              setStep(index as Step)
            }}
            disabled={!reachable(index as Step)}
          >
            <span className="step-index">{done[index] ? <Check size={13} strokeWidth={3} /> : index + 1}</span>
            <span className="step-text">
              <span className="step-title">{s.title}</span>
              <span className="step-desc">{s.desc}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="steps">
        <div className="nav-label">资料</div>
        <button className={cn('step-item', libraryActive && 'active')} onClick={onLibrary}>
          <span className="step-index">
            <LibraryBig size={13} />
          </span>
          <span className="step-text">
            <span className="step-title">作品库</span>
            <span className="step-desc">历史项目与成片</span>
          </span>
        </button>
      </div>

      <div className="sidebar-foot">
        <div className="side-chip">
          <span>口播时长</span>
          <strong className="mono">
            {Math.floor(duration.total / 60)}:{String(Math.round(duration.total) % 60).padStart(2, '0')}
          </strong>
        </div>
        <div className="side-chip">
          <span>句子</span>
          <strong className="mono">
            {lines.length} 句 · {allVoiced ? '已配音' : hasScript ? '待配音' : '—'}
          </strong>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-soft btn-md grow" onClick={onSettings}>
            <Settings2 size={15} />
            <span>设置</span>
          </button>
          <button className="icon-btn" title="新建项目" onClick={onNewProject}>
            <RotateCcw size={15} />
          </button>
        </div>
        <div className="row small faint" style={{ padding: '0 4px' }}>
          <FolderOpen size={12} />
          <span
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={settings?.defaults.outputDir}
          >
            {settings?.defaults.outputDir || '默认输出目录'}
          </span>
        </div>
      </div>
    </aside>
  )
}