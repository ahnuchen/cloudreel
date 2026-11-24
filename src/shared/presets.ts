import type { TTSProviderId } from './types'
import { NLS_VOICES } from './voices/nls'
import { BAILIAN_VOICES } from './voices/bailian'

export interface LLMPreset {
  id: string
  label: string
  baseUrl: string
  models: string[]
  hint?: string
  needsKey: boolean
}

export const LLM_PRESETS: LLMPreset[] = [
  {
    id: 'bailian-token',
    label: '阿里云百炼 · Token 套餐（国内）',
    baseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    models: [
      'qwen4-max',
      'qwen4-max-preview',
      'qwen3.8-max',
      'qwen3.8-flash',
      'qwen3.7-max',
      'qwen3.7-plus',
      'qwen3.6-flash',
      'deepseek-v4-pro',
      'deepseek-v4-pro-0813',
      'deepseek-v4.1-flash',
      'deepseek-v4.1-flash-1017',
      'deepseek-v4-flash-0731',
      'glm-5.3',
      'glm-5.2'
    ],
    hint: '订阅 Token 套餐后拿到的 sk-sp- Key；语音也在「语音合成」里选百炼 Token 套餐',
    needsKey: true
  },
  {
    id: 'dashscope',
    label: '阿里云百炼 · 按量付费',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen3-max', 'qwen3-235b-a22b'],
    hint: '百炼控制台的 API Key（sk- 开头），走 OpenAI 兼容接口',
    needsKey: true
  },
  {
    id: 'custom',
    label: '自定义 OpenAI 兼容接口',
    baseUrl: '',
    models: [],
    hint: '任意兼容 /chat/completions 的服务：填 Base URL（如 https://api.xxx.com/v1）或直接粘贴完整地址；模型名自由填写，本地网关可留空 Key。',
    needsKey: false
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner', 'deepseek-flash'],
    hint: 'DeepSeek 开放平台的 API Key',
    needsKey: true
  },
  {
    id: 'moonshot',
    label: '月之暗面 Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k', 'kimi-k2-0905-preview'],
    needsKey: true
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-flash', 'glm-4-plus', 'glm-4.5', 'glm-4.6'],
    needsKey: true
  },
  {
    id: 'siliconflow',
    label: '硅基流动 SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: ['Qwen/Qwen3-235B-A22B-Instruct-2507', 'deepseek-ai/DeepSeek-V3', 'moonshotai/Kimi-K2-Instruct'],
    needsKey: true
  },
  {
    id: 'volcengine',
    label: '火山方舟（豆包）',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: ['doubao-seed-1.6', 'doubao-1.5-pro-32k'],
    hint: '模型名也可填控制台里的推理接入点 ID（ep-...）',
    needsKey: true
  },
  {
    id: 'hunyuan',
    label: '腾讯混元',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    models: ['hunyuan-turbos-latest', 'hunyuan-t1-latest'],
    needsKey: true
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    baseUrl: 'https://api.minimax.chat/v1',
    models: ['MiniMax-Text-01', 'MiniMax-M2'],
    needsKey: true
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4o'],
    needsKey: true
  },
  {
    id: 'gemini',
    label: 'Google Gemini（OpenAI 兼容）',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    needsKey: true
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-sonnet-4', 'google/gemini-2.5-flash'],
    needsKey: true
  },
  ]

export interface Voice {
  id: string
  label: string
  lang?: string
  tags?: string
}

export const TTS_PROVIDERS: { id: TTSProviderId; label: string; desc: string }[] = [
  { id: 'bailian', label: '阿里云百炼 · Token 套餐', desc: 'qwen-audio-3.0-tts-plus，600+ 音色，一个 sk-sp- Key' },
  { id: 'dashscope', label: '阿里云百炼 · Qwen-TTS（按量付费）', desc: 'Qwen-TTS，HTTP 接口，一个 API Key 即可' },
  { id: 'aliyun-nls', label: '阿里云智能语音 NLS', desc: 'AK/SK + AppKey，147 个官方音色，价格低' },
  { id: 'openai', label: 'OpenAI 兼容 TTS', desc: 'OpenAI / 硅基流动 / 自建网关' },
  { id: 'azure', label: 'Azure 语音', desc: '微软 Azure Speech，中文音色丰富' },
  { id: 'tencent', label: '腾讯云语音合成', desc: 'SecretId/SecretKey，预置精品音色' }
]

export const VOICES: Record<TTSProviderId, Voice[]> = {
  bailian: BAILIAN_VOICES,
  dashscope: [
    { id: 'Cherry', label: 'Cherry · 芊悦（女，自然）', lang: 'zh' },
    { id: 'Serena', label: 'Serena · 苏瑶（女，温柔）', lang: 'zh' },
    { id: 'Ethan', label: 'Ethan · 晨煦（男，阳光）', lang: 'zh' },
    { id: 'Chelsea', label: 'Chelsea · 千雪（女，知性）', lang: 'zh' },
    { id: 'Dylan', label: 'Dylan · 晓东（男，北京话）', lang: 'zh' },
    { id: 'Jada', label: 'Jada · 阿珍（女，上海话）', lang: 'zh' },
    { id: 'Sunny', label: 'Sunny · 晴儿（女，四川话）', lang: 'zh' },
    { id: 'Rocky', label: 'Rocky · 阿泽（男，粤语）', lang: 'zh' },
    { id: 'Kiki', label: 'Kiki · 阿清（女，粤语）', lang: 'zh' },
    { id: 'Eric', label: 'Eric · 程川（男，四川话）', lang: 'zh' },
    { id: 'Li', label: 'Li · 老李（男，南京话）', lang: 'zh' },
    { id: 'Nofish', label: 'Nofish · 不吃鱼（男，呆萌）', lang: 'zh' },
    { id: 'Jennifer', label: 'Jennifer（女，英语）', lang: 'en' },
    { id: 'Ryan', label: 'Ryan（男，英语）', lang: 'en' }
  ],
  'aliyun-nls': NLS_VOICES,
  openai: [
    { id: 'alloy', label: 'Alloy（中性）' },
    { id: 'echo', label: 'Echo（男）' },
    { id: 'fable', label: 'Fable（英式）' },
    { id: 'onyx', label: 'Onyx（低沉男声）' },
    { id: 'nova', label: 'Nova（女）' },
    { id: 'shimmer', label: 'Shimmer（女）' },
    { id: 'coral', label: 'Coral（女）' },
    { id: 'sage', label: 'Sage（女）' },
    { id: 'ash', label: 'Ash（男）' },
    { id: 'ballad', label: 'Ballad（男）' },
    { id: 'verse', label: 'Verse（男）' }
  ],
  azure: [
    { id: 'zh-CN-XiaoxiaoNeural', label: '晓晓（女，自然）', lang: 'zh' },
    { id: 'zh-CN-XiaoyiNeural', label: '晓伊（女，活泼）', lang: 'zh' },
    { id: 'zh-CN-YunxiNeural', label: '云希（男，阳光）', lang: 'zh' },
    { id: 'zh-CN-YunjianNeural', label: '云健（男，浑厚）', lang: 'zh' },
    { id: 'zh-CN-YunyangNeural', label: '云扬（男，新闻）', lang: 'zh' },
    { id: 'zh-CN-YunxiaNeural', label: '云夏（男，少年）', lang: 'zh' },
    { id: 'zh-CN-YunzeNeural', label: '云泽（男，成熟）', lang: 'zh' },
    { id: 'zh-CN-XiaochenNeural', label: '晓辰（女，知性）', lang: 'zh' },
    { id: 'zh-CN-XiaohanNeural', label: '晓涵（女，温柔）', lang: 'zh' },
    { id: 'zh-CN-XiaomengNeural', label: '晓梦（女，甜美）', lang: 'zh' },
    { id: 'zh-CN-XiaoxiaoMultilingualNeural', label: '晓晓（多语言）', lang: 'zh' },
    { id: 'en-US-AvaMultilingualNeural', label: 'Ava（英，多语言）', lang: 'en' },
    { id: 'en-US-AndrewNeural', label: 'Andrew（英，男）', lang: 'en' }
  ],
  tencent: [
    { id: '101001', label: '智瑜（女，精品）', lang: 'zh' },
    { id: '101002', label: '智聆（女，精品）', lang: 'zh' },
    { id: '101003', label: '智美（女，精品）', lang: 'zh' },
    { id: '101004', label: '智云（男，精品）', lang: 'zh' },
    { id: '101005', label: '智莉（女，精品）', lang: 'zh' },
    { id: '101008', label: '智琪（女，精品）', lang: 'zh' },
    { id: '101009', label: '智芸（女，精品）', lang: 'zh' },
    { id: '101010', label: '智华（男，精品）', lang: 'zh' },
    { id: '101016', label: '智甜（女童）', lang: 'zh' },
    { id: '101019', label: '智彤（粤语）', lang: 'zh' },
    { id: '101027', label: '智梅（女，精品）', lang: 'zh' },
    { id: '100510000', label: '智逍遥（男，精品）', lang: 'zh' }
  ]
}

export const TRANSITIONS = [
  { id: 'random', label: '随机' },
  { id: 'fade', label: '淡入淡出' },
  { id: 'smoothleft', label: '平滑左移' },
  { id: 'smoothup', label: '平滑上移' },
  { id: 'circleopen', label: '圆形展开' },
  { id: 'dissolve', label: '溶解' },
  { id: 'wipeleft', label: '左侧擦除' },
  { id: 'slideleft', label: '左侧推入' },
  { id: 'pixelize', label: '像素化' },
  { id: 'radial', label: '径向' }
]

export const SUBTITLE_FONTS = [
  'Microsoft YaHei',
  'Microsoft JhengHei',
  'SimHei',
  'SimSun',
  'KaiTi',
  'PingFang SC',
  'Noto Sans CJK SC'
]

export const VIDEO_PRESETS = [
  { id: 'portrait', label: '竖屏 9:16', width: 1080, height: 1920 },
  { id: 'landscape', label: '横屏 16:9', width: 1920, height: 1080 },
  { id: 'square', label: '方形 1:1', width: 1080, height: 1080 }
] as const

export const STYLE_PRESETS = [
  {
    id: 'knowledge',
    label: '知识科普',
    prompt: '语气专业但不枯燥，多用具体例子和类比，开头 3 秒必须抛出反常识的钩子。'
  },
  {
    id: 'story',
    label: '情感故事',
    prompt: '用第一人称或第三人称讲一个有起承转合的短故事，情绪递进，结尾点题。'
  },
  {
    id: 'promote',
    label: '种草带货',
    prompt: '从目标用户的痛点切入，给出 2-3 个具体卖点和使用场景，语气真诚不夸张。'
  },
  {
    id: 'news',
    label: '新闻口播',
    prompt: '像新闻主播一样客观陈述，先讲结论再讲背景和影响，避免主观情绪。'
  },
  { id: 'custom', label: '自定义风格', prompt: '' }
]

export function voicesFor(provider: TTSProviderId): Voice[] {
  return VOICES[provider] ?? []
}