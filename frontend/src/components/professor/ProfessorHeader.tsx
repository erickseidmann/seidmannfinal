/**
 * Header do Dashboard Professores (estilo admin: sem Login/Matricule-se).
 * Inclui sininho do chat para mensagens não lidas.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import { LogOut, LayoutDashboard, MessageCircle } from 'lucide-react'

export default function ProfessorHeader() {
  const [unreadChatCount, setUnreadChatCount] = useState(0)

  const fetchUnreadCount = useCallback(() => {
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
    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, 15000)
    return () => clearInterval(interval)
  }, [fetchUnreadCount])

  useEffect(() => {
    const onChatUpdated = () => fetchUnreadCount()
    window.addEventListener('professor-chat-updated', onChatUpdated)
    return () => window.removeEventListener('professor-chat-updated', onChatUpdated)
  }, [fetchUnreadCount])

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch (error) {
      console.error('Erro ao fazer logout:', error)
    }
    window.location.href = '/login'
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link href="/dashboard-professores" className="flex items-center gap-2 text-brand-orange font-bold text-lg">
            <LayoutDashboard className="w-5 h-5" />
            <span>Dashboard Professores</span>
          </Link>

          <div className="flex items-center gap-4">
            <Link
              href="/dashboard-professores/chat"
              className="relative p-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              title={unreadChatCount > 0 ? `${unreadChatCount} mensagem(ns) não lida(s)` : 'Chat'}
            >
              <MessageCircle className="w-5 h-5" />
              {unreadChatCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
                  {unreadChatCount > 99 ? '99+' : unreadChatCount}
                </span>
              )}
            </Link>
            <Button
              onClick={handleLogout}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Sair
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
