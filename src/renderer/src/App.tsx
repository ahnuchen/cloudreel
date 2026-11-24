import { useEffect, useState, type ReactElement } from 'react'
import { Clapperboard, Settings2, Sparkles } from 'lucide-react'
import { ToastProvider, useToast } from './lib/toast'
import { SettingsProvider, useSettings } from './lib/settings'
import { RenderProvider, useRender } from './lib/render'
import { StudioProvider, useStudio } from './studio/store'
import { Sidebar } from './components/Sidebar'
import { Studio } from './studio/Studio'
import { SettingsPage } from './settings/SettingsPage'
import { LibraryPage } from './library/LibraryPage'
import { api, cn } from './lib/api'
import { useTheme } from './lib/theme'
import { Badge, StatusDot } from './components/ui'

type Page = 'studio' | 'settings' | 'library'

const STEP_TITLES = ['文案脚本', '配音', '画面素材', '成片导出']
const STEP_DESCS = [
  '主题 → 口播稿 → 可编辑的分句',
  '逐句云端合成，试听后再定稿',
  '按句子关键词匹配画面',
  '字幕、BGM、转场，一键渲染'
]

function Shell(): ReactElement {
  const { settings, loading } = useSettings()
  useTheme(settings?.theme)
  const { draft, reset, loadRecord } = useStudio()
  const render = useRender()
  const [page, setPage] = useState<Page>('studio')
  const [ffmpeg, setFfmpeg] = useState<{ ok: boolean; version: string } | null>(null)
  const toast = useToast()

  useEffect(() => {
    api
      .appInfo()
      .then((info) => {
        setFfmpeg({ ok: info.ffmpeg.ok, version: info.ffmpeg.version })
        if (!info.ffmpeg.ok) toast.push('没有找到可用的 ffmpeg，渲染会失败。请检查安装或环境变量 FFMPEG_PATH。', 'error')
      })
      .catch(() => undefined)
  }, [toast])

  const openProject = async (id: string): Promise<void> => {
    if (render.status === 'running') {
      toast.push('正在渲染，先取消或等它完成再切换项目', 'error')
      return
    }
    try {
      const record = await api.projectLoad(id)
      if (!record) {
        toast.push('项目文件不存在，可能已被删除', 'error')
        return
      }
      loadRecord(record)
      render.clear()
      setPage('studio')
      toast.push(`已打开「${record.title || '未命名项目'}」`, 'success')
    } catch (e: any) {
      toast.push(e.message || String(e), 'error')
    }
  }

  const onProjectDeleted = (id: string): void => {
    if (draft.projectId === id) {
      reset()
      render.clear()
    }
  }

  const newProject = (): void => {
    if (render.status === 'running') {
      toast.push('正在渲染，先取消或等它完成再新建项目', 'error')
      return
    }
    if (draft.script || draft.topic) {
      const ok = window.confirm('新建项目会清空当前主题、文案、配音和画面选择，确定吗？')
      if (!ok) return
    }
    reset()
    render.clear()
    setPage('studio')
    toast.push('已新建项目', 'success')
  }

  if (loading || !settings) {
    return (
      <div className="splash">
        <div className="splash-inner">
          <div className="brand-mark">
            <Clapperboard size={24} />
          </div>
          <div>CloudReel 正在启动…</div>
          <div className="small faint">读取本机设置与 ffmpeg</div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Sidebar
        onSettings={() => setPage('settings')}
        onNewProject={newProject}
        onStudio={() => setPage('studio')}
        onLibrary={() => setPage('library')}
        libraryActive={page === 'library'}
        studioActive={page === 'studio'}
        renderDone={render.status === 'done'}
      />
      <div className="main">
        <header className="topbar">
          <div className="grow">
            <div className="topbar-title">
              {page === 'settings' ? '设置' : page === 'library' ? '作品库' : STEP_TITLES[draft.step]}
              {render.status === 'running' && <span className="badge badge-accent" style={{ marginLeft: 10 }}>渲染中</span>}
            </div>
            <div className="topbar-sub">
              {page === 'settings' ? '云服务、素材与输出配置' : page === 'library' ? '本机保存的项目与成片记录' : STEP_DESCS[draft.step]}
            </div>
          </div>
          <div className="row" style={{ gap: 14 }}>
            <StatusDot ok={Boolean(ffmpeg?.ok)} text={ffmpeg?.ok ? 'ffmpeg 就绪' : 'ffmpeg 异常'} />
            <Badge tone="accent">
              <Sparkles size={11} /> 全云端
            </Badge>
            <button
              className={cn('icon-btn', page === 'settings' && 'active')}
              title="设置"
              onClick={() => setPage(page === 'settings' ? 'studio' : 'settings')}
            >
              <Settings2 size={15} />
            </button>
          </div>
        </header>
        <main className="content">
          {page === 'settings' ? (
            <SettingsPage onBack={() => setPage('studio')} />
          ) : page === 'library' ? (
            <LibraryPage onOpen={openProject} onNew={newProject} onDeleted={onProjectDeleted} />
          ) : (
            <Studio onOpenSettings={() => setPage('settings')} onNewProject={newProject} />
          )}
        </main>
      </div>
    </div>
  )
}

export default function App(): ReactElement {
  return (
    <ToastProvider>
      <SettingsProvider>
        <StudioProvider>
          <RenderProvider>
            <Shell />
          </RenderProvider>
        </StudioProvider>
      </SettingsProvider>
    </ToastProvider>
  )
}