'use client'
import { ReactNode } from 'react'

// ── BUTTON ──────────────────────────────────────────────────
interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'wa'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
}
export function Btn({ variant = 'primary', size = 'md', className = '', children, ...props }: BtnProps) {
  const v = {
    primary:   'bg-p-green hover:bg-p-dark text-white',
    secondary: 'bg-white border border-p-line hover:bg-p-light text-p-ink',
    danger:    'bg-red-500 hover:bg-red-600 text-white',
    ghost:     'hover:bg-p-light text-p-ink2',
    wa:        'bg-[#25d366] hover:bg-[#1ebe5a] text-white',
  }[variant]
  const s = { sm: 'text-xs px-2.5 py-1.5', md: 'text-sm px-4 py-2', lg: 'text-base px-5 py-2.5' }[size]
  return (
    <button className={`font-saira font-bold rounded-lg transition-colors disabled:opacity-50 ${v} ${s} ${className}`} {...props}>
      {children}
    </button>
  )
}

// ── MODAL ───────────────────────────────────────────────────
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-p-line">
          <h2 className="font-saira font-bold text-lg text-p-ink">{title}</h2>
          <button onClick={onClose} className="text-p-gray hover:text-p-ink text-xl leading-none">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

// ── FIELD ───────────────────────────────────────────────────
export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-[11px] font-semibold text-p-ink2 uppercase tracking-wider mb-1">{label}</label>
      {children}
    </div>
  )
}

// ── INPUT ───────────────────────────────────────────────────
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props} className={`w-full border border-p-line rounded-lg px-3 py-2 text-sm text-p-ink focus:outline-none focus:border-p-green focus:ring-1 focus:ring-p-green bg-white ${props.className ?? ''}`} />
  )
}

// ── SELECT ──────────────────────────────────────────────────
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`w-full border border-p-line rounded-lg px-3 py-2 text-sm text-p-ink focus:outline-none focus:border-p-green bg-white ${props.className ?? ''}`} />
  )
}

// ── BADGE ───────────────────────────────────────────────────
const BADGE_COLORS: Record<string, string> = {
  pendiente:  'bg-gray-100 text-gray-600',
  confirmado: 'bg-p-light text-p-dark',
  hecho:      'bg-green-100 text-green-700',
  ausente:    'bg-red-100 text-red-600',
  gerencial:  'bg-purple-100 text-purple-700',
  admin:      'bg-blue-100 text-blue-700',
  ventas:     'bg-p-light text-p-dark',
  SI:         'bg-green-100 text-green-700',
  NO:         'bg-red-100 text-red-600',
  MIN:        'bg-amber-100 text-amber-700',
}
export function Badge({ label }: { label: string }) {
  const cls = BADGE_COLORS[label] ?? 'bg-gray-100 text-gray-600'
  return <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
}

// ── KPI CARD ────────────────────────────────────────────────
export function KpiCard({ label, value, accent = false, sub }: { label: string; value: string; accent?: boolean; sub?: string }) {
  return (
    <div className={`rounded-xl border px-4 py-4 ${accent ? 'border-p-green bg-p-light' : 'border-p-line bg-white'}`}>
      <p className={`font-saira font-bold text-2xl ${accent ? 'text-p-dark' : 'text-p-ink'}`}>{value}</p>
      {sub && <p className="font-mono text-xs text-p-ink2 mt-0.5">{sub}</p>}
      <p className="text-[10px] text-p-ink2 uppercase tracking-wider mt-1">{label}</p>
    </div>
  )
}

// ── EMPTY STATE ─────────────────────────────────────────────
export function Empty({ msg = 'Sin datos' }: { msg?: string }) {
  return <p className="text-center text-sm text-p-gray py-10">{msg}</p>
}

// ── ALARM BAR ───────────────────────────────────────────────
export function AlarmBar({ count, label, href, onGo }: { count: number; label: string; href?: string; onGo?: () => void }) {
  if (!count) return null
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-4 mb-3">
      <div>
        <span className="font-saira font-bold text-amber-700">⚠️ {count} {label}</span>
      </div>
      {onGo && <button onClick={onGo} className="text-xs font-semibold text-amber-700 underline whitespace-nowrap">Ver</button>}
    </div>
  )
}
