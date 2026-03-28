/**
 * Dashboard Professores – Início (saudação + acesso rápido)
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  User,
  Calendar,
  ClipboardList,
  AlertTriangle,
  Clock,
  ClipboardCheck,
  BookOpen,
  Bell,
  Megaphone,
} from 'lucide-react'
import { useTranslation, useLanguage } from '@/contexts/LanguageContext'
import { formatTimeInTZ } from '@/lib/datetime'
import {
  resolveProfessorFinanceiroForToday,
  percentRegistrosFromFinanceiroData,
} from '@/lib/professor-fin-period'

function getStartOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
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

interface LessonItem {
  id: string
  startAt: string
  durationMinutes?: number | null
  status?: 'CONFIRMED' | 'CANCELLED' | 'REPOSICAO'
  record?: { id: string } | null
  enrollment: {
    nome: string
    tipoAula: string | null
    nomeGrupo: string | null
    groupMemberNames?: string[]
  }
}

type UpcomingRow = {
  id: string
  startAt: string
  durationMinutes: number | null
  studentLabel: string
  book: string | null
  lastPage: string | null
}

type AlertRow = {
  id: string
  message: string
  type: string
  readAt: string | null
  criadoEm: string
}

type AnnouncementRow = {
  id: string
  title: string
  message: string
  criadoEm: string
  sentAt: string | null
}

function notifTypeLabel(type: string, t: (key: string) => string): string {
  if (type === 'PAYMENT_DONE') return t('professor.home.notifPayment')
  if (type === 'NEW_ANNOUNCEMENT') return t('professor.home.notifAnnouncement')
  if (type === 'NEW_STUDENT') return t('professor.home.notifNewStudent')
  if (type === 'PROOF_RESEND_NEEDED') return t('professor.home.notifProofResend')
  return t('professor.home.notifGeneric')
}

export default function DashboardProfessoresInicioPage() {
  const { t } = useTranslation()
  const { locale } = useLanguage()
  const dateLocale = locale === 'pt-BR' ? 'pt-BR' : locale === 'es' ? 'es' : 'en-US'
  const [professor, setProfessor] = useState<Professor | null>(null)
  const [alertRegistros, setAlertRegistros] = useState<{ show: boolean; pendingCount: number } | null>(null)
  const [loadingAlertRegistros, setLoadingAlertRegistros] = useState(true)
  const [periodMetrics, setPeriodMetrics] = useState<{
    percentHorariosUsados: number | null
    semDisponibilidadeCadastrada: boolean
    percentRegistros: number | null
  } | null>(null)
  const [loadingMetrics, setLoadingMetrics] = useState(true)
  const [widgets, setWidgets] = useState<{
    upcomingLessons: UpcomingRow[]
    alerts: AlertRow[]
    announcements: AnnouncementRow[]
  } | null>(null)
  const [widgetsLoading, setWidgetsLoading] = useState(true)
  const [widgetsError, setWidgetsError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setWidgetsLoading(true)
    setWidgetsError(null)
    const empty = { upcomingLessons: [] as UpcomingRow[], alerts: [] as AlertRow[], announcements: [] as AnnouncementRow[] }
    fetch('/api/professor/dashboard-home', { credentials: 'include' })
      .then(async (res) => {
        let json: { ok?: boolean; data?: unknown; message?: string } | null = null
        try {
          json = (await res.json()) as { ok?: boolean; data?: unknown; message?: string }
        } catch {
          json = null
        }
        if (cancelled) return
        const data = json?.data
        const ok =
          res.ok &&
          json?.ok === true &&
          data &&
          typeof data === 'object' &&
          'upcomingLessons' in data &&
          'alerts' in data &&
          'announcements' in data
        if (!ok) {
          const msg =
            typeof json?.message === 'string' && json.message.trim()
              ? json.message.trim()
              : t('professor.home.widgetsLoadError')
          setWidgetsError(msg)
          setWidgets(empty)
          return
        }
        const d = data as {
          upcomingLessons: unknown
          alerts: unknown
          announcements: unknown
        }
        setWidgetsError(null)
        setWidgets({
          upcomingLessons: Array.isArray(d.upcomingLessons) ? d.upcomingLessons : [],
          alerts: Array.isArray(d.alerts) ? d.alerts : [],
          announcements: Array.isArray(d.announcements) ? d.announcements : [],
        })
      })
      .catch(() => {
        if (!cancelled) {
          setWidgetsError(t('professor.home.widgetsLoadError'))
          setWidgets(empty)
        }
      })
      .finally(() => {
        if (!cancelled) setWidgetsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [t])

  const markAlertRead = async (id: string) => {
    try {
      const res = await fetch(`/api/professor/alerts/${id}/read`, {
        method: 'PATCH',
        credentials: 'include',
      })
      const json = await res.json().catch(() => ({}))
      if (!json?.ok) return
      setWidgets((w) =>
        w
          ? {
              ...w,
              alerts: w.alerts.map((a) =>
                a.id === id ? { ...a, readAt: new Date().toISOString() } : a
              ),
            }
          : w
      )
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    fetch('/api/professor/me', { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data?.professor) setProfessor(json.data.professor)
      })
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoadingAlertRegistros(true)
    setLoadingMetrics(true)
    const now = new Date()

    ;(async () => {
      try {
        const [finJson, weekJson] = await Promise.all([
          resolveProfessorFinanceiroForToday(fetch).then(async (resolved) => {
            if (resolved) return resolved
            const y = now.getFullYear()
            const m = now.getMonth() + 1
            const r = await fetch(`/api/professor/financeiro?year=${y}&month=${m}`, { credentials: 'include' })
            return r.json()
          }),
          fetch('/api/professor/availability/week-summary', { credentials: 'include' }).then((res) => res.json()),
        ])
        if (cancelled) return

        // Mesma métrica do resumo em Controlar minha agenda (semana atual dom–sáb, BR)
        let percentHorariosUsados: number | null = null
        let semDisponibilidadeCadastrada = false
        if (weekJson?.ok && weekJson.data) {
          const total = weekJson.data.totalWeeklyAvailableMinutes ?? 0
          const used = weekJson.data.usedMinutesWeek ?? 0
          if (total <= 0) {
            semDisponibilidadeCadastrada = true
          } else {
            percentHorariosUsados = Math.min(100, Math.round((100 * used) / total))
          }
        }

        // Mesmo período e fórmula que Registrar aulas (GET financeiro: aulas com registro / esperadas no período)
        const percentRegistros =
          finJson?.ok && finJson.data
            ? percentRegistrosFromFinanceiroData(finJson.data as Record<string, unknown>)
            : null

        setPeriodMetrics({
          percentHorariosUsados,
          semDisponibilidadeCadastrada,
          percentRegistros,
        })

        if (!finJson?.ok || !finJson.data) {
          setAlertRegistros(null)
          return
        }
        const d = finJson.data as {
          dataInicio?: string
          dataTermino?: string
          statusPagamento?: string
        }
        if (!d.dataInicio || !d.dataTermino) {
          setAlertRegistros(null)
          return
        }
        if (d.statusPagamento === 'PAGO') {
          setAlertRegistros(null)
          return
        }
        const dataTermino = new Date(d.dataTermino + 'T23:59:59.999Z')
        const hoje = getStartOfDay(now)
        const limite = addDays(hoje, 7)
        const pagamentoChegando = dataTermino.getTime() <= limite.getTime()
        if (!pagamentoChegando) {
          setAlertRegistros(null)
          return
        }
        const start = d.dataInicio + 'T00:00:00.000Z'
        const end = d.dataTermino + 'T23:59:59.999Z'
        const lessonsRes = await fetch(
          `/api/professor/lessons?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
          { credentials: 'include' }
        )
        const lessonsJson = await lessonsRes.json()
        if (cancelled) return
        const lessons: LessonItem[] = lessonsJson?.ok && Array.isArray(lessonsJson?.data?.lessons) ? lessonsJson.data.lessons : []
        const pendingCount = lessons.filter((l) => !l.record?.id && l.status !== 'CANCELLED').length
        setAlertRegistros(pendingCount > 0 ? { show: true, pendingCount } : null)
      } catch {
        if (!cancelled) {
          setPeriodMetrics(null)
          setAlertRegistros(null)
        }
      } finally {
        if (!cancelled) {
          setLoadingAlertRegistros(false)
          setLoadingMetrics(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const displayName = professor?.nomePreferido || professor?.nome || 'Professor'

  const quickLinks = [
    {
      href: '/dashboard-professores/dados-pessoais',
      title: t('professor.home.personalData'),
      description: t('professor.home.personalDataDesc'),
      icon: User,
      iconWrap: 'bg-amber-400',
    },
    {
      href: '/dashboard-professores/calendario',
      title: t('professor.home.calendar'),
      description: t('professor.home.calendarDesc'),
      icon: Calendar,
      iconWrap: 'bg-sky-500',
    },
    {
      href: '/dashboard-professores/registrar-aulas',
      title: t('professor.home.records'),
      description: t('professor.home.recordsDesc'),
      icon: ClipboardList,
      iconWrap: 'bg-violet-500',
    },
  ] as const

  const fmtPct = (v: number | null) => (v === null ? '—' : `${v}%`)

  const formatShortDate = (iso: string) =>
    new Intl.DateTimeFormat(dateLocale, {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    }).format(new Date(iso))

  const bookPageLine = (l: UpcomingRow) => {
    const parts = [l.book?.trim(), l.lastPage?.trim()].filter(Boolean)
    if (parts.length === 0) return t('professor.home.noBookPageYet')
    return parts.join(' · ')
  }

  return (
    <div className="max-w-7xl">
      <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight mb-3">
        {t('professor.home.welcome').replace('{name}', displayName)}
      </h1>
      <p className="text-gray-600 text-base sm:text-lg leading-relaxed mb-8 max-w-2xl">
        {t('professor.home.subtitle')}
      </p>

      {!widgetsLoading && widgetsError ? (
        <div
          className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="alert"
        >
          {widgetsError}
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 md:gap-5">
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

        <Link
          href="/dashboard-professores/minha-agenda"
          className="group flex flex-col gap-4 p-6 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all text-left"
        >
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-inner"
            aria-hidden
          >
            <Clock className="h-7 w-7" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-gray-900 text-lg leading-snug">{t('professor.home.horariosUsadosTitle')}</p>
            {loadingMetrics ? (
              <div className="mt-3 h-10 w-20 rounded bg-gray-100 animate-pulse" />
            ) : periodMetrics?.semDisponibilidadeCadastrada ? (
              <p className="text-sm text-gray-500 mt-2 leading-relaxed">{t('professor.home.horariosUsadosNoSlots')}</p>
            ) : periodMetrics == null || periodMetrics.percentHorariosUsados === null ? (
              <p className="text-sm text-gray-500 mt-2 leading-relaxed">{t('professor.home.progressEmpty')}</p>
            ) : (
              <p className="text-3xl font-bold text-gray-900 tabular-nums mt-3">
                {fmtPct(periodMetrics.percentHorariosUsados)}
              </p>
            )}
          </div>
        </Link>

        <Link
          href="/dashboard-professores/registrar-aulas"
          className={
            !loadingAlertRegistros && alertRegistros?.show
              ? 'group flex flex-col gap-4 p-6 rounded-2xl bg-white border-2 border-red-300 text-left transition-none animate-registros-open-card'
              : 'group flex flex-col gap-4 p-6 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all text-left'
          }
        >
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-teal-500 text-white shadow-inner"
            aria-hidden
          >
            <ClipboardCheck className="h-7 w-7" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1 flex flex-col gap-3">
            <p className="font-bold text-gray-900 text-lg leading-snug">{t('professor.home.progressoRegistrosTitle')}</p>
            {loadingMetrics ? (
              <div className="mt-1 h-10 w-20 rounded bg-gray-100 animate-pulse" />
            ) : periodMetrics == null || periodMetrics.percentRegistros === null ? (
              <p className="text-sm text-gray-500 leading-relaxed">{t('professor.home.progressEmpty')}</p>
            ) : (
              <p className="text-3xl font-bold text-gray-900 tabular-nums">{fmtPct(periodMetrics.percentRegistros)}</p>
            )}
            {!loadingAlertRegistros && alertRegistros?.show && (
              <div
                className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-800 leading-snug group-hover:bg-red-100/90 transition-colors"
                role="status"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                <span>{t('professor.home.openRecordsAlert')}</span>
              </div>
            )}
          </div>
        </Link>
      </div>

      <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Próximas aulas — faixa azul */}
        <section
          className="rounded-2xl border border-sky-200/80 bg-sky-50/50 shadow-sm overflow-hidden border-l-4 border-l-sky-500"
          aria-labelledby="dash-upcoming-title"
        >
          <div className="flex items-start gap-3 px-4 pt-4 pb-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500 text-white">
              <BookOpen className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h2 id="dash-upcoming-title" className="font-bold text-gray-900">
                {t('professor.home.upcomingLessonsTitle')}
              </h2>
              <p className="text-xs text-sky-900/70 mt-0.5">{t('professor.home.upcomingLessonsSubtitle')}</p>
            </div>
          </div>
          <div className="px-4 pb-4 max-h-[min(420px,55vh)] overflow-y-auto">
            {widgetsLoading ? (
              <p className="text-sm text-gray-500 py-6">{t('professor.home.widgetsLoading')}</p>
            ) : !widgets?.upcomingLessons.length ? (
              <p className="text-sm text-gray-600 py-4">{t('professor.home.noUpcomingLessons')}</p>
            ) : (
              <ul className="space-y-3">
                {widgets.upcomingLessons.map((l) => (
                  <li
                    key={l.id}
                    className="rounded-xl bg-white/90 border border-sky-100 px-3 py-2.5 text-sm shadow-sm"
                  >
                    <p className="font-semibold text-gray-900">{l.studentLabel}</p>
                    <p className="text-gray-700 mt-1">
                      <span className="text-gray-500">{formatShortDate(l.startAt)}</span>
                      {' · '}
                      <span className="tabular-nums">{formatTimeInTZ(l.startAt, dateLocale)}</span>
                      {l.durationMinutes != null ? (
                        <span className="text-gray-500"> · {l.durationMinutes} min</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-sky-900/80 mt-1.5">
                      <span className="font-medium text-sky-800">{t('professor.home.bookPageLabel')}:</span>{' '}
                      {bookPageLine(l)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/dashboard-professores/calendario"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-700 hover:text-sky-900 mt-4"
            >
              <Calendar className="h-4 w-4" />
              {t('professor.home.viewCalendar')}
            </Link>
          </div>
        </section>

        {/* Notificações — faixa vermelha */}
        <section
          className="rounded-2xl border border-red-200/80 bg-red-50/40 shadow-sm overflow-hidden border-l-4 border-l-red-500"
          aria-labelledby="dash-notif-title"
        >
          <div className="flex items-start gap-3 px-4 pt-4 pb-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white">
              <Bell className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h2 id="dash-notif-title" className="font-bold text-gray-900">
                {t('professor.home.notifications')}
              </h2>
              <p className="text-xs text-red-900/70 mt-0.5">{t('professor.home.notificationsDesc')}</p>
            </div>
          </div>
          <div className="px-4 pb-4 max-h-[min(420px,55vh)] overflow-y-auto">
            {widgetsLoading ? (
              <p className="text-sm text-gray-500 py-6">{t('professor.home.widgetsLoading')}</p>
            ) : !widgets?.alerts.length ? (
              <p className="text-sm text-gray-600 py-4">{t('professor.home.noNotifications')}</p>
            ) : (
              <ul className="space-y-2.5">
                {widgets.alerts.map((a) => (
                  <li
                    key={a.id}
                    className={`rounded-xl border px-3 py-2.5 text-sm ${
                      a.readAt
                        ? 'bg-white/80 border-red-100 text-gray-700'
                        : 'bg-white border-red-200 shadow-sm'
                    }`}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700/90">
                      {notifTypeLabel(a.type, t)}
                    </p>
                    <p className="text-gray-800 mt-1 whitespace-pre-wrap">{a.message}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className="text-xs text-gray-500">
                        {new Intl.DateTimeFormat(dateLocale, {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        }).format(new Date(a.criadoEm))}
                      </span>
                      {!a.readAt && (
                        <button
                          type="button"
                          onClick={() => void markAlertRead(a.id)}
                          className="text-xs font-medium text-red-700 hover:underline"
                        >
                          {t('professor.home.markRead')}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Avisos (anúncios) — faixa amarela */}
        <section
          className="rounded-2xl border border-amber-200/80 bg-amber-50/50 shadow-sm overflow-hidden border-l-4 border-l-amber-400"
          aria-labelledby="dash-avisos-title"
        >
          <div className="flex items-start gap-3 px-4 pt-4 pb-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
              <Megaphone className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h2 id="dash-avisos-title" className="font-bold text-gray-900">
                {t('professor.home.announcements')}
              </h2>
              <p className="text-xs text-amber-900/75 mt-0.5">{t('professor.home.announcementsDesc')}</p>
            </div>
          </div>
          <div className="px-4 pb-4 max-h-[min(420px,55vh)] overflow-y-auto">
            {widgetsLoading ? (
              <p className="text-sm text-gray-500 py-6">{t('professor.home.widgetsLoading')}</p>
            ) : !widgets?.announcements.length ? (
              <p className="text-sm text-gray-600 py-4">{t('professor.home.noAnnouncements')}</p>
            ) : (
              <ul className="space-y-3">
                {widgets.announcements.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-xl bg-white/90 border border-amber-100 px-3 py-2.5 text-sm shadow-sm"
                  >
                    <p className="font-semibold text-gray-900">{a.title}</p>
                    <p className="text-gray-700 mt-1 line-clamp-4 whitespace-pre-wrap">{a.message}</p>
                    <p className="text-xs text-amber-900/60 mt-2">
                      {a.sentAt
                        ? `${t('professor.home.sentAt')}: ${new Intl.DateTimeFormat(dateLocale, {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          }).format(new Date(a.sentAt))}`
                        : `${t('professor.home.createdAt')}: ${new Intl.DateTimeFormat(dateLocale, {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          }).format(new Date(a.criadoEm))}`}
                    </p>
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
