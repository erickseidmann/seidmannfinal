/**
 * Financeiro – Relatórios
 * UI para consultar e exportar relatórios financeiros (geral, receitas, despesas, inadimplência, professores).
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import AdminLayout from '@/components/admin/AdminLayout'
import Button from '@/components/ui/Button'
import { Loader2, Search, Download } from 'lucide-react'

const MESES_LABELS: Record<number, string> = {
  1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 6: 'Junho',
  7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro',
}
const ANOS_DISPONIVEIS = (() => {
  const current = new Date().getFullYear()
  return Array.from({ length: current - 2024 + 2 }, (_, i) => 2024 + i) // 2024 até ano atual + 1
})()
const TIPO_OPCOES = [
  { value: 'geral', label: 'Visão Geral' },
  { value: 'receitas', label: 'Receitas' },
  { value: 'despesas', label: 'Despesas' },
  { value: 'inadimplencia', label: 'Inadimplência' },
  { value: 'professores', label: 'Professores' },
] as const

const MES_OPCOES = [{ value: '', label: 'Todos (ano inteiro)' }, ...Object.entries(MESES_LABELS).map(([num, label]) => ({ value: num, label }))]

type ReportType = 'geral' | 'receitas' | 'despesas' | 'inadimplencia' | 'professores'

function formatMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
}

function statusBadge(status: string | null): string {
  if (!status) return 'bg-gray-100 text-gray-700'
  if (status === 'PAGO') return 'bg-green-100 text-green-800'
  if (status === 'ATRASADO') return 'bg-red-100 text-red-800'
  if (status === 'EM_ABERTO') return 'bg-amber-100 text-amber-800'
  return 'bg-gray-100 text-gray-700'
}

function statusLabel(status: string | null): string {
  if (!status) return '—'
  const map: Record<string, string> = { PAGO: 'Pago', PENDING: 'Pendente', ATRASADO: 'Atrasado', EM_ABERTO: 'Em aberto' }
  return map[status] || status
}

export default function FinanceiroRelatoriosPage() {
  const anoAtual = new Date().getFullYear()
  const [tipo, setTipo] = useState<ReportType>('geral')
  const [year, setYear] = useState(anoAtual)
  const [month, setMonth] = useState<string>('')
  const [data, setData] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const buildUrl = useCallback((fmt: 'json' | 'csv') => {
    const params = new URLSearchParams({ type: tipo, year: String(year), format: fmt })
    if (month) params.set('month', month)
    return `/api/admin/financeiro/relatorios?${params.toString()}`
  }, [tipo, year, month])

  const fetchReport = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ type: tipo, year: String(year), format: 'json' })
      if (month) params.set('month', month)
      const res = await fetch(`/api/admin/financeiro/relatorios?${params.toString()}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setData(null)
        setError(json.message || 'Erro ao carregar relatório')
        return
      }
      setData(json.data)
    } catch {
      setData(null)
      setError('Erro ao carregar relatório. Verifique sua conexão.')
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [tipo, year, month])

  // Carregar relatório ao abrir a página e quando tipo, year ou month mudam
  useEffect(() => {
    void fetchReport()
  }, [tipo, year, month, fetchReport])

  const handleExportCsv = useCallback(async () => {
    setExporting(true)
    try {
      const res = await fetch(buildUrl('csv'), { credentials: 'include' })
      if (!res.ok) throw new Error('Falha ao exportar')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `relatorio-${tipo}-${year}${month ? `-${month}` : ''}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Não foi possível exportar o CSV.')
    } finally {
      setExporting(false)
    }
  }, [buildUrl, tipo, year, month])

  const hasMonth = !!month

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Financeiro – Relatórios</h1>
          <p className="text-gray-600 mt-1">Relatórios e exportações financeiras por período.</p>
        </div>

        {/* Barra de filtros */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Tipo</label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as ReportType)}
                className="input min-w-[180px]"
              >
                {TIPO_OPCOES.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Ano</label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="input min-w-[100px]"
              >
                {ANOS_DISPONIVEIS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Mês</label>
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="input min-w-[160px]"
              >
                {MES_OPCOES.map((o) => (
                  <option key={o.value || 'all'} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <Button variant="primary" size="sm" onClick={() => void fetchReport()} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
              Buscar
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={loading || exporting}>
              {exporting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
              Exportar CSV
            </Button>
          </div>
        </div>

        {/* Erro */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="text-red-800">{String(error)}</p>
            <Button variant="outline" size="sm" onClick={() => void fetchReport()}>
              Tentar novamente
            </Button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
          </div>
        )}

        {/* Resultados */}
        {!loading && !error && data && (
          <ReportContent tipo={tipo} data={data} hasMonth={hasMonth} month={month ? Number(month) : 0} year={year} />
        )}

        {!loading && !error && !data && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center text-gray-500">
            Nenhum dado encontrado para o período selecionado.
          </div>
        )}
      </div>
    </AdminLayout>
  )
}

function ReportContent({
  tipo,
  data,
  hasMonth,
  month,
  year,
}: {
  tipo: ReportType
  data: unknown
  hasMonth: boolean
  month: number
  year: number
}) {
  if (tipo === 'geral') return <ReportGeral data={data as GeralData} hasMonth={hasMonth} month={month} year={year} />
  if (tipo === 'receitas') return <ReportReceitas data={data as ReceitasData} hasMonth={hasMonth} month={month} year={year} />
  if (tipo === 'despesas') return <ReportDespesas data={data as DespesasData} hasMonth={hasMonth} month={month} year={year} />
  if (tipo === 'inadimplencia') return <ReportInadimplencia data={data as InadimplenciaData} />
  if (tipo === 'professores') return <ReportProfessores data={data as ProfessoresData} />
  return null
}

// --- Tipos ---
interface GeralItem {
  mes: number
  ano: number
  receita: number
  despesaProfessores: number
  despesaAdmin: number
  despesaOutras: number
  totalDespesas: number
  saldo: number
}
interface GeralData {
  items?: GeralItem[]
}

interface ReceitasItemMes {
  year: number
  month: number
  totalPago: number
  totalPendente: number
  totalAtrasado: number
  totalGeral: number
}
interface ReceitasItemAluno {
  aluno: string
  valorMensalidade: number
  status: string | null
  year: number
  month: number
}
interface ReceitasData {
  items?: ReceitasItemMes[] | ReceitasItemAluno[]
  totalPago?: number
  totalPendente?: number
  totalAtrasado?: number
  totalGeral?: number
}

interface DespesasData {
  items?: Array<{ year: number; month: number; professores: number; adminStaff: number; despesasAdmin: number; total: number }>
  professores?: Array<{ professor: string; horasRegistradas: number; valorPorHora: number; valorAPagar: number; status: string | null }>
  admin?: Array<{ nome: string; valor: number; status: string | null }>
  expenses?: Array<{ name: string; valor: number; status: string | null }>
  totalProfessores?: number
  totalAdminStaff?: number
  totalDespesasAdmin?: number
  total?: number
}

interface InadimplenciaItem {
  aluno: string
  email: string
  valorMensalidade: number
  dueDay: number | null
  mesesAtrasados: number
}
interface InadimplenciaData {
  items?: InadimplenciaItem[]
}

interface ProfessoresItem {
  nome: string
  totalHorasRegistradas: number
  valorPorHora: number
  valorAPagar: number
  paymentStatus: string | null
}
interface ProfessoresData {
  items?: ProfessoresItem[]
  totalGeral?: number
}

// --- Geral ---
function ReportGeral({ data, hasMonth, month, year }: { data: GeralData; hasMonth: boolean; month: number; year: number }) {
  const items = data?.items ?? []
  const receitaTotal = items.reduce((s, i) => s + (i.receita ?? 0), 0)
  const despesaTotal = items.reduce((s, i) => s + (i.totalDespesas ?? 0), 0)
  const saldoTotal = items.reduce((s, i) => s + (i.saldo ?? 0), 0)

  if (hasMonth && items.length === 1) {
    const i = items[0]
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border-2 border-green-200 bg-green-50 p-4">
            <p className="text-xs font-semibold text-green-800 uppercase">Receita</p>
            <p className="text-xl font-bold text-green-900 mt-1">{formatMoney(i?.receita)}</p>
          </div>
          <div className="rounded-xl border-2 border-red-200 bg-red-50 p-4">
            <p className="text-xs font-semibold text-red-800 uppercase">Despesas</p>
            <p className="text-xl font-bold text-red-900 mt-1">{formatMoney(i?.totalDespesas)}</p>
          </div>
          <div className={`rounded-xl border-2 p-4 ${(i?.saldo ?? 0) >= 0 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
            <p className="text-xs font-semibold uppercase">Saldo</p>
            <p className={`text-xl font-bold mt-1 ${(i?.saldo ?? 0) >= 0 ? 'text-green-900' : 'text-red-900'}`}>
              {formatMoney(i?.saldo)}
            </p>
          </div>
        </div>
        <div className="text-sm text-gray-600">
          Prof.: {formatMoney(i?.despesaProfessores)} | Admin: {formatMoney(i?.despesaAdmin)} | Outras: {formatMoney(i?.despesaOutras)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border-2 border-green-200 bg-green-50 p-4">
          <p className="text-xs font-semibold text-green-800 uppercase">Receita Total</p>
          <p className="text-xl font-bold text-green-900 mt-1">{formatMoney(receitaTotal)}</p>
        </div>
        <div className="rounded-xl border-2 border-red-200 bg-red-50 p-4">
          <p className="text-xs font-semibold text-red-800 uppercase">Despesa Total</p>
          <p className="text-xl font-bold text-red-900 mt-1">{formatMoney(despesaTotal)}</p>
        </div>
        <div className={`rounded-xl border-2 p-4 ${saldoTotal >= 0 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
          <p className="text-xs font-semibold uppercase">Saldo</p>
          <p className={`text-xl font-bold mt-1 ${saldoTotal >= 0 ? 'text-green-900' : 'text-red-900'}`}>{formatMoney(saldoTotal)}</p>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Mês</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Receita</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Despesas Prof.</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Despesas Admin</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Outras</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total Despesas</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={`${r.ano}-${r.mes}`} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 text-sm text-gray-900">{MESES_LABELS[r.mes]} {r.ano}</td>
                <td className="px-4 py-2 text-sm text-right text-gray-900">{formatMoney(r.receita)}</td>
                <td className="px-4 py-2 text-sm text-right text-gray-900">{formatMoney(r.despesaProfessores)}</td>
                <td className="px-4 py-2 text-sm text-right text-gray-900">{formatMoney(r.despesaAdmin)}</td>
                <td className="px-4 py-2 text-sm text-right text-gray-900">{formatMoney(r.despesaOutras)}</td>
                <td className="px-4 py-2 text-sm text-right text-gray-900">{formatMoney(r.totalDespesas)}</td>
                <td className={`px-4 py-2 text-sm text-right font-medium ${r.saldo >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatMoney(r.saldo)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
              <td className="px-4 py-2 text-sm text-gray-900">Total {year}</td>
              <td className="px-4 py-2 text-sm text-right text-gray-900">{formatMoney(receitaTotal)}</td>
              <td className="px-4 py-2 text-sm text-right text-gray-900">{formatMoney(items.reduce((s, i) => s + i.despesaProfessores, 0))}</td>
              <td className="px-4 py-2 text-sm text-right text-gray-900">{formatMoney(items.reduce((s, i) => s + i.despesaAdmin, 0))}</td>
              <td className="px-4 py-2 text-sm text-right text-gray-900">{formatMoney(items.reduce((s, i) => s + i.despesaOutras, 0))}</td>
              <td className="px-4 py-2 text-sm text-right text-gray-900">{formatMoney(despesaTotal)}</td>
              <td className={`px-4 py-2 text-sm text-right ${saldoTotal >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatMoney(saldoTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// --- Receitas ---
function ReportReceitas({ data, hasMonth, month, year }: { data: ReceitasData; hasMonth: boolean; month: number; year: number }) {
  const items = data?.items ?? []
  if (hasMonth) {
    const alunoItems = items as ReceitasItemAluno[]
    const totalPago = data.totalPago ?? 0
    const totalPendente = data.totalPendente ?? 0
    const totalAtrasado = data.totalAtrasado ?? 0
    const totalGeral = data.totalGeral ?? 0
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase">Total Pago</p>
            <p className="text-lg font-bold text-green-700 mt-1">{formatMoney(totalPago)}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase">Pendente</p>
            <p className="text-lg font-bold text-amber-700 mt-1">{formatMoney(totalPendente)}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase">Atrasado</p>
            <p className="text-lg font-bold text-red-700 mt-1">{formatMoney(totalAtrasado)}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase">Total</p>
            <p className="text-lg font-bold text-gray-900 mt-1">{formatMoney(totalGeral)}</p>
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[400px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Aluno</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Valor Mensalidade</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
              </tr>
            </thead>
            <tbody>
              {alunoItems.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500">Nenhum dado encontrado</td></tr>
              ) : (
                alunoItems.map((r, idx) => (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm text-gray-900">{r.aluno}</td>
                    <td className="px-4 py-2 text-sm text-right text-gray-900">{formatMoney(r.valorMensalidade)}</td>
                    <td className="px-4 py-2"><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusBadge(r.status)}`}>{statusLabel(r.status)}</span></td>
                  </tr>
                ))
              )}
            </tbody>
            {alunoItems.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                  <td className="px-4 py-2 text-sm">Total</td>
                  <td className="px-4 py-2 text-sm text-right">{formatMoney(alunoItems.reduce((s, r) => s + r.valorMensalidade, 0))}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    )
  }

  const mesItems = items as ReceitasItemMes[]
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full min-w-[600px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Mês</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total Pago</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total Pendente</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total Atrasado</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total</th>
          </tr>
        </thead>
        <tbody>
          {mesItems.length === 0 ? (
            <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Nenhum dado encontrado</td></tr>
          ) : (
            mesItems.map((r) => (
              <tr key={`${r.year}-${r.month}`} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 text-sm text-gray-900">{MESES_LABELS[r.month]} {r.year}</td>
                <td className="px-4 py-2 text-sm text-right text-green-700">{formatMoney(r.totalPago)}</td>
                <td className="px-4 py-2 text-sm text-right text-amber-700">{formatMoney(r.totalPendente)}</td>
                <td className="px-4 py-2 text-sm text-right text-red-700">{formatMoney(r.totalAtrasado)}</td>
                <td className="px-4 py-2 text-sm text-right text-gray-900 font-medium">{formatMoney(r.totalGeral)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

// --- Despesas ---
function ReportDespesas({ data, hasMonth, month, year }: { data: DespesasData; hasMonth: boolean; month: number; year: number }) {
  if (hasMonth) {
    const profs = data.professores ?? []
    const admin = data.admin ?? []
    const expenses = data.expenses ?? []
    const totalP = data.totalProfessores ?? 0
    const totalA = data.totalAdminStaff ?? 0
    const totalE = data.totalDespesasAdmin ?? 0
    const total = data.total ?? 0
    return (
      <div className="space-y-6">
        <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold text-amber-800 uppercase">Total a pagar – {MESES_LABELS[month]} {year}</p>
          <p className="text-2xl font-bold text-amber-900 mt-1">{formatMoney(total)}</p>
        </div>
        <div className="grid gap-4">
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <h3 className="px-4 py-3 bg-gray-50 font-semibold text-gray-800 border-b">Professores</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead><tr className="border-b bg-gray-50"><th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Professor</th><th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Horas</th><th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Valor/Hora</th><th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Valor a Pagar</th><th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Status</th></tr></thead>
                <tbody>
                  {profs.length === 0 ? <tr><td colSpan={5} className="px-4 py-4 text-center text-gray-500">Nenhum</td></tr> : profs.map((r, i) => (
                    <tr key={i} className="border-b border-gray-100"><td className="px-4 py-2 text-sm">{r.professor}</td><td className="px-4 py-2 text-sm text-right">{(r.horasRegistradas ?? 0).toFixed(2)}</td><td className="px-4 py-2 text-sm text-right">{formatMoney(r.valorPorHora)}</td><td className="px-4 py-2 text-sm text-right font-medium">{formatMoney(r.valorAPagar)}</td><td><span className={`px-2 py-0.5 rounded text-xs ${statusBadge(r.status)}`}>{statusLabel(r.status)}</span></td></tr>
                  ))}
                </tbody>
                {profs.length > 0 && <tfoot><tr className="border-t-2 bg-gray-50 font-semibold"><td className="px-4 py-2">Total</td><td colSpan={2}></td><td className="px-4 py-2 text-right">{formatMoney(totalP)}</td><td></td></tr></tfoot>}
              </table>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <h3 className="px-4 py-3 bg-gray-50 font-semibold text-gray-800 border-b">Admin / Funcionários</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[400px]">
                <thead><tr className="border-b bg-gray-50"><th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Nome</th><th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Valor</th><th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Status</th></tr></thead>
                <tbody>
                  {admin.length === 0 ? <tr><td colSpan={3} className="px-4 py-4 text-center text-gray-500">Nenhum</td></tr> : admin.map((r, i) => (
                    <tr key={i} className="border-b border-gray-100"><td className="px-4 py-2 text-sm">{r.nome}</td><td className="px-4 py-2 text-sm text-right">{formatMoney(r.valor)}</td><td><span className={`px-2 py-0.5 rounded text-xs ${statusBadge(r.status)}`}>{statusLabel(r.status)}</span></td></tr>
                  ))}
                </tbody>
                {admin.length > 0 && <tfoot><tr className="border-t-2 bg-gray-50 font-semibold"><td className="px-4 py-2">Total</td><td className="px-4 py-2 text-right">{formatMoney(totalA)}</td><td></td></tr></tfoot>}
              </table>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <h3 className="px-4 py-3 bg-gray-50 font-semibold text-gray-800 border-b">Despesas avulsas</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[400px]">
                <thead><tr className="border-b bg-gray-50"><th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Despesa</th><th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Valor</th><th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Status</th></tr></thead>
                <tbody>
                  {expenses.length === 0 ? <tr><td colSpan={3} className="px-4 py-4 text-center text-gray-500">Nenhum</td></tr> : expenses.map((r, i) => (
                    <tr key={i} className="border-b border-gray-100"><td className="px-4 py-2 text-sm">{r.name}</td><td className="px-4 py-2 text-sm text-right">{formatMoney(r.valor)}</td><td><span className={`px-2 py-0.5 rounded text-xs ${statusBadge(r.status)}`}>{statusLabel(r.status)}</span></td></tr>
                  ))}
                </tbody>
                {expenses.length > 0 && <tfoot><tr className="border-t-2 bg-gray-50 font-semibold"><td className="px-4 py-2">Total</td><td className="px-4 py-2 text-right">{formatMoney(totalE)}</td><td></td></tr></tfoot>}
              </table>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const items = data.items ?? []
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full min-w-[600px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Mês</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Professores</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Admin</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Outras</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Nenhum dado encontrado</td></tr> : items.map((r: { year: number; month: number; professores: number; adminStaff: number; despesasAdmin: number; total: number }) => (
            <tr key={`${r.year}-${r.month}`} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-4 py-2 text-sm text-gray-900">{MESES_LABELS[r.month]} {r.year}</td>
              <td className="px-4 py-2 text-sm text-right text-gray-900">{formatMoney(r.professores)}</td>
              <td className="px-4 py-2 text-sm text-right text-gray-900">{formatMoney(r.adminStaff)}</td>
              <td className="px-4 py-2 text-sm text-right text-gray-900">{formatMoney(r.despesasAdmin)}</td>
              <td className="px-4 py-2 text-sm text-right text-gray-900 font-medium">{formatMoney(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// --- Inadimplência ---
function ReportInadimplencia({ data }: { data: InadimplenciaData }) {
  const items = data?.items ?? []
  const totalEmAberto = items.reduce((s, r) => s + r.valorMensalidade * r.mesesAtrasados, 0)

  return (
    <div className="space-y-4">
      <div className="rounded-xl border-2 border-red-200 bg-red-50 p-4">
        <p className="text-xs font-semibold text-red-800 uppercase">{items.length} alunos inadimplentes</p>
        <p className="text-2xl font-bold text-red-900 mt-1">Total em aberto: {formatMoney(totalEmAberto)}</p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Aluno</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Email</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Valor Mensalidade</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Dia Vencimento</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Meses Atrasados</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Nenhum aluno inadimplente</td></tr> : items.map((r, i) => (
              <tr key={i} className={`border-b border-gray-100 hover:bg-gray-50 ${r.mesesAtrasados >= 3 ? 'bg-red-50 font-bold' : ''}`}>
                <td className={`px-4 py-2 text-sm ${r.mesesAtrasados >= 3 ? 'text-red-900' : 'text-gray-900'}`}>{r.aluno}</td>
                <td className="px-4 py-2 text-sm text-gray-600">{r.email}</td>
                <td className="px-4 py-2 text-sm text-right text-gray-900">{formatMoney(r.valorMensalidade)}</td>
                <td className="px-4 py-2 text-sm text-center text-gray-900">{r.dueDay ?? '—'}</td>
                <td className={`px-4 py-2 text-sm text-center font-medium ${r.mesesAtrasados >= 3 ? 'text-red-700' : 'text-gray-900'}`}>{r.mesesAtrasados}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// --- Professores ---
function ReportProfessores({ data }: { data: ProfessoresData }) {
  const items = data?.items ?? []
  const totalGeral = data?.totalGeral ?? 0

  return (
    <div className="space-y-4">
      <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4">
        <p className="text-xs font-semibold text-amber-800 uppercase">Total a pagar para todos os professores</p>
        <p className="text-2xl font-bold text-amber-900 mt-1">{formatMoney(totalGeral)}</p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Professor</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Horas Registradas</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Valor/Hora</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Valor a Pagar</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Nenhum dado encontrado</td></tr> : items.map((r, i) => (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 text-sm text-gray-900">{r.nome}</td>
                <td className="px-4 py-2 text-sm text-right text-gray-900">{(r.totalHorasRegistradas ?? 0).toFixed(2)}</td>
                <td className="px-4 py-2 text-sm text-right text-gray-900">{formatMoney(r.valorPorHora)}</td>
                <td className="px-4 py-2 text-sm text-right font-medium text-gray-900">{formatMoney(r.valorAPagar)}</td>
                <td><span className={`px-2 py-0.5 rounded text-xs ${statusBadge(r.paymentStatus)}`}>{statusLabel(r.paymentStatus)}</span></td>
              </tr>
            ))}
          </tbody>
          {items.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                <td className="px-4 py-2 text-sm">Total</td>
                <td colSpan={2}></td>
                <td className="px-4 py-2 text-sm text-right">{formatMoney(totalGeral)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

