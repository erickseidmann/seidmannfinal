/**
 * Admin: Acompanhar chamada das aulas (presença em tempo real na videochamada).
 */

'use client'

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/admin/AdminLayout'
import TableScrollArea from '@/components/admin/TableScrollArea'
import Button from '@/components/ui/Button'
import { Loader2, RefreshCw, ChevronDown, ChevronUp, AlertTriangle, FileDown } from 'lucide-react'
import { downloadLessonAttendancePdf } from '@/lib/lesson-attendance-pdf-export'
import { TEACHER_ABSENCE_GRACE_MINUTES } from '@/lib/lesson-attendance-summary'
import SeidmannLoading from '@/components/ui/SeidmannLoading'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'

interface AttendanceSession {
  id: string
  lessonId: string
  role: 'TEACHER' | 'STUDENT'
  participantName: string
  joinedAt: string
  leftAt: string | null
  status: 'ACTIVE' | 'ENDED'
  durationSeconds: number
}

interface RetentionNotice {
  deletionDateKey: string
  deletionDateLabel: string
  lessonDateKey: string
  lessonDateLabel: string
  sessionCount: number
  lessonCount: number
}

interface LessonSummary {
  lessonId: string
  lessonStartAt: string
  durationMinutes: number
  studentName: string
  teacherName: string
  teacherJoinedAt: string | null
  studentJoinedAt: string | null
  teacherTimeSeconds: number
  studentTimeSeconds: number
  scheduledSeconds: number
  teacherMetScheduledTime: boolean
  callStatus: 'ACTIVE' | 'ENDED'
  teacherAbsent: boolean
  teacherId: string | null
  teacherAbsenceReportId: string | null
  sessions: AttendanceSession[]
}

const ROLE_LABELS: Record<string, string> = {
  TEACHER: 'Professor',
  STUDENT: 'Aluno',
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Na chamada',
  ENDED: 'Encerrada',
}

type LessonStatusFilter = 'ALL' | 'ACTIVE' | 'ENDED' | 'TEACHER_ABSENT'

const LESSON_STATUS_FILTER_OPTIONS: { value: LessonStatusFilter; label: string }[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'ACTIVE', label: 'Na chamada' },
  { value: 'ENDED', label: 'Encerrada' },
  { value: 'TEACHER_ABSENT', label: 'Ausência do professor' },
]

/** Altura máxima da tabela: cabeçalho + até 8 linhas visíveis antes do scroll vertical. */
const TABLE_VISIBLE_ROWS = 8
const TABLE_ROW_HEIGHT_PX = 52
const TABLE_MAX_HEIGHT_PX = TABLE_ROW_HEIGHT_PX * (TABLE_VISIBLE_ROWS + 1)

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}min`
  if (m > 0) return `${m} min ${s.toString().padStart(2, '0')}s`
  return `${s}s`
}

function formatScheduledMinutes(minutes: number): string {
  return `${minutes} min`
}

function toDateInputValue(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function AdminAcompanharChamadasPage() {
  const router = useRouter()
  const [summaries, setSummaries] = useState<LessonSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [releasingLessonId, setReleasingLessonId] = useState<string | null>(null)
  const [retentionDays, setRetentionDays] = useState(60)
  const [retentionNotices, setRetentionNotices] = useState<RetentionNotice[]>([])
  const [downloadingDateKey, setDownloadingDateKey] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const today = useMemo(() => new Date(), [])

  const { confirm, ConfirmDialog } = useConfirmDialog()

  const [startDate, setStartDate] = useState(() => toDateInputValue(today))
  const [endDate, setEndDate] = useState(() => toDateInputValue(today))
  const [statusFilter, setStatusFilter] = useState<LessonStatusFilter>('ALL')
  const [nameFilter, setNameFilter] = useState('')

  const filteredSummaries = useMemo(() => {
    let rows = summaries
    if (statusFilter === 'TEACHER_ABSENT') {
      rows = rows.filter((s) => s.teacherAbsent)
    } else if (statusFilter === 'ACTIVE') {
      rows = rows.filter((s) => !s.teacherAbsent && s.callStatus === 'ACTIVE')
    } else if (statusFilter === 'ENDED') {
      rows = rows.filter((s) => !s.teacherAbsent && s.callStatus === 'ENDED')
    }

    const query = nameFilter.trim().toLowerCase()
    if (!query) return rows
    return rows.filter((s) => {
      const student = s.studentName?.toLowerCase() ?? ''
      const teacher = s.teacherName?.toLowerCase() ?? ''
      return student.includes(query) || teacher.includes(query)
    })
  }, [summaries, statusFilter, nameFilter])

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const start = new Date(`${startDate}T00:00:00`)
      const end = new Date(`${endDate}T23:59:59.999`)
      const params = new URLSearchParams({
        start: start.toISOString(),
        end: end.toISOString(),
      })
      const res = await fetch(`/api/admin/lesson-attendance?${params}`, { credentials: 'include' })
      if (res.status === 401 || res.status === 403) {
        router.push('/login?tab=admin')
        return
      }
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setError(json.message || 'Erro ao carregar registros')
        setSummaries([])
        return
      }
      setSummaries(Array.isArray(json.data?.summaries) ? json.data.summaries : [])
    } catch {
      setError('Erro ao carregar registros')
      setSummaries([])
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, router])

  const fetchRetentionNotices = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/lesson-attendance/retention', { credentials: 'include' })
      if (!res.ok) return
      const json = await res.json()
      if (!json.ok) return
      setRetentionDays(json.data?.retentionDays ?? 60)
      setRetentionNotices(Array.isArray(json.data?.upcoming) ? json.data.upcoming : [])
    } catch {
      // silencioso
    }
  }, [])

  const handleDownloadArchive = async (lessonDateKey: string) => {
    if (downloadingDateKey) return
    setDownloadingDateKey(lessonDateKey)
    try {
      const res = await fetch(
        `/api/admin/lesson-attendance/archive?lessonDate=${encodeURIComponent(lessonDateKey)}`,
        { credentials: 'include' }
      )
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setError(json.message || 'Erro ao gerar PDF')
        return
      }
      const summaries = Array.isArray(json.data?.summaries) ? json.data.summaries : []
      await downloadLessonAttendancePdf(summaries, lessonDateKey)
    } catch {
      setError('Erro ao gerar PDF')
    } finally {
      setDownloadingDateKey(null)
    }
  }

  useEffect(() => {
    fetchRecords()
    fetchRetentionNotices()
  }, [fetchRecords, fetchRetentionNotices])

  const handleReleaseRegistrationByLesson = useCallback(
    async (lessonId: string) => {
      const ok = await confirm({
        title: 'Liberar registro',
        message:
          'Isso libera o professor para registrar a aula normalmente (ausência incorreta na chamada). Continuar?',
        confirmLabel: 'Liberar',
        cancelLabel: 'Cancelar',
        variant: 'default',
      })
      if (!ok) return

      setReleasingLessonId(lessonId)
      setSuccessMessage(null)
      setError(null)
      try {
        const res = await fetch('/api/admin/lesson-record-unlock-requests/release', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lessonId }),
        })
        const json = await res.json()
        if (!res.ok || !json.ok) {
          setError(json.message || 'Erro ao liberar registro')
          return
        }

        setSuccessMessage('Registro liberado com sucesso.')
        await fetchRecords()
      } catch {
        setError('Erro de rede ao liberar registro')
      } finally {
        setReleasingLessonId(null)
      }
    },
    [confirm, fetchRecords]
  )

  return (
    <AdminLayout>
      <div className="max-w-[1400px] mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Acompanhar chamada das aulas</h1>
          <p className="text-sm text-gray-600 mt-1">
            Uma linha por aula: horário agendado, entrada do professor e do aluno, tempo na chamada e
            status. Ausência do professor é marcada após {TEACHER_ABSENCE_GRACE_MINUTES} min sem
            entrada na videochamada. Os registros ficam disponíveis por {retentionDays} dias.
            Arraste a tabela para os lados para ver todas as colunas.
          </p>
        </div>

        {retentionNotices.length > 0 && (
          <div className="mb-4 space-y-2">
            {retentionNotices.map((notice) => (
              <div
                key={`${notice.deletionDateKey}-${notice.lessonDateKey}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                <div className="flex items-start gap-2 min-w-0">
                  <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
                  <p>
                    No dia <strong>{notice.deletionDateLabel}</strong> serão excluídos{' '}
                    <strong>{notice.sessionCount}</strong> registro(s) de presença referentes ao dia{' '}
                    <strong>{notice.lessonDateLabel}</strong>
                    {notice.lessonCount > 0 ? ` (${notice.lessonCount} aula(s))` : ''}.
                    Se quiser guardar, baixe o PDF antes da exclusão.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="shrink-0 border-amber-300 bg-white hover:bg-amber-100/50"
                  disabled={downloadingDateKey === notice.lessonDateKey}
                  onClick={() => void handleDownloadArchive(notice.lessonDateKey)}
                >
                  {downloadingDateKey === notice.lessonDateKey ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <FileDown className="w-4 h-4 mr-2" />
                  )}
                  Baixar PDF
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3 mb-4 p-4 bg-white rounded-xl border border-gray-200">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">De</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Até</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as LessonStatusFilter)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[180px] bg-white"
            >
              {LESSON_STATUS_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Aluno ou professor</label>
            <input
              type="text"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              placeholder="Digite um nome..."
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[220px]"
            />
          </div>
          <Button variant="primary" onClick={() => fetchRecords()} disabled={loading}>
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Atualizar
          </Button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {successMessage}
          </div>
        )}

        <TableScrollArea
          className="rounded-xl border border-gray-200 bg-white"
          scrollClassName="overflow-x-auto overflow-y-auto"
          scrollStyle={{ maxHeight: TABLE_MAX_HEIGHT_PX }}
        >
          <table className="w-max min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 shadow-[0_1px_0_0_rgb(229,231,235)]">
              <tr>
                <th className="px-4 py-3">Aula</th>
                <th className="px-4 py-3">Aluno</th>
                <th className="px-4 py-3">Professor</th>
                <th className="px-4 py-3">Prof. entrou</th>
                <th className="px-4 py-3">Aluno entrou</th>
                <th className="px-4 py-3">Tempo agendado</th>
                <th className="px-4 py-3">Tempo prof.</th>
                <th className="px-4 py-3">Tempo aluno</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-500"><SeidmannLoading message="Carregando..." variant="compact" className="py-4" /></td>
                </tr>
              ) : filteredSummaries.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-500">
                    {summaries.length === 0
                      ? 'Nenhum registro de presença no período selecionado.'
                      : 'Nenhuma aula encontrada com os filtros selecionados.'}
                  </td>
                </tr>
              ) : (
                filteredSummaries.map((s) => {
                  const isExpanded = expandedId === s.lessonId
                  const hasOpenAbsenceAlert = s.teacherAbsent
                  const rowClass = s.teacherAbsent
                    ? 'bg-red-50 hover:bg-red-100/80'
                    : 'hover:bg-gray-50/80'

                  return (
                    <Fragment key={s.lessonId}>
                      <tr className={rowClass}>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {formatDateTime(s.lessonStartAt)}
                        </td>
                        <td className="px-4 py-3">{s.studentName}</td>
                        <td className="px-4 py-3">{s.teacherName}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {s.teacherJoinedAt ? formatDateTime(s.teacherJoinedAt) : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {s.studentJoinedAt ? formatDateTime(s.studentJoinedAt) : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                          {formatScheduledMinutes(s.durationMinutes)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                          <span
                            className={
                              !s.teacherAbsent && !s.teacherMetScheduledTime
                                ? 'text-amber-700'
                                : ''
                            }
                          >
                            {s.teacherTimeSeconds > 0
                              ? formatDuration(s.teacherTimeSeconds)
                              : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                          {s.studentTimeSeconds > 0
                            ? formatDuration(s.studentTimeSeconds)
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {s.teacherAbsent ? (
                            <div className="flex flex-col items-start gap-2">
                              <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-red-200 text-red-900">
                                Ausência do professor
                              </span>
                              {hasOpenAbsenceAlert ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={releasingLessonId != null}
                                  onClick={() => {
                                    void handleReleaseRegistrationByLesson(s.lessonId)
                                  }}
                                  className="border-red-200 text-red-700 hover:bg-red-50"
                                >
                                  {releasingLessonId === s.lessonId ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    'Liberar registro'
                                  )}
                                </Button>
                              ) : null}
                            </div>
                          ) : (
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                                s.callStatus === 'ACTIVE'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {STATUS_LABELS[s.callStatus] ?? s.callStatus}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedId(isExpanded ? null : s.lessonId)
                            }
                            className="inline-flex items-center gap-1 text-xs font-medium text-brand-orange hover:underline"
                          >
                            Ver detalhes
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className={rowClass}>
                          <td colSpan={10} className="px-4 pb-4 pt-0">
                            <div className="rounded-lg border border-gray-200 bg-white/80 overflow-hidden max-w-full">
                              {s.sessions.length === 0 ? (
                                <p className="px-3 py-3 text-xs text-gray-500">
                                  Nenhuma entrada registrada na videochamada.
                                </p>
                              ) : (
                                <table className="w-full min-w-0 text-xs">
                                  <thead className="bg-gray-50 text-gray-600">
                                    <tr>
                                      <th className="px-3 py-2 text-left">Quem entrou</th>
                                      <th className="px-3 py-2 text-left">Entrada</th>
                                      <th className="px-3 py-2 text-left">Saída</th>
                                      <th className="px-3 py-2 text-left">Tempo</th>
                                      <th className="px-3 py-2 text-left">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {s.sessions.map((sess) => (
                                      <tr key={sess.id}>
                                        <td className="px-3 py-2">
                                          <span className="text-gray-500">
                                            {ROLE_LABELS[sess.role]}
                                          </span>{' '}
                                          {sess.participantName}
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                          {formatDateTime(sess.joinedAt)}
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                          {sess.leftAt
                                            ? formatDateTime(sess.leftAt)
                                            : '—'}
                                        </td>
                                        <td className="px-3 py-2 tabular-nums">
                                          {formatDuration(sess.durationSeconds)}
                                        </td>
                                        <td className="px-3 py-2">
                                          {STATUS_LABELS[sess.status] ?? sess.status}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </TableScrollArea>

        {!loading && filteredSummaries.length > 0 && (
          <p className="text-xs text-gray-500 mt-3">
            {filteredSummaries.length} aula(s)
            {statusFilter !== 'ALL' ? ' com o filtro aplicado' : ' no período'}.
            {filteredSummaries.filter((s) => s.teacherAbsent).length > 0
              ? ` ${filteredSummaries.filter((s) => s.teacherAbsent).length} com ausência do professor.`
              : ''}
            {filteredSummaries.length > TABLE_VISIBLE_ROWS
              ? ` Role a tabela para ver mais (exibindo ${TABLE_VISIBLE_ROWS} por vez).`
              : ''}
          </p>
        )}

        <ConfirmDialog />

      </div>
    </AdminLayout>
  )
}
