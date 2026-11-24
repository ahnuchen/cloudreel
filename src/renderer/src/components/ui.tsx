import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactElement, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../lib/api'

type Variant = 'primary' | 'soft' | 'ghost' | 'outline' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
}

export function Btn({ variant = 'soft', size = 'md', loading, icon, className, children, disabled, ...rest }: BtnProps): ReactElement {
  return (
    <button
      className={cn('btn', `btn-${variant}`, `btn-${size}`, className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 size={size === 'sm' ? 14 : 16} className="spin" /> : icon}
      {children && <span>{children}</span>}
    </button>
  )
}

export function Field({ label, hint, children, className }: { label?: string; hint?: ReactNode; children: ReactNode; className?: string }): ReactElement {
  return (
    <label className={cn('field', className)}>
      {label && <span className="field-label">{label}</span>}
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>): ReactElement {
  return <input {...props} className={cn('input', props.className)} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>): ReactElement {
  return <textarea {...props} className={cn('input textarea', props.className)} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>): ReactElement {
  return <select {...props} className={cn('input select', props.className)} />
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className
}: {
  value: T
  options: { id: T; label: string; hint?: string }[]
  onChange: (v: T) => void
  className?: string
}): ReactElement {
  return (
    <div className={cn('segmented', className)}>
      {options.map((o) => (
        <button key={o.id} className={cn('segment', value === o.id && 'active')} onClick={() => onChange(o.id)} type="button">
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }): ReactElement {
  return (
    <button type="button" className={cn('toggle-row', checked && 'on')} onClick={() => onChange(!checked)}>
      <span className={cn('switch', checked && 'on')}>
        <span className="switch-dot" />
      </span>
      <span className="toggle-text">
        <span className="toggle-label">{label}</span>
        {hint && <span className="toggle-hint">{hint}</span>}
      </span>
    </button>
  )
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'ok' | 'warn' | 'accent' }): ReactElement {
  return <span className={cn('badge', `badge-${tone}`)}>{children}</span>
}

export function Card({ title, desc, right, children, className, pad = true }: { title?: ReactNode; desc?: ReactNode; right?: ReactNode; children?: ReactNode; className?: string; pad?: boolean }): ReactElement {
  return (
    <section className={cn('card', className)}>
      {(title || right) && (
        <header className="card-head">
          <div>
            {title && <h3 className="card-title">{title}</h3>}
            {desc && <p className="card-desc">{desc}</p>}
          </div>
          {right && <div className="card-right">{right}</div>}
        </header>
      )}
      {children && <div className={cn('card-body', !pad && 'no-pad')}>{children}</div>}
    </section>
  )
}

export function Spinner({ size = 16 }: { size?: number }): ReactElement {
  return <Loader2 size={size} className="spin" />
}

export function Empty({ icon, title, desc, action }: { icon?: ReactNode; title: string; desc?: string; action?: ReactNode }): ReactElement {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <div className="empty-title">{title}</div>
      {desc && <div className="empty-desc">{desc}</div>}
      {action}
    </div>
  )
}

export function StatusDot({ ok, text }: { ok: boolean; text?: string }): ReactElement {
  return (
    <span className={cn('status-dot', ok ? 'ok' : 'bad')}>
      <i />
      {text}
    </span>
  )
}