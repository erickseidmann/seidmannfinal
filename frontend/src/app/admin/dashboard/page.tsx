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
import { Card } from '@/components/ui/Card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Users, UserCheck, UserX, UserCog, GraduationCap, CalendarX, AlertTriangle } from 'lucide-react'

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
interface ListItemTotalUser extends ListItemBase {
  role?: string
}

const LIST_TITLES: Record<ListType, string> = {
  activeStudents: 'Alunos Ativos',
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
    (ListItemWithData | ListItemWithoutLesson | ListItemTotalUser)[]
  >([])
  const [listLoading, setListLoading] = useState(false)
  const [calendarStats, setCalendarStats] = useState<CalendarStats | null>(null)
  const [calendarStatsLoading, setCalendarStatsLoading] = useState(true)
  const [showAlunosSemAulaModal, setShowAlunosSemAulaModal] = useState(false)

  useEffect(() => {
    fetchMetrics()
  }, [])

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
      <div>
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            Dashboard Admin
          </h1>
          <p className="text-sm text-gray-600">
            Visão geral do sistema e métricas de usuários
          </p>
        </div>

        {/* Cards de Métricas - Usuários (clicáveis) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div
            role="button"
            tabIndex={0}
            onClick={() => openListModal('activeStudents')}
            onKeyDown={(e) => e.key === 'Enter' && openListModal('activeStudents')}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-lg"
          >
            <StatCard
              title="Alunos Ativos"
              value={metrics?.users.ACTIVE || 0}
              icon={<UserCheck className="w-6 h-6" />}
              color="green"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setShowAlunosSemAulaModal(true)}
            onKeyDown={(e) => e.key === 'Enter' && setShowAlunosSemAulaModal(true)}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-lg"
          >
            <StatCard
              title="Alunos sem aula designada"
              value={calendarStatsLoading ? '...' : (calendarStats?.wrongFrequencyCount ?? 0)}
              icon={<Users className="w-6 h-6" />}
              color="orange"
              subtitle="Freq. incorreta na semana (seg–sáb) vs. cadastrada"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => openListModal('inactiveStudents')}
            onKeyDown={(e) => e.key === 'Enter' && openListModal('inactiveStudents')}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-lg"
          >
            <StatCard
              title="Alunos Inativos"
              value={metrics?.users.INACTIVE || 0}
              icon={<UserX className="w-6 h-6" />}
              color="red"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => openListModal('totalUsers')}
            onKeyDown={(e) => e.key === 'Enter' && openListModal('totalUsers')}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-lg"
          >
            <StatCard
              title="Total de Usuários"
              value={metrics?.users.total || 0}
              icon={<UserCog className="w-6 h-6" />}
              color="purple"
            />
          </div>
        </div>

        {/* Cards de Métricas - Professores e Faltas (clicáveis) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div
            role="button"
            tabIndex={0}
            onClick={() => openListModal('activeTeachers')}
            onKeyDown={(e) => e.key === 'Enter' && openListModal('activeTeachers')}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-lg"
          >
            <StatCard
              title="Professores Ativos"
              value={metrics?.teachers.ACTIVE || 0}
              icon={<GraduationCap className="w-6 h-6" />}
              color="blue"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => openListModal('inactiveTeachers')}
            onKeyDown={(e) => e.key === 'Enter' && openListModal('inactiveTeachers')}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-lg"
          >
            <StatCard
              title="Professores Inativos"
              value={metrics?.teachers.INACTIVE || 0}
              icon={<GraduationCap className="w-6 h-6" />}
              color="red"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => openListModal('absencesStudentsWeek')}
            onKeyDown={(e) => e.key === 'Enter' && openListModal('absencesStudentsWeek')}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-lg"
          >
            <StatCard
              title="Faltas Alunos (7 dias)"
              value={metrics?.absences.studentsWeek || 0}
              icon={<CalendarX className="w-6 h-6" />}
              color="orange"
              subtitle="Última semana"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => openListModal('teachersWithProblems')}
            onKeyDown={(e) => e.key === 'Enter' && openListModal('teachersWithProblems')}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-lg"
          >
            <StatCard
              title="Professores com problemas"
              value={metrics?.teachersWithProblems ?? 0}
              icon={<AlertTriangle className="w-6 h-6" />}
              color="red"
              subtitle="Avaliação 1 estrela"
            />
          </div>
        </div>

        {/* Cards de Faltas Mensais (clicáveis) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div
            role="button"
            tabIndex={0}
            onClick={() => openListModal('absencesStudentsMonth')}
            onKeyDown={(e) => e.key === 'Enter' && openListModal('absencesStudentsMonth')}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-lg"
          >
            <StatCard
              title="Faltas Alunos (30 dias)"
              value={metrics?.absences.studentsMonth || 0}
              icon={<CalendarX className="w-6 h-6" />}
              color="orange"
              subtitle="Último mês"
            />
          </div>
        </div>

        {/* Gráfico */}
        <Card className="p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            Distribuição de Usuários por Status
          </h2>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="Alunos" fill="#f97316" />
              <Bar dataKey="Professores" fill="#ea580c" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

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
