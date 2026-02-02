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
  LogOut,
} from 'lucide-react'

const NAV = [
  { href: '/dashboard-aluno', label: 'Início', icon: LayoutDashboard },
  { href: '/dashboard-aluno/dados', label: 'Meus dados', icon: User },
  { href: '/dashboard-aluno/financeiro', label: 'Financeiro', icon: Wallet },
] as const

export default function DashboardAlunoMainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [aluno, setAluno] = useState<{ nome: string } | null>(null)

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

  const handleLogout = () => {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).then(() => {
      window.location.href = '/login'
    })
  }

  const displayName = aluno?.nome || 'Aluno'

  return (
    <div className="min-h-screen bg-gray-50">
      <StudentHeader />
      <div className="flex flex-col md:flex-row pt-16">
        {/* Sidebar */}
        <aside className="w-full md:w-56 lg:w-64 bg-white border-b md:border-b-0 md:border-r border-gray-200 shrink-0 md:min-h-[calc(100vh-4rem)]">
          <div className="p-4 border-b border-gray-100">
            <h1 className="text-lg font-bold text-gray-900">Área do Aluno</h1>
            <p className="text-sm text-gray-500 mt-0.5">{displayName}</p>
          </div>
          <nav className="p-2 space-y-0.5">
            {NAV.map(({ href, label, icon: Icon }) => {
              const isActive = href === '/dashboard-aluno' ? pathname === href : pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
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
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          <div className="p-4 md:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  )
}
