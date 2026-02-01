/**
 * Layout do Dashboard Professores
 * Rotas protegidas por middleware (role TEACHER).
 */

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Dashboard Professores | Seidmann Institute',
  description: 'Área do professor - Seidmann Institute',
}

export default function DashboardProfessoresLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {children}
    </div>
  )
}
