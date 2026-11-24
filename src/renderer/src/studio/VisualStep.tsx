import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { FolderOpen, ImagePlus, Search, Shuffle, Sparkles, X } from 'lucide-react'
import type { MaterialCandidate } from '@shared/types'
import { useStudio } from '../studio/store'
import { useSettings } from '../lib/settings'
import { useToast } from '../lib/toast'
import { api, cn, mediaUrl } from '../lib/api'
import { Badge, Btn, Card, Field, Input } from '../components/ui'
import { isVideoUrl } from '../components/Media'

function stockReady(provider: string, pexelsKey: string, pixabayKey: string, localDir: string): boolean {
  if (provider === 'local') return Boolean(localDir)
  if (provider === 'pixabay') return Boolean(pixabayKey)
  return Boolean(pexelsKey)
}

function ThumbMedia({ c }: { c: MaterialCandidate }): ReactElement {
  const local = c.source === '本地素材'
  const isVideo = local ? isVideoUrl(c.url) : c.kind === 'video'
  const src = local ? mediaUrl(c.url) : isVideo && !isVideoUrl(c.previewUrl) ? c.url : c.previewUrl || c.url
  if (isVideo && src) {
    return <video src={src} muted loop playsInline autoPlay preload="metadata" />
  }
  return <img src={src} alt="" loading="lazy" />
}

export function VisualStep({ onOpenSettings }: { onOpenSettings: () => void }): ReactElement {
  const { draft, setMaterial, setCandidates, setActiveLine, setStep, updateLine } = useStudio()
  const { settings } = useSettings()
  const toast = useToast()
  const lines = draft.script?.lines ?? []
  const provider = settings?.stock.provider ?? 'pexels'
  const ready = stockReady(provider, settings?.stock.pexelsKey ?? '', settings?.stock.pixabayKey ?? '', settings?.stock.localDir ?? '')
  const [loadingIds, setLoadingIds] = useState<Record<string, boolean>>({})
  const [autoRunning, setAutoRunning] = useState(false)
  const [pool, setPool] = useState<MaterialCandidate[]>([])
  const [poolLoading, setPoolLoading] = useState(false)
  const cancelRef = useRef(false)

  useEffect(() => {
    if (provider !== 'local' || !settings?.stock.localDir) return
    let alive = true
    setPoolLoading(true)
    api
      .listLocalMaterials(settings.stock.localDir)
      .then((list) => alive && setPool(list))
      .catch(() => undefined)
      .finally(() => alive && setPoolLoading(false))
    return () => {
      alive = false
    }
  }, [provider, settings?.stock.localDir])

  const matchedCount = useMemo(() => lines.filter((l) => draft.material[l.id]).length, [lines, draft.material])

  const search = async (lineId: string, page = 1, silent = false): Promise<MaterialCandidate[]> => {
    const line = lines.find((l) => l.id === lineId)
    if (!line) return []
    const query = line.visualQuery.trim()
    if (!query) {
      if (!silent) toast.push('这句还没有画面关键词，可以在关键词框里填英文，或先用主题搜索', 'error')
      return []
    }
    setLoadingIds((prev) => ({ ...prev, [lineId]: true }))
    try {
      const results = await api.searchMaterials({
        query,
        count: 6,
        page,
        orientation: draft.videoPreset
      })
      setCandidates(lineId, results, page)
      if (!results.length && !silent) toast.push('没搜到合适素材，换几个关键词试试')
      return results
    } catch (e: any) {
      if (!silent) toast.push(e.message || String(e), 'error')
      return []
    } finally {
      setLoadingIds((prev) => {
        const next = { ...prev }
        delete next[lineId]
        return next
      })
    }
  }

  const pick = (lineId: string, c: MaterialCandidate): void => {
    if (c.source === '本地素材') {
      setMaterial(lineId, { kind: 'local', path: c.url, previewUrl: c.url })
    } else {
      setMaterial(lineId, c)
    }
    setActiveLine(lineId)
  }

  const autoMatch = async (): Promise<void> => {
    if (!ready) {
      toast.push('素材源还没配置好，先去设置里填 Key 或选择本地文件夹', 'error')
      onOpenSettings()
      return
    }
    if (provider === 'local') {
      if (!pool.length) {
        toast.push('本地素材文件夹里没有可用的视频或图片', 'error')
        return
      }
      let cursor = 0
      lines.forEach((line) => {
        const c = pool[cursor % pool.length]
        cursor++
        setMaterial(line.id, { kind: 'local', path: c.url, previewUrl: c.url })
      })
      toast.push(`已随机分配 ${lines.length} 条本地素材`, 'success')
      return
    }
    cancelRef.current = false
    setAutoRunning(true)
    let cursor = 0
    let done = 0
    let failed = 0
    const workers = Array.from({ length: Math.min(3, lines.length) }, async () => {
      while (!cancelRef.current) {
        const index = cursor++
        if (index >= lines.length) break
        const line = lines[index]
        const query = line.visualQuery.trim() || draft.topic
        setLoadingIds((prev) => ({ ...prev, [line.id]: true }))
        try {
          const results = await api.searchMaterials({ query, count: 6, page: 1, orientation: draft.videoPreset })
          setCandidates(line.id, results, 1)
          if (results.length) {
            const best = results.find((r) => r.kind === 'video') ?? results[0]
            setMaterial(line.id, best)
          } else failed++
        } catch {
          failed++
        } finally {
          setLoadingIds((prev) => {
            const next = { ...prev }
            delete next[line.id]
            return next
          })
        }
        done++
      }
    })
    await Promise.all(workers)
    setAutoRunning(false)
    toast.push(
      failed ? `已匹配 ${lines.length - failed} 句，${failed} 句没找到素材` : `已自动匹配 ${lines.length} 句画面`,
      failed ? 'error' : 'success'
    )
  }

  const pickLocalFile = async (lineId: string): Promise<void> => {
    const file = await api.pickFile([
      { name: '视频或图片', extensions: ['mp4', 'mov', 'm4v', 'webm', 'jpg', 'jpeg', 'png', 'webp'] }
    ])
    if (file) setMaterial(lineId, { kind: 'local', path: file, previewUrl: file })
  }

  return (
    <div className="step-stack">
      <div className="page-head">
        <div>
          <h1 className="page-title">每一句，配一个能拍出来的画面</h1>
          <p className="page-desc">素材按句匹配，渲染时自动裁切、补足时长；没有素材的句子会用纯色底。</p>
        </div>
        <Badge tone={matchedCount === lines.length && lines.length ? 'ok' : 'accent'}>
          已匹配 {matchedCount}/{lines.length}
        </Badge>
      </div>

      <Card
        title="素材源"
        desc={`${provider === 'local' ? '本地素材文件夹' : provider === 'pixabay' ? 'Pixabay' : 'Pexels'} · ${
          draft.videoPreset === 'portrait' ? '竖屏' : draft.videoPreset === 'landscape' ? '横屏' : '方形'
        }`}
        right={
          <>
            <Btn variant="ghost" size="sm" icon={<FolderOpen size={13} />} onClick={onOpenSettings}>
              更换素材源
            </Btn>
            <Btn variant="primary" size="sm" icon={<Shuffle size={13} />} loading={autoRunning} onClick={autoMatch}>
              自动匹配全部
            </Btn>
          </>
        }
      >
        {!ready && (
          <div className="inline-error">
            {provider === 'local' ? '还没有选择本地素材文件夹，' : '素材源 API Key 还没填，'}
            去「设置 → 素材源」补齐后再搜索。
          </div>
        )}
        {provider === 'local' && (
          <div className="row small muted" style={{ marginTop: ready ? 0 : 8 }}>
            <ImagePlus size={13} />
            <span>
              已载入 {poolLoading ? '…' : pool.length} 个素材
              {settings?.stock.localDir ? ` · ${settings.stock.localDir}` : ''}
            </span>
          </div>
        )}
        {provider !== 'local' && (
          <div className="small faint" style={{ marginTop: ready ? 0 : 8 }}>
            搜索关键词来自每句的「画面关键词」。建议用英文、具体名词，例如 <span className="mono">close-up of noodles</span>。
          </div>
        )}
      </Card>

      <Card title="逐句画面" desc="点缩略图选中；可以单句换一批，也可以直接从本地文件挑。">
        {lines.map((line, index) => {
          const candidates = draft.candidates[line.id] ?? []
          const selected = draft.material[line.id]
          const loading = loadingIds[line.id]
          return (
            <div className="visual-row" key={line.id}>
              <div className="visual-head">
                <div className="row" style={{ minWidth: 0, gap: 8 }}>
                  <span className="script-num" style={{ flex: 'none' }}>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="visual-line-text" title={line.text}>
                    {line.text}
                  </span>
                </div>
                <Input
                  value={line.visualQuery}
                  onChange={(e) => updateLine(line.id, { visualQuery: e.target.value })}
                  placeholder="english stock query"
                  style={{ fontSize: 11.5, height: 28 }}
                />
                <div className="row" style={{ gap: 6 }}>
                  <Btn
                    variant="soft"
                    size="sm"
                    loading={loading}
                    icon={<Search size={13} />}
                    onClick={() => search(line.id, 1)}
                  >
                    搜索
                  </Btn>
                  <Btn variant="ghost" size="sm" icon={<ImagePlus size={13} />} onClick={() => pickLocalFile(line.id)}>
                    本地
                  </Btn>
                </div>
              </div>

              {provider === 'local' ? (
                <div className="thumb-row">
                  {(pool.length ? pool : []).slice(0, 24).map((c) => {
                    const isSelected = selected?.kind === 'local' && selected.path === c.url
                    return (
                      <div className="thumb-item" key={c.id}>
                        <button className={cn('thumb', isSelected && 'selected')} onClick={() => pick(line.id, c)}>
                          <ThumbMedia c={c} />
                          <span className="thumb-kind">{c.kind === 'video' ? '视频' : '图片'}</span>
                          {isSelected && <span className="thumb-check">✓</span>}
                        </button>
                        <span className="thumb-credit" title={c.credit}>
                          {c.credit}
                        </span>
                      </div>
                    )
                  })}
                  {!pool.length && <div className="thumb-empty">文件夹里没有素材</div>}
                </div>
              ) : candidates.length ? (
                <div className="thumb-row">
                  {candidates.map((c) => {
                    const isSelected = Boolean(selected && 'id' in selected && selected.id === c.id)
                    return (
                      <div className="thumb-item" key={c.id}>
                        <button className={cn('thumb', isSelected && 'selected')} onClick={() => pick(line.id, c)}>
                          <ThumbMedia c={c} />
                          <span className="thumb-kind">{c.kind === 'video' ? (c.duration ? `${c.duration}s` : '视频') : '图片'}</span>
                          {isSelected && <span className="thumb-check">✓</span>}
                        </button>
                        <span className="thumb-credit" title={c.credit}>
                          {c.credit}
                        </span>
                      </div>
                    )
                  })}
                  <button
                    className="thumb-empty"
                    style={{ cursor: 'pointer' }}
                    onClick={() => search(line.id, (draft.page[line.id] ?? 1) + 1)}
                  >
                    换一批
                  </button>
                </div>
              ) : (
                <div className="thumb-row">
                  <div className="thumb-empty">
                    {loading ? '搜索中…' : line.visualQuery ? '还没有结果' : '缺少画面关键词'}
                  </div>
                  {selected && (
                    <Btn
                      variant="ghost"
                      size="sm"
                      icon={<X size={13} />}
                      onClick={() => setMaterial(line.id, null)}
                      style={{ alignSelf: 'center' }}
                    >
                      清除已选
                    </Btn>
                  )}
                </div>
              )}
              {selected && provider !== 'local' && candidates.length > 0 && (
                <div className="small faint" style={{ marginTop: 6 }}>
                  已选：{selected.kind === 'local' ? '本地素材' : selected.credit}
                  <button className="link-btn" style={{ marginLeft: 8 }} onClick={() => setMaterial(line.id, null)}>
                    取消选择
                  </button>
                </div>
              )}
            </div>
          )
        })}
        {!lines.length && <div className="small muted">先去第一步生成文案。</div>}
        <div className="row" style={{ marginTop: 12 }}>
          <Btn variant="ghost" size="sm" icon={<Sparkles size={13} />} onClick={autoMatch} loading={autoRunning}>
            按关键词再自动匹配一轮
          </Btn>
        </div>
      </Card>

      <div className="action-bar">
        <div className="action-info">
          已匹配 <strong>{matchedCount}</strong> / {lines.length} 句
          {matchedCount < lines.length && <span className="faint"> · 未匹配的句子会用纯色底</span>}
        </div>
        <div className="row">
          <Btn variant="ghost" size="md" onClick={() => setStep(1)}>
            上一步
          </Btn>
          <Btn variant="primary" size="md" onClick={() => setStep(3)}>
            下一步：成片
          </Btn>
        </div>
      </div>
    </div>
  )
}