/**
 * Layout Admin
 * 
 * Layout compartilhado para todas as páginas admin com sidebar e topbar
 */

'use client'

import { ReactNode, useState, useEffect } from 'react'
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

const PAGE_KEY_BY_HREF: Record<string, string> = {
  '/admin/dashboard': 'dashboard',
  '/admin/professores': 'professores',
  '/admin/alunos': 'alunos',
  '/admin/usuarios': 'usuarios',
  '/admin/livros': 'livros',
  '/admin/alertas': 'alertas',
  '/admin/calendario': 'calendario',
}

const baseMenuItems: MenuItem[] = [
  { href: '/admin/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { href: '/admin/professores', labelKey: 'admin.professors', icon: GraduationCap },
  { href: '/admin/alunos', labelKey: 'admin.students', icon: UserCircle },
  { href: '/admin/usuarios', labelKey: 'admin.users', icon: Users, superAdminOnly: true },
  { href: '/admin/livros', labelKey: 'admin.books', icon: BookOpen },
  { href: '/admin/alertas', labelKey: 'admin.alerts', icon: Bell },
  { href: '/admin/calendario', labelKey: 'admin.calendar', icon: CalendarDays },
]

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useTranslation()
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [adminPages, setAdminPages] = useState<string[]>([])
  const [meLoaded, setMeLoaded] = useState(false)

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

  const menuItems = baseMenuItems.filter((item) => {
    if (item.superAdminOnly) return isSuperAdmin
    if (isSuperAdmin) return true
    const pageKey = PAGE_KEY_BY_HREF[item.href]
    // Sem páginas configuradas: mostrar ao menos o dashboard
    if (pageKey === 'dashboard' && adminPages.length === 0) return true
    return pageKey ? adminPages.includes(pageKey) : false
  })

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
                const Icon = item.icon
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-brand-orange text-white font-semibold'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{t(item.labelKey)}</span>
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
