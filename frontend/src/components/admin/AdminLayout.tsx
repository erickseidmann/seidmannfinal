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
import SeidmannLoading from '@/components/ui/SeidmannLoading'
import {
  LayoutDashboard,
  Users,
  Wallet,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  MessageCircle,
  X,
  StickyNote,
  Briefcase,
  Library,
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

type MenuGroupId = 'gestao' | 'material' | 'financeiro'

interface MenuGroup {
  type: 'group'
  id: MenuGroupId
  labelKey: string
  icon: typeof Wallet
  expandedPrefixes: string[]
  children: { href: string; labelKey: string }[]
}

const PAGE_KEY_BY_HREF: Record<string, string> = {
  '/admin/dashboard': 'dashboard',
  '/admin/professores': 'professores',
  '/admin/professores/inativos': 'professores',
  '/admin/alunos': 'alunos',
  '/admin/alunos/bolsistas': 'alunos',
  '/admin/usuarios': 'usuarios',
  '/admin/livros': 'livros',
  '/admin/alertas': 'alertas',
  '/admin/calendario': 'calendario',
  '/admin/registros-aulas': 'registros-aulas',
  '/admin/acompanhar-chamadas': 'acompanhar-chamadas',
  '/admin/financeiro/geral': 'financeiro-geral',
  '/admin/financeiro/alunos': 'financeiro-alunos',
  '/admin/financeiro/recebimentos': 'financeiro-alunos',
  '/admin/financeiro/professores': 'financeiro-professores',
  '/admin/financeiro/pagamentos': 'financeiro-pagamentos',
  '/admin/financeiro/administracao': 'financeiro-administracao',
  '/admin/financeiro/movimentacao': 'financeiro-movimentacao',
  '/admin/financeiro/saidas': 'financeiro-saidas',
  '/admin/financeiro/relatorios': 'financeiro-relatorios',
  '/admin/financeiro/cupons': 'financeiro-cupons',
  '/admin/financeiro/nfse': 'financeiro-nfse',
  '/admin/financeiro/notificacoes': 'financeiro-notificacoes',
  '/admin/financeiro/cobrancas': 'financeiro-cobrancas',
  '/admin/chat': 'chat',
  '/admin/todos': 'todos',
  '/admin/bloco-de-notas': 'bloco-notas',
  '/admin/minhas-financas': 'minhas-financas',
  '/admin/karaoke': 'karaoke',
  '/admin/treinamentos': 'treinamentos',
  '/admin/certificados': 'certificados',
  '/admin/escolas-parceiras': 'escolas-parceiras',
}

const GESTAO_SUB_KEYS = ['professores', 'alunos', 'calendario', 'registros-aulas', 'acompanhar-chamadas', 'alertas', 'todos'] as const
const MATERIAL_SUB_KEYS = ['livros', 'karaoke', 'treinamentos', 'certificados'] as const
const FINANCEIRO_SUB_KEYS = [
  'financeiro-geral',
  'financeiro-alunos',
  'financeiro-professores',
  'financeiro-administracao',
  'financeiro-movimentacao',
  'financeiro-saidas',
  'financeiro-relatorios',
  'financeiro-cupons',
  'financeiro-nfse',
  'financeiro-notificacoes',
  'financeiro-cobrancas',
] as const

function hasGestaoAccess(adminPages: string[], subKey: string): boolean {
  if (subKey === 'todos') return true
  return adminPages.includes(subKey)
}
function hasAnyGestaoAccess(adminPages: string[]): boolean {
  return GESTAO_SUB_KEYS.some((k) => hasGestaoAccess(adminPages, k))
}

function hasMaterialAccess(adminPages: string[], subKey: string): boolean {
  if (subKey === 'karaoke' || subKey === 'treinamentos' || subKey === 'certificados') return true
  return adminPages.includes(subKey)
}
function hasAnyMaterialAccess(adminPages: string[]): boolean {
  return MATERIAL_SUB_KEYS.some((k) => hasMaterialAccess(adminPages, k))
}

function hasFinanceiroAccess(adminPages: string[], subKey: string): boolean {
  if (subKey === 'escolas-parceiras') {
    return (
      adminPages.includes('escolas-parceiras') || adminPages.includes('alunos')
    )
  }
  if (adminPages.includes('financeiro')) return true
  return adminPages.includes(subKey)
}
function hasAnyFinanceiroAccess(adminPages: string[]): boolean {
  if (adminPages.includes('financeiro')) return true
  if (adminPages.includes('escolas-parceiras') || adminPages.includes('alunos')) {
    return true
  }
  return FINANCEIRO_SUB_KEYS.some((k) => adminPages.includes(k))
}

function canAccessGroupChild(
  groupId: MenuGroupId,
  pageKey: string | undefined,
  adminPages: string[],
  isSuperAdmin: boolean
): boolean {
  if (!pageKey) return false
  if (isSuperAdmin) return true
  if (groupId === 'gestao') return hasGestaoAccess(adminPages, pageKey)
  if (groupId === 'material') return hasMaterialAccess(adminPages, pageKey)
  return hasFinanceiroAccess(adminPages, pageKey)
}

function hasAnyGroupAccess(groupId: MenuGroupId, adminPages: string[]): boolean {
  if (groupId === 'gestao') return hasAnyGestaoAccess(adminPages)
  if (groupId === 'material') return hasAnyMaterialAccess(adminPages)
  return hasAnyFinanceiroAccess(adminPages)
}

function isGroupExpanded(group: MenuGroup, pathname: string | null): boolean {
  if (!pathname) return false
  return group.expandedPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function isChildActive(href: string, pathname: string | null): boolean {
  if (!pathname) return false
  if (pathname === href) return true
  if (href === '/admin/alunos' && pathname.startsWith('/admin/alunos/')) return true
  if (href === '/admin/professores' && pathname.startsWith('/admin/professores/')) return true
  if (href === '/admin/karaoke' && pathname.startsWith('/admin/karaoke/')) return true
  if (href === '/admin/treinamentos' && pathname.startsWith('/admin/treinamentos/')) return true
  if (href === '/admin/certificados' && pathname.startsWith('/admin/certificados/')) return true
  return false
}

const baseMenuItems: (MenuItem | MenuGroup)[] = [
  { href: '/admin/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  {
    type: 'group',
    id: 'gestao',
    labelKey: 'admin.gestao',
    icon: Briefcase,
    expandedPrefixes: [
      '/admin/professores',
      '/admin/alunos',
      '/admin/calendario',
      '/admin/registros-aulas',
      '/admin/acompanhar-chamadas',
      '/admin/alertas',
      '/admin/todos',
    ],
    children: [
      { href: '/admin/professores', labelKey: 'admin.professors' },
      { href: '/admin/alunos', labelKey: 'admin.students' },
      { href: '/admin/calendario', labelKey: 'admin.calendar' },
      { href: '/admin/registros-aulas', labelKey: 'admin.lessonRecords' },
      { href: '/admin/acompanhar-chamadas', labelKey: 'admin.lessonAttendance' },
      { href: '/admin/alertas', labelKey: 'admin.alerts' },
      { href: '/admin/todos', labelKey: 'admin.todos' },
    ],
  },
  {
    type: 'group',
    id: 'material',
    labelKey: 'admin.material',
    icon: Library,
    expandedPrefixes: ['/admin/livros', '/admin/karaoke', '/admin/treinamentos', '/admin/certificados'],
    children: [
      { href: '/admin/livros', labelKey: 'admin.books' },
      { href: '/admin/karaoke', labelKey: 'admin.karaoke' },
      { href: '/admin/treinamentos', labelKey: 'admin.trainings' },
      { href: '/admin/certificados', labelKey: 'admin.certificates' },
    ],
  },
  {
    type: 'group',
    id: 'financeiro',
    labelKey: 'admin.financeiro',
    icon: Wallet,
    expandedPrefixes: ['/admin/financeiro', '/admin/escolas-parceiras'],
    children: [
      { href: '/admin/financeiro/geral', labelKey: 'admin.financeiroGeral' },
      { href: '/admin/financeiro/alunos', labelKey: 'admin.financeiroAlunos' },
      { href: '/admin/financeiro/professores', labelKey: 'admin.financeiroProfessores' },
      { href: '/admin/financeiro/pagamentos', labelKey: 'admin.financeiroPagamentos' },
      { href: '/admin/financeiro/administracao', labelKey: 'admin.financeiroAdministracao' },
      { href: '/admin/financeiro/movimentacao', labelKey: 'admin.financeiroMovimentacao' },
      { href: '/admin/financeiro/saidas', labelKey: 'admin.financeiroSaidas' },
      { href: '/admin/financeiro/relatorios', labelKey: 'admin.financeiroRelatorios' },
      { href: '/admin/financeiro/nfse', labelKey: 'admin.financeiroNfse' },
      { href: '/admin/financeiro/cupons', labelKey: 'admin.financeiroCupons' },
      { href: '/admin/escolas-parceiras', labelKey: 'admin.partnerSchools' },
    ],
  },
  { href: '/admin/chat', labelKey: 'admin.chat', icon: MessageCircle },
  { href: '/admin/bloco-de-notas', labelKey: 'admin.notesPad', icon: StickyNote },
  { href: '/admin/minhas-financas', labelKey: 'admin.myFinances', icon: Wallet },
  { href: '/admin/usuarios', labelKey: 'admin.users', icon: Users, superAdminOnly: true },
]

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useTranslation()
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [adminPages, setAdminPages] = useState<string[]>([])
  const [meLoaded, setMeLoaded] = useState(false)
  const [unreadChatCount, setUnreadChatCount] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  /** Toggle manual dos grupos (Gestão, Material, Financeiro); undefined = segue a rota atual */
  const [groupOpen, setGroupOpen] = useState<Partial<Record<MenuGroupId, boolean>>>({})

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setSidebarOpen(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      controller.abort()
    }, 5000)

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

  useEffect(() => {
    if (!meLoaded) return
    const pageKey =
      PAGE_KEY_BY_HREF[pathname ?? ''] ??
      (pathname?.startsWith('/admin/alunos/') ? 'alunos' : undefined) ??
      (pathname?.startsWith('/admin/professores/') ? 'professores' : undefined) ??
      (pathname?.startsWith('/admin/karaoke/') ? 'karaoke' : undefined) ??
      (pathname?.startsWith('/admin/treinamentos/') ? 'treinamentos' : undefined)
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
    if (
      pageKey === 'todos' ||
      pageKey === 'bloco-notas' ||
      pageKey === 'minhas-financas' ||
      pageKey === 'karaoke' ||
      pageKey === 'treinamentos'
    ) {
      return
    }
    if (
      pageKey === 'escolas-parceiras' &&
      (adminPages.includes('escolas-parceiras') || adminPages.includes('alunos'))
    ) {
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
      return hasAnyGroupAccess(item.id, adminPages)
    }
    const menuItem = item as MenuItem
    if (menuItem.superAdminOnly) return isSuperAdmin
    if (isSuperAdmin) return true
    const pageKey = PAGE_KEY_BY_HREF[menuItem.href]
    if (pageKey === 'dashboard' && adminPages.length === 0) return true
    if (pageKey === 'todos' || pageKey === 'bloco-notas' || pageKey === 'minhas-financas') return true
    return pageKey ? adminPages.includes(pageKey) : false
  })

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setSidebarOpen(false)
    }
  }, [pathname])

  // Ao entrar em uma rota do grupo, abre o submenu; ao sair, limpa fechado manual
  useEffect(() => {
    for (const item of baseMenuItems) {
      if (!('type' in item) || item.type !== 'group') continue
      const group = item as MenuGroup
      if (isGroupExpanded(group, pathname)) {
        setGroupOpen((prev) =>
          prev[group.id] === false ? prev : { ...prev, [group.id]: true }
        )
      } else {
        setGroupOpen((prev) => {
          if (prev[group.id] === false) {
            const next = { ...prev }
            delete next[group.id]
            return next
          }
          return prev
        })
      }
    }
  }, [pathname])

  const isGroupOpen = (group: MenuGroup): boolean => {
    if (groupOpen[group.id] === false) return false
    if (groupOpen[group.id] === true) return true
    return isGroupExpanded(group, pathname)
  }

  const toggleGroup = (group: MenuGroup) => {
    setGroupOpen((prev) => ({
      ...prev,
      [group.id]: !isGroupOpen(group),
    }))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader onMenuClick={() => setSidebarOpen((v) => !v)} />

      {sidebarOpen && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
        />
      )}

      {!sidebarOpen && (
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="fixed left-0 top-20 z-40 flex items-center justify-center w-10 h-10 md:w-12 md:h-12 bg-orange-500 rounded-r-lg shadow-lg text-white hover:bg-orange-600 transition-colors animate-pulse"
          title="Abrir menu"
          aria-label="Abrir menu"
        >
          <ChevronRight className="w-6 h-6" strokeWidth={2.5} />
        </button>
      )}

      <div className="flex pt-16">
        <aside
          className={`fixed left-0 top-16 z-40 h-[calc(100vh-4rem)] w-64 transform bg-white shadow-lg transition-transform duration-200 ease-out ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex h-full flex-col overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 p-4">
              <span className="font-semibold text-gray-800 lg:flex-1">Menu</span>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 shrink-0"
                aria-label="Fechar menu"
                title="Fechar menu"
              >
                <span className="lg:hidden"><X className="w-5 h-5" /></span>
                <span className="hidden lg:inline"><ChevronLeft className="w-5 h-5" /></span>
              </button>
            </div>
            <nav className="flex-1 p-4 space-y-2">
              {!meLoaded ? (
                <div className="px-4 py-3"><SeidmannLoading message="Carregando menu..." variant="compact" className="py-2" /></div>
              ) : (
                menuItems.map((item) => {
                  if ('type' in item && item.type === 'group') {
                    const group = item as MenuGroup
                    const Icon = group.icon
                    const open = isGroupOpen(group)
                    const onGroupRoute = isGroupExpanded(group, pathname)
                    return (
                      <div key={group.labelKey} className="space-y-0.5">
                        <button
                          type="button"
                          onClick={() => toggleGroup(group)}
                          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left ${
                            open || onGroupRoute
                              ? 'bg-brand-orange/10 text-brand-orange font-semibold'
                              : 'text-gray-700 hover:bg-gray-100'
                          }`}
                          aria-expanded={open}
                        >
                          <Icon className="w-5 h-5 shrink-0" />
                          <span>{t(group.labelKey)}</span>
                          {open ? (
                            <ChevronDown className="w-4 h-4 ml-auto" />
                          ) : (
                            <ChevronRight className="w-4 h-4 ml-auto" />
                          )}
                        </button>
                        {open && (
                          <div className="pl-4 space-y-0.5 border-l-2 border-gray-200 ml-4">
                            {group.children.map((child) => {
                              const pageKey = PAGE_KEY_BY_HREF[child.href]
                              const canAccess = canAccessGroupChild(
                                group.id,
                                pageKey,
                                adminPages,
                                isSuperAdmin
                              )
                              if (!canAccess) return null
                              const isActive = isChildActive(child.href, pathname)
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
                  const isActive =
                    pathname === menuItem.href ||
                    (menuItem.href === '/admin/alunos' && (pathname?.startsWith('/admin/alunos/') ?? false))
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

        <main
          className={`min-w-0 flex-1 p-3 sm:p-4 md:p-6 overflow-x-hidden transition-[margin] duration-200 ${sidebarOpen ? 'lg:ml-64' : ''}`}
        >
          <div className="mx-auto w-full max-w-[1600px] min-w-0">{children}</div>
        </main>
      </div>
    </div>
  )
}
