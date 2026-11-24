import crypto from 'crypto'
import type { AppSettings, ScriptDoc, ScriptLine } from '@shared/types'
import { chatCompletion } from '../providers/llm'

export interface ScriptRequest {
  topic: string
  style: string
  styleId: string
  language: string
  chars: number
}

function buildPrompt(req: ScriptRequest): string {
  return `你是一名顶级短视频口播编剧。请围绕下面的主题，创作一条约 ${req.chars} 字的中文短视频口播稿。

主题：${req.topic}

风格要求：${req.style || '口语化、有信息密度、开头抓人'}

硬性要求：
1. 只需要口播正文，不要标题、不要“大家好/今天我们来聊聊”之类的套话，不要 Markdown、不要表情符号。
2. 把正文拆成若干条短句，每条 12~32 个汉字，适合整屏显示成一条字幕。条数控制在 5~14 条。
3. 第一句必须是能在 3 秒内抓住注意力的钩子（反常识、提问、冲突或数字）。
4. 为每条短句给出 1 个用于图库检索的英文 visualQuery：2~5 个英文单词，描述具体可拍摄的画面（物体 + 场景/动作），不要抽象词。
5. 输出严格 JSON，不要代码块，格式：
{"title":"不超过 20 字的标题","hashtags":["#话题1","#话题2"],"lines":[{"text":"口播短句","visualQuery":"english stock footage query"}]}`.trim()
}

function stripFence(text: string): string {
  let t = text.trim()
  t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start >= 0 && end > start) t = t.slice(start, end + 1)
  return t
}

function cleanText(raw: string): string {
  return raw
    .replace(/^[\s\-*•·\d.、)）]+/, '')
    .replace(/^["“”'‘’]+|["“”'‘’]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function fallbackLines(topic: string, style: string): ScriptLine[] {
  const source = topic.replace(/[\r\n]+/g, '。')
  const pieces = source
    .split(/(?<=[。！？!?；;])/)
    .map(cleanText)
    .filter(Boolean)
  const chunks: string[] = []
  let buffer = ''
  for (const p of pieces) {
    if ((buffer + p).length > 32 && buffer) {
      chunks.push(buffer)
      buffer = p
    } else {
      buffer += p
    }
  }
  if (buffer) chunks.push(buffer)
  const lines = (chunks.length ? chunks : [topic]).slice(0, 14)
  return lines.map((text) => ({
    id: crypto.randomUUID(),
    text,
    visualQuery: ''
  }))
}

function normalize(doc: any, req: ScriptRequest): ScriptDoc {
  const rawLines = Array.isArray(doc?.lines) ? doc.lines : []
  const lines: ScriptLine[] = []
  for (const item of rawLines) {
    const text = cleanText(typeof item === 'string' ? item : item?.text ?? '')
    if (!text) continue
    const query =
      (typeof item?.visualQuery === 'string' && item.visualQuery) ||
      (typeof item?.keywords === 'string' && item.keywords) ||
      (Array.isArray(item?.keywords) ? item.keywords.join(' ') : '') ||
      ''
    lines.push({ id: crypto.randomUUID(), text, visualQuery: String(query).trim() })
    if (lines.length >= 16) break
  }
  if (!lines.length) {
    return {
      title: req.topic.slice(0, 20),
      lines: fallbackLines(req.topic, req.style),
      hashtags: []
    }
  }
  return {
    title: String(doc?.title || req.topic).slice(0, 30),
    lines,
    hashtags: Array.isArray(doc?.hashtags) ? doc.hashtags.map((h: any) => String(h)).slice(0, 6) : []
  }
}

function tryParse(content: string): any | null {
  try {
    return JSON.parse(stripFence(content))
  } catch {
    return null
  }
}

export async function generateScript(settings: AppSettings, req: ScriptRequest, signal?: AbortSignal): Promise<ScriptDoc> {
  if (!req.topic.trim()) throw new Error('请先填写主题')
  const prompt = buildPrompt(req)
  const baseMessages = [
    {
      role: 'system' as const,
      content: '你输出严格的 JSON，不包含任何解释、Markdown 或代码块标记。'
    },
    { role: 'user' as const, content: prompt }
  ]

  const call = async (jsonMode: boolean, temperature: number, extra?: string): Promise<string> => {
    const messages = extra
      ? [...baseMessages, { role: 'assistant' as const, content: extra.slice(0, 1500) }, { role: 'user' as const, content: '上一次输出不是合法 JSON。请严格只输出一个 JSON 对象，不要任何解释或代码块，字段与要求保持一致。' }]
      : baseMessages
    return chatCompletion(settings.llm, messages, {
      json: jsonMode,
      maxTokens: 1800,
      temperature,
      signal,
      timeoutMs: 150_000
    })
  }

  let content = ''
  try {
    content = await call(true, 0.9)
  } catch (e: any) {
    throw new Error('生成文案失败：' + (e.message || String(e)))
  }

  let parsed = tryParse(content)
  if (!parsed) {
    try {
      content = await call(false, 0.25, content)
      parsed = tryParse(content)
    } catch {
      /* fall through to prose fallback */
    }
  }
  if (parsed) return normalize(parsed, req)

  const text = content.trim()
  if (text.length > 20 && !text.includes('{')) {
    return {
      title: req.topic.slice(0, 20),
      lines: fallbackLines(text, req.style),
      hashtags: []
    }
  }
  throw new Error('模型返回的文案格式无法解析，请重试或换个模型')
}
