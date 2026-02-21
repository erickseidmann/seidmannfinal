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
  Menu,
  X,
  Columns3,
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
  '/admin/financeiro/geral': 'financeiro-geral',
  '/admin/financeiro/alunos': 'financeiro-alunos',
  '/admin/financeiro/professores': 'financeiro-professores',
  '/admin/financeiro/administracao': 'financeiro-administracao',
  '/admin/financeiro/relatorios': 'financeiro-relatorios',
  '/admin/financeiro/cupons': 'financeiro-cupons',
  '/admin/financeiro/nfse': 'financeiro-nfse',
  '/admin/financeiro/notificacoes': 'financeiro-notificacoes',
  '/admin/financeiro/cobrancas': 'financeiro-cobrancas',
  '/admin/chat': 'chat',
  '/admin/kanban': 'kanban',
}

const FINANCEIRO_SUB_KEYS = ['financeiro-geral', 'financeiro-alunos', 'financeiro-professores', 'financeiro-administracao', 'financeiro-relatorios', 'financeiro-cupons', 'financeiro-nfse', 'financeiro-notificacoes', 'financeiro-cobrancas'] as const
function hasFinanceiroAccess(adminPages: string[], subKey: string): boolean {
  if (adminPages.includes('financeiro')) return true
  return adminPages.includes(subKey)
}
function hasAnyFinanceiroAccess(adminPages: string[]): boolean {
  if (adminPages.includes('financeiro')) return true
  return FINANCEIRO_SUB_KEYS.some((k) => adminPages.includes(k))
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
  { href: '/admin/kanban', labelKey: 'admin.kanban', icon: Columns3 },
  {
    type: 'group',
    labelKey: 'admin.financeiro',
    icon: Wallet,
    children: [
      { href: '/admin/financeiro/geral', labelKey: 'admin.financeiroGeral' },
      { href: '/admin/financeiro/alunos', labelKey: 'admin.financeiroAlunos' },
      { href: '/admin/financeiro/cobrancas', labelKey: 'admin.financeiroCobrancas' },
      { href: '/admin/financeiro/professores', labelKey: 'admin.financeiroProfessores' },
      { href: '/admin/financeiro/administracao', labelKey: 'admin.financeiroAdministracao' },
      { href: '/admin/financeiro/relatorios', labelKey: 'admin.financeiroRelatorios' },
      { href: '/admin/financeiro/cupons', labelKey: 'admin.financeiroCupons' },
      { href: '/admin/financeiro/nfse', labelKey: 'admin.financeiroNfse' },
      { href: '/admin/financeiro/notificacoes', labelKey: 'admin.financeiroNotificacoes' },
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
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
    if (FINANCEIRO_SUB_KEYS.includes(pageKey as (typeof FINANCEIRO_SUB_KEYS)[number])) {
      if (!hasFinanceiroAccess(adminPages, pageKey)) {
        router.replace('/admin/dashboard')
      }
      return
    }
    // Kanban: disponível para todos os usuários admin
    if (pageKey === 'kanban') {
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
      return hasAnyFinanceiroAccess(adminPages)
    }
    const menuItem = item as MenuItem
    if (menuItem.superAdminOnly) return isSuperAdmin
    if (isSuperAdmin) return true
    const pageKey = PAGE_KEY_BY_HREF[menuItem.href]
    if (pageKey === 'dashboard' && adminPages.length === 0) return true
    // Kanban: disponível para todos os usuários admin
    if (pageKey === 'kanban') return true
    return pageKey ? adminPages.includes(pageKey) : false
  })

  const isFinanceiroExpanded = pathname?.startsWith('/admin/financeiro')

  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader onMenuClick={() => setSidebarOpen((v) => !v)} />

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
        <aside
          className={`fixed left-0 top-16 z-40 h-[calc(100vh-4rem)] w-64 transform bg-white shadow-lg transition-transform duration-200 ease-out lg:translate-x-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex h-full flex-col overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 p-4 lg:hidden">
              <span className="font-semibold text-gray-800">Menu</span>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="rounded-lg p-2 text-gray-600 hover:bg-gray-100"
                aria-label="Fechar menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-4 space-y-2">
            {!meLoaded ? (
              <div className="px-4 py-3 text-sm text-gray-500 animate-pulse">
                Carregando menu...
              </div>
            ) : (
              menuItems.map((item) => {
                if ('type' in item && item.type === 'group') {
                  const group = item as MenuGroup
                  const Icon = group.icon
                  const firstAccessibleHref =
                    group.children.find((c) => {
                      const pk = PAGE_KEY_BY_HREF[c.href]
                      return pk && (isSuperAdmin || hasFinanceiroAccess(adminPages, pk))
                    })?.href ?? group.children[0].href
                  return (
                    <div key={group.labelKey} className="space-y-0.5">
                      <Link
                        href={firstAccessibleHref}
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
                            const pageKey = PAGE_KEY_BY_HREF[child.href]
                            const canAccess = isSuperAdmin || (pageKey && hasFinanceiroAccess(adminPages, pageKey))
                            if (!canAccess) return null
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
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-3 sm:p-4 md:p-6 lg:ml-64 overflow-x-hidden">
          <div className="mx-auto w-full max-w-[1600px] min-w-0">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
