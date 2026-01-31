/**
 * LayoutShell
 *
 * Para rotas /admin/* não exibe Header/Footer públicos (a área admin tem seu próprio layout).
 * Para as demais rotas exibe Header, main e Footer.
 */

'use client'

import { usePathname } from 'next/navigation'
import { Header } from './Header'
import { Footer } from './Footer'

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAdmin = pathname?.startsWith('/admin')

  if (isAdmin) {
    return <>{children}</>
  }

  return (
    <>
      <Header variant="transparent" />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  )
}
