/**
 * Header específico para páginas admin
 * 
 * Remove links de login/matrícula e adiciona navegação admin
 */

'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import { LogOut, LayoutDashboard } from 'lucide-react'

export default function AdminHeader() {
  const router = useRouter()

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
        credentials: 'include',
      })
    } catch (error) {
      console.error('Erro ao fazer logout:', error)
    }
    router.push('/')
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo / Dashboard */}
          <Link href="/admin/dashboard" className="flex items-center gap-2 text-brand-orange font-bold text-lg">
            <LayoutDashboard className="w-5 h-5" />
            <span>Dashboard Admin</span>
          </Link>

          {/* Navegação removida - agora está no sidebar do AdminLayout */}

          {/* Botão Sair */}
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
    </header>
  )
}
