/**
 * Header específico para páginas admin
 * 
 * Remove links de login/matrícula e adiciona navegação admin
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import { LanguageSelector } from '@/components/layout/LanguageSelector'
import { useTranslation } from '@/contexts/LanguageContext'
import { LogOut, LayoutDashboard, Bell, Loader2, Menu } from 'lucide-react'

interface AdminNotif {
  id: string
  message: string
  readAt: string | null
  criadoEm: string
}

interface AdminHeaderProps {
  onMenuClick?: () => void
}

export default function AdminHeader({ onMenuClick }: AdminHeaderProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState<AdminNotif[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loadingNotif, setLoadingNotif] = useState(false)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const notifRef = useRef<HTMLDivElement>(null)

  const fetchUnreadCount = () => {
    fetch('/api/admin/notifications/unread-count', { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data?.unreadCount != null) setUnreadCount(json.data.unreadCount)
      })
      .catch(() => {})
  }

  useEffect(() => {
    fetchUnreadCount()
  }, [])

  useEffect(() => {
    if (!notifOpen) return
    setLoadingNotif(true)
    fetch('/api/admin/notifications', { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data?.notifications) {
          setNotifications(json.data.notifications)
          if (json.data.unreadCount != null) setUnreadCount(json.data.unreadCount)
        } else setNotifications([])
      })
      .catch(() => setNotifications([]))
      .finally(() => setLoadingNotif(false))
  }, [notifOpen])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    if (notifOpen) document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [notifOpen])

  const handleMarkRead = (id: string) => {
    setMarkingId(id)
    fetch(`/api/admin/notifications/${id}/read`, { method: 'PATCH', credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok) {
          setNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
          )
          setUnreadCount((c) => Math.max(0, c - 1))
        }
      })
      .finally(() => setMarkingId(null))
  }

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
      <div className="container mx-auto px-3 sm:px-4">
        <div className="flex items-center justify-between h-14 sm:h-16 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {onMenuClick && (
              <button
                type="button"
                onClick={onMenuClick}
                className="lg:hidden shrink-0 p-2 rounded-lg text-gray-600 hover:bg-gray-100"
                aria-label="Abrir menu"
              >
                <Menu className="w-6 h-6" />
              </button>
            )}
            <Link href="/admin/dashboard" className="flex items-center gap-2 text-brand-orange font-bold text-base sm:text-lg truncate">
              <LayoutDashboard className="w-5 h-5 shrink-0" />
              <span>{t('admin.dashboard')}</span>
            </Link>
          </div>

          <div className="flex items-center gap-4">
            {/* Sininho de notificações */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                className="relative p-2 rounded-lg text-gray-600 hover:bg-gray-100 focus:ring-2 focus:ring-brand-orange/30"
                aria-label="Notificações"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-full mt-1 w-80 max-h-[320px] overflow-y-auto bg-white rounded-lg border border-gray-200 shadow-lg py-1 z-50">
                  <div className="px-3 py-2 border-b border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-800">Notificações</h3>
                  </div>
                  {loadingNotif ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                  ) : notifications.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-gray-500">Nenhuma notificação.</p>
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {notifications.map((n) => (
                        <li
                          key={n.id}
                          className={`px-3 py-2.5 text-sm ${!n.readAt ? 'bg-amber-50/50' : ''}`}
                        >
                          <p className="text-gray-800">{n.message}</p>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <span className="text-xs text-gray-500">
                              {new Date(n.criadoEm).toLocaleDateString('pt-BR', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                            {!n.readAt && (
                              <button
                                type="button"
                                onClick={() => handleMarkRead(n.id)}
                                disabled={!!markingId}
                                className="text-xs text-brand-orange hover:underline disabled:opacity-50"
                              >
                                {markingId === n.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin inline" />
                                ) : (
                                  'Marcar como lido'
                                )}
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <LanguageSelector />
            <Button
              onClick={handleLogout}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              {t('nav.logout')}
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
