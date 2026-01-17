/**
 * Card.tsx
 * 
 * Componente de card reutilizável do design system.
 */

import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface CardProps {
  children: ReactNode
  className?: string
  hover?: boolean
  onClick?: () => void
}

export function Card({ children, className, hover = false, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'card',
        hover && 'card-hover',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {children}
    </div>
  )
}
