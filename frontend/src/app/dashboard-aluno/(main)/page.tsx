/**
 * Dashboard Aluno – Início
 * Exibe: saudação, notificações (alertas), última aula, próxima aula e cards de acesso.
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { User, Wallet, Calendar, MessageCircle, Bell, Clock, ChevronRight, Trash2, Loader2 } from 'lucide-react'

interface Aluno {
  nome: string
}

interface AlertItem {
  id: string
  message: string
  level: string | null
  readAt?: string | null
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
  status?: 'CONFIRMED' | 'CANCELLED' | 'REPOSICAO'
  record?: { book: string | null; lastPage: string | null; notesForStudent: string | null }
}

interface LessonRecord {
  id: string
  lessonId: string
  startAt: string
  teacherName: string
  assignedHomework: string | null
  lastPage: string | null
  notesForStudent: string | null
  book: string | null
  criadoEm: string
}

interface LessonRequest {
  id: string
  lessonId: string
  type: string
  status: string
  requestedStartAt: string | null
  requestedTeacherId: string | null
  notes: string | null
  adminNotes: string | null
  criadoEm: string
  lesson: {
    startAt: string
    teacher: { nome: string }
  }
  requestedTeacher: { nome: string } | null
}

interface DashboardInfo {
  alerts: AlertItem[]
  nextLesson: NextLesson | null
  lastLesson: LastLesson | null
  lessonRecords?: LessonRecord[]
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
  const [deletingAlertId, setDeletingAlertId] = useState<string | null>(null)
  const [lessonRequests, setLessonRequests] = useState<LessonRequest[]>([])
  const [loadingRequests, setLoadingRequests] = useState(true)

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

  useEffect(() => {
    setLoadingRequests(true)
    fetch('/api/student/lesson-requests', { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.requests) {
          setLessonRequests(json.requests)
        }
      })
      .catch(() => {
        setLessonRequests([])
      })
      .finally(() => setLoadingRequests(false))
  }, [])

  const handleExcluirNotificacao = (id: string) => {
    setDeletingAlertId(id)
    fetch(`/api/student/alerts/${id}`, { method: 'DELETE', credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && dashboardInfo) {
          setDashboardInfo({
            ...dashboardInfo,
            alerts: dashboardInfo.alerts.filter((a) => a.id !== id),
          })
        }
      })
      .finally(() => setDeletingAlertId(null))
  }

  const displayName = aluno?.nome || 'Aluno'
  const alerts = dashboardInfo?.alerts ?? []
  const nextLesson = dashboardInfo?.nextLesson ?? null
  const lastLesson = dashboardInfo?.lastLesson ?? null
  const lessonRecords = dashboardInfo?.lessonRecords ?? []

  const getStatusLabel = (status?: string) => {
    if (!status) return ''
    if (status === 'CONFIRMED') return 'Confirmada'
    if (status === 'CANCELLED') return 'Cancelada'
    if (status === 'REPOSICAO') return 'Reposição'
    return status
  }

  const getRequestStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      PENDING: 'Pendente',
      TEACHER_APPROVED: 'Aprovada pelo professor',
      TEACHER_REJECTED: 'Rejeitada pelo professor - aguardando gestão',
      COMPLETED: 'Concluída',
      ADMIN_REJECTED: 'Negada pela gestão',
    }
    return labels[status] || status
  }

  const getRequestStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      PENDING: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      TEACHER_APPROVED: 'bg-green-100 text-green-800 border-green-200',
      TEACHER_REJECTED: 'bg-purple-100 text-purple-800 border-purple-200',
      COMPLETED: 'bg-blue-100 text-blue-800 border-blue-200',
      ADMIN_REJECTED: 'bg-red-100 text-red-800 border-red-200',
    }
    return colors[status] || 'bg-gray-100 text-gray-800 border-gray-200'
  }

  const getRequestTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      CANCELAMENTO: 'Cancelamento',
      TROCA_AULA: 'Troca de aula',
      TROCA_PROFESSOR: 'Troca de professor',
    }
    return labels[type] || type
  }

  const pendingRequests = lessonRequests.filter((r) => 
    r.status === 'PENDING' || r.status === 'TEACHER_REJECTED'
  )

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Olá, {displayName}!</h1>
      <p className="text-gray-600 mb-6">
        Bem-vindo ao seu painel. Use o menu para acessar seus dados, calendário de aulas, chat e informações financeiras.
      </p>

      <div className="space-y-6 max-w-4xl">
        {/* Status de Solicitações */}
        {pendingRequests.length > 0 && (
          <section className="bg-white rounded-xl border border-purple-200 shadow-sm overflow-hidden">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 px-4 py-3 border-b border-gray-100">
              <Bell className="w-5 h-5 text-purple-600" />
              Status das Solicitações
            </h2>
            <div className="px-4 py-3 space-y-3">
              {pendingRequests.slice(0, 5).map((request) => {
                const lessonDate = new Date(request.lesson.startAt)
                return (
                  <div key={request.id} className="p-3 rounded-lg border border-purple-200 bg-purple-50">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          {getRequestTypeLabel(request.type)}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                          Aula: {lessonDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às {lessonDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <p className="text-xs text-gray-600">Professor: {request.lesson.teacher.nome}</p>
                        {request.requestedStartAt && (
                          <p className="text-xs text-gray-600 mt-1">
                            Solicitado para: {new Date(request.requestedStartAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às {new Date(request.requestedStartAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                        {request.requestedTeacher && (
                          <p className="text-xs text-gray-600 mt-1">
                            Professor solicitado: {request.requestedTeacher.nome}
                          </p>
                        )}
                      </div>
                      <span className={`text-xs px-2 py-1 rounded shrink-0 ${getRequestStatusColor(request.status)}`}>
                        {getRequestStatusLabel(request.status)}
                      </span>
                    </div>
                    {request.adminNotes && (
                      <p className="text-xs text-gray-600 mt-2 italic border-t border-purple-200 pt-2">
                        Observação da gestão: {request.adminNotes}
                      </p>
                    )}
                  </div>
                )
              })}
              {pendingRequests.length > 5 && (
                <p className="text-xs text-gray-500 text-center py-2 border-t border-purple-200 mt-2">
                  Mostrando apenas as 5 solicitações mais recentes de {pendingRequests.length} total
                </p>
              )}
            </div>
          </section>
        )}

        {alerts.length > 0 && (
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 px-4 py-3 border-b border-gray-100">
              <Bell className="w-5 h-5 text-brand-orange" />
              Notificações
            </h2>
            <ul className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
              {alerts.slice(0, 5).map((a) => (
                <li key={a.id} className="px-4 py-3 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800">{a.message}</p>
                    <p className="text-xs text-gray-500 mt-1">{formatDateHour(a.criadoEm)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleExcluirNotificacao(a.id)}
                    disabled={!!deletingAlertId}
                    className="shrink-0 p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Excluir"
                  >
                    {deletingAlertId === a.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {lastLesson && (
            <section className={`bg-white rounded-xl border shadow-sm p-4 ${
              lastLesson.status === 'CANCELLED' ? 'border-red-200 bg-red-50' : 'border-gray-200'
            }`}>
              <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 mb-3">
                <Clock className="w-4 h-4 text-brand-orange" />
                Última aula
              </h2>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1">
                  <p className={`text-sm ${lastLesson.status === 'CANCELLED' ? 'text-red-800' : 'text-gray-700'}`}>
                    <span className="font-medium">{formatShortDate(lastLesson.startAt)}</span>
                    <span className={`${lastLesson.status === 'CANCELLED' ? 'text-red-600' : 'text-gray-500'}`}> · {new Date(lastLesson.startAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </p>
                  <p className={`text-sm mt-1 ${lastLesson.status === 'CANCELLED' ? 'text-red-700' : 'text-gray-600'}`}>
                    Professor(a): {lastLesson.teacherName}
                    {lastLesson.durationMinutes && ` · ${lastLesson.durationMinutes} min`}
                  </p>
                </div>
                {lastLesson.status && (
                  <span className={`text-xs px-2 py-1 rounded shrink-0 ${
                    lastLesson.status === 'CONFIRMED' ? 'bg-green-100 text-green-800' :
                    lastLesson.status === 'CANCELLED' ? 'bg-red-100 text-red-800' :
                    'bg-amber-100 text-amber-800'
                  }`}>
                    {getStatusLabel(lastLesson.status)}
                  </span>
                )}
              </div>
              {lastLesson.record?.book && (
                <p className={`text-sm mt-1 ${lastLesson.status === 'CANCELLED' ? 'text-red-600' : 'text-gray-500'}`}>
                  Livro: {lastLesson.record.book}{lastLesson.record.lastPage ? ` – p. ${lastLesson.record.lastPage}` : ''}
                </p>
              )}
              {lastLesson.record?.notesForStudent && (
                <p className={`text-sm mt-2 italic ${lastLesson.status === 'CANCELLED' ? 'text-red-700' : 'text-gray-600'}`}>
                  &quot;{lastLesson.record.notesForStudent}&quot;
                </p>
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

        {/* Registros de Aula */}
        {lessonRecords.length > 0 && (
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 px-4 py-3 border-b border-gray-100">
              <Clock className="w-5 h-5 text-brand-orange" />
              Registros de Aula
            </h2>
            <div className="max-h-[500px] overflow-y-auto">
              {lessonRecords.map((record, index) => (
                <div
                  key={record.id}
                  className={`px-4 py-4 border-b border-gray-100 last:border-0 ${
                    index === 0 ? 'bg-orange-50' : ''
                  }`}
                >
                  {index === 0 && (
                    <div className="mb-2">
                      <span className="text-xs font-semibold text-brand-orange uppercase">Último Registro</span>
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {formatShortDate(record.startAt)} · {new Date(record.startAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">Professor(a): {record.teacherName}</p>
                    </div>
                  </div>
                  <div className="space-y-2 mt-3">
                    {record.book && (
                      <div>
                        <p className="text-xs font-semibold text-gray-700">Livro:</p>
                        <p className="text-sm text-gray-800">{record.book}{record.lastPage ? ` – p. ${record.lastPage}` : ''}</p>
                      </div>
                    )}
                    {record.assignedHomework && (
                      <div>
                        <p className="text-xs font-semibold text-gray-700">Homework:</p>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{record.assignedHomework}</p>
                      </div>
                    )}
                    {record.notesForStudent && (
                      <div>
                        <p className="text-xs font-semibold text-gray-700">Observações:</p>
                        <p className="text-sm text-gray-800 italic whitespace-pre-wrap">&quot;{record.notesForStudent}&quot;</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

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
