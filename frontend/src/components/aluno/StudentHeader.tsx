/**
 * Header do Dashboard Aluno (sem chat).
 */

'use client'

import Link from 'next/link'
import Button from '@/components/ui/Button'
import { LogOut, LayoutDashboard, Menu } from 'lucide-react'

interface StudentHeaderProps {
  onMenuClick?: () => void
}

export default function StudentHeader({ onMenuClick }: StudentHeaderProps) {
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
          <div className="flex items-center gap-3">
            {/* Botão menu hambúrguer (mobile) */}
            <button
              type="button"
              onClick={onMenuClick}
              className="lg:hidden p-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Abrir menu"
            >
              <Menu className="w-6 h-6" />
            </button>
            <Link href="/dashboard-aluno" className="flex items-center gap-2 text-brand-orange font-bold text-lg">
              <LayoutDashboard className="w-5 h-5" />
              <span className="hidden sm:inline">Dashboard Aluno</span>
              <span className="sm:hidden">Dashboard</span>
            </Link>
          </div>

          <div className="flex items-center gap-4">
            <Button
              onClick={handleLogout}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
