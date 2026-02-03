/**
 * Dashboard Aluno – Início
 * Exibe: saudação, notificações (alertas), última aula, próxima aula e cards de acesso.
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { User, Wallet, Calendar, MessageCircle, Bell, Clock, ChevronRight } from 'lucide-react'

interface Aluno {
  nome: string
}

interface AlertItem {
  id: string
  message: string
  level: string | null
  criadoEm: string
}

interface NextLesson {
  startAt: string
  teacherName: string
  durationMinutes: number
}

interface LastLesson {
  startAt: string
  teacherName: string
  durationMinutes: number
  status: string
  record?: { book: string | null; lastPage: string | null; notesForStudent: string | null }
}

interface DashboardInfo {
  alerts: AlertItem[]
  nextLesson: NextLesson | null
  lastLesson: LastLesson | null
}

function formatDateHour(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
}

export default function DashboardAlunoInicioPage() {
  const [aluno, setAluno] = useState<Aluno | null>(null)
  const [dashboardInfo, setDashboardInfo] = useState<DashboardInfo | null>(null)

  useEffect(() => {
    fetch('/api/student/me', { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data?.aluno) setAluno(json.data.aluno)
      })
  }, [])

  useEffect(() => {
    fetch('/api/student/dashboard-info', { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data) setDashboardInfo(json.data)
      })
  }, [])

  const displayName = aluno?.nome || 'Aluno'
  const alerts = dashboardInfo?.alerts ?? []
  const nextLesson = dashboardInfo?.nextLesson ?? null
  const lastLesson = dashboardInfo?.lastLesson ?? null

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Olá, {displayName}!</h1>
      <p className="text-gray-600 mb-6">
        Bem-vindo ao seu painel. Use o menu ao lado para acessar seus dados, calendário de aulas, chat e informações financeiras.
      </p>

      <div className="space-y-6 max-w-4xl">
        {alerts.length > 0 && (
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 px-4 py-3 border-b border-gray-100">
              <Bell className="w-5 h-5 text-brand-orange" />
              Notificações
            </h2>
            <ul className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
              {alerts.slice(0, 5).map((a) => (
                <li key={a.id} className="px-4 py-3">
                  <p className="text-sm text-gray-800">{a.message}</p>
                  <p className="text-xs text-gray-500 mt-1">{formatDateHour(a.criadoEm)}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {lastLesson && (
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 mb-3">
                <Clock className="w-4 h-4 text-brand-orange" />
                Última aula
              </h2>
              <p className="text-sm text-gray-700">
                <span className="font-medium">{formatShortDate(lastLesson.startAt)}</span>
                <span className="text-gray-500"> · {new Date(lastLesson.startAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
              </p>
              <p className="text-sm text-gray-600 mt-1">Professor(a): {lastLesson.teacherName}</p>
              {lastLesson.record?.book && (
                <p className="text-sm text-gray-500 mt-1">Livro: {lastLesson.record.book}{lastLesson.record.lastPage ? ` – p. ${lastLesson.record.lastPage}` : ''}</p>
              )}
              {lastLesson.record?.notesForStudent && (
                <p className="text-sm text-gray-600 mt-2 italic">&quot;{lastLesson.record.notesForStudent}&quot;</p>
              )}
            </section>
          )}
          {nextLesson && (
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 mb-3">
                <Calendar className="w-4 h-4 text-brand-orange" />
                Próxima aula
              </h2>
              <p className="text-sm text-gray-700">
                <span className="font-medium">{formatShortDate(nextLesson.startAt)}</span>
                <span className="text-gray-500"> · {new Date(nextLesson.startAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
              </p>
              <p className="text-sm text-gray-600 mt-1">Professor(a): {nextLesson.teacherName} · {nextLesson.durationMinutes} min</p>
            </section>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/dashboard-aluno/dados"
            className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow text-left flex items-start gap-3"
          >
            <User className="w-8 h-8 text-brand-orange shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900">Meus dados</p>
              <p className="text-sm text-gray-500 mt-1">Ver suas informações de matrícula e contato</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />
          </Link>
          <Link
            href="/dashboard-aluno/calendario"
            className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow text-left flex items-start gap-3"
          >
            <Calendar className="w-8 h-8 text-brand-orange shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900">Calendário</p>
              <p className="text-sm text-gray-500 mt-1">Ver suas aulas do mês</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />
          </Link>
          <Link
            href="/dashboard-aluno/chat"
            className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow text-left flex items-start gap-3"
          >
            <MessageCircle className="w-8 h-8 text-brand-orange shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900">Chat</p>
              <p className="text-sm text-gray-500 mt-1">Conversas com a equipe e professores</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />
          </Link>
          <Link
            href="/dashboard-aluno/financeiro"
            className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow text-left flex items-start gap-3"
          >
            <Wallet className="w-8 h-8 text-brand-orange shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900">Financeiro</p>
              <p className="text-sm text-gray-500 mt-1">Valor da mensalidade e status de pagamento</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />
          </Link>
        </div>
      </div>
    </div>
  )
}
