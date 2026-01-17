/**
 * Button.tsx
 * 
 * Componente de botão reutilizável com variantes.
 */

import Link from 'next/link'
import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  href?: string
  onClick?: () => void
  type?: 'button' | 'submit'
  className?: string
  disabled?: boolean
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  href,
  onClick,
  type = 'button',
  className = '',
  disabled = false,
}: ButtonProps) {
  const baseStyles = 'font-semibold rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 inline-flex items-center justify-center'
  
  const variants = {
    primary: 'bg-gradient-to-r from-brand-orange to-brand-yellow text-white hover:shadow-lg hover:scale-105 focus:ring-brand-orange',
    secondary: 'bg-brand-text text-white hover:bg-gray-800 focus:ring-brand-text',
    outline: 'border-2 border-brand-orange text-brand-orange hover:bg-brand-orange hover:text-white focus:ring-brand-orange',
  }

  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
  }

  const disabledStyles = disabled ? 'opacity-50 cursor-not-allowed hover:shadow-none hover:scale-100' : ''

  const classes = cn(baseStyles, variants[variant], sizes[size], disabledStyles, className)

  if (href) {
    const isExternal = href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')
    
    if (isExternal) {
      return (
        <a
          href={href}
          target={href.startsWith('http') ? '_blank' : undefined}
          rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
          className={classes}
        >
          {children}
        </a>
      )
    }
    
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    )
  }

  return (
    <button type={type} onClick={onClick} className={classes} disabled={disabled}>
      {children}
    </button>
  )
}
