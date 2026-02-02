/**
 * Layout Admin
 * 
 * Layout compartilhado para todas as páginas admin com sidebar e topbar
 */

'use client'

import { ReactNode, useState, useEffect, useCallback } from 'react'
import AdminHeader from './AdminHeader'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslation } from '@/contexts/LanguageContext'
import {
  LayoutDashboard,
  Users,
  UserCircle,
  BookOpen,
  Bell,
  GraduationCap,
  CalendarDays,
  ClipboardList,
  Wallet,
  ChevronDown,
  ChevronRight,
  MessageCircle,
} from 'lucide-react'

interface AdminLayoutProps {
  children: ReactNode
}

interface MenuItem {
  href: string
  labelKey: string
  icon: typeof LayoutDashboard
  superAdminOnly?: boolean
}

interface MenuGroup {
  type: 'group'
  labelKey: string
  icon: typeof Wallet
  children: { href: string; labelKey: string }[]
}

const PAGE_KEY_BY_HREF: Record<string, string> = {
  '/admin/dashboard': 'dashboard',
  '/admin/professores': 'professores',
  '/admin/alunos': 'alunos',
  '/admin/usuarios': 'usuarios',
  '/admin/livros': 'livros',
  '/admin/alertas': 'alertas',
  '/admin/calendario': 'calendario',
  '/admin/registros-aulas': 'registros-aulas',
  '/admin/financeiro/geral': 'financeiro',
  '/admin/financeiro/alunos': 'financeiro',
  '/admin/financeiro/professores': 'financeiro',
  '/admin/financeiro/administracao': 'financeiro',
  '/admin/financeiro/relatorios': 'financeiro',
  '/admin/chat': 'chat',
}

const baseMenuItems: (MenuItem | MenuGroup)[] = [
  { href: '/admin/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { href: '/admin/professores', labelKey: 'admin.professors', icon: GraduationCap },
  { href: '/admin/alunos', labelKey: 'admin.students', icon: UserCircle },
  { href: '/admin/usuarios', labelKey: 'admin.users', icon: Users, superAdminOnly: true },
  { href: '/admin/livros', labelKey: 'admin.books', icon: BookOpen },
  { href: '/admin/alertas', labelKey: 'admin.alerts', icon: Bell },
  { href: '/admin/calendario', labelKey: 'admin.calendar', icon: CalendarDays },
  { href: '/admin/registros-aulas', labelKey: 'admin.lessonRecords', icon: ClipboardList },
  { href: '/admin/chat', labelKey: 'admin.chat', icon: MessageCircle },
  {
    type: 'group',
    labelKey: 'admin.financeiro',
    icon: Wallet,
    children: [
      { href: '/admin/financeiro/geral', labelKey: 'admin.financeiroGeral' },
      { href: '/admin/financeiro/alunos', labelKey: 'admin.financeiroAlunos' },
      { href: '/admin/financeiro/professores', labelKey: 'admin.financeiroProfessores' },
      { href: '/admin/financeiro/administracao', labelKey: 'admin.financeiroAdministracao' },
      { href: '/admin/financeiro/relatorios', labelKey: 'admin.financeiroRelatorios' },
    ],
  },
]

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useTranslation()
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [adminPages, setAdminPages] = useState<string[]>([])
  const [meLoaded, setMeLoaded] = useState(false)
  const [unreadChatCount, setUnreadChatCount] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      controller.abort()
    }, 5000) // 5s: se a API não responder, mostramos o menu mesmo assim

    fetch('/api/admin/me', { credentials: 'include', signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.ok && json?.data) {
          if (json.data.isSuperAdmin) setIsSuperAdmin(true)
          setAdminPages(Array.isArray(json.data.adminPages) ? json.data.adminPages : [])
        } else {
          setIsSuperAdmin(true)
        }
      })
      .catch(() => {
        setIsSuperAdmin(true)
      })
      .finally(() => {
        clearTimeout(timeoutId)
        setMeLoaded(true)
      })
  }, [])

  // Redirecionar se não tiver acesso à página atual (delegar acessos)
  useEffect(() => {
    if (!meLoaded) return
    const pageKey = PAGE_KEY_BY_HREF[pathname]
    if (!pageKey) return
    if (isSuperAdmin) return
    if (pageKey === 'usuarios') {
      router.replace('/admin/dashboard')
      return
    }
    if (!adminPages.includes(pageKey)) {
      router.replace('/admin/dashboard')
    }
  }, [meLoaded, pathname, isSuperAdmin, adminPages, router])

  const fetchChatUnreadCount = useCallback(() => {
    fetch('/api/admin/chat/unread-count', { credentials: 'include' })
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
    window.addEventListener('admin-chat-updated', onChatUpdated)
    return () => window.removeEventListener('admin-chat-updated', onChatUpdated)
  }, [fetchChatUnreadCount])

  const menuItems = baseMenuItems.filter((item) => {
    if ('type' in item && item.type === 'group') {
      if (isSuperAdmin) return true
      return adminPages.includes('financeiro')
    }
    const menuItem = item as MenuItem
    if (menuItem.superAdminOnly) return isSuperAdmin
    if (isSuperAdmin) return true
    const pageKey = PAGE_KEY_BY_HREF[menuItem.href]
    if (pageKey === 'dashboard' && adminPages.length === 0) return true
    return pageKey ? adminPages.includes(pageKey) : false
  })

  const isFinanceiroExpanded = pathname?.startsWith('/admin/financeiro')

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader />

      <div className="flex pt-16">
        <aside className="w-64 bg-white shadow-sm min-h-screen fixed left-0 top-16">
          <nav className="p-4 space-y-2">
            {!meLoaded ? (
              <div className="px-4 py-3 text-sm text-gray-500 animate-pulse">
                Carregando menu...
              </div>
            ) : (
              menuItems.map((item) => {
                if ('type' in item && item.type === 'group') {
                  const group = item as MenuGroup
                  const Icon = group.icon
                  return (
                    <div key={group.labelKey} className="space-y-0.5">
                      <Link
                        href={group.children[0].href}
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                          isFinanceiroExpanded
                            ? 'bg-brand-orange/10 text-brand-orange font-semibold'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <Icon className="w-5 h-5 shrink-0" />
                        <span>{t(group.labelKey)}</span>
                        {isFinanceiroExpanded ? (
                          <ChevronDown className="w-4 h-4 ml-auto" />
                        ) : (
                          <ChevronRight className="w-4 h-4 ml-auto" />
                        )}
                      </Link>
                      {isFinanceiroExpanded && (
                        <div className="pl-4 space-y-0.5 border-l-2 border-gray-200 ml-4">
                          {group.children.map((child) => {
                            const isActive = pathname === child.href
                            return (
                              <Link
                                key={child.href}
                                href={child.href}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                                  isActive
                                    ? 'bg-brand-orange text-white font-medium'
                                    : 'text-gray-600 hover:bg-gray-100'
                                }`}
                              >
                                <span>{t(child.labelKey)}</span>
                              </Link>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                }
                const menuItem = item as MenuItem
                const Icon = menuItem.icon
                const isActive = pathname === menuItem.href
                const isChat = menuItem.href === '/admin/chat'
                const showChatDot = isChat && unreadChatCount > 0
                return (
                  <Link
                    key={menuItem.href}
                    href={menuItem.href}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-brand-orange text-white font-semibold'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span>{t(menuItem.labelKey)}</span>
                    {showChatDot && (
                      <span
                        className="ml-auto w-2 h-2 rounded-full bg-red-500 shrink-0"
                        title={`${unreadChatCount} mensagem(ns) não lida(s)`}
                        aria-label={`${unreadChatCount} não lidas`}
                      />
                    )}
                  </Link>
                )
              })
            )}
          </nav>
        </aside>

        <main className="flex-1 ml-64 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
