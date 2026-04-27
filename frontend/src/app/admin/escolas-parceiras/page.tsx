'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AdminLayout from '@/components/admin/AdminLayout'
import { School, Loader2, Search, Download } from 'lucide-react'
import { useTranslation } from '@/contexts/LanguageContext'
import Button from '@/components/ui/Button'

type SchoolOption = {
  value: string
  label: string
}

type EnrollmentRow = {
  id: string
  nome: string
  dataMatricula: string
  valorMensalidade: number
  status: string
}

type ApiResponse = {
  schoolOptions: SchoolOption[]
  selectedSchool: string | null
  period: { startDate: string | null; endDate: string | null }
  totals: { totalMatriculados: number; totalAtivos: number }
  enrollments: EnrollmentRow[]
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR')
}

function todayIsoDate(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export default function AdminPartnerSchoolsPage() {
  const { t } = useTranslation()
  const [school, setSchool] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState(todayIsoDate())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ApiResponse | null>(null)

  const fetchData = useCallback(
    async (opts?: { preserveSchool?: boolean }) => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (school) params.set('school', school)
        if (startDate) params.set('startDate', startDate)
        if (endDate) params.set('endDate', endDate)
        const res = await fetch(`/api/admin/escolas-parceiras?${params.toString()}`, {
          credentials: 'include',
        })
        const json = await res.json()
        if (!res.ok || !json.ok) {
          setError(json.message || 'Não foi possível carregar os dados.')
          setData(null)
          return
        }
        const payload = json.data as ApiResponse
        setData(payload)
        if (!opts?.preserveSchool && !school && payload.schoolOptions.length > 0) {
          const first = payload.schoolOptions[0]
          if (first?.value) {
            setSchool(first.value)
          }
        }
      } catch {
        setError('Erro ao carregar dados. Tente novamente.')
        setData(null)
      } finally {
        setLoading(false)
      }
    },
    [school, startDate, endDate]
  )

  useEffect(() => {
    void fetchData()
    // A primeira carga deve ocorrer apenas uma vez
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows = data?.enrollments ?? []
  const totalValor = useMemo(() => rows.reduce((acc, row) => acc + row.valorMensalidade, 0), [rows])

  const handleDownload = useCallback(async () => {
    try {
      const params = new URLSearchParams({ format: 'csv' })
      if (school) params.set('school', school)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      const res = await fetch(`/api/admin/escolas-parceiras?${params.toString()}`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Falha ao gerar arquivo')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'escolas-parceiras.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Não foi possível baixar as informações agora.')
    }
  }, [school, startDate, endDate])

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 md:p-8 shadow-lg">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-orange-50 p-2 text-brand-orange shrink-0">
                <School className="w-6 h-6" aria-hidden />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-slate-800">{t('admin.partnerSchools')}</h1>
                <p className="mt-2 text-sm text-slate-600">
                  Selecione a escola e o período para visualizar matrículas, valores e totais.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Escola</label>
                <select
                  value={school}
                  onChange={(e) => setSchool(e.target.value)}
                  className="input w-full"
                >
                  {data?.schoolOptions?.length ? (
                    data.schoolOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))
                  ) : (
                    <option value="">Sem escolas cadastradas</option>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Data inicial</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Data final</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="input w-full"
                />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void fetchData({ preserveSchool: true })}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                  Buscar
                </Button>
                <Button variant="outline" size="sm" onClick={() => void handleDownload()} disabled={loading}>
                  <Download className="w-4 h-4 mr-2" />
                  Baixar infos
                </Button>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4">
              <p className="text-xs font-semibold uppercase text-blue-800">Total matriculados</p>
              <p className="text-2xl font-bold text-blue-900 mt-1">
                {loading ? '…' : data?.totals.totalMatriculados ?? 0}
              </p>
            </div>
            <div className="rounded-xl border-2 border-green-200 bg-green-50 p-4">
              <p className="text-xs font-semibold uppercase text-green-800">Alunos ativos</p>
              <p className="text-2xl font-bold text-green-900 mt-1">
                {loading ? '…' : data?.totals.totalAtivos ?? 0}
              </p>
            </div>
            <div className="rounded-xl border-2 border-violet-200 bg-violet-50 p-4">
              <p className="text-xs font-semibold uppercase text-violet-800">Valor total</p>
              <p className="text-xl font-bold text-violet-900 mt-1">
                {loading ? '…' : formatMoney(totalValor)}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full min-w-[620px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Nome</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Data matrícula</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Valor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      Carregando...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      Nenhuma matrícula encontrada para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm text-gray-900">{row.nome}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{formatDate(row.dataMatricula)}</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-900 font-medium">
                        {formatMoney(row.valorMensalidade)}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-700">{row.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
