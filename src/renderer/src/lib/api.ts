export const api = window.cloudreel

export function mediaUrl(p?: string | null): string {
  if (!p) return ''
  if (/^(https?|data|blob|crfile):/i.test(p)) return p
  return api.mediaUrl(p)
}

export function fmtDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '0:00'
  const s = Math.round(seconds)
  const m = Math.floor(s / 60)
  const rest = s % 60
  return `${m}:${String(rest).padStart(2, '0')}`
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'id-' + Math.random().toString(36).slice(2)
}

export function estimateSeconds(text: string): number {
  const len = [...text.trim()].length
  return Math.max(1.2, len / 4.4)
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}