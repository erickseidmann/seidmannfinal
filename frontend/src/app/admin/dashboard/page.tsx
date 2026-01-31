/**
 * Dashboard Admin
 * 
 * Página principal do painel administrativo com métricas e gráficos
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/admin/AdminLayout'
import StatCard from '@/components/admin/StatCard'
import { Card } from '@/components/ui/Card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Users, UserCheck, UserX, UserCog, GraduationCap, CalendarX } from 'lucide-react'

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
  absences: {
    studentsWeek: number
    studentsMonth: number
    teachersWeek: number
    teachersMonth: number
  }
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchMetrics()
  }, [])

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


  // Preparar dados para o gráfico
  const chartData = metrics ? [
    { name: 'Ativos', Alunos: metrics.users.ACTIVE, Professores: metrics.teachers.ACTIVE },
    { name: 'Pendentes', Alunos: metrics.users.PENDING, Professores: 0 },
    { name: 'Inativos', Alunos: metrics.users.INACTIVE, Professores: metrics.teachers.INACTIVE },
  ] : []

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

        {/* Cards de Métricas - Usuários */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Alunos Ativos"
            value={metrics?.users.ACTIVE || 0}
            icon={<UserCheck className="w-6 h-6" />}
            color="green"
          />
          <StatCard
            title="Alunos Pendentes"
            value={metrics?.users.PENDING || 0}
            icon={<Users className="w-6 h-6" />}
            color="orange"
          />
          <StatCard
            title="Alunos Inativos"
            value={metrics?.users.INACTIVE || 0}
            icon={<UserX className="w-6 h-6" />}
            color="red"
          />
          <StatCard
            title="Total de Usuários"
            value={metrics?.users.total || 0}
            icon={<UserCog className="w-6 h-6" />}
            color="purple"
          />
        </div>

        {/* Cards de Métricas - Professores e Faltas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Professores Ativos"
            value={metrics?.teachers.ACTIVE || 0}
            icon={<GraduationCap className="w-6 h-6" />}
            color="blue"
          />
          <StatCard
            title="Professores Inativos"
            value={metrics?.teachers.INACTIVE || 0}
            icon={<GraduationCap className="w-6 h-6" />}
            color="red"
          />
          <StatCard
            title="Faltas Alunos (7 dias)"
            value={metrics?.absences.studentsWeek || 0}
            icon={<CalendarX className="w-6 h-6" />}
            color="orange"
            subtitle="Última semana"
          />
          <StatCard
            title="Faltas Professores (7 dias)"
            value={metrics?.absences.teachersWeek || 0}
            icon={<CalendarX className="w-6 h-6" />}
            color="red"
            subtitle="Última semana"
          />
        </div>

        {/* Cards de Faltas Mensais */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <StatCard
            title="Faltas Alunos (30 dias)"
            value={metrics?.absences.studentsMonth || 0}
            icon={<CalendarX className="w-6 h-6" />}
            color="orange"
            subtitle="Último mês"
          />
          <StatCard
            title="Faltas Professores (30 dias)"
            value={metrics?.absences.teachersMonth || 0}
            icon={<CalendarX className="w-6 h-6" />}
            color="red"
            subtitle="Último mês"
          />
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
      </div>
    </AdminLayout>
  )
}
