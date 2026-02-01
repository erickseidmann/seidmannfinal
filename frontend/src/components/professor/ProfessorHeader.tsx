/**
 * Header do Dashboard Professores (estilo admin: sem Login/Matricule-se).
 */

'use client'

import Link from 'next/link'
import Button from '@/components/ui/Button'
import { LogOut, LayoutDashboard } from 'lucide-react'

export default function ProfessorHeader() {
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch (error) {
      console.error('Erro ao fazer logout:', error)
    }
    window.location.href = '/login'
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link href="/dashboard-professores" className="flex items-center gap-2 text-brand-orange font-bold text-lg">
            <LayoutDashboard className="w-5 h-5" />
            <span>Dashboard Professores</span>
          </Link>

          <div className="flex items-center gap-4">
            <Button
              onClick={handleLogout}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Sair
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
