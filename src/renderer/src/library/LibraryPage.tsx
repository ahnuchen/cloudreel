import { useEffect, useMemo, useState, type ReactElement } from 'react'
import {
  Clapperboard,
  Clock3,
  Film,
  FolderOpen,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X
} from 'lucide-react'
import type { ProjectSummary } from '@shared/types'
import { api, cn, fmtDuration, mediaUrl } from '../lib/api'
import { useToast } from '../lib/toast'
import { Badge, Btn, Empty, Input, Select } from '../components/ui'

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`
  if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400_000)} 天前`
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function LibraryPage({
  onOpen,
  onNew,
  onDeleted
}: {
  onOpen: (id: string) => Promise<void> | void
  onNew: () => void
  onDeleted: (id: string) => void
}): ReactElement {
  const toast = useToast()
  const [list, setList] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'updated' | 'created' | 'outputs'>('updated')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ProjectSummary | null>(null)
  const [playing, setPlaying] = useState('')

  const load = async (): Promise<void> => {
    setLoading(true)
    try {
      setList(await api.projectsList())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const items = q
      ? list.filter((p) => p.title.toLowerCase().includes(q) || p.topic.toLowerCase().includes(q))
      : list
    const sorted = [...items]
    if (sort === 'created') sorted.sort((a, b) => b.createdAt - a.createdAt)
    else if (sort === 'outputs') sorted.sort((a, b) => b.outputs - a.outputs || b.updatedAt - a.updatedAt)
    else sorted.sort((a, b) => b.updatedAt - a.updatedAt)
    return sorted
  }, [list, query, sort])

  const remove = async (p: ProjectSummary): Promise<void> => {
    const ok = window.confirm(`删除「${p.title}」？\n\n项目里的配音、素材缓存和成片记录会一起删除，已导出的成片文件本身不会被删除。`)
    if (!ok) return
    setBusyId(p.id)
    try {
      const done = await api.projectDelete(p.id)
      if (done) {
        onDeleted(p.id)
        setList((prev) => prev.filter((x) => x.id !== p.id))
        toast.push('项目已删除', 'success')
      }
    } catch (e: any) {
      toast.push(e.message || String(e), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const openDetail = (p: ProjectSummary): void => {
    setDetail(p)
    setPlaying(p.outputList[0]?.path ?? '')
  }

  return (
    <div className="settings-wrap" style={{ maxWidth: 1180 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">作品库</h1>
          <p className="page-desc">每个项目都会自动保存在本机。继续编辑、找回成片，或者清掉不再需要的草稿。</p>
        </div>
        <div className="row">
          <Btn variant="ghost" size="md" icon={<RefreshCw size={14} />} onClick={load}>
            刷新
          </Btn>
          <Btn variant="primary" size="md" icon={<Plus size={15} />} onClick={onNew}>
            新建项目
          </Btn>
        </div>
      </div>

      <div className="row" style={{ gap: 10 }}>
        <div className="row grow" style={{ gap: 8, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: '4px 10px' }}>
          <Search size={14} className="faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索标题或主题"
            style={{ border: 0, background: 'transparent', boxShadow: 'none', paddingLeft: 0 }}
          />
        </div>
        <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} style={{ width: 150 }}>
          <option value="updated">最近修改</option>
          <option value="created">最新创建</option>
          <option value="outputs">成片最多</option>
        </Select>
        <Badge>{filtered.length} 个项目</Badge>
      </div>

      {loading ? (
        <div className="empty">正在读取作品库…</div>
      ) : !filtered.length ? (
        <Empty
          icon={<Layers size={20} />}
          title={query ? '没有匹配的项目' : '作品库还是空的'}
          desc={query ? '换个关键词试试。' : '从一条主题开始，生成第一条片子后会自动出现在这里。'}
          action={
            <Btn variant="primary" size="md" icon={<Clapperboard size={14} />} onClick={onNew}>
              开始创作
            </Btn>
          }
        />
      ) : (
        <div className="project-grid">
          {filtered.map((p) => (
            <article className="project-card" key={p.id}>
              <button className="project-cover" onClick={() => onOpen(p.id)} title="继续编辑">
                {p.cover ? (
                  <img src={/^https?:/i.test(p.cover) ? p.cover : mediaUrl(p.cover)} alt="" loading="lazy" />
                ) : (
                  <div className="project-cover-fallback">
                    <Film size={22} />
                    <span>{p.title.slice(0, 1)}</span>
                  </div>
                )}
                <span className="project-cover-scrim" />
                <span className="project-duration mono">{fmtDuration(p.duration)}</span>
                <span className="project-status">
                  {p.outputs > 0 ? <Badge tone="ok">已导出 {p.outputs}</Badge> : <Badge>草稿</Badge>}
                </span>
              </button>
              <div className="project-body">
                <div className="project-title" title={p.title}>
                  {p.title}
                </div>
                <div className="project-meta">
                  <span>{p.lines} 句</span>
                  <span>·</span>
                  <span className="row" style={{ gap: 4 }}>
                    <Clock3 size={11} />
                    {relativeTime(p.updatedAt)}
                  </span>
                </div>
                <div className="project-actions">
                  <Btn variant="soft" size="sm" onClick={() => onOpen(p.id)}>
                    继续编辑
                  </Btn>
                  <Btn
                    variant="ghost"
                    size="sm"
                    icon={<FolderOpen size={13} />}
                    onClick={() => openDetail(p)}
                    title="查看成片历史与项目目录"
                  >
                    成片{p.outputs > 0 ? ` ${p.outputs}` : ''}
                  </Btn>
                  <span className="grow" />
                  <button
                    className="icon-btn"
                    title="删除项目"
                    disabled={busyId === p.id}
                    onClick={() => remove(p)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <header className="modal-head">
              <div>
                <div className="modal-title">{detail.title}</div>
                <div className="modal-sub">
                  {detail.lines} 句 · 创建于 {new Date(detail.createdAt).toLocaleDateString()} · 已导出 {detail.outputList.length} 条
                </div>
              </div>
              <button className="icon-btn" onClick={() => setDetail(null)} title="关闭">
                <X size={15} />
              </button>
            </header>
            <div className="modal-body">
              {playing ? (
                <video className="modal-video" src={mediaUrl(playing)} controls playsInline />
              ) : (
                <div className="empty" style={{ padding: '36px 0' }}>
                  还没有导出的成片
                </div>
              )}
              {detail.outputList.length > 0 && (
                <div className="output-list">
                  {detail.outputList.map((o) => (
                    <button
                      key={o.path}
                      className={cn('output-row', playing === o.path && 'active')}
                      onClick={() => setPlaying(o.path)}
                    >
                      <span className="output-time mono">{fmtDuration(o.duration)}</span>
                      <span className="output-name">{o.path.split(/[\/]/).pop()}</span>
                      <span className="output-meta">{new Date(o.createdAt).toLocaleString()}</span>
                      <span className="output-meta">{(o.size / 1024 / 1024).toFixed(1)} MB</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="row" style={{ marginTop: 12 }}>
                <Btn variant="soft" size="sm" icon={<FolderOpen size={13} />} onClick={() => api.projectReveal(detail.id)}>
                  项目目录
                </Btn>
                {playing && (
                  <Btn variant="ghost" size="sm" onClick={() => api.reveal(playing)}>
                    显示成片文件
                  </Btn>
                )}
                <span className="grow" />
                <Btn variant="primary" size="sm" onClick={() => onOpen(detail.id)}>
                  继续编辑
                </Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}