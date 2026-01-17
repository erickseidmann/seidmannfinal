/**
 * Logo.tsx
 * 
 * Componente de logo do Seidmann Institute.
 * Suporta diferentes tamanhos e variantes (color/white).
 * Tenta carregar imagem do logo, usa fallback SVG se não existir.
 */

'use client'

import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useState } from 'react'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  variant?: 'color' | 'white'
  className?: string
  href?: string
}

const sizeConfig = {
  sm: { icon: 'w-6 h-6', text: 'text-lg', iconText: 'text-base', imageSize: { w: 120, h: 32 } },
  md: { icon: 'w-10 h-10', text: 'text-xl', iconText: 'text-xl', imageSize: { w: 180, h: 48 } },
  lg: { icon: 'w-12 h-12', text: 'text-2xl', iconText: 'text-2xl', imageSize: { w: 240, h: 64 } },
}

export function Logo({ size = 'md', variant = 'color', className, href = '/' }: LogoProps) {
  const [useFallback, setUseFallback] = useState(true) // Inicia com fallback
  const config = sizeConfig[size]
  const textColor = variant === 'white' ? 'text-white' : 'text-brand-text'

  // Tenta carregar imagem do logo (pode ser substituído quando logo existir)
  const logoSrc = variant === 'white' 
    ? '/assets/logos/logo-full-white.png'
    : '/assets/logos/logo-full-dark.png'

  // Por enquanto, sempre usa fallback
  // Quando o logo existir, descomente e ajuste a lógica de carregamento
  return (
    <Link href={href} className={cn('inline-flex items-center gap-2', className)}>
      {/* Logo com ícone "S" e texto */}
      <div className={cn(
        'rounded-full bg-gradient-to-r from-brand-orange to-brand-yellow flex items-center justify-center flex-shrink-0',
        config.icon
      )}>
        <span className={cn('font-display font-bold text-white', config.iconText)}>
          S
        </span>
      </div>
      <span className={cn('font-display font-bold', textColor, config.text)}>
        Seidmann
      </span>
    </Link>
  )
}
