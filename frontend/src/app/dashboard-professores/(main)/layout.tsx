/**
 * Layout das páginas principais do Dashboard Professores (com nav).
 * Alterar-senha fica fora deste layout.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import ProfessorHeader from '@/components/professor/ProfessorHeader'
import { useTranslation } from '@/contexts/LanguageContext'
import {
  LayoutDashboard,
  User,
  Calendar,
  Wallet,
  BookOpen,
  MessageCircle,
  LogOut,
} from 'lucide-react'

const NAV = [
  { href: '/dashboard-professores', labelKey: 'professor.nav.home', icon: LayoutDashboard, showUnreadDot: true },
  { href: '/dashboard-professores/dados-pessoais', labelKey: 'professor.nav.personalData', icon: User },
  { href: '/dashboard-professores/calendario', labelKey: 'professor.nav.calendar', icon: Calendar },
  { href: '/dashboard-professores/financeiro', labelKey: 'professor.nav.financial', icon: Wallet },
  { href: '/dashboard-professores/material', labelKey: 'professor.nav.material', icon: BookOpen },
  { href: '/dashboard-professores/chat', labelKey: 'professor.nav.chat', icon: MessageCircle, showChatDot: true },
] as const

export default function DashboardProfessoresMainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  const pathname = usePathname()
  const [professor, setProfessor] = useState<{ nome: string; nomePreferido: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [unreadAlertsCount, setUnreadAlertsCount] = useState(0)
  const [unreadChatCount, setUnreadChatCount] = useState(0)

  useEffect(() => {
    fetch('/api/professor/me', { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data?.professor) {
          const prof = json.data.professor
          if (prof.mustChangePassword) {
            window.location.replace('/dashboard-professores/alterar-senha')
            return
          }
          setProfessor(prof)
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const fetchUnreadCount = useCallback(() => {
    fetch('/api/professor/alerts/unread-count', { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data?.unreadCount != null) {
          setUnreadAlertsCount(json.data.unreadCount)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchUnreadCount()
  }, [pathname, fetchUnreadCount])

  useEffect(() => {
    const onAlertsUpdated = () => fetchUnreadCount()
    window.addEventListener('professor-alerts-updated', onAlertsUpdated)
    return () => window.removeEventListener('professor-alerts-updated', onAlertsUpdated)
  }, [fetchUnreadCount])

  const fetchChatUnreadCount = useCallback(() => {
    fetch('/api/professor/chat/unread-count', { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data?.unreadCount != null) {
          setUnreadChatCount(json.data.unreadCount)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchChatUnreadCount()
  }, [pathname, fetchChatUnreadCount])

  useEffect(() => {
    const onChatUpdated = () => fetchChatUnreadCount()
    window.addEventListener('professor-chat-updated', onChatUpdated)
    return () => window.removeEventListener('professor-chat-updated', onChatUpdated)
  }, [fetchChatUnreadCount])

  const handleLogout = () => {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).then(() => {
      window.location.href = '/login'
    })
  }

  const displayName = professor?.nomePreferido || professor?.nome || 'Professor'

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">{t('professor.home.loading')}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ProfessorHeader />
      <div className="flex flex-col md:flex-row pt-16">
        {/* Sidebar */}
        <aside className="w-full md:w-56 lg:w-64 bg-white border-b md:border-b-0 md:border-r border-gray-200 shrink-0 md:min-h-[calc(100vh-4rem)]">
        <div className="p-4 border-b border-gray-100">
          <h1 className="text-lg font-bold text-gray-900">{t('professor.dashboardTitle')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{displayName}</p>
        </div>
        <nav className="p-2 space-y-0.5">
          {NAV.map((item) => {
            const { href, labelKey, icon: Icon } = item
            const showUnreadDot = 'showUnreadDot' in item ? item.showUnreadDot : undefined
            const showChatDot = 'showChatDot' in item ? item.showChatDot : undefined
            const isActive = href === '/dashboard-professores' ? pathname === href : pathname.startsWith(href)
            const showDot = (showUnreadDot && unreadAlertsCount > 0) || (showChatDot && unreadChatCount > 0)
            const label = t(labelKey)
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
                {showDot && (
                  <span
                    className="ml-auto w-2 h-2 rounded-full bg-red-500 shrink-0"
                    title={showChatDot ? (unreadChatCount > 0 ? t('professor.chatUnreadTitle').replace('{n}', String(unreadChatCount)) : t('professor.chat')) : (unreadAlertsCount > 0 ? t('professor.home.notificationsUnreadTitle').replace('{n}', String(unreadAlertsCount)) : label)}
                    aria-label={t('professor.home.notificationsUnreadTitle').replace('{n}', String(unreadAlertsCount))}
                  />
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
            {t('nav.logout')}
          </button>
        </div>
      </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1 overflow-auto">
          <div className="p-4 md:p-6 lg:p-8 max-w-full">{children}</div>
        </main>
      </div>
    </div>
  )
}
