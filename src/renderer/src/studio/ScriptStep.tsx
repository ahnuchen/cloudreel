import { useMemo, useState, type ReactElement } from 'react'
import { ArrowDown, ArrowUp, FileText, Plus, Scissors, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { STYLE_PRESETS } from '@shared/presets'
import type { ScriptDoc } from '@shared/types'
import { useStudio } from '../studio/store'
import { useSettings } from '../lib/settings'
import { useToast } from '../lib/toast'
import { api, cn, estimateSeconds, uid } from '../lib/api'
import { splitSentences, visualQueryFromSentence } from '../lib/text'
import { Badge, Btn, Card, Empty, Field, Input, Segmented, Select, Textarea } from '../components/ui'

const LENGTHS = [
  { chars: 60, label: '60 字 · 约 20 秒' },
  { chars: 120, label: '120 字 · 约 40 秒' },
  { chars: 300, label: '300 字 · 约 90 秒' },
  { chars: 600, label: '600 字 · 约 3 分钟' }
]

export function ScriptStep(): ReactElement {
  const { draft, patch, setScript, updateLine, addLine, removeLine, moveLine, setActiveLine, setStep, duration } = useStudio()
  const { settings } = useSettings()
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const lines = draft.script?.lines ?? []
  const source = draft.scriptSource ?? 'ai'
  const style = STYLE_PRESETS.find((s) => s.id === draft.styleId) ?? STYLE_PRESETS[0]

  const estimate = useMemo(() => lines.reduce((sum, l) => sum + estimateSeconds(l.text), 0), [lines])
  const manualSentences = useMemo(() => splitSentences(draft.manualText), [draft.manualText])

  const switchSource = (next: 'ai' | 'manual'): void => {
    const manualText = draft.manualText || (draft.script?.lines.map((l) => l.text).join('\n') ?? '')
    patch({ scriptSource: next, ...(next === 'manual' && !draft.manualText ? { manualText } : {}) })
  }

  const splitManual = (): void => {
    const text = draft.manualText.trim()
    if (!text) {
      toast.push('先把完整文案贴进来', 'error')
      return
    }
    const sentences = splitSentences(text)
    if (!sentences.length) {
      toast.push('没有识别到句子，检查一下标点或换行', 'error')
      return
    }
    if (lines.some((l) => draft.audio[l.id])) {
      const ok = window.confirm('重新拆分会清除已生成的配音和画面匹配，继续吗？')
      if (!ok) return
    }
    const title =
      draft.topic.trim() ||
      sentences[0].replace(/[。！？!?；;…\s]+/g, '').slice(0, 30) ||
      '手动文案'
    const doc: ScriptDoc = {
      title,
      hashtags: [],
      lines: sentences.map((sentence) => ({
        id: uid(),
        text: sentence,
        visualQuery: visualQueryFromSentence(sentence)
      }))
    }
    setScript(doc)
    toast.push(`已按原文拆成 ${doc.lines.length} 句，可以逐句修改`, 'success')
  }

  const generate = async (): Promise<void> => {
    if (!draft.topic.trim()) {
      toast.push('先写一个主题，比如「隔夜菜到底能不能吃」', 'error')
      return
    }
    if (lines.some((l) => draft.audio[l.id])) {
      const ok = window.confirm('重新生成脚本会清除已生成的配音和画面匹配，继续吗？')
      if (!ok) return
    }
    setLoading(true)
    try {
      const doc = await api.generateScript({
        topic: draft.topic.trim(),
        style: draft.styleId === 'custom' ? draft.customStyle : style.prompt,
        styleId: draft.styleId,
        language: draft.language,
        chars: draft.chars
      })
      setScript(doc)
      toast.push(`写好 ${doc.lines.length} 句口播稿，可以直接编辑`, 'success')
    } catch (e: any) {
      toast.push(e.message || String(e), 'error')
    } finally {
      setLoading(false)
    }
  }

  const llmReady = Boolean(settings?.llm.baseUrl && settings?.llm.apiKey)

  return (
    <div className="step-stack">
      <div className="page-head">
        <div>
          <h1 className="page-title">{source === 'manual' ? '把你的全文贴进来' : '先定一个能让人停下来的主题'}</h1>
          <p className="page-desc">
            {source === 'manual'
              ? '按原文标点和换行拆句，不改写你的内容。'
              : 'AI 负责拆句和配画面关键词，你负责判断它值不值得讲。'}
          </p>
        </div>
        <Badge tone={source === 'manual' ? 'accent' : llmReady ? 'ok' : 'warn'}>
          {source === 'manual' ? '手动输入全文' : llmReady ? `文案模型 · ${settings?.llm.model}` : '文案模型未配置'}
        </Badge>
      </div>

      <Card
        title="文稿来源"
        desc={source === 'manual' ? '粘贴完整口播稿，按原句拆分，不改写内容。' : '一句话主题即可。越具体，写出来越像人话。'}
        right={source === 'ai' ? <span className="small faint">Ctrl/⌘ + Enter 生成</span> : <span className="small faint">{manualSentences.length} 句</span>}
      >
        <div className="form-stack">
          <Field label="生成方式">
            <Segmented
              value={source}
              options={[
                { id: 'ai', label: 'AI 生成' },
                { id: 'manual', label: '粘贴全文' }
              ]}
              onChange={switchSource}
            />
          </Field>

          {source === 'ai' ? (
            <div className="topic-box">
              <Textarea
                value={draft.topic}
                onChange={(e) => patch({ topic: e.target.value })}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') generate()
                }}
                placeholder="例如：隔夜菜到底能不能吃？拆穿三个流传最广的谣言"
              />
              <div className="chip-row">
                {STYLE_PRESETS.map((s) => (
                  <button
                    key={s.id}
                    className={cn('chip', draft.styleId === s.id && 'active')}
                    onClick={() => patch({ styleId: s.id })}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {draft.styleId === 'custom' && (
                <Field label="自定义风格描述">
                  <Input
                    value={draft.customStyle}
                    onChange={(e) => patch({ customStyle: e.target.value })}
                    placeholder="例如：像朋友聊天一样，多讲亲身经历，结尾留一个反问"
                  />
                </Field>
              )}
              <div className="grid-3">
                <Field label="口播语言">
                  <Select value={draft.language} onChange={(e) => patch({ language: e.target.value as typeof draft.language })}>
                    <option value="zh-CN">简体中文</option>
                    <option value="zh-TW">繁體中文</option>
                    <option value="en">English</option>
                  </Select>
                </Field>
                <Field label="篇幅">
                  <Select value={draft.chars} onChange={(e) => patch({ chars: Number(e.target.value) })}>
                    {LENGTHS.map((l) => (
                      <option key={l.chars} value={l.chars}>
                        {l.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="field">
                  <span className="field-label">&nbsp;</span>
                  <Btn variant="primary" size="md" icon={<Sparkles size={15} />} loading={loading} onClick={generate}>
                    {lines.length ? '重新生成文案' : '生成口播稿'}
                  </Btn>
                </div>
              </div>
              {!llmReady && <div className="inline-error">还没有配置文本模型，先去「设置 → 文本模型」填 Key。</div>}
            </div>
          ) : (
            <div className="topic-box">
              <Textarea
                value={draft.manualText}
                onChange={(e) => patch({ manualText: e.target.value })}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') splitManual()
                }}
                placeholder={'把完整文案粘贴到这里…\n\n支持按 。！？； 和换行拆分，保留原文和标点。'}
                style={{ minHeight: 220 }}
              />
              <div className="row">
                <Btn variant="primary" size="md" icon={<Scissors size={15} />} onClick={splitManual}>
                  {lines.length ? '重新拆分句子' : '按句拆分'}
                </Btn>
                <span className="small faint">
                  {[...draft.manualText].length} 字 · 预计 {manualSentences.length} 句 · Ctrl/⌘ + Enter 拆分
                </span>
              </div>
              <div className="small faint">
                拆分后仍可逐句修改。每句默认拿原文当画面搜索词，建议到下一步换成更具体的英文关键词。
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card
        title="口播稿"
        desc={lines.length ? '直接改文字，回车换行；改过的句子需要重新配音。' : undefined}
        right={
          lines.length ? (
            <div className="row small faint">
              <span>{lines.length} 句</span>
              <span>·</span>
              <span>约 {Math.round(estimate)} 秒</span>
            </div>
          ) : undefined
        }
      >
        {!lines.length ? (
          <Empty
            icon={<FileText size={20} />}
            title={
              loading
                ? '正在写稿…'
                : source === 'manual'
                  ? '粘贴全文后按句拆分'
                  : '这里会出现你的口播稿'
            }
            desc={
              loading
                ? '模型正在拆句、配画面关键词，大约需要 5-20 秒。'
                : source === 'manual'
                  ? '把完整文案贴到上面，点「按句拆分」，会按原文标点和换行逐句拆开，不改写内容。'
                  : '输入主题并点击「生成口播稿」。生成后每一句都可以单独修改、上下移动。'
            }
            action={
              source === 'manual' ? (
                draft.manualText.trim() ? (
                  <Btn variant="outline" size="sm" icon={<Scissors size={14} />} onClick={splitManual}>
                    按句拆分
                  </Btn>
                ) : undefined
              ) : !loading && draft.topic ? (
                <Btn variant="outline" size="sm" icon={<Wand2 size={14} />} onClick={generate}>
                  用当前主题生成
                </Btn>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="row" style={{ marginBottom: 6 }}>
              <Input
                value={draft.script?.title ?? ''}
                onChange={(e) =>
                  draft.script &&
                  patch({ script: { ...draft.script, title: e.target.value } })
                }
                placeholder="视频标题"
                style={{ fontWeight: 600 }}
              />
              <Badge tone="accent">{draft.script?.hashtags?.[0] || '未加话题'}</Badge>
            </div>
            {!!draft.script?.hashtags?.length && (
              <div className="hash-row">
                {draft.script.hashtags.map((h) => (
                  <span key={h} className="badge">
                    {h}
                  </span>
                ))}
              </div>
            )}
            <div className="script-list" style={{ marginTop: 10 }}>
              {lines.map((line, index) => {
                const chars = [...line.text].length
                const voiced = Boolean(draft.audio[line.id])
                return (
                  <div
                    key={line.id}
                    className={cn('script-row', draft.activeLineId === line.id && 'active')}
                    onClick={() => setActiveLine(line.id)}
                  >
                    <span className="script-num">{String(index + 1).padStart(2, '0')}</span>
                    <div className="script-main">
                      <Textarea
                        className="script-text"
                        rows={Math.max(2, Math.ceil(chars / 28))}
                        value={line.text}
                        onFocus={() => setActiveLine(line.id)}
                        onChange={(e) => updateLine(line.id, { text: e.target.value })}
                      />
                      <div className="script-query">
                        <span className="small faint" style={{ flex: 'none' }}>
                          画面关键词
                        </span>
                        <Input
                          value={line.visualQuery}
                          onChange={(e) => updateLine(line.id, { visualQuery: e.target.value })}
                          placeholder="english stock query，例如 close-up of noodles"
                        />
                      </div>
                      <div className="script-meta">
                        <span>{chars} 字</span>
                        <span>≈ {estimateSeconds(line.text).toFixed(1)}s</span>
                        {voiced && <span style={{ color: 'var(--ok)' }}>已配音</span>}
                      </div>
                    </div>
                    <div className="script-actions">
                      <button className="icon-btn" title="上移" onClick={() => moveLine(line.id, -1)} disabled={index === 0}>
                        <ArrowUp size={13} />
                      </button>
                      <button
                        className="icon-btn"
                        title="下移"
                        onClick={() => moveLine(line.id, 1)}
                        disabled={index === lines.length - 1}
                      >
                        <ArrowDown size={13} />
                      </button>
                      <button className="icon-btn" title="删除" onClick={() => removeLine(line.id)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            <Btn variant="ghost" size="sm" icon={<Plus size={14} />} onClick={addLine} style={{ marginTop: 4 }}>
              再加一句
            </Btn>
          </>
        )}
      </Card>

      <div className="action-bar">
        <div className="action-info">
          {lines.length ? (
            <>
              共 <strong>{lines.length}</strong> 句，预计 <strong>{Math.round(estimate)}s</strong> 口播
            </>
          ) : (
            '先生成或手写至少一句文案'
          )}
        </div>
        <div className="row">
          <Btn variant="primary" size="md" disabled={!lines.length} onClick={() => setStep(1)}>
            下一步：配音
          </Btn>
        </div>
      </div>
    </div>
  )
}