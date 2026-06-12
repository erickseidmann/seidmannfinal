'use client'

import Logo from '@/components/branding/Logo'
import { cn } from '@/lib/utils'

export type SeidmannLoadingVariant = 'page' | 'section' | 'inline' | 'compact'

export interface SeidmannLoadingProps {
  message?: string | null
  variant?: SeidmannLoadingVariant
  /** Exibe logo e texto lado a lado (útil em botões e linhas compactas). */
  layout?: 'column' | 'row'
  className?: string
}

const variantConfig: Record<
  SeidmannLoadingVariant,
  { wrapper: string; logoSize: 'sm' | 'md' | 'lg'; messageClass: string }
> = {
  page: {
    wrapper: 'min-h-screen flex flex-col items-center justify-center gap-5 bg-gray-50',
    logoSize: 'md',
    messageClass: 'text-sm text-gray-500 font-medium',
  },
  section: {
    wrapper: 'flex flex-col items-center justify-center gap-4 py-12 text-center',
    logoSize: 'sm',
    messageClass: 'text-sm text-gray-600',
  },
  inline: {
    wrapper: 'flex flex-col items-center justify-center gap-3 py-6 text-center',
    logoSize: 'sm',
    messageClass: 'text-sm text-gray-500',
  },
  compact: {
    wrapper: 'flex flex-col items-center justify-center gap-2 py-4 text-center',
    logoSize: 'sm',
    messageClass: 'text-xs text-gray-500',
  },
}

export default function SeidmannLoading({
  message = 'Carregando...',
  variant = 'section',
  layout = 'column',
  className,
}: SeidmannLoadingProps) {
  const cfg = variantConfig[variant]
  const label = message ?? 'Carregando'
  const isRow = layout === 'row'

  return (
    <div
      className={cn(
        cfg.wrapper,
        isRow && 'flex-row gap-2 py-0',
        className
      )}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="animate-pulse opacity-90 shrink-0">
        <Logo
          variant={isRow ? 'icon' : 'full'}
          size={cfg.logoSize}
          noLink
          priority
          useFallback
        />
      </div>
      {message ? (
        isRow ? (
          <span className={cfg.messageClass}>{message}</span>
        ) : (
          <p className={cfg.messageClass}>{message}</p>
        )
      ) : null}
    </div>
  )
}
