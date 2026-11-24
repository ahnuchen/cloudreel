import { useEffect, useRef, useState, type ReactElement } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Cpu,
  Eye,
  EyeOff,
  FolderOpen,
  KeyRound,
  Save,
  Server,
  Wallet
} from 'lucide-react'
import type { AppSettings, ProviderTestResult, TTSProviderId } from '@shared/types'
import { LLM_PRESETS, TTS_PROVIDERS, VOICES } from '@shared/presets'
import { useSettings } from '../lib/settings'
import { useToast } from '../lib/toast'
import { api, cn } from '../lib/api'
import { Badge, Btn, Card, Field, Input, Segmented, Select, StatusDot, Toggle } from '../components/ui'
import { VoicePicker } from '../components/VoicePicker'
import { applyTheme } from '../lib/theme'

type Tab = 'llm' | 'tts' | 'stock' | 'general'

const TABS: { id: Tab; label: string }[] = [
  { id: 'llm', label: '文本模型' },
  { id: 'tts', label: '语音合成' },
  { id: 'stock', label: '素材源' },
  { id: 'general', label: '通用与数据' }
]

export function SettingsPage({ onBack }: { onBack: () => void }): ReactElement {
  const { settings, save, saving } = useSettings()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('llm')
  const [form, setForm] = useState<AppSettings | null>(settings)
  const [testing, setTesting] = useState<'llm' | 'tts' | null>(null)
  const [results, setResults] = useState<{ llm?: ProviderTestResult; tts?: ProviderTestResult }>({})
  const [show, setShow] = useState<Record<string, boolean>>({})
  const [info, setInfo] = useState<{ version: string; dataDir: string; projectsDir: string; ffmpeg: { ok: boolean; path: string; version: string } } | null>(null)

  useEffect(() => {
    if (settings) setForm(settings)
  }, [settings])

  useEffect(() => {
    api.appInfo().then(setInfo).catch(() => undefined)
  }, [])

  if (!form) return <div className="empty">正在读取设置…</div>

  const setLLM = (patch: Partial<AppSettings['llm']>): void => setForm((f) => (f ? { ...f, llm: { ...f.llm, ...patch } } : f))
  const customRef = useRef<{ baseUrl: string; model: string }>({ baseUrl: '', model: '' })
  const chooseLLMPreset = (p: (typeof LLM_PRESETS)[number]): void => {
    if (form.llm.presetId === 'custom') customRef.current = { baseUrl: form.llm.baseUrl, model: form.llm.model }
    if (p.id === 'custom') {
      setLLM({ presetId: 'custom', baseUrl: customRef.current.baseUrl, model: customRef.current.model })
      return
    }
    setLLM({ presetId: p.id, baseUrl: p.baseUrl || form.llm.baseUrl, model: p.models[0] || form.llm.model })
  }
  const setTTS = (patch: Partial<AppSettings['tts']>): void => setForm((f) => (f ? { ...f, tts: { ...f.tts, ...patch } } : f))
  const setStock = (patch: Partial<AppSettings['stock']>): void => setForm((f) => (f ? { ...f, stock: { ...f.stock, ...patch } } : f))
  const setDefaults = (patch: Partial<AppSettings['defaults']>): void =>
    setForm((f) => (f ? { ...f, defaults: { ...f.defaults, ...patch } } : f))

  const persist = async (): Promise<AppSettings | null> => {
    try {
      const next = await save(form)
      setForm(next)
      toast.push('设置已保存', 'success')
      return next
    } catch (e: any) {
      toast.push(e.message || String(e), 'error')
      return null
    }
  }

  const test = async (kind: 'llm' | 'tts'): Promise<void> => {
    const next = await save(form)
    setForm(next)
    setTesting(kind)
    setResults((prev) => ({ ...prev, [kind]: undefined }))
    try {
      const res = kind === 'llm' ? await api.testLLM() : await api.testTTS()
      setResults((prev) => ({ ...prev, [kind]: res }))
      toast.push(res.ok ? '连接正常' : '连接失败', res.ok ? 'success' : 'error')
    } finally {
      setTesting(null)
    }
  }

  const setTheme = (theme: AppSettings['theme']): void => {
    setForm((f) => (f ? { ...f, theme } : f))
    applyTheme(theme)
  }

  const pickOutputDir = async (): Promise<void> => {
    const dir = await api.pickFolder('选择成片输出目录', form.defaults.outputDir)
    if (dir) setDefaults({ outputDir: dir })
  }

  const pickLocalDir = async (): Promise<void> => {
    const dir = await api.pickFolder('选择本地素材文件夹', form.stock.localDir)
    if (dir) setStock({ localDir: dir })
  }

  const preset = LLM_PRESETS.find((p) => p.id === form.llm.presetId) ?? LLM_PRESETS[0]
  const tts = form.tts
  const provider = tts.provider
  const voices = VOICES[provider] ?? []

  const keyField = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    id: string,
    placeholder = 'sk-...'
  ): ReactElement => (
    <Field label={label}>
      <div className="row" style={{ gap: 6 }}>
        <Input
          type={show[id] ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
        />
        <button className="icon-btn" title={show[id] ? '隐藏' : '显示'} onClick={() => setShow((s) => ({ ...s, [id]: !s[id] }))}>
          {show[id] ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </Field>
  )

  return (
    <div className="settings-wrap">
      <div className="page-head">
        <div>
          <h1 className="page-title">设置</h1>
          <p className="page-desc">所有能力都走云服务。Key 加密保存在本机，不会上传到任何第三方。</p>
        </div>
        <div className="row">
          <Btn variant="ghost" size="md" icon={<ArrowLeft size={14} />} onClick={onBack}>
            返回工作台
          </Btn>
          <Btn variant="primary" size="md" icon={<Save size={14} />} loading={saving} onClick={persist}>
            保存设置
          </Btn>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={cn('tab', tab === t.id && 'active')} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'llm' && (
        <Card title="文本模型" desc="任何兼容 OpenAI /chat/completions 的服务都能用。写文案时只用这一套配置。">
          <div className="form-stack">
            <Field label="服务商预设">
              <div className="preset-row">
                {LLM_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    className={cn('preset-card', form.llm.presetId === p.id && 'active')}
                    onClick={() => chooseLLMPreset(p)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </Field>
            <div className="grid-2">
              <Field label="接口地址 Base URL" hint={preset.hint}>
                <Input
                  value={form.llm.baseUrl}
                  onChange={(e) => setLLM({ baseUrl: e.target.value })}
                  placeholder={
                    preset.id === 'custom'
                      ? 'https://api.xxx.com/v1 或完整 /chat/completions 地址'
                      : 'https://api.deepseek.com/v1'
                  }
                  spellCheck={false}
                />
              </Field>
              {keyField(
                preset.id === 'custom' ? 'API Key（本地网关可留空）' : 'API Key',
                form.llm.apiKey,
                (v) => setLLM({ apiKey: v }),
                'llm'
              )}
            </div>
            <div className="grid-2">
              <Field label="模型">
                <Input
                  list="llm-models"
                  value={form.llm.model}
                  onChange={(e) => setLLM({ model: e.target.value })}
                  placeholder={preset.id === 'custom' ? '例如 gpt-4o-mini / llama3.1 / qwen2.5' : 'deepseek-chat'}
                />
                <datalist id="llm-models">
                  {preset.models.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </Field>
              <Field label={`温度 ${form.llm.temperature.toFixed(2)}`} hint="越高越发散，写故事 0.9，写口播 0.6-0.8">
                <input
                  type="range"
                  min={0}
                  max={1.4}
                  step={0.05}
                  value={form.llm.temperature}
                  onChange={(e) => setLLM({ temperature: Number(e.target.value) })}
                />
              </Field>
            </div>
            {preset.id === 'custom' && (
              <div className="banner">
                <Server size={17} />
                <div className="grow small muted">
                  任何 OpenAI 兼容接口都能用：Base URL 填到 <code>/v1</code>，或直接粘贴以 <code>/chat/completions</code> 结尾的完整地址；
                  模型名自由填写，本地网关可留空 Key。写稿时会优先用 JSON 模式，网关不支持会自动回退。
                </div>
              </div>
            )}
            <div className="row">
              <Btn variant="soft" size="md" loading={testing === 'llm'} onClick={() => test('llm')}>
                保存并测试连接
              </Btn>
              <span className="small faint">测试会发一条很短的消息，确认地址、Key 和模型都可用。</span>
            </div>
            {results.llm && (
              <div className={cn('test-result', results.llm.ok ? 'ok' : 'bad')}>
                {results.llm.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                <span>
                  {results.llm.message}
                  {results.llm.latency ? ` · ${results.llm.latency}ms` : ''}
                </span>
              </div>
            )}
          </div>
        </Card>
      )}

      {tab === 'tts' && (
        <>
          <Card title="语音服务商" desc="配音按句合成，每句一个文件，字幕时长直接来自音频。">
            <div className="preset-row">
              {TTS_PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  className={cn('preset-card', provider === p.id && 'active')}
                  onClick={() => setTTS({ provider: p.id as TTSProviderId })}
                >
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>{p.label}</div>
                  <div className="small faint">{p.desc}</div>
                </button>
              ))}
            </div>
          </Card>

          <Card title={`${TTS_PROVIDERS.find((p) => p.id === provider)?.label} 配置`}>
            <div className="form-stack">
              {provider === 'bailian' && (
                <>
                  <div className="grid-2">
                    {keyField(
                      'Token 套餐 API Key（留空复用文本模型的 Key）',
                      tts.bailian.apiKey,
                      (v) => setTTS({ bailian: { ...tts.bailian, apiKey: v } }),
                      'bl',
                      'sk-sp-...（文本模型选了 Token 套餐时可留空）'
                    )}
                    <Field label="接口地址" hint="国内 Token 套餐固定地址，一般不用改">
                      <Input
                        value={tts.bailian.baseUrl}
                        onChange={(e) => setTTS({ bailian: { ...tts.bailian, baseUrl: e.target.value } })}
                        placeholder="https://token-plan.cn-beijing.maas.aliyuncs.com"
                      />
                    </Field>
                  </div>
                  <div className="grid-2">
                    <Field label="模型" hint="音色必须与模型匹配；Token 套餐默认 qwen-audio-3.0-tts-plus">
                      <Input
                        list="bailian-tts-models"
                        value={tts.bailian.model}
                        onChange={(e) => setTTS({ bailian: { ...tts.bailian, model: e.target.value } })}
                        placeholder="qwen-audio-3.0-tts-plus"
                      />
                      <datalist id="bailian-tts-models">
                        {['qwen-audio-3.0-tts-plus', 'qwen-audio-3.0-tts-flash', 'qwen-audio-3.1-tts-plus', 'qwen-audio-3.1-tts-flash', 'cosyvoice-v3-flash'].map((m) => (
                          <option key={m} value={m} />
                        ))}
                      </datalist>
                    </Field>
                    <Field label={`默认音色（${voices.length} 个）`} hint="支持名称 / 特质 / voice ID 搜索">
                      <VoicePicker
                        value={tts.bailian.voice}
                        voices={voices}
                        onChange={(v) => setTTS({ bailian: { ...tts.bailian, voice: v } })}
                      />
                    </Field>
                  </div>
                  <div className="small faint">
                    使用订阅 Token 套餐时生成的 sk-sp- Key，接口为 /api/v1/services/audio/tts/SpeechSynthesizer。
                    系统音色与 597 个基础音色都已内置，直接搜索中文名即可。
                  </div>
                </>
              )}

              {provider === 'dashscope' && (
                <>
                  <div className="grid-2">
                    {keyField('百炼 API Key', tts.dashscope.apiKey, (v) => setTTS({ dashscope: { ...tts.dashscope, apiKey: v } }), 'ds')}
                    <Field label="模型" hint="qwen-tts 为百炼的语音合成模型">
                      <Input
                        value={tts.dashscope.model}
                        onChange={(e) => setTTS({ dashscope: { ...tts.dashscope, model: e.target.value } })}
                        placeholder="qwen-tts"
                      />
                    </Field>
                  </div>
                  <Field label="默认音色">
                    <VoicePicker
                      value={tts.dashscope.voice}
                      voices={voices}
                      onChange={(v) => setTTS({ dashscope: { ...tts.dashscope, voice: v } })}
                    />
                  </Field>
                </>
              )}

              {provider === 'aliyun-nls' && (
                <>
                  <div className="grid-2">
                    {keyField('AccessKey ID', tts.nls.accessKeyId, (v) => setTTS({ nls: { ...tts.nls, accessKeyId: v } }), 'ak', 'LTAI...')}
                    {keyField('AccessKey Secret', tts.nls.accessKeySecret, (v) => setTTS({ nls: { ...tts.nls, accessKeySecret: v } }), 'sk')}
                  </div>
                  <div className="grid-2">
                    <Field label="AppKey（项目 Appkey）">
                      <Input value={tts.nls.appKey} onChange={(e) => setTTS({ nls: { ...tts.nls, appKey: e.target.value } })} placeholder="智能语音交互控制台的 Appkey" />
                    </Field>
                    <Field label="区域 Region">
                      <Select value={tts.nls.region} onChange={(e) => setTTS({ nls: { ...tts.nls, region: e.target.value } })}>
                        <option value="cn-shanghai">cn-shanghai</option>
                        <option value="cn-beijing">cn-beijing</option>
                        <option value="cn-shenzhen">cn-shenzhen</option>
                      </Select>
                    </Field>
                  </div>
                  <Field label={`默认音色（${voices.length} 个）`}>
                    <VoicePicker
                      value={tts.nls.voice}
                      voices={voices}
                      onChange={(v) => setTTS({ nls: { ...tts.nls, voice: v } })}
                    />
                  </Field>
                  <div className="small faint">NLS 使用的是智能语音交互的 AK/SK + Appkey，不是百炼的 API Key。</div>
                </>
              )}

              {provider === 'openai' && (
                <>
                  <div className="grid-2">
                    <Field label="接口地址" hint="OpenAI、硅基流动或任意兼容端点">
                      <Input
                        value={tts.openai.baseUrl}
                        onChange={(e) => setTTS({ openai: { ...tts.openai, baseUrl: e.target.value } })}
                        placeholder="https://api.openai.com/v1"
                      />
                    </Field>
                    {keyField('API Key', tts.openai.apiKey, (v) => setTTS({ openai: { ...tts.openai, apiKey: v } }), 'oaitts')}
                  </div>
                  <div className="grid-2">
                    <Field label="模型">
                      <Input
                        value={tts.openai.model}
                        onChange={(e) => setTTS({ openai: { ...tts.openai, model: e.target.value } })}
                        placeholder="gpt-4o-mini-tts"
                      />
                    </Field>
                    <Field label="默认音色">
                      <VoicePicker
                        value={tts.openai.voice}
                        voices={voices}
                        onChange={(v) => setTTS({ openai: { ...tts.openai, voice: v } })}
                      />
                    </Field>
                  </div>
                </>
              )}

              {provider === 'azure' && (
                <>
                  <div className="grid-2">
                    {keyField('Speech Key', tts.azure.key, (v) => setTTS({ azure: { ...tts.azure, key: v } }), 'az')}
                    <Field label="Region" hint="例如 eastasia、eastus">
                      <Input value={tts.azure.region} onChange={(e) => setTTS({ azure: { ...tts.azure, region: e.target.value } })} />
                    </Field>
                  </div>
                  <Field label="默认音色">
                    <VoicePicker
                      value={tts.azure.voice}
                      voices={voices}
                      onChange={(v) => setTTS({ azure: { ...tts.azure, voice: v } })}
                    />
                  </Field>
                </>
              )}

              {provider === 'tencent' && (
                <>
                  <div className="grid-2">
                    {keyField('SecretId', tts.tencent.secretId, (v) => setTTS({ tencent: { ...tts.tencent, secretId: v } }), 'tc1', 'AKID...')}
                    {keyField('SecretKey', tts.tencent.secretKey, (v) => setTTS({ tencent: { ...tts.tencent, secretKey: v } }), 'tc2')}
                  </div>
                  <div className="grid-2">
                    <Field label="音色 VoiceType">
                      <VoicePicker
                        value={String(tts.tencent.voiceType)}
                        voices={voices}
                        onChange={(v) => setTTS({ tencent: { ...tts.tencent, voiceType: Number(v) || 101001 } })}
                      />
                    </Field>
                    <Field label="Region">
                      <Input value={tts.tencent.region} onChange={(e) => setTTS({ tencent: { ...tts.tencent, region: e.target.value } })} />
                    </Field>
                  </div>
                </>
              )}

              <Field label="默认语速" hint="0.7 更慢，1.4 更快；实际合成后用 atempo 变速，音调不变">
                <div className="row">
                  <input
                    type="range"
                    min={0.7}
                    max={1.4}
                    step={0.05}
                    value={tts.speed}
                    onChange={(e) => setTTS({ speed: Number(e.target.value) })}
                    style={{ maxWidth: 320 }}
                  />
                  <Badge>× {tts.speed.toFixed(2)}</Badge>
                </div>
              </Field>

              <div className="row">
                <Btn variant="soft" size="md" loading={testing === 'tts'} onClick={() => test('tts')}>
                  保存并试听
                </Btn>
                <span className="small faint">会合成一句「你好，这是 CloudReel 的语音测试。」</span>
              </div>
              {results.tts && (
                <div className={cn('test-result', results.tts.ok ? 'ok' : 'bad')}>
                  {results.tts.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                  <span>
                    {results.tts.message}
                    {results.tts.latency ? ` · ${results.tts.latency}ms` : ''}
                  </span>
                </div>
              )}
            </div>
          </Card>
        </>
      )}

      {tab === 'stock' && (
        <Card title="素材源" desc="按句子关键词搜索竖屏/横屏视频和图片。也可以用本地素材文件夹。">
          <div className="form-stack">
            <Field label="素材来源">
              <Segmented
                value={form.stock.provider}
                options={[
                  { id: 'pexels', label: 'Pexels' },
                  { id: 'pixabay', label: 'Pixabay' },
                  { id: 'local', label: '本地文件夹' }
                ]}
                onChange={(v) => setStock({ provider: v })}
              />
            </Field>
            {form.stock.provider === 'pexels' &&
              keyField('Pexels API Key', form.stock.pexelsKey, (v) => setStock({ pexelsKey: v }), 'px', '在 pexels.com/api 免费申请')}
            {form.stock.provider === 'pixabay' &&
              keyField('Pixabay API Key', form.stock.pixabayKey, (v) => setStock({ pixabayKey: v }), 'pix', '在 pixabay.com/api/docs 免费申请')}
            {form.stock.provider === 'local' && (
              <Field label="本地素材文件夹" hint="支持 mp4 / mov / jpg / png / webp，最多读取 40 个文件">
                <div className="row">
                  <Input value={form.stock.localDir} onChange={(e) => setStock({ localDir: e.target.value })} placeholder="D:\\素材\\自然风光" />
                  <Btn variant="soft" size="sm" icon={<FolderOpen size={13} />} onClick={pickLocalDir}>
                    选择
                  </Btn>
                </div>
              </Field>
            )}
            <Field label="默认画面方向">
              <Segmented
                value={form.stock.orientation}
                options={[
                  { id: 'portrait', label: '竖屏' },
                  { id: 'landscape', label: '横屏' },
                  { id: 'square', label: '方形' }
                ]}
                onChange={(v) => setStock({ orientation: v })}
              />
            </Field>
            <div className="banner">
              <Wallet size={17} />
              <div className="grow small muted">
                Pexels / Pixabay 均免费，素材可商用，但请遵守各站许可；成片里不强制署名。
              </div>
            </div>
          </div>
        </Card>
      )}

      {tab === 'general' && (
        <>
          <Card title="外观" desc="深色、浅色，或跟随系统自动切换。">
            <Field label="主题">
              <Segmented
                value={form.theme}
                options={[
                  { id: 'system', label: '跟随系统' },
                  { id: 'light', label: '浅色' },
                  { id: 'dark', label: '深色' }
                ]}
                onChange={setTheme}
              />
            </Field>
          </Card>

          <Card title="输出与运行环境">
            <div className="form-stack">
              <Field label="成片输出目录" hint="每次渲染会自动创建子文件，不覆盖已有文件">
                <div className="row">
                  <Input value={form.defaults.outputDir} onChange={(e) => setDefaults({ outputDir: e.target.value })} />
                  <Btn variant="soft" size="sm" icon={<FolderOpen size={13} />} onClick={pickOutputDir}>
                    选择
                  </Btn>
                  <Btn variant="ghost" size="sm" onClick={() => api.openPath(form.defaults.outputDir)}>
                    打开
                  </Btn>
                </div>
              </Field>
              <div className="divider" />
              <Toggle
                checked={form.defaults.lowMemory}
                onChange={(v) => setDefaults({ lowMemory: v })}
                label="低内存模式"
                hint="逐段合成转场，速度慢一些，但 4GB/8GB 内存的机器更稳"
              />
              <div className="kv">
                <span>ffmpeg</span>
                <span className="row" style={{ gap: 8 }}>
                  <StatusDot ok={Boolean(info?.ffmpeg.ok)} text={info?.ffmpeg.ok ? '就绪' : '不可用'} />
                  <span className="small faint mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {info?.ffmpeg.path}
                  </span>
                </span>
                <span>应用数据</span>
                <span className="row" style={{ gap: 8 }}>
                  <span className="small mono">{info?.dataDir}</span>
                  <button className="link-btn" onClick={() => info && api.openPath(info.dataDir)}>
                    打开
                  </button>
                </span>
                <span>版本</span>
                <span className="small">{info?.version ?? '0.1.0'}</span>
              </div>
            </div>
          </Card>

          <Card title="关于 CloudReel">
            <div className="row" style={{ color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.8 }}>
              <Server size={16} />
              <div>
                CloudReel 是一个纯云服务的短视频成片工作台：文案、配音、素材、合成流水线全部在本机编排，
                Key 使用系统 DPAPI 加密存储。
              </div>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <Cpu size={14} className="faint" />
              <span className="small faint">Electron + React · ffmpeg 内置 · 无需安装 Python</span>
              <span className="grow" />
              <KeyRound size={14} className="faint" />
              <span className="small faint">密钥仅保存在本机</span>
            </div>
          </Card>
        </>
      )}

      <div className="action-bar">
        <div className="action-info">
          修改后记得保存。测试连接会自动先保存再发起请求。
        </div>
        <div className="row">
          <Btn variant="ghost" size="md" onClick={onBack}>
            返回
          </Btn>
          <Btn variant="primary" size="md" icon={<Save size={14} />} loading={saving} onClick={persist}>
            保存设置
          </Btn>
        </div>
      </div>
    </div>
  )
}