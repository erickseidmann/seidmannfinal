/**
 * Layout Admin
 * 
 * Layout compartilhado para todas as páginas admin com sidebar e topbar
 */

'use client'

import { ReactNode } from 'react'
import AdminHeader from './AdminHeader'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  LayoutDashboard, 
  Users, 
  UserCog, 
  BookOpen, 
  Bell,
  GraduationCap
} from 'lucide-react'

interface AdminLayoutProps {
  children: ReactNode
}

const menuItems = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/professores', label: 'Professores', icon: GraduationCap },
  { href: '/admin/usuarios', label: 'Usuários', icon: Users },
  { href: '/admin/livros', label: 'Livros', icon: BookOpen },
  { href: '/admin/alertas', label: 'Alertas', icon: Bell },
]

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader />
      
      <div className="flex pt-16">
        {/* Sidebar */}
        <aside className="w-64 bg-white shadow-sm min-h-screen fixed left-0 top-16">
          <nav className="p-4 space-y-2">
            {menuItems.map((item) => {
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
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 ml-64 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
