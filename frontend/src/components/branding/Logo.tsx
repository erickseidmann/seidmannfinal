/**
 * Logo.tsx
 * 
 * Componente de logo do Seidmann Institute usando imagens reais.
 * Suporta variantes (full/icon) e tamanhos diferentes.
 * Com fallback para <img> caso next/image falhe.
 */

'use client'

import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useState } from 'react'

interface LogoProps {
  variant?: 'full' | 'icon'
  className?: string
  size?: 'sm' | 'md' | 'lg'
  priority?: boolean
  href?: string
  useFallback?: boolean // Se true, usa <img> como fallback
  noLink?: boolean // Se true, não renderiza o Link (útil quando está dentro de outro Link)
}

const sizeConfig = {
  sm: { full: { width: 120, height: 40 }, icon: { width: 40, height: 40 } },
  md: { full: { width: 180, height: 60 }, icon: { width: 60, height: 60 } },
  lg: { full: { width: 240, height: 80 }, icon: { width: 80, height: 80 } },
}

export default function Logo({
  variant = 'full',
  className,
  size = 'md',
  priority = false,
  href = '/',
  useFallback = false,
  noLink = false,
}: LogoProps) {
  const [imageError, setImageError] = useState(false)
  const config = sizeConfig[size][variant]
  // Tenta primeiro com subpasta logo/, depois sem subpasta
  const logoSrc = variant === 'full' 
    ? '/images/logo/logo-full.png'
    : '/images/logo/logo-icon.png'

  // Se variant="icon", aplicar estilo circular com tamanho fixo
  const isIcon = variant === 'icon'
  const iconWrapperClass = isIcon 
    ? cn('w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-brand-orange to-brand-yellow p-1 flex items-center justify-center', className)
    : className
  const imageClass = isIcon 
    ? 'object-cover w-full h-full rounded-full'
    : 'object-contain'

  // Conteúdo visual do logo (imagem)
  const logoImage = useFallback || imageError ? (
    isIcon ? (
      <img
        src={logoSrc}
        alt="Seidmann Institute"
        className={imageClass}
        onError={() => setImageError(true)}
      />
    ) : (
      <img
        src={logoSrc}
        alt="Seidmann Institute"
        width={config.width}
        height={config.height}
        className={imageClass}
        onError={() => setImageError(true)}
      />
    )
  ) : (
    isIcon ? (
      <Image
        src={logoSrc}
        alt="Seidmann Institute"
        width={48}
        height={48}
        priority={priority}
        className={imageClass}
        onError={() => setImageError(true)}
      />
    ) : (
      <Image
        src={logoSrc}
        alt="Seidmann Institute"
        width={config.width}
        height={config.height}
        priority={priority}
        className={imageClass}
        onError={() => setImageError(true)}
      />
    )
  )

  // Se noLink é true, retorna apenas o elemento visual sem Link
  if (noLink) {
    return (
      <div className={isIcon ? iconWrapperClass : cn('inline-block', className)}>
        {logoImage}
      </div>
    )
  }

  // Se useFallback é true OU se houve erro, usa <img> nativo com Link
  return (
    <Link href={href} className={isIcon ? iconWrapperClass : cn('inline-block', className)}>
      {logoImage}
    </Link>
  )
}
