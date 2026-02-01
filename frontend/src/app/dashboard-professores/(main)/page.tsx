/**
 * Dashboard Professores – Início (com anúncios)
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Megaphone } from 'lucide-react'

interface Professor {
  nome: string
  nomePreferido: string | null
}

interface Announcement {
  id: string
  title: string
  message: string
  status: string
  sentAt: string | null
  criadoEm: string
}

export default function DashboardProfessoresInicioPage() {
  const [professor, setProfessor] = useState<Professor | null>(null)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true)

  useEffect(() => {
    fetch('/api/professor/me', { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data?.professor) setProfessor(json.data.professor)
      })
  }, [])

  useEffect(() => {
    fetch('/api/professor/announcements', { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data?.announcements) setAnnouncements(json.data.announcements)
      })
      .finally(() => setLoadingAnnouncements(false))
  }, [])

  const displayName = professor?.nomePreferido || professor?.nome || 'Professor'

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Olá, {displayName}!</h1>
      <p className="text-gray-600 mb-6">
        Bem-vindo ao seu painel. Use o menu ao lado para acessar seus dados pessoais, calendário de aulas e outras seções.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mb-8">
        <Link
          href="/dashboard-professores/dados-pessoais"
          className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow text-left"
        >
          <p className="font-semibold text-gray-900">Dados pessoais</p>
          <p className="text-sm text-gray-500 mt-1">Editar nome, nome preferido e WhatsApp</p>
        </Link>
        <Link
          href="/dashboard-professores/calendario"
          className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow text-left"
        >
          <p className="font-semibold text-gray-900">Calendário</p>
          <p className="text-sm text-gray-500 mt-1">Ver suas aulas por mês, semana ou dia</p>
        </Link>
      </div>

      {/* Anúncios (criados no admin – Alertas) */}
      <div className="max-w-2xl">
        <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-brand-orange" />
          Anúncios
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          Comunicados enviados pela administração. Novos anúncios criados no painel admin também são enviados por e-mail aos professores.
        </p>
        {loadingAnnouncements ? (
          <p className="text-sm text-gray-500">Carregando anúncios...</p>
        ) : announcements.length === 0 ? (
          <div className="p-4 bg-white rounded-xl border border-gray-200 text-sm text-gray-500">
            Nenhum anúncio no momento.
          </div>
        ) : (
          <ul className="space-y-3">
            {announcements.map((a) => (
              <li key={a.id} className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900">{a.title}</p>
                    <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{a.message}</p>
                    <p className="text-xs text-gray-400 mt-2">
                      {a.sentAt
                        ? `Enviado em ${new Date(a.sentAt).toLocaleString('pt-BR')}`
                        : `Criado em ${new Date(a.criadoEm).toLocaleString('pt-BR')}`}
                      {a.status === 'PENDING' && (
                        <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-xs">Pendente de envio</span>
                      )}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
