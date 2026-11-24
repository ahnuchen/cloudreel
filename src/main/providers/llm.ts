import type { LLMConfig, ProviderTestResult } from '@shared/types'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

function completionsUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '')
  return /\/chat\/completions$/i.test(base) ? base : base + '/chat/completions'
}

function friendlyHttpError(status: number, body: string): string {
  let detail = ''
  try {
    const json = JSON.parse(body)
    detail = json?.error?.message || json?.message || json?.error || ''
  } catch {
    detail = body.slice(0, 300)
  }
  const map: Record<number, string> = {
    400: '请求参数有误',
    401: 'API Key 无效或未授权',
    403: '没有访问权限（可能未开通该模型）',
    404: '接口地址或模型不存在',
    429: '请求过于频繁或额度不足',
    500: '服务端异常，请稍后重试',
    502: '网关异常，请稍后重试',
    503: '服务暂时不可用'
  }
  return `${map[status] || `HTTP ${status}`}${detail ? '：' + detail : ''}`
}

export async function chatCompletion(
  cfg: LLMConfig,
  messages: ChatMessage[],
  opts: { json?: boolean; maxTokens?: number; temperature?: number; timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<string> {
  if (!cfg.baseUrl) throw new Error('请先在设置里填写文本模型的接口地址')
  if (!cfg.apiKey && cfg.presetId !== 'custom') throw new Error('请先在设置里填写文本模型的 API Key')

  const timeout = AbortSignal.timeout(opts.timeoutMs ?? 120_000)
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout

  const payload: any = {
    model: cfg.model,
    messages,
    stream: false,
    max_tokens: opts.maxTokens ?? 2000
  }
  const temp = opts.temperature ?? cfg.temperature
  if (typeof temp === 'number' && temp >= 0) payload.temperature = temp
  if (opts.json) payload.response_format = { type: 'json_object' }

  const attempt = async (withJsonMode: boolean): Promise<Response> => {
    const body = { ...payload }
    if (!withJsonMode) delete body.response_format
    return fetch(completionsUrl(cfg.baseUrl), {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {})
      },
      body: JSON.stringify(body)
    })
  }

  let res = await attempt(Boolean(opts.json))
  if (!res.ok && opts.json && (res.status === 400 || res.status === 422)) {
    await res.text().catch(() => '')
    res = await attempt(false)
  }
  if (!res.ok) {
    throw new Error(friendlyHttpError(res.status, await res.text()))
  }
  const data: any = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((c: any) => (typeof c === 'string' ? c : c?.text || '')).join('')
  }
  throw new Error('模型没有返回内容')
}

export async function testLLM(cfg: LLMConfig): Promise<ProviderTestResult> {
  const start = Date.now()
  try {
    const reply = await chatCompletion(
      cfg,
      [{ role: 'user', content: '回复两个字：可用' }],
      { maxTokens: 64, temperature: 0, timeoutMs: 30_000 }
    )
    return {
      ok: true,
      message: `连接成功 · ${cfg.model} · 回复「${reply.trim().slice(0, 20)}」`,
      latency: Date.now() - start
    }
  } catch (e: any) {
    return { ok: false, message: e?.name === 'TimeoutError' ? '请求超时（30s）' : e.message || String(e) }
  }
}