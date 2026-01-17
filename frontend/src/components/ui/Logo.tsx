/**
 * Logo.tsx
 * 
 * Componente de logo do Seidmann Institute.
 */

import Link from 'next/link'

interface LogoProps {
  className?: string
}

export function Logo({ className = '' }: LogoProps) {
  return (
    <Link href="/" className={`flex items-center gap-2 ${className}`}>
      <div className="w-10 h-10 rounded-full bg-gradient-seidmann flex items-center justify-center">
        <span className="text-white font-display font-bold text-xl">S</span>
      </div>
      <span className="text-xl font-display font-bold text-seidmann-dark">
        Seidmann Institute
      </span>
    </Link>
  )
}
