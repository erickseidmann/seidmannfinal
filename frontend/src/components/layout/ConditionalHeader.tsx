/**
 * Renderiza o Header do site apenas fora de /admin e /dashboard-professores.
 * Nas rotas admin e dashboard-professores cada um usa seu próprio header (AdminHeader / ProfessorHeader).
 */

'use client'

import { usePathname } from 'next/navigation'
import { Header } from './Header'

export function ConditionalHeader() {
  const pathname = usePathname()
  if (!pathname) return <Header variant="transparent" />
  if (pathname.startsWith('/admin') || pathname.startsWith('/dashboard-professores') || pathname.startsWith('/dashboard-aluno')) return null
  return <Header variant="transparent" />
}
