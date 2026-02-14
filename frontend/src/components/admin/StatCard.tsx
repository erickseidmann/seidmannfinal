/**
 * Componente StatCard
 *
 * Card para exibir estatísticas no dashboard.
 * variant="finance" = estilo pastel do financeiro (borda colorida, fundo claro).
 */

import { ReactNode } from 'react'

interface StatCardProps {
  title: string
  value: string | number
  icon?: ReactNode
  color?: 'green' | 'orange' | 'red' | 'blue' | 'purple'
  subtitle?: string
  className?: string
  /** Estilo igual ao financeiro: fundo pastel, borda colorida, título em maiúsculas */
  variant?: 'default' | 'finance'
}

const colorClasses = {
  green: 'text-emerald-600 bg-emerald-100',
  orange: 'text-amber-600 bg-amber-100',
  red: 'text-rose-600 bg-rose-100',
  blue: 'text-sky-600 bg-sky-100',
  purple: 'text-violet-600 bg-violet-100',
}

const financeCardClasses = {
  green: 'border-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100',
  orange: 'border-2 border-amber-200 bg-amber-50 hover:bg-amber-100',
  red: 'border-2 border-red-200 bg-red-50 hover:bg-red-100',
  blue: 'border-2 border-sky-200 bg-sky-50 hover:bg-sky-100',
  purple: 'border-2 border-violet-200 bg-violet-50 hover:bg-violet-100',
}

const financeTitleClasses = {
  green: 'text-emerald-800',
  orange: 'text-amber-800',
  red: 'text-red-800',
  blue: 'text-sky-800',
  purple: 'text-violet-800',
}

const financeValueClasses = {
  green: 'text-emerald-900',
  orange: 'text-amber-900',
  red: 'text-red-900',
  blue: 'text-sky-900',
  purple: 'text-violet-900',
}

const financeIconClasses = {
  green: 'text-emerald-700 bg-emerald-200/60',
  orange: 'text-amber-700 bg-amber-200/60',
  red: 'text-red-700 bg-red-200/60',
  blue: 'text-sky-700 bg-sky-200/60',
  purple: 'text-violet-700 bg-violet-200/60',
}

export default function StatCard({ title, value, icon, color = 'blue', subtitle, className = '', variant = 'default' }: StatCardProps) {
  if (variant === 'finance') {
    return (
      <div
        className={`rounded-xl p-4 shadow-sm transition-colors h-full flex flex-col ${financeCardClasses[color]} ${className}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className={`text-xs font-semibold uppercase tracking-wide ${financeTitleClasses[color]}`}>
              {title}
            </p>
            <p className={`mt-1 text-xl font-bold tabular-nums ${financeValueClasses[color]}`}>
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{subtitle}</p>
            )}
          </div>
          {icon && (
            <div className={`shrink-0 p-2 rounded-lg ${financeIconClasses[color]}`}>
              {icon}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white p-6 shadow-md transition-all hover:shadow-lg hover:border-slate-300/80 ${className}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
          <p className={`text-3xl font-bold tabular-nums ${colorClasses[color]}`}>
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-slate-400 mt-1.5 line-clamp-2">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div className={`shrink-0 p-3 rounded-xl ${colorClasses[color]}`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
