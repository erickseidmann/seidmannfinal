/**
 * Dashboard Aluno – Início
 * Estilo alinhado ao painel do professor: header grande, cards de acesso
 * com ícones em círculos coloridos e três painéis coloridos lado a lado.
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  User,
  Wallet,
  Calendar,
  MessageCircle,
  Bell,
  Clock,
  Trash2,
  Loader2,
  Video,
  BookOpen,
  ClipboardList,
} from 'lucide-react'

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
  id: string
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

function formatTimeShort(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function DashboardAlunoInicioPage() {
  const [aluno, setAluno] = useState<Aluno | null>(null)
  const [dashboardInfo, setDashboardInfo] = useState<DashboardInfo | null>(null)
  const [deletingAlertId, setDeletingAlertId] = useState<string | null>(null)
  const [lessonRequests, setLessonRequests] = useState<LessonRequest[]>([])
  const [loadingRequests, setLoadingRequests] = useState(true)
  const [loadingDashboard, setLoadingDashboard] = useState(true)
  const [, setTick] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    fetch('/api/student/me', { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data?.aluno) setAluno(json.data.aluno)
      })
  }, [])

  useEffect(() => {
    setLoadingDashboard(true)
    fetch('/api/student/dashboard-info', { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data) setDashboardInfo(json.data)
      })
      .finally(() => setLoadingDashboard(false))
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

  const pendingRequests = lessonRequests.filter(
    (r) => r.status === 'PENDING' || r.status === 'TEACHER_REJECTED'
  )

  const quickLinks = [
    {
      href: '/dashboard-aluno/dados',
      title: 'Meus dados',
      description: 'Veja suas informações de matrícula e contato.',
      icon: User,
      iconWrap: 'bg-amber-400',
    },
    {
      href: '/dashboard-aluno/calendario',
      title: 'Calendário',
      description: 'Acompanhe suas aulas do mês.',
      icon: Calendar,
      iconWrap: 'bg-sky-500',
    },
    {
      href: '/dashboard-aluno/chat',
      title: 'Chat',
      description: 'Converse com a equipe e seus professores.',
      icon: MessageCircle,
      iconWrap: 'bg-violet-500',
    },
    {
      href: '/dashboard-aluno/financeiro',
      title: 'Financeiro',
      description: 'Mensalidade e status de pagamento.',
      icon: Wallet,
      iconWrap: 'bg-emerald-500',
    },
  ] as const

  const showJoinLessonButton = (() => {
    if (!nextLesson) return false
    const diffMs = new Date(nextLesson.startAt).getTime() - Date.now()
    return diffMs <= 15 * 60 * 1000
  })()

  return (
    <div className="max-w-7xl">
      <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight mb-3">
        Olá, {displayName}!
      </h1>
      <p className="text-gray-600 text-base sm:text-lg leading-relaxed mb-8 max-w-2xl">
        Bem-vindo ao seu painel. Use o menu para acessar seus dados, calendário de aulas, chat e
        informações financeiras.
      </p>

      {/* Cards de acesso rápido */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
        {quickLinks.map(({ href, title, description, icon: Icon, iconWrap }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col gap-4 p-6 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all text-left"
          >
            <div
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${iconWrap} text-white shadow-inner`}
              aria-hidden
            >
              <Icon className="h-7 w-7" strokeWidth={2} />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-lg leading-snug">{title}</p>
              <p className="text-sm text-gray-500 mt-2 leading-relaxed">{description}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Botão entrar na aula (somente se a próxima aula estiver próxima) */}
      {showJoinLessonButton && nextLesson && (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white">
              <Video className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="font-semibold text-emerald-900">Sua aula está prestes a começar</p>
              <p className="text-sm text-emerald-800/80 mt-0.5">
                Com {nextLesson.teacherName} · {formatShortDate(nextLesson.startAt)} ·{' '}
                {formatTimeShort(nextLesson.startAt)}
              </p>
            </div>
          </div>
          <Link
            href={`/dashboard-aluno/aula/${nextLesson.id}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <Video className="w-4 h-4" />
            Entrar na Aula
          </Link>
        </div>
      )}

      {/* Três painéis coloridos */}
      <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Aulas — faixa azul (próxima + última) */}
        <section
          className="rounded-2xl border border-sky-200/80 bg-sky-50/50 shadow-sm overflow-hidden border-l-4 border-l-sky-500"
          aria-labelledby="dash-aluno-aulas-title"
        >
          <div className="flex items-start gap-3 px-4 pt-4 pb-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500 text-white">
              <BookOpen className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h2 id="dash-aluno-aulas-title" className="font-bold text-gray-900">
                Suas aulas
              </h2>
              <p className="text-xs text-sky-900/70 mt-0.5">Próxima aula e última aula registrada.</p>
            </div>
          </div>
          <div className="px-4 pb-4 max-h-[min(420px,55vh)] overflow-y-auto space-y-3">
            {loadingDashboard ? (
              <p className="text-sm text-gray-500 py-6">Carregando...</p>
            ) : (
              <>
                {nextLesson ? (
                  <div className="rounded-xl bg-white/90 border border-sky-100 px-3 py-2.5 text-sm shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className="w-4 h-4 text-sky-600" aria-hidden />
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-700/90">
                        Próxima aula
                      </p>
                    </div>
                    <p className="text-gray-900 font-semibold">
                      {formatShortDate(nextLesson.startAt)}
                      <span className="font-normal text-gray-600">
                        {' '}
                        · {formatTimeShort(nextLesson.startAt)}
                      </span>
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      Professor(a): {nextLesson.teacherName} · {nextLesson.durationMinutes} min
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 py-2">Nenhuma aula futura agendada.</p>
                )}

                {lastLesson && (
                  <div
                    className={`rounded-xl border px-3 py-2.5 text-sm shadow-sm ${
                      lastLesson.status === 'CANCELLED'
                        ? 'bg-red-50 border-red-200'
                        : 'bg-white/90 border-sky-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <Clock
                          className={`w-4 h-4 ${
                            lastLesson.status === 'CANCELLED' ? 'text-red-600' : 'text-sky-600'
                          }`}
                          aria-hidden
                        />
                        <p
                          className={`text-[10px] font-semibold uppercase tracking-wide ${
                            lastLesson.status === 'CANCELLED'
                              ? 'text-red-700/90'
                              : 'text-sky-700/90'
                          }`}
                        >
                          Última aula
                        </p>
                      </div>
                      {lastLesson.status && (
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded shrink-0 font-medium ${
                            lastLesson.status === 'CONFIRMED'
                              ? 'bg-green-100 text-green-800'
                              : lastLesson.status === 'CANCELLED'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {getStatusLabel(lastLesson.status)}
                        </span>
                      )}
                    </div>
                    <p
                      className={`font-semibold ${
                        lastLesson.status === 'CANCELLED' ? 'text-red-900' : 'text-gray-900'
                      }`}
                    >
                      {formatShortDate(lastLesson.startAt)}
                      <span
                        className={`font-normal ${
                          lastLesson.status === 'CANCELLED' ? 'text-red-700' : 'text-gray-600'
                        }`}
                      >
                        {' '}
                        · {formatTimeShort(lastLesson.startAt)}
                      </span>
                    </p>
                    <p
                      className={`text-sm mt-1 ${
                        lastLesson.status === 'CANCELLED' ? 'text-red-700' : 'text-gray-600'
                      }`}
                    >
                      Professor(a): {lastLesson.teacherName}
                      {lastLesson.durationMinutes ? ` · ${lastLesson.durationMinutes} min` : ''}
                    </p>
                    {lastLesson.record?.book && (
                      <p
                        className={`text-xs mt-1.5 ${
                          lastLesson.status === 'CANCELLED' ? 'text-red-600' : 'text-sky-900/80'
                        }`}
                      >
                        <span
                          className={`font-medium ${
                            lastLesson.status === 'CANCELLED' ? 'text-red-700' : 'text-sky-800'
                          }`}
                        >
                          Livro:
                        </span>{' '}
                        {lastLesson.record.book}
                        {lastLesson.record.lastPage ? ` – p. ${lastLesson.record.lastPage}` : ''}
                      </p>
                    )}
                    {lastLesson.record?.notesForStudent && (
                      <p
                        className={`text-xs mt-2 italic ${
                          lastLesson.status === 'CANCELLED' ? 'text-red-700' : 'text-gray-600'
                        }`}
                      >
                        &quot;{lastLesson.record.notesForStudent}&quot;
                      </p>
                    )}
                  </div>
                )}

                {!nextLesson && !lastLesson && (
                  <p className="text-sm text-gray-600 py-2">Nada para mostrar por aqui ainda.</p>
                )}
              </>
            )}
            <Link
              href="/dashboard-aluno/calendario"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-700 hover:text-sky-900 mt-2"
            >
              <Calendar className="h-4 w-4" />
              Ver calendário
            </Link>
          </div>
        </section>

        {/* Notificações + Status de Solicitações — faixa vermelha */}
        <section
          className="rounded-2xl border border-red-200/80 bg-red-50/40 shadow-sm overflow-hidden border-l-4 border-l-red-500"
          aria-labelledby="dash-aluno-notif-title"
        >
          <div className="flex items-start gap-3 px-4 pt-4 pb-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white">
              <Bell className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h2 id="dash-aluno-notif-title" className="font-bold text-gray-900">
                Notificações
              </h2>
              <p className="text-xs text-red-900/70 mt-0.5">
                Avisos da gestão e status das suas solicitações.
              </p>
            </div>
          </div>
          <div className="px-4 pb-4 max-h-[min(420px,55vh)] overflow-y-auto space-y-2.5">
            {loadingDashboard && loadingRequests ? (
              <p className="text-sm text-gray-500 py-6">Carregando...</p>
            ) : (
              <>
                {pendingRequests.slice(0, 5).map((request) => {
                  const lessonDate = new Date(request.lesson.startAt)
                  return (
                    <div
                      key={request.id}
                      className="rounded-xl border bg-white border-red-200 shadow-sm px-3 py-2.5 text-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700/90">
                          {getRequestTypeLabel(request.type)}
                        </p>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded shrink-0 border ${getRequestStatusColor(
                            request.status
                          )}`}
                        >
                          {getRequestStatusLabel(request.status)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-700 mt-1.5">
                        Aula:{' '}
                        {lessonDate.toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}{' '}
                        às {formatTimeShort(request.lesson.startAt)}
                      </p>
                      <p className="text-xs text-gray-600">
                        Professor: {request.lesson.teacher.nome}
                      </p>
                      {request.requestedStartAt && (
                        <p className="text-xs text-gray-600 mt-0.5">
                          Solicitado para:{' '}
                          {new Date(request.requestedStartAt).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}{' '}
                          às {formatTimeShort(request.requestedStartAt)}
                        </p>
                      )}
                      {request.requestedTeacher && (
                        <p className="text-xs text-gray-600">
                          Professor solicitado: {request.requestedTeacher.nome}
                        </p>
                      )}
                      {request.adminNotes && (
                        <p className="text-xs text-gray-600 mt-2 italic border-t border-red-100 pt-2">
                          Observação da gestão: {request.adminNotes}
                        </p>
                      )}
                    </div>
                  )
                })}
                {pendingRequests.length > 5 && (
                  <p className="text-xs text-gray-500 text-center py-1">
                    Mostrando 5 de {pendingRequests.length} solicitações
                  </p>
                )}

                {alerts.slice(0, 5).map((a) => (
                  <div
                    key={a.id}
                    className={`rounded-xl border px-3 py-2.5 text-sm flex items-start justify-between gap-2 ${
                      a.readAt
                        ? 'bg-white/80 border-red-100 text-gray-700'
                        : 'bg-white border-red-200 shadow-sm'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700/90">
                        Aviso
                      </p>
                      <p className="text-gray-800 mt-1 whitespace-pre-wrap">{a.message}</p>
                      <p className="text-xs text-gray-500 mt-1.5">{formatDateHour(a.criadoEm)}</p>
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
                  </div>
                ))}

                {pendingRequests.length === 0 && alerts.length === 0 && (
                  <p className="text-sm text-gray-600 py-4">
                    Nenhuma notificação ou solicitação no momento.
                  </p>
                )}
              </>
            )}
          </div>
        </section>

        {/* Registros de aula — faixa amarela */}
        <section
          className="rounded-2xl border border-amber-200/80 bg-amber-50/50 shadow-sm overflow-hidden border-l-4 border-l-amber-400"
          aria-labelledby="dash-aluno-records-title"
        >
          <div className="flex items-start gap-3 px-4 pt-4 pb-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
              <ClipboardList className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h2 id="dash-aluno-records-title" className="font-bold text-gray-900">
                Registros de aula
              </h2>
              <p className="text-xs text-amber-900/75 mt-0.5">
                Livro, página e tarefas das últimas aulas.
              </p>
            </div>
          </div>
          <div className="px-4 pb-4 max-h-[min(420px,55vh)] overflow-y-auto space-y-3">
            {loadingDashboard ? (
              <p className="text-sm text-gray-500 py-6">Carregando...</p>
            ) : lessonRecords.length === 0 ? (
              <p className="text-sm text-gray-600 py-4">Nenhum registro disponível ainda.</p>
            ) : (
              <ul className="space-y-3">
                {lessonRecords.map((record, index) => (
                  <li
                    key={record.id}
                    className={`rounded-xl border px-3 py-2.5 text-sm shadow-sm ${
                      index === 0
                        ? 'bg-amber-100/60 border-amber-300'
                        : 'bg-white/90 border-amber-100'
                    }`}
                  >
                    {index === 0 && (
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 mb-1">
                        Último registro
                      </p>
                    )}
                    <p className="text-gray-900 font-semibold">
                      {formatShortDate(record.startAt)}
                      <span className="font-normal text-gray-600">
                        {' '}
                        · {formatTimeShort(record.startAt)}
                      </span>
                    </p>
                    <p className="text-sm text-gray-600 mt-0.5">
                      Professor(a): {record.teacherName}
                    </p>
                    <div className="space-y-1.5 mt-2">
                      {record.book && (
                        <div className="text-xs">
                          <span className="font-semibold text-amber-900">Livro:</span>{' '}
                          <span className="text-gray-800">
                            {record.book}
                            {record.lastPage ? ` – p. ${record.lastPage}` : ''}
                          </span>
                        </div>
                      )}
                      {record.assignedHomework && (
                        <div className="text-xs">
                          <span className="font-semibold text-amber-900">Homework:</span>{' '}
                          <span className="text-gray-800 whitespace-pre-wrap">
                            {record.assignedHomework}
                          </span>
                        </div>
                      )}
                      {record.notesForStudent && (
                        <div className="text-xs">
                          <span className="font-semibold text-amber-900">Observações:</span>{' '}
                          <span className="text-gray-800 italic whitespace-pre-wrap">
                            &quot;{record.notesForStudent}&quot;
                          </span>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
