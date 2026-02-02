/**
 * Layout do Dashboard Aluno
 * Rotas protegidas por middleware (role STUDENT).
 */

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Dashboard Aluno | Seidmann Institute',
  description: 'Área do aluno - Seidmann Institute',
}

export default function DashboardAlunoLayout({
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
