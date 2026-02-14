/**
 * Layout das páginas principais do Dashboard Aluno (com nav).
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import StudentHeader from '@/components/aluno/StudentHeader'
import {
  LayoutDashboard,
  User,
  Wallet,
  Calendar,
  MessageCircle,
  BookOpen,
  LogOut,
  X,
} from 'lucide-react'

const NAV = [
  { href: '/dashboard-aluno', label: 'Início', icon: LayoutDashboard },
  { href: '/dashboard-aluno/dados', label: 'Meus dados', icon: User },
  { href: '/dashboard-aluno/calendario', label: 'Calendário', icon: Calendar },
  { href: '/dashboard-aluno/material', label: 'Material', icon: BookOpen },
  { href: '/dashboard-aluno/chat', label: 'Chat', icon: MessageCircle },
  { href: '/dashboard-aluno/financeiro', label: 'Financeiro', icon: Wallet },
] as const

export default function DashboardAlunoMainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [aluno, setAluno] = useState<{ nome: string } | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    fetch('/api/student/me', { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data?.aluno) {
          if (json.data.mustChangePassword) {
            window.location.replace('/dashboard-aluno/alterar-senha')
            return
          }
          setAluno(json.data.aluno)
        }
      })
  }, [])

  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  const handleLogout = () => {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).then(() => {
      window.location.href = '/login'
    })
  }

  const displayName = aluno?.nome || 'Aluno'

  return (
    <div className="min-h-screen bg-gray-50">
      <StudentHeader onMenuClick={() => setSidebarOpen((v) => !v)} />

      {/* Overlay em mobile quando sidebar aberta */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
        />
      )}

      <div className="flex pt-16">
        {/* Sidebar */}
        <aside
          className={`fixed left-0 top-16 z-40 h-[calc(100vh-4rem)] w-64 transform bg-white shadow-lg transition-transform duration-200 ease-out lg:translate-x-0 lg:static lg:shadow-none ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex h-full flex-col overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 p-4 lg:hidden">
              <div>
                <h1 className="text-lg font-bold text-gray-900">Área do Aluno</h1>
                <p className="text-sm text-gray-500 mt-0.5">{displayName}</p>
              </div>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="rounded-lg p-2 text-gray-600 hover:bg-gray-100"
                aria-label="Fechar menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="hidden lg:block p-4 border-b border-gray-100">
              <h1 className="text-lg font-bold text-gray-900">Área do Aluno</h1>
              <p className="text-sm text-gray-500 mt-0.5">{displayName}</p>
            </div>
            <nav className="flex-1 p-2 space-y-0.5">
              {NAV.map(({ href, label, icon: Icon }) => {
                const isActive = href === '/dashboard-aluno' ? pathname === href : pathname.startsWith(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-brand-orange/10 text-brand-orange'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    {label}
                  </Link>
                )
              })}
            </nav>
            <div className="p-2 mt-auto border-t border-gray-100">
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                <LogOut className="w-5 h-5 shrink-0" />
                Sair
              </button>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1 overflow-auto lg:ml-0">
          <div className="p-4 md:p-6 lg:p-8 max-w-full">{children}</div>
        </main>
      </div>
    </div>
  )
}
