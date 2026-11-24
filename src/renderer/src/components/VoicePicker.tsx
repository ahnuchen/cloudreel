import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search } from 'lucide-react'
import type { Voice } from '@shared/presets'
import { cn } from '../lib/api'

interface PanelRect {
  left: number
  top: number
  width: number
  openUp: boolean
}

export function VoicePicker({
  value,
  voices,
  onChange,
  placeholder = '搜索音色名称或 ID'
}: {
  value: string
  voices: Voice[]
  onChange: (v: string) => void
  placeholder?: string
}): ReactElement {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const [rect, setRect] = useState<PanelRect | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const current = useMemo(() => voices.find((v) => v.id === value), [voices, value])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return voices
    return voices.filter((v) => `${v.label} ${v.id} ${v.tags ?? ''}`.toLowerCase().includes(q))
  }, [voices, query])

  useEffect(() => {
    setHighlight(0)
  }, [query, open])

  const updateRect = useCallback((): void => {
    const el = wrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const openUp = window.innerHeight - r.bottom < 380 && r.top > 380
    const left = Math.max(12, Math.min(r.left, window.innerWidth - r.width - 12))
    setRect({ left, top: r.bottom, width: r.width, openUp })
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      const target = e.target as Node
      if (!wrapRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (!open) {
      setRect(null)
      return
    }
    updateRect()
    const onViewport = (): void => updateRect()
    window.addEventListener('scroll', onViewport, true)
    window.addEventListener('resize', onViewport)
    return () => {
      window.removeEventListener('scroll', onViewport, true)
      window.removeEventListener('resize', onViewport)
    }
  }, [open, updateRect])

  const choose = (v: Voice): void => {
    onChange(v.id)
    setOpen(false)
    setQuery('')
  }

  const openPanel = (): void => {
    setOpen(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlight((h) => Math.min(h + 1, Math.max(0, filtered.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const q = query.trim()
      if (!q) {
        setOpen(false)
        return
      }
      if (filtered.length) choose(filtered[Math.min(highlight, filtered.length - 1)])
      else {
        onChange(q)
        setOpen(false)
        setQuery('')
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div className="voice-picker" ref={wrapRef}>
      <div className="voice-picker-control" onClick={openPanel}>
        <Search size={13} className="faint" />
        <input
          ref={inputRef}
          className="voice-picker-input"
          value={open ? query : (current?.label ?? value)}
          placeholder={open && current ? `已选：${current.label}` : placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoComplete="off"
        />
        <ChevronDown size={14} className={cn('faint', open && 'rot180')} />
      </div>
      {open && rect && createPortal(
        <div
          ref={panelRef}
          className="voice-picker-panel"
          style={{
            left: rect.left,
            width: rect.width,
            top: rect.openUp ? undefined : rect.top + 6,
            bottom: rect.openUp ? window.innerHeight - rect.top + 6 : undefined
          }}
        >
          <div className="voice-picker-meta">
            {query.trim() ? `匹配 ${filtered.length} 个` : `共 ${voices.length} 个音色`}
            <span className="faint"> · 输入中文名 / ID 搜索，Enter 确认</span>
          </div>
          <div className="voice-picker-list">
            {!filtered.length && <div className="voice-picker-empty">没有匹配项，按 Enter 使用自定义 ID：{query.trim()}</div>}
            {filtered.map((v, i) => (
              <button
                type="button"
                key={v.id}
                className={cn('voice-picker-item', v.id === value && 'active', i === highlight && 'hl')}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(v)}
                onMouseEnter={() => setHighlight(i)}
              >
                <span className="voice-picker-label">{v.label}</span>
                <span className="voice-picker-id mono">{v.id}</span>
                {v.id === value && <Check size={13} className="voice-picker-check" />}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}