/**
 * Dashboard Admin
 *
 * Página principal do painel administrativo com métricas e gráficos.
 * Cubos clicáveis abrem modal com lista de nomes (e dados extras quando aplicável).
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/admin/AdminLayout'
import StatCard from '@/components/admin/StatCard'
import Modal from '@/components/admin/Modal'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Users, UserCheck, UserX, UserCog, GraduationCap, CalendarX, AlertTriangle, UserPlus, History } from 'lucide-react'

/** Segunda-feira 00:00 da semana que contém d */
function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

/** Formata data e hora para exibição (ex.: 03/02 14:00) */
function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const day = d.getDate().toString().padStart(2, '0')
  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  const h = d.getHours().toString().padStart(2, '0')
  const min = d.getMinutes().toString().padStart(2, '0')
  return `${day}/${month} ${h}:${min}`
}

/** Estatísticas da semana (seg–sáb) para o cubo Alunos sem aula designada (freq. incorreta) */
interface CalendarStats {
  wrongFrequencyCount: number
  wrongFrequencyList: {
    enrollmentId: string
    studentName: string
    expected: number
    actual: number
    expectedMinutes?: number
    actualMinutes?: number
    lessonTimesThisWeek?: string[]
    lastBook?: string | null
  }[]
}

interface Metrics {
  users: {
    ACTIVE: number
    PENDING: number
    INACTIVE: number
    total: number
  }
  teachers: {
    ACTIVE: number
    INACTIVE: number
    total: number
  }
  studentsWithoutLesson: number
  novosMatriculadosCount: number
  teachersWithProblems: number
  absences: {
    studentsWeek: number
    studentsMonth: number
    teachersWeek: number
    teachersMonth: number
  }
}

type ListType =
  | 'activeStudents'
  | 'novosMatriculados'
  | 'studentsWithoutLesson'
  | 'inactiveStudents'
  | 'totalUsers'
  | 'activeTeachers'
  | 'inactiveTeachers'
  | 'teachersWithProblems'
  | 'absencesStudentsWeek'
  | 'absencesStudentsMonth'

interface ListItemBase {
  id: string
  nome: string
}
interface ListItemWithData extends ListItemBase {
  data?: string
}
interface ListItemWithoutLesson extends ListItemBase {
  ultimaAulaData: string | null
  ultimoLivro: string | null
  ultimaPagina: string | null
}
interface ListItemNovosMatriculados extends ListItemBase {
  dataMatricula?: string
  linkPagamentoEnviadoAt?: string | null
}
interface ListItemTotalUser extends ListItemBase {
  role?: string
}

const LIST_TITLES: Record<ListType, string> = {
  activeStudents: 'Alunos Ativos',
  novosMatriculados: 'Novos alunos matriculados',
  studentsWithoutLesson: 'Alunos sem aula designada',
  inactiveStudents: 'Alunos Inativos',
  totalUsers: 'Total de Usuários',
  activeTeachers: 'Professores Ativos',
  inactiveTeachers: 'Professores Inativos',
  teachersWithProblems: 'Professores com problemas',
  absencesStudentsWeek: 'Faltas Alunos (7 dias)',
  absencesStudentsMonth: 'Faltas Alunos (30 dias)',
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalType, setModalType] = useState<ListType | null>(null)
  const [listData, setListData] = useState<
    (ListItemWithData | ListItemWithoutLesson | ListItemTotalUser | ListItemNovosMatriculados)[]
  >([])
  const [listLoading, setListLoading] = useState(false)
  const [calendarStats, setCalendarStats] = useState<CalendarStats | null>(null)
  const [calendarStatsLoading, setCalendarStatsLoading] = useState(true)
  const [showAlunosSemAulaModal, setShowAlunosSemAulaModal] = useState(false)
  const [marcandoAulasId, setMarcandoAulasId] = useState<string | null>(null)
  const [marcandoLinkPagId, setMarcandoLinkPagId] = useState<string | null>(null)
  const [showAuditModal, setShowAuditModal] = useState(false)
  const [auditActivities, setAuditActivities] = useState<Array<{ id: string; actorName: string; action: string; detail: string; createdAt: string }>>([])
  const [auditHours, setAuditHours] = useState(48)
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditCount48h, setAuditCount48h] = useState<number | null>(null)

  useEffect(() => {
    fetchMetrics()
  }, [])

  const fetchAuditCount = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/audit-activity?hours=48&countOnly=true', { credentials: 'include' })
      const json = await res.json()
      if (json.ok && typeof json.data?.count === 'number') {
        setAuditCount48h(json.data.count)
      }
    } catch {
      // ignora
    }
  }, [])

  useEffect(() => {
    fetchAuditCount()
  }, [fetchAuditCount])

  const fetchCalendarStats = useCallback(async () => {
    setCalendarStatsLoading(true)
    try {
      const monday = getMonday(new Date())
      const res = await fetch(
        `/api/admin/lessons/stats?weekStart=${monday.toISOString()}`,
        { credentials: 'include' }
      )
      if (!res.ok) return
      const json = await res.json()
      if (json.ok && json.data) {
        setCalendarStats({
          wrongFrequencyCount: json.data.wrongFrequencyCount ?? 0,
          wrongFrequencyList: json.data.wrongFrequencyList ?? [],
        })
      }
    } catch (e) {
      console.error(e)
    } finally {
      setCalendarStatsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCalendarStats()
  }, [fetchCalendarStats])

  const openListModal = useCallback(
    async (type: ListType) => {
      setModalType(type)
      setListData([])
      setListLoading(true)
      try {
        const res = await fetch(`/api/admin/dashboard-lists?type=${type}`, {
          credentials: 'include',
        })
        const json = await res.json()
        if (json.ok && Array.isArray(json.data)) {
          setListData(json.data)
        } else {
          setListData([])
        }
      } catch {
        setListData([])
      } finally {
        setListLoading(false)
      }
    },
    []
  )

  const closeModal = useCallback(() => setModalType(null), [])

  const openAuditModal = useCallback(async () => {
    setShowAuditModal(true)
    setAuditLoading(true)
    try {
      const res = await fetch(`/api/admin/audit-activity?hours=${auditHours}`, { credentials: 'include' })
      const json = await res.json()
      if (json.ok && Array.isArray(json.data?.activities)) {
        setAuditActivities(json.data.activities)
      } else {
        setAuditActivities([])
      }
    } catch {
      setAuditActivities([])
    } finally {
      setAuditLoading(false)
    }
  }, [auditHours])

  const refetchAuditWithHours = useCallback((hours: number) => {
    setAuditHours(hours)
    setAuditLoading(true)
    fetch(`/api/admin/audit-activity?hours=${hours}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && Array.isArray(json.data?.activities)) {
          setAuditActivities(json.data.activities)
        } else {
          setAuditActivities([])
        }
      })
      .catch(() => setAuditActivities([]))
      .finally(() => setAuditLoading(false))
  }, [])

  const marcarAulasAdicionadas = useCallback(
    async (enrollmentId: string) => {
      setMarcandoAulasId(enrollmentId)
      try {
        const res = await fetch(`/api/admin/enrollments/${enrollmentId}/marcar-aulas-adicionadas`, {
          method: 'PATCH',
          credentials: 'include',
        })
        const json = await res.json()
        if (json.ok) {
          setListData((prev) => prev.filter((item) => item.id !== enrollmentId))
          fetchMetrics()
        }
      } catch (e) {
        console.error(e)
      } finally {
        setMarcandoAulasId(null)
      }
    },
    []
  )

  const marcarLinkPagEnviado = useCallback(
    async (enrollmentId: string) => {
      setMarcandoLinkPagId(enrollmentId)
      try {
        const res = await fetch(`/api/admin/enrollments/${enrollmentId}/marcar-link-pagamento-enviado`, {
          method: 'PATCH',
          credentials: 'include',
        })
        const json = await res.json()
        if (json.ok) {
          setListData((prev) =>
            prev.map((item) =>
              item.id === enrollmentId
                ? { ...item, linkPagamentoEnviadoAt: new Date().toISOString() }
                : item
            )
          )
        }
      } catch (e) {
        console.error(e)
      } finally {
        setMarcandoLinkPagId(null)
      }
    },
    []
  )

  const fetchMetrics = async () => {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000) // 8s timeout

      const response = await fetch('/api/admin/metrics', {
        credentials: 'include',
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          router.push('/login?tab=admin')
          return
        }
        const text = await response.text()
        let msg = 'Erro ao carregar métricas'
        try {
          const json = JSON.parse(text)
          if (json?.message) msg = json.message
        } catch {
          if (text?.startsWith('Internal')) msg = 'Servidor indisponível. Tente recarregar.'
        }
        throw new Error(msg)
      }

      const text = await response.text()
      let json: { ok?: boolean; data?: Metrics; message?: string }
      try {
        json = JSON.parse(text)
      } catch {
        setError('Resposta inválida do servidor. Tente recarregar.')
        setLoading(false)
        return
      }
      if (json.ok && json.data) {
        setMetrics(json.data)
      } else {
        throw new Error(json.message || 'Erro ao carregar métricas')
      }
    } catch (err) {
      console.error('Erro ao buscar métricas:', err)
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          setError('A requisição demorou demais. Verifique a conexão e tente recarregar.')
        } else {
          setError(err.message)
        }
      } else {
        setError('Erro ao carregar dados')
      }
    } finally {
      setLoading(false)
    }
  }


  // Preparar dados para o gráfico (Sem aula = freq. incorreta na semana)
  const chartData = metrics
    ? [
        { name: 'Ativos', Alunos: metrics.users.ACTIVE, Professores: metrics.teachers.ACTIVE },
        {
          name: 'Sem aula',
          Alunos: calendarStats?.wrongFrequencyCount ?? 0,
          Professores: 0,
        },
        { name: 'Inativos', Alunos: metrics.users.INACTIVE, Professores: metrics.teachers.INACTIVE },
      ]
    : []

  if (loading) {
    return (
      <AdminLayout>
        <div className="text-center py-12 text-gray-600">Carregando...</div>
      </AdminLayout>
    )
  }

  if (error) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            type="button"
            onClick={() => {
              setError(null)
              setLoading(true)
              fetchMetrics()
            }}
            className="px-4 py-2 bg-brand-orange text-white rounded-lg font-medium hover:opacity-90"
          >
            Tentar novamente
          </button>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50/50">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-10 rounded-full bg-gradient-to-b from-brand-orange to-amber-500" aria-hidden />
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
              Dashboard Admin
            </h1>
          </div>
          <p className="text-sm text-slate-500 ml-4">
            Visão geral do sistema e métricas de usuários
          </p>
        </div>

        {/* Cubos de métricas (estilo financeiro, um único grid alinhado) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8 items-stretch">
          <div
            role="button"
            tabIndex={0}
            onClick={() => openListModal('activeStudents')}
            onKeyDown={(e) => e.key === 'Enter' && openListModal('activeStudents')}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.99] min-h-0"
          >
            <StatCard
              variant="finance"
              title="Alunos Ativos"
              value={metrics?.users.ACTIVE || 0}
              icon={<UserCheck className="w-5 h-5" />}
              color="green"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => openListModal('novosMatriculados')}
            onKeyDown={(e) => e.key === 'Enter' && openListModal('novosMatriculados')}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.99] min-h-0"
          >
            <StatCard
              variant="finance"
              title="Novos alunos matriculados"
              value={metrics?.novosMatriculadosCount ?? 0}
              icon={<UserPlus className="w-5 h-5" />}
              color="blue"
              subtitle="Clique para ver, marcar «enviei link pag» e «já adicionei aulas»"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setShowAlunosSemAulaModal(true)}
            onKeyDown={(e) => e.key === 'Enter' && setShowAlunosSemAulaModal(true)}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.99] min-h-0"
          >
            <StatCard
              variant="finance"
              title="Alunos sem aula designada"
              value={calendarStatsLoading ? '...' : (calendarStats?.wrongFrequencyCount ?? 0)}
              icon={<Users className="w-5 h-5" />}
              color="orange"
              subtitle="Freq. incorreta na semana"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => openListModal('inactiveStudents')}
            onKeyDown={(e) => e.key === 'Enter' && openListModal('inactiveStudents')}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.99] min-h-0"
          >
            <StatCard
              variant="finance"
              title="Alunos Inativos"
              value={metrics?.users.INACTIVE || 0}
              icon={<UserX className="w-5 h-5" />}
              color="red"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => openListModal('totalUsers')}
            onKeyDown={(e) => e.key === 'Enter' && openListModal('totalUsers')}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.99] min-h-0"
          >
            <StatCard
              variant="finance"
              title="Total de Usuários"
              value={metrics?.users.total || 0}
              icon={<UserCog className="w-5 h-5" />}
              color="purple"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => openListModal('activeTeachers')}
            onKeyDown={(e) => e.key === 'Enter' && openListModal('activeTeachers')}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.99] min-h-0"
          >
            <StatCard
              variant="finance"
              title="Professores Ativos"
              value={metrics?.teachers.ACTIVE || 0}
              icon={<GraduationCap className="w-5 h-5" />}
              color="green"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => openListModal('inactiveTeachers')}
            onKeyDown={(e) => e.key === 'Enter' && openListModal('inactiveTeachers')}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.99] min-h-0"
          >
            <StatCard
              variant="finance"
              title="Professores Inativos"
              value={metrics?.teachers.INACTIVE || 0}
              icon={<GraduationCap className="w-5 h-5" />}
              color="red"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => openListModal('absencesStudentsWeek')}
            onKeyDown={(e) => e.key === 'Enter' && openListModal('absencesStudentsWeek')}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.99] min-h-0"
          >
            <StatCard
              variant="finance"
              title="Faltas Alunos (7 dias)"
              value={metrics?.absences.studentsWeek || 0}
              icon={<CalendarX className="w-5 h-5" />}
              color="orange"
              subtitle="Última semana"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => openListModal('teachersWithProblems')}
            onKeyDown={(e) => e.key === 'Enter' && openListModal('teachersWithProblems')}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.99] min-h-0"
          >
            <StatCard
              variant="finance"
              title="Professores com problemas"
              value={metrics?.teachersWithProblems ?? 0}
              icon={<AlertTriangle className="w-5 h-5" />}
              color="red"
              subtitle="Avaliação 1 estrela"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => openListModal('absencesStudentsMonth')}
            onKeyDown={(e) => e.key === 'Enter' && openListModal('absencesStudentsMonth')}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.99] min-h-0"
          >
            <StatCard
              variant="finance"
              title="Faltas Alunos (30 dias)"
              value={metrics?.absences.studentsMonth || 0}
              icon={<CalendarX className="w-5 h-5" />}
              color="orange"
              subtitle="Último mês"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={openAuditModal}
            onKeyDown={(e) => e.key === 'Enter' && openAuditModal()}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.99] min-h-0"
          >
            <StatCard
              variant="finance"
              title="Quem fez o quê"
              value={auditCount48h ?? '...'}
              icon={<History className="w-5 h-5" />}
              color="purple"
              subtitle="Clique para ver ações dos admins (últimas 48h)"
            />
          </div>
        </div>

        {/* Gráfico */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 md:p-8 shadow-lg mb-8">
          <h2 className="text-xl font-semibold text-slate-800 mb-6 pb-3 border-b border-slate-100">
            Distribuição de Usuários por Status
          </h2>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={{ stroke: '#e2e8f0' }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                labelStyle={{ fontWeight: 600, color: '#334155' }}
              />
              <Legend wrapperStyle={{ paddingTop: 16 }} iconType="circle" iconSize={8} />
              <Bar dataKey="Alunos" fill="#f97316" radius={[4, 4, 0, 0]} name="Alunos" />
              <Bar dataKey="Professores" fill="#ea580c" radius={[4, 4, 0, 0]} name="Professores" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Modal de lista ao clicar no cubo */}
        <Modal
          isOpen={modalType !== null}
          onClose={closeModal}
          title={modalType ? LIST_TITLES[modalType] : ''}
          size="xl"
        >
          {listLoading ? (
            <p className="text-gray-500">Carregando...</p>
          ) : listData.length === 0 ? (
            <p className="text-gray-500">Nenhum registro.</p>
          ) : modalType === 'novosMatriculados' ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Alunos que se matricularam pelo formulário e ainda não foram marcados como «já adicionei aulas». Use «Enviei link pag» para registrar o envio do link de pagamento; «Já adicionei aulas» remove o aluno da lista.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="py-2 pr-4 font-semibold text-gray-700">Nome</th>
                      <th className="py-2 pr-4 font-semibold text-gray-700">Data da matrícula</th>
                      <th className="py-2 font-semibold text-gray-700">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listData.map((item) => {
                      const row = item as ListItemNovosMatriculados
                      const dataFormatada = row.dataMatricula
                        ? new Date(row.dataMatricula).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })
                        : '—'
                      const isLoadingAulas = marcandoAulasId === row.id
                      const isLoadingLink = marcandoLinkPagId === row.id
                      const linkEnviado = !!row.linkPagamentoEnviadoAt
                      return (
                        <tr key={row.id} className="border-b border-gray-100">
                          <td className="py-2 pr-4">{row.nome}</td>
                          <td className="py-2 pr-4">{dataFormatada}</td>
                          <td className="py-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => marcarLinkPagEnviado(row.id)}
                              disabled={isLoadingLink || linkEnviado}
                              className={`px-3 py-1.5 text-sm font-medium rounded-lg disabled:cursor-not-allowed disabled:opacity-50 ${
                                linkEnviado
                                  ? 'bg-gray-200 text-gray-600 cursor-default'
                                  : 'bg-sky-600 text-white hover:opacity-90'
                              }`}
                            >
                              {isLoadingLink ? 'Salvando...' : linkEnviado ? 'Link enviado' : 'Enviei link pag'}
                            </button>
                            <button
                              type="button"
                              onClick={() => marcarAulasAdicionadas(row.id)}
                              disabled={isLoadingAulas}
                              className="px-3 py-1.5 text-sm font-medium rounded-lg bg-brand-orange text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isLoadingAulas ? 'Salvando...' : 'Já adicionei aulas'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : modalType === 'studentsWithoutLesson' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-2 pr-4 font-semibold text-gray-700">Nome</th>
                    <th className="py-2 pr-4 font-semibold text-gray-700">Data da última aula</th>
                    <th className="py-2 font-semibold text-gray-700">Livro (última aula)</th>
                  </tr>
                </thead>
                <tbody>
                  {listData.map((item) => {
                    const row = item as ListItemWithoutLesson
                    const dataFormatada = row.ultimaAulaData
                      ? new Date(row.ultimaAulaData).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })
                      : '—'
                    return (
                      <tr key={row.id} className="border-b border-gray-100">
                        <td className="py-2 pr-4">{row.nome}</td>
                        <td className="py-2 pr-4">{dataFormatada}</td>
                        <td className="py-2">{row.ultimoLivro ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : modalType?.startsWith('absences') ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-2 pr-4 font-semibold text-gray-700">Nome</th>
                    <th className="py-2 font-semibold text-gray-700">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {listData.map((item) => {
                    const row = item as ListItemWithData
                    const dataFormatada = row.data
                      ? new Date(row.data).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })
                      : '—'
                    return (
                      <tr key={row.id} className="border-b border-gray-100">
                        <td className="py-2 pr-4">{row.nome}</td>
                        <td className="py-2">{dataFormatada}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : modalType === 'totalUsers' ? (
            <ul className="space-y-1 max-h-96 overflow-y-auto">
              {listData.map((item) => {
                const row = item as ListItemTotalUser
                const roleLabel =
                  row.role === 'STUDENT'
                    ? 'Aluno'
                    : row.role === 'ADMIN'
                      ? 'Admin'
                      : row.role ?? '—'
                return (
                  <li key={row.id} className="flex justify-between gap-4 py-1">
                    <span>{row.nome}</span>
                    <span className="text-gray-500 text-sm">{roleLabel}</span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <ul className="space-y-1 max-h-96 overflow-y-auto">
              {listData.map((item) => (
                <li key={item.id} className="py-1">
                  {item.nome}
                </li>
              ))}
            </ul>
          )}
        </Modal>

        {/* Modal Quem fez o quê */}
        <Modal
          isOpen={showAuditModal}
          onClose={() => {
            setShowAuditModal(false)
            fetchAuditCount()
          }}
          title="Quem fez o quê"
          size="xl"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <label className="text-sm font-medium text-gray-700">Período:</label>
              <select
                value={auditHours}
                onChange={(e) => refetchAuditWithHours(Number(e.target.value))}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
              >
                <option value={48}>Últimas 48 horas</option>
                <option value={72}>Últimas 72 horas</option>
                <option value={168}>Últimos 7 dias</option>
                <option value={336}>Últimos 14 dias</option>
                <option value={720}>Últimos 30 dias</option>
              </select>
            </div>
            {auditLoading ? (
              <p className="text-gray-500">Carregando...</p>
            ) : auditActivities.length === 0 ? (
              <p className="text-gray-500">Nenhuma ação registrada neste período.</p>
            ) : (
              <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-white border-b border-gray-200">
                    <tr>
                      <th className="py-2 pr-4 font-semibold text-gray-700">Quando</th>
                      <th className="py-2 pr-4 font-semibold text-gray-700">Quem</th>
                      <th className="py-2 pr-4 font-semibold text-gray-700">Ação</th>
                      <th className="py-2 font-semibold text-gray-700">Detalhe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditActivities.map((item) => (
                      <tr key={item.id} className="border-b border-gray-100">
                        <td className="py-2 pr-4 text-sm text-gray-600 whitespace-nowrap">
                          {formatDateTime(item.createdAt)}
                        </td>
                        <td className="py-2 pr-4 font-medium">{item.actorName}</td>
                        <td className="py-2 pr-4">{item.action}</td>
                        <td className="py-2 text-gray-600">{item.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Modal>

        {/* Modal Alunos sem aula designada (freq. incorreta): nome, horários de aula, último livro */}
        <Modal
          isOpen={showAlunosSemAulaModal}
          onClose={() => setShowAlunosSemAulaModal(false)}
          title="Alunos sem aula designada"
          size="xl"
        >
          <p className="text-xs text-gray-500 mb-4">
            Alunos ativos cujo total de aulas na semana (seg–sáb) não confere com a frequência cadastrada.
          </p>
          {!calendarStats ? (
            <p className="text-gray-500">Carregando...</p>
          ) : calendarStats.wrongFrequencyList.length === 0 ? (
            <p className="text-gray-500">Nenhum aluno com frequência incorreta nesta semana.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-2 pr-4 font-semibold text-gray-700">Nome</th>
                    <th className="py-2 pr-4 font-semibold text-gray-700">Horários de aula (semana)</th>
                    <th className="py-2 font-semibold text-gray-700">Último livro</th>
                  </tr>
                </thead>
                <tbody>
                  {calendarStats.wrongFrequencyList.map((item) => (
                    <tr key={item.enrollmentId} className="border-b border-gray-100">
                      <td className="py-2 pr-4">{item.studentName}</td>
                      <td className="py-2 pr-4">
                        {item.lessonTimesThisWeek?.length
                          ? item.lessonTimesThisWeek.map((iso) => formatDateTime(iso)).join(', ')
                          : '—'}
                      </td>
                      <td className="py-2">{item.lastBook ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      </div>
    </AdminLayout>
  )
}
