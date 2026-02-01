/**
 * Renderiza o Footer do site apenas fora de /admin e /dashboard-professores.
 */

'use client'

import { usePathname } from 'next/navigation'
import { Footer } from './Footer'

export function ConditionalFooter() {
  const pathname = usePathname()
  if (!pathname) return <Footer />
  if (pathname.startsWith('/admin') || pathname.startsWith('/dashboard-professores')) return null
  return <Footer />
}
