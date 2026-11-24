import crypto from 'crypto'
import { app } from 'electron'
import { mkdirSync, unlinkSync, writeFileSync } from 'fs'
import path from 'path'
import WebSocket from 'ws'
import type { AppSettings, ProviderTestResult, TTSProviderId } from '@shared/types'
import { probeMedia } from '../ffmpeg'

export interface SynthRequest {
  text: string
  voice: string
  speed: number
  outFile: string
  provider?: TTSProviderId
  signal?: AbortSignal
}

function ensureDir(file: string): void {
  mkdirSync(path.dirname(file), { recursive: true })
}

async function readError(res: Response): Promise<string> {
  const text = await res.text()
  try {
    const json = JSON.parse(text)
    return json?.error?.message || json?.message || json?.Message || text.slice(0, 300)
  } catch {
    return text.slice(0, 300) || `HTTP ${res.status}`
  }
}

async function downloadTo(url: string, file: string, signal?: AbortSignal): Promise<void> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`下载音频失败：HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  ensureDir(file)
  writeFileSync(file, buf)
}

function bailianApiKey(settings: AppSettings): string {
  if (settings.tts.bailian.apiKey) return settings.tts.bailian.apiKey
  if (settings.llm.baseUrl.includes('token-plan.')) return settings.llm.apiKey
  return ''
}

async function synthesizeBailian(settings: AppSettings, req: SynthRequest, signal: AbortSignal): Promise<void> {
  const cfg = settings.tts.bailian
  const apiKey = bailianApiKey(settings)
  if (!apiKey) throw new Error('请先在设置里填写百炼 Token 套餐的 API Key（sk-sp- 开头）')
  const base = (cfg.baseUrl || 'https://token-plan.cn-beijing.maas.aliyuncs.com')
    .replace(/\/+$/, '')
    .replace(/\/compatible-mode\/v1$/i, '')
    .replace(/\/api\/v1$/i, '')
  const res = await fetch(base + '/api/v1/services/audio/tts/SpeechSynthesizer', {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: cfg.model || 'qwen-audio-3.0-tts-plus',
      input: {
        text: req.text,
        voice: req.voice || cfg.voice || 'longanhuan_v3.6',
        format: 'mp3',
        sample_rate: 24000
      }
    })
  })
  if (!res.ok) throw new Error('百炼 Token 套餐语音合成失败：' + (await readError(res)))
  const data: any = await res.json()
  if (data?.code && data.code !== 200) throw new Error(`百炼 Token 套餐语音合成失败：${data.message || data.code}`)
  const audioUrl = data?.output?.audio?.url
  if (audioUrl) {
    await downloadTo(audioUrl, req.outFile, signal)
    return
  }
  const inline = data?.output?.audio?.data
  if (typeof inline === 'string' && inline) {
    ensureDir(req.outFile)
    writeFileSync(req.outFile, Buffer.from(inline, 'base64'))
    return
  }
  throw new Error('百炼 Token 套餐语音合成没有返回音频：' + JSON.stringify(data).slice(0, 300))
}

async function synthesizeDashScope(settings: AppSettings, req: SynthRequest, signal: AbortSignal): Promise<void> {
  const cfg = settings.tts.dashscope
  if (!cfg.apiKey) throw new Error('请先在设置里填写阿里云百炼 API Key')
  const res = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: cfg.model || 'qwen-tts',
      input: { text: req.text, voice: req.voice || cfg.voice }
    })
  })
  if (!res.ok) throw new Error('百炼语音合成失败：' + (await readError(res)))
  const data: any = await res.json()
  if (data?.code && data.code !== 200) throw new Error(`百炼语音合成失败：${data.message || data.code}`)
  const audioUrl = data?.output?.audio?.url
  if (!audioUrl) throw new Error('百炼语音合成没有返回音频地址：' + JSON.stringify(data).slice(0, 300))
  await downloadTo(audioUrl, req.outFile, signal)
}

function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

const nlsTokenCache = new Map<string, { token: string; expires: number }>()

async function getNlsToken(ak: string, sk: string, signal: AbortSignal): Promise<string> {
  const key = ak + ':' + sk.slice(-6)
  const hit = nlsTokenCache.get(key)
  if (hit && hit.expires > Date.now() + 60_000) return hit.token

  const params: Record<string, string> = {
    AccessKeyId: ak,
    Action: 'CreateToken',
    Format: 'JSON',
    RegionId: 'cn-shanghai',
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: '1.0',
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    Version: '2019-02-28'
  }
  const canonical = Object.keys(params)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join('&')
  const stringToSign = `POST&%2F&${percentEncode(canonical)}`
  const signature = crypto.createHmac('sha1', sk + '&').update(stringToSign).digest('base64')
  const body = `${canonical}&Signature=${percentEncode(signature)}`
  const res = await fetch('https://nls-meta.cn-shanghai.aliyuncs.com/', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!res.ok) throw new Error('获取阿里云 NLS Token 失败：' + (await readError(res)))
  const data: any = await res.json()
  const token = data?.Token?.Id
  if (!token) throw new Error('阿里云 NLS 未返回 Token：' + JSON.stringify(data).slice(0, 300))
  const expireTime = Number(data?.Token?.ExpireTime)
  const expires = expireTime > 1e12 ? expireTime : expireTime > 1e9 ? expireTime * 1000 : Date.now() + 12 * 3600_000
  nlsTokenCache.set(key, { token, expires })
  return token
}

async function synthesizeAliyunNls(settings: AppSettings, req: SynthRequest, signal: AbortSignal): Promise<void> {
  const cfg = settings.tts.nls
  if (!cfg.accessKeyId || !cfg.accessKeySecret || !cfg.appKey) {
    throw new Error('请先在设置里填写阿里云 NLS 的 AccessKeyId / AccessKeySecret / AppKey')
  }
  const token = await getNlsToken(cfg.accessKeyId, cfg.accessKeySecret, signal)
  const region = cfg.region || 'cn-shanghai'
  const wsUrl = `wss://nls-gateway.${region}.aliyuncs.com/ws/v1`
  const namespace = req.text.length > 280 ? 'SpeechLongSynthesizer' : 'SpeechSynthesizer'

  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(wsUrl, {
      headers: { 'X-NLS-Token': token },
      handshakeTimeout: 15_000
    })
    const chunks: Buffer[] = []
    let done = false
    const cleanup = (): void => {
      try {
        ws.close()
      } catch {
        /* ignore */
      }
    }
    const fail = (err: Error): void => {
      if (done) return
      done = true
      cleanup()
      reject(err)
    }
    const succeed = (): void => {
      if (done) return
      done = true
      cleanup()
      ensureDir(req.outFile)
      writeFileSync(req.outFile, Buffer.concat(chunks))
      resolve()
    }
    const onAbort = (): void => fail(new Error('cancelled'))
    signal.addEventListener('abort', onAbort, { once: true })
    ws.on('open', () => {
      const msg = {
        header: {
          message_id: crypto.randomUUID().replace(/-/g, ''),
          task_id: crypto.randomUUID().replace(/-/g, ''),
          namespace,
          name: 'StartSynthesis',
          appkey: cfg.appKey
        },
        payload: {
          text: req.text,
          voice: req.voice || cfg.voice || 'aixia',
          format: 'mp3',
          sample_rate: 24000,
          volume: 50,
          speech_rate: 0,
          pitch_rate: 0
        },
        context: { sdk: { name: 'cloudreel', version: '0.1.0', language: 'typescript' } }
      }
      ws.send(JSON.stringify(msg))
    })
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer))
        return
      }
      try {
        const json = JSON.parse(data.toString())
        const name = json?.header?.name
        if (name === 'SynthesisCompleted') succeed()
        else if (name === 'TaskFailed') {
          fail(new Error(`阿里云语音合成失败：${json?.payload?.message || json?.header?.status_text || '未知错误'}`))
        }
      } catch {
        /* ignore */
      }
    })
    ws.on('error', (err) => fail(new Error('阿里云语音连接失败：' + err.message)))
    ws.on('close', () => {
      if (!done) {
        if (chunks.length) succeed()
        else fail(new Error('阿里云语音连接提前关闭'))
      }
    })
    setTimeout(() => {
      if (!done) {
        if (chunks.length) succeed()
        else fail(new Error('阿里云语音合成超时（90s）'))
      }
    }, 90_000)
  })
}

async function synthesizeOpenAI(settings: AppSettings, req: SynthRequest, signal: AbortSignal): Promise<void> {
  const cfg = settings.tts.openai
  if (!cfg.apiKey) throw new Error('请先在设置里填写 OpenAI 兼容 TTS 的 API Key')
  const res = await fetch(cfg.baseUrl.replace(/\/+$/, '') + '/audio/speech', {
    method: 'POST',
    signal,
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.model || 'gpt-4o-mini-tts',
      input: req.text,
      voice: req.voice || cfg.voice,
      response_format: 'mp3'
    })
  })
  if (!res.ok) throw new Error('语音合成失败：' + (await readError(res)))
  ensureDir(req.outFile)
  writeFileSync(req.outFile, Buffer.from(await res.arrayBuffer()))
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function synthesizeAzure(settings: AppSettings, req: SynthRequest, signal: AbortSignal): Promise<void> {
  const cfg = settings.tts.azure
  if (!cfg.key || !cfg.region) throw new Error('请先在设置里填写 Azure 语音的 Key 和 Region')
  const voice = req.voice || cfg.voice
  const lang = voice.split('-').slice(0, 2).join('-')
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}"><voice name="${voice}"><prosody rate="0%" pitch="0%">${escapeXml(req.text)}</prosody></voice></speak>`
  const url = `https://${cfg.region}.tts.speech.microsoft.com/cognitiveservices/v1`
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'Ocp-Apim-Subscription-Key': cfg.key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3'
    },
    body: ssml
  })
  if (!res.ok) throw new Error('Azure 语音合成失败：' + (await readError(res)))
  ensureDir(req.outFile)
  writeFileSync(req.outFile, Buffer.from(await res.arrayBuffer()))
}

function sha256Hex(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex')
}

function hmacSha256(key: string | Buffer, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data).digest()
}

async function synthesizeTencent(settings: AppSettings, req: SynthRequest, signal: AbortSignal): Promise<void> {
  const cfg = settings.tts.tencent
  if (!cfg.secretId || !cfg.secretKey) throw new Error('请先在设置里填写腾讯云 SecretId / SecretKey')
  const host = 'tts.tencentcloudapi.com'
  const service = 'tts'
  const action = 'TextToVoice'
  const version = '2019-08-23'
  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const payload = JSON.stringify({
    Text: req.text,
    SessionId: crypto.randomUUID(),
    VoiceType: Number(req.voice || cfg.voiceType) || 101001,
    Codec: 'mp3',
    SampleRate: 24000,
    Speed: 0,
    Volume: 0,
    ProjectId: 0,
    ModelType: 1,
    PrimaryLanguage: 1
  })
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`
  const signedHeaders = 'content-type;host'
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, sha256Hex(payload)].join('\n')
  const scope = `${date}/${service}/tc3_request`
  const stringToSign = ['TC3-HMAC-SHA256', String(timestamp), scope, sha256Hex(canonicalRequest)].join('\n')
  const secretDate = hmacSha256('TC3' + cfg.secretKey, date)
  const secretService = hmacSha256(secretDate, service)
  const secretSigning = hmacSha256(secretService, 'tc3_request')
  const signature = hmacSha256(secretSigning, stringToSign).toString('hex')
  const authorization = `TC3-HMAC-SHA256 Credential=${cfg.secretId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const res = await fetch(`https://${host}`, {
    method: 'POST',
    signal,
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json; charset=utf-8',
      Host: host,
      'X-TC-Action': action,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Version': version,
      'X-TC-Region': cfg.region || 'ap-guangzhou'
    },
    body: payload
  })
  const data: any = await res.json().catch(() => null)
  if (!res.ok || data?.Response?.Error) {
    const err = data?.Response?.Error
    throw new Error(`腾讯云语音合成失败：${err?.Message || `HTTP ${res.status}`}`)
  }
  const audio = data?.Response?.Audio
  if (!audio) throw new Error('腾讯云语音合成没有返回音频')
  ensureDir(req.outFile)
  writeFileSync(req.outFile, Buffer.from(audio, 'base64'))
}

export async function synthesize(settings: AppSettings, req: SynthRequest): Promise<void> {
  const provider = req.provider ?? settings.tts.provider
  const timeout = AbortSignal.timeout(90_000)
  const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout
  if (!req.text.trim()) throw new Error('文本为空')
  switch (provider) {
    case 'bailian':
      return synthesizeBailian(settings, req, signal)
    case 'dashscope':
      return synthesizeDashScope(settings, req, signal)
    case 'aliyun-nls':
      return synthesizeAliyunNls(settings, req, signal)
    case 'openai':
      return synthesizeOpenAI(settings, req, signal)
    case 'azure':
      return synthesizeAzure(settings, req, signal)
    case 'tencent':
      return synthesizeTencent(settings, req, signal)
    default:
      throw new Error('未知的语音服务商：' + provider)
  }
}

export async function testTTS(settings: AppSettings): Promise<ProviderTestResult> {
  const start = Date.now()
  const voice = (() => {
    switch (settings.tts.provider) {
      case 'bailian':
        return settings.tts.bailian.voice
      case 'dashscope':
        return settings.tts.dashscope.voice
      case 'aliyun-nls':
        return settings.tts.nls.voice
      case 'openai':
        return settings.tts.openai.voice
      case 'azure':
        return settings.tts.azure.voice
      default:
        return String(settings.tts.tencent.voiceType)
    }
  })()
  const file = path.join(app.getPath('temp'), `cloudreel-tts-test-${Date.now()}.mp3`)
  try {
    await synthesize(settings, { text: '你好，这是 CloudReel 的语音测试。', voice, speed: 1, outFile: file })
    const info = await probeMedia(file)
    return {
      ok: true,
      message: `合成成功 · 时长 ${info.duration.toFixed(1)}s · ${settings.tts.provider}`,
      latency: Date.now() - start
    }
  } catch (e: any) {
    return { ok: false, message: e.message || String(e) }
  } finally {
    try {
      unlinkSync(file)
    } catch {
      /* ignore */
    }
  }
}