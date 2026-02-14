/**
 * Dashboard Professores – Início (notificações + anúncios)
 * Notificações: só pagamento enviado, novo anúncio e novo aluno (exibidas somente aqui).
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Megaphone, Bell, Loader2, DollarSign, UserPlus, Calendar, CalendarDays, Trash2, CheckCircle, XCircle, Clock } from 'lucide-react'
import Button from '@/components/ui/Button'
import Toast from '@/components/admin/Toast'
import { useTranslation } from '@/contexts/LanguageContext'

function getStartOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function getEndOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

function getStartOfWeek(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  date.setDate(date.getDate() - day)
  date.setHours(0, 0, 0, 0)
  return date
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

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

interface Notificacao {
  id: string
  message: string
  type: string | null
  readAt: string | null
  criadoEm: string
}

interface LessonItem {
  id: string
  startAt: string
  durationMinutes?: number | null
  status?: 'CONFIRMED' | 'CANCELLED' | 'REPOSICAO'
  enrollment: {
    nome: string
    tipoAula: string | null
    nomeGrupo: string | null
    groupMemberNames?: string[]
  }
}

interface LessonRequest {
  id: string
  lessonId: string
  type: string
  status: string
  requestedStartAt: string | null
  notes: string | null
  criadoEm: string
  lesson: {
    id: string
    startAt: string
    enrollment: {
      nome: string
    }
  }
}

export default function DashboardProfessoresInicioPage() {
  const { t } = useTranslation()
  const [professor, setProfessor] = useState<Professor | null>(null)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true)
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([])
  const [loadingNotif, setLoadingNotif] = useState(true)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [aulasHoje, setAulasHoje] = useState<LessonItem[]>([])
  const [aulasSemana, setAulasSemana] = useState<LessonItem[]>([])
  const [loadingAulasHoje, setLoadingAulasHoje] = useState(true)
  const [loadingAulasSemana, setLoadingAulasSemana] = useState(true)
  const [lessonRequests, setLessonRequests] = useState<LessonRequest[]>([])
  const [loadingRequests, setLoadingRequests] = useState(true)
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

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

  const fetchNotificacoes = useCallback(() => {
    setLoadingNotif(true)
    fetch('/api/professor/alerts', { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data?.alerts) setNotificacoes(json.data.alerts)
        else setNotificacoes([])
      })
      .catch(() => setNotificacoes([]))
      .finally(() => setLoadingNotif(false))
  }, [])

  useEffect(() => {
    fetchNotificacoes()
  }, [fetchNotificacoes])

  const fetchAulasHoje = useCallback(() => {
    setLoadingAulasHoje(true)
    const hoje = new Date()
    const start = getStartOfDay(hoje)
    const end = getEndOfDay(hoje)
    const params = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() })
    fetch(`/api/professor/lessons?${params}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data?.lessons) setAulasHoje(json.data.lessons as LessonItem[])
        else setAulasHoje([])
      })
      .catch(() => setAulasHoje([]))
      .finally(() => setLoadingAulasHoje(false))
  }, [])

  const fetchAulasSemana = useCallback(() => {
    setLoadingAulasSemana(true)
    const hoje = new Date()
    const start = getStartOfWeek(hoje)
    const end = addDays(start, 6)
    end.setHours(23, 59, 59, 999)
    const params = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() })
    fetch(`/api/professor/lessons?${params}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data?.lessons) setAulasSemana(json.data.lessons as LessonItem[])
        else setAulasSemana([])
      })
      .catch(() => setAulasSemana([]))
      .finally(() => setLoadingAulasSemana(false))
  }, [])

  useEffect(() => {
    fetchAulasHoje()
    fetchAulasSemana()
  }, [fetchAulasHoje, fetchAulasSemana])

  const fetchLessonRequests = useCallback(() => {
    setLoadingRequests(true)
    fetch('/api/lesson-requests/teacher-pending', { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        console.log('[Dashboard Professor] Resposta da API de solicitações:', json)
        if (json.ok && json.requests) {
          setLessonRequests(json.requests || [])
        } else {
          console.warn('[Dashboard Professor] API retornou erro ou sem requests:', json)
          setLessonRequests([])
        }
      })
      .catch((err) => {
        console.error('[Dashboard Professor] Erro ao buscar solicitações:', err)
        setLessonRequests([])
      })
      .finally(() => setLoadingRequests(false))
  }, [])

  useEffect(() => {
    fetchLessonRequests()
  }, [fetchLessonRequests])

  const handleApproveRequest = useCallback(async (requestId: string) => {
    setProcessingRequestId(requestId)
    try {
      const res = await fetch(`/api/lesson-requests/${requestId}/teacher-approval`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ approved: true }),
      })
      const json = await res.json()
      if (res.ok && json.ok) {
        fetchLessonRequests()
        fetchAulasHoje()
        fetchAulasSemana()
        // Disparar evento para atualizar calendários
        window.dispatchEvent(new CustomEvent('lessons-updated'))
        setToast({ message: 'Solicitação aprovada com sucesso! A aula original foi cancelada e uma nova aula foi criada.', type: 'success' })
      } else {
        setToast({ message: json.message || 'Erro ao aprovar solicitação', type: 'error' })
      }
    } catch (err) {
      console.error('Erro ao aprovar solicitação:', err)
      setToast({ message: 'Erro ao aprovar solicitação', type: 'error' })
    } finally {
      setProcessingRequestId(null)
    }
  }, [fetchLessonRequests, fetchAulasHoje, fetchAulasSemana])

  const handleRejectRequest = useCallback(async (requestId: string) => {
    setProcessingRequestId(requestId)
    try {
      const res = await fetch(`/api/lesson-requests/${requestId}/teacher-approval`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ approved: false }),
      })
      const json = await res.json()
      if (res.ok && json.ok) {
        fetchLessonRequests()
        setToast({ message: 'Solicitação rejeitada. A solicitação foi enviada para a gestão.', type: 'success' })
      } else {
        setToast({ message: json.message || 'Erro ao rejeitar solicitação', type: 'error' })
      }
    } catch (err) {
      console.error('Erro ao rejeitar solicitação:', err)
      setToast({ message: 'Erro ao rejeitar solicitação', type: 'error' })
    } finally {
      setProcessingRequestId(null)
    }
  }, [fetchLessonRequests])

  const handleMarcarLido = (id: string) => {
    setMarkingId(id)
    fetch(`/api/professor/alerts/${id}/read`, { method: 'PATCH', credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok) {
          setNotificacoes((prev) =>
            prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
          )
          window.dispatchEvent(new CustomEvent('professor-alerts-updated'))
        }
      })
      .finally(() => setMarkingId(null))
  }

  const handleExcluirNotificacao = (id: string) => {
    setDeletingId(id)
    fetch(`/api/professor/alerts/${id}`, { method: 'DELETE', credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok) {
          setNotificacoes((prev) => prev.filter((n) => n.id !== id))
          window.dispatchEvent(new CustomEvent('professor-alerts-updated'))
        }
      })
      .finally(() => setDeletingId(null))
  }

  const displayName = professor?.nomePreferido || professor?.nome || 'Professor'

  const formatLessonTime = (startAt: string, durationMinutes?: number | null) => {
    const d = new Date(startAt)
    const h = d.getHours()
    const m = d.getMinutes()
    const time = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
    const dur = durationMinutes ?? 60
    return `${time} (${dur} min)`
  }

  const lessonDisplayName = (l: LessonItem) => {
    const enr = l.enrollment
    if (enr?.tipoAula === 'GRUPO' && enr?.groupMemberNames?.length) {
      return enr.groupMemberNames.slice(0, 3).join(', ') + (enr.groupMemberNames.length > 3 ? '…' : '')
    }
    return enr?.nome ?? '—'
  }

  const getStatusLabel = (status?: string) => {
    if (!status) return ''
    if (status === 'CONFIRMED') return 'Confirmada'
    if (status === 'CANCELLED') return 'Cancelada'
    if (status === 'REPOSICAO') return 'Reposição'
    return status
  }

  const tipoLabel = (type: string | null) => {
    if (type === 'PAYMENT_DONE') return { label: t('professor.home.notifPayment'), icon: DollarSign }
    if (type === 'NEW_ANNOUNCEMENT') return { label: t('professor.home.notifAnnouncement'), icon: Megaphone }
    if (type === 'NEW_STUDENT') return { label: t('professor.home.notifNewStudent'), icon: UserPlus }
    return { label: t('professor.home.notifGeneric'), icon: Bell }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('professor.home.welcome').replace('{name}', displayName)}</h1>
      <p className="text-gray-600 mb-6">
        {t('professor.home.subtitle')}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mb-8">
        <Link
          href="/dashboard-professores/dados-pessoais"
          className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow text-left"
        >
          <p className="font-semibold text-gray-900">{t('professor.home.personalData')}</p>
          <p className="text-sm text-gray-500 mt-1">{t('professor.home.personalDataDesc')}</p>
        </Link>
        <Link
          href="/dashboard-professores/calendario"
          className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow text-left"
        >
          <p className="font-semibold text-gray-900">{t('professor.home.calendar')}</p>
          <p className="text-sm text-gray-500 mt-1">{t('professor.home.calendarDesc')}</p>
        </Link>
      </div>

      {/* Solicitações de troca pendentes */}
      <div className="mb-8">
        <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
          <Clock className="w-5 h-5 text-purple-600" />
          Solicitações de troca de aula pendentes
        </h2>
        {loadingRequests ? (
          <div className="p-4 bg-white rounded-xl border border-gray-200 text-sm text-gray-500">
            Carregando solicitações...
          </div>
        ) : lessonRequests.length > 0 ? (
          <div className="space-y-3">
            {lessonRequests.map((req) => {
              const lessonDate = new Date(req.lesson.startAt)
              const requestedDate = req.requestedStartAt ? new Date(req.requestedStartAt) : null
              return (
                <div
                  key={req.id}
                  className="p-4 bg-purple-50 border-2 border-purple-200 rounded-xl shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-purple-900 mb-1">
                        Solicitação de {req.type === 'TROCA_AULA' ? 'troca de aula' : req.type === 'TROCA_PROFESSOR' ? 'troca de professor' : 'cancelamento'}
                      </p>
                      <p className="text-sm text-gray-700">
                        <strong>Aluno:</strong> {req.lesson.enrollment.nome}
                      </p>
                      <p className="text-sm text-gray-700">
                        <strong>Aula atual:</strong> {lessonDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às {lessonDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {requestedDate && (
                        <p className="text-sm text-gray-700">
                          <strong>Nova data solicitada:</strong> {requestedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às {requestedDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                      {req.notes && (
                        <p className="text-sm text-gray-600 mt-1">
                          <strong>Observações:</strong> {req.notes}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-2">
                        {new Date(req.criadoEm).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant="primary"
                        onClick={() => handleApproveRequest(req.id)}
                        disabled={!!processingRequestId}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {processingRequestId === req.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Aceitar
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleRejectRequest(req.id)}
                        disabled={!!processingRequestId}
                        className="border-red-300 text-red-700 hover:bg-red-50"
                      >
                        {processingRequestId === req.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <XCircle className="w-4 h-4 mr-1" />
                            Enviar para gestão
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="p-4 bg-white rounded-xl border border-gray-200 text-sm text-gray-500">
            Nenhuma solicitação pendente no momento.
          </div>
        )}
      </div>

      {/* Notificações e Anúncios – lado a lado, acima das aulas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Bell className="w-5 h-5 text-brand-orange" />
            {t('professor.home.notifications')}
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            {t('professor.home.notificationsDesc')}
          </p>
        {loadingNotif ? (
          <p className="text-sm text-gray-500">{t('professor.home.loadingNotifications')}</p>
        ) : notificacoes.length === 0 ? (
          <div className="p-4 bg-white rounded-xl border border-gray-200 text-sm text-gray-500">
            {t('professor.home.noNotifications')}
          </div>
        ) : (
          <ul className="space-y-3">
            {notificacoes.map((n) => {
              const { label, icon: Icon } = tipoLabel(n.type)
              return (
                <li
                  key={n.id}
                  className={`p-4 rounded-xl border shadow-sm flex flex-wrap items-center gap-3 ${!n.readAt ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}
                >
                  <Icon className="w-5 h-5 text-brand-orange shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-gray-500 uppercase">{label}</p>
                    <p className="text-sm text-gray-800 mt-0.5">{n.message}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(n.criadoEm).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!n.readAt && (
                      <Button
                        variant="outline"
                        onClick={() => handleMarcarLido(n.id)}
                        disabled={!!markingId || !!deletingId}
                        className="text-xs py-1.5 px-2"
                      >
                        {markingId === n.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          t('professor.home.markRead')
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      onClick={() => handleExcluirNotificacao(n.id)}
                      disabled={!!markingId || !!deletingId}
                      className="text-xs py-1.5 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                      title={t('common.delete')}
                    >
                      {deletingId === n.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-brand-orange" />
            {t('professor.home.announcements')}
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            {t('professor.home.announcementsDesc')}
          </p>
        {loadingAnnouncements ? (
          <p className="text-sm text-gray-500">{t('professor.home.loadingAnnouncements')}</p>
        ) : announcements.length === 0 ? (
          <div className="p-4 bg-white rounded-xl border border-gray-200 text-sm text-gray-500">
            {t('professor.home.noAnnouncements')}
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
                        ? `${t('professor.home.sentAt')} ${new Date(a.sentAt).toLocaleString()}` 
                        : `${t('professor.home.createdAt')} ${new Date(a.criadoEm).toLocaleString()}`}
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

      {/* Aulas do dia e Aulas da semana */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-brand-orange" />
              {t('professor.home.lessonsToday')}
            </h2>
            <Link
              href="/dashboard-professores/calendario"
              className="text-sm font-medium text-brand-orange hover:underline"
            >
              {t('professor.home.viewCalendar')}
            </Link>
          </div>
          <div className="p-4 min-h-[120px]">
            {loadingAulasHoje ? (
              <p className="text-sm text-gray-500 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('professor.home.loading')}
              </p>
            ) : aulasHoje.length === 0 ? (
              <p className="text-sm text-gray-500">{t('professor.home.noLessonToday')}</p>
            ) : (
              <ul className="space-y-2">
                {aulasHoje.map((l) => (
                  <li 
                    key={l.id} 
                    className={`flex items-center justify-between gap-2 py-2 border-b border-gray-100 last:border-0 ${
                      l.status === 'CANCELLED' ? 'bg-red-50 text-red-800' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className={`text-sm font-medium truncate ${l.status === 'CANCELLED' ? 'text-red-800' : 'text-gray-900'}`} title={lessonDisplayName(l)}>
                        {lessonDisplayName(l)}
                      </span>
                      {l.status && (
                        <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                          l.status === 'CONFIRMED' ? 'bg-green-100 text-green-800' :
                          l.status === 'CANCELLED' ? 'bg-red-100 text-red-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {getStatusLabel(l.status)}
                        </span>
                      )}
                    </div>
                    <span className={`text-xs shrink-0 ${l.status === 'CANCELLED' ? 'text-red-600' : 'text-gray-500'}`}>
                      {formatLessonTime(l.startAt, l.durationMinutes)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-brand-orange" />
              {t('professor.home.lessonsWeek')}
            </h2>
            <Link
              href="/dashboard-professores/calendario"
              className="text-sm font-medium text-brand-orange hover:underline"
            >
              {t('professor.home.viewCalendar')}
            </Link>
          </div>
          <div className="p-4 min-h-[120px]">
            {loadingAulasSemana ? (
              <p className="text-sm text-gray-500 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('professor.home.loading')}
              </p>
            ) : aulasSemana.length === 0 ? (
              <p className="text-sm text-gray-500">{t('professor.home.noLessonWeek')}</p>
            ) : (
              <ul className="space-y-2">
                {aulasSemana.slice(0, 10).map((l) => (
                  <li 
                    key={l.id} 
                    className={`flex items-center justify-between gap-2 py-2 border-b border-gray-100 last:border-0 ${
                      l.status === 'CANCELLED' ? 'bg-red-50 text-red-800' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className={`text-sm font-medium truncate ${l.status === 'CANCELLED' ? 'text-red-800' : 'text-gray-900'}`} title={lessonDisplayName(l)}>
                        {lessonDisplayName(l)}
                      </span>
                      {l.status && (
                        <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                          l.status === 'CONFIRMED' ? 'bg-green-100 text-green-800' :
                          l.status === 'CANCELLED' ? 'bg-red-100 text-red-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {getStatusLabel(l.status)}
                        </span>
                      )}
                    </div>
                    <span className={`text-xs shrink-0 ${l.status === 'CANCELLED' ? 'text-red-600' : 'text-gray-500'}`}>
                      {new Date(l.startAt).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })} {new Date(l.startAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </li>
                ))}
                {aulasSemana.length > 10 && (
                  <p className="text-xs text-gray-500 pt-1">{t('professor.home.moreLessons').replace('{n}', String(aulasSemana.length - 10))}</p>
                )}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Toast de notificação */}
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  )
}
