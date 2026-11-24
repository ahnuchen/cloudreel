import { type ReactElement } from 'react'
import { KeyRound, Settings2, Sparkles } from 'lucide-react'
import { useStudio } from './store'
import { useSettings } from '../lib/settings'
import { Btn } from '../components/ui'
import { PhonePreview } from '../components/PhonePreview'
import { ScriptStep } from './ScriptStep'
import { VoiceStep, ttsConfigReady } from './VoiceStep'
import { VisualStep } from './VisualStep'
import { FinishStep } from './FinishStep'

export function Studio({ onOpenSettings, onNewProject }: { onOpenSettings: () => void; onNewProject: () => void }): ReactElement {
  const { draft } = useStudio()
  const { settings } = useSettings()

  const llmReady = Boolean(settings?.llm.baseUrl && settings?.llm.apiKey)
  const ttsReady = ttsConfigReady(settings)
  const unconfigured = !llmReady || !ttsReady

  const step = draft.script || draft.step === 0 ? draft.step : 0

  return (
    <div className="studio-grid">
      <div className="step-stack">
        {unconfigured && (
          <div className="banner">
            <KeyRound size={17} />
            <div className="grow">
              <div className="banner-title">还差一步就能生成</div>
              <div className="small faint">
                {!llmReady ? '文本模型' : ''}
                {!llmReady && !ttsReady ? ' 和 ' : ''}
                {!ttsReady ? '语音合成' : ''}
                还没有配置 Key。CloudReel 全部走云服务，不需要在本机装任何模型。
              </div>
            </div>
            <Btn variant="primary" size="sm" icon={<Settings2 size={13} />} onClick={onOpenSettings}>
              去配置
            </Btn>
          </div>
        )}

        {step === 0 && <ScriptStep />}
        {step === 1 && <VoiceStep onOpenSettings={onOpenSettings} />}
        {step === 2 && <VisualStep onOpenSettings={onOpenSettings} />}
        {step === 3 && <FinishStep onOpenSettings={onOpenSettings} onNewProject={onNewProject} />}

        {step === 0 && draft.script && (
          <div className="row small faint" style={{ paddingLeft: 4 }}>
            <Sparkles size={12} />
            <span>文案会随手保存到本机，关掉窗口再打开还在。</span>
          </div>
        )}
      </div>
      <PhonePreview />
    </div>
  )
}