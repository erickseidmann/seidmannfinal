/**
 * Layout das páginas principais do Dashboard Aluno (com nav).
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import StudentHeader from '@/components/aluno/StudentHeader'
import {
  LayoutDashboard,
  User,
  Wallet,
  Calendar,
  Video,
  MessageCircle,
  BookOpen,
  LogOut,
  X,
  Gamepad2,
} from 'lucide-react'

const NAV = [
  { href: '/dashboard-aluno', label: 'Início', icon: LayoutDashboard },
  { href: '/dashboard-aluno/dados', label: 'Meus dados', icon: User },
  { href: '/dashboard-aluno/calendario', label: 'Calendário', icon: Calendar },
  { href: '/dashboard-aluno/aula', label: 'Sala de Aula', icon: Video },
  { href: '/dashboard-aluno/material', label: 'Material', icon: BookOpen },
  { href: '/dashboard-aluno/jogos', label: 'Jogos', icon: Gamepad2 },
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
  const [activeClassroomId, setActiveClassroomId] = useState<string | null>(null)
  const [nextLessonStartAt, setNextLessonStartAt] = useState<number | null>(null)
  const [tick, setTick] = useState(() => Date.now())

  const checkActiveClassroom = useCallback(() => {
    fetch('/api/student/lessons?start=' + new Date(Date.now() - 15 * 60 * 1000).toISOString() + '&end=' + new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data?.lessons) {
          const now = Date.now()
          const lessons = json.data.lessons as { id: string; startAt: string; durationMinutes?: number; status: string }[]
          const active = lessons.find((l) => {
            const start = new Date(l.startAt).getTime()
            const end = start + (l.durationMinutes || 60) * 60 * 1000
            return l.status === 'CONFIRMED' && now >= start - 3 * 60 * 1000 && now <= end + 15 * 60 * 1000
          })
          if (active) {
            setActiveClassroomId(active.id)
            setNextLessonStartAt(null)
          } else {
            setActiveClassroomId(null)
            const future = lessons
              .filter((l) => l.status === 'CONFIRMED' && new Date(l.startAt).getTime() > now)
              .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
            const next = future[0]
            setNextLessonStartAt(next ? new Date(next.startAt).getTime() : null)
          }
        }
      })
      .catch(() => {
        setActiveClassroomId(null)
        setNextLessonStartAt(null)
      })
  }, [])

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
    checkActiveClassroom()
    const interval = setInterval(checkActiveClassroom, 60000)
    return () => clearInterval(interval)
  }, [checkActiveClassroom])

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  const sidebarMinutesUntilNext = nextLessonStartAt != null ? (nextLessonStartAt - tick) / (1000 * 60) : null

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
                const isAula = href === '/dashboard-aluno/aula'
                const linkHref = isAula && activeClassroomId ? `/dashboard-aluno/aula/${activeClassroomId}` : href
                const isActive = linkHref === '/dashboard-aluno' ? pathname === linkHref : pathname.startsWith(linkHref)
                if (isAula && !activeClassroomId) {
                  const showAvailableIn = sidebarMinutesUntilNext != null && sidebarMinutesUntilNext > 0
                  return (
                    <div
                      key={href}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 cursor-not-allowed opacity-50"
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      <span className="flex-1 min-w-0">
                        {label}
                        {showAvailableIn && (
                          <span className="block text-xs font-normal text-gray-500 mt-0.5">
                            Disponível em {Math.ceil(sidebarMinutesUntilNext)} min
                          </span>
                        )}
                      </span>
                      <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                    </div>
                  )
                }
                return (
                  <Link
                    key={href}
                    href={linkHref}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-brand-orange/10 text-brand-orange'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    {label}
                    {isAula && activeClassroomId && (
                      <span className="ml-auto w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    )}
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
