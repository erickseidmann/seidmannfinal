/**
 * Financeiro – Relatórios
 * UI para consultar e exportar relatórios financeiros (geral, receitas, despesas, inadimplência, professores).
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import AdminLayout from '@/components/admin/AdminLayout'
import Button from '@/components/ui/Button'
import { Loader2, Search, Download, HeartPulse, Lightbulb, ChevronDown, ChevronRight } from 'lucide-react'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'

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
          {tipo === 'geral' && (
            <p className="text-xs text-gray-500 mt-3 w-full">
              {month ? (
                <>
                  Com <strong>mês específico</strong>, a Visão Geral inclui alunos matriculados no financeiro, inativações no mês, gráfico combinado e o cubo de saúde com sugestões.
                </>
              ) : (
                <>
                  Com <strong>ano inteiro (todos os meses)</strong>, a Visão Geral inclui médias de alunos e mensalidades, totais de inativações no ano, gráfico mês a mês e o cubo de saúde com base no ano.
                </>
              )}
            </p>
          )}
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
interface EscolaSaudePayload {
  score: number
  label: string
  cor: 'green' | 'amber' | 'red'
  sugestoes: string[]
}

interface KpisMesItem {
  month: number
  matriculadosCount: number
  matriculadosValorTotal: number
  inativadosCount: number
  valorPerdidoInativos: number
}

interface ResumoAnualPayload {
  mediaMatriculados: number
  mediaValorMensalidades: number
  totalInativadosAno: number
  valorPerdidoAno: number
}

interface MovimentacaoSaidaLinhaRelatorio {
  id: string
  name: string
  valor: number
  data: string
  transacao: string
  identificacao: string
  year: number
  month: number
}

interface EntradaAlunoPagoLinhaRelatorio {
  aluno: string
  valor: number
  year: number
  month: number
}

interface GeralData {
  items?: GeralItem[]
  /** Preenchidos pela API quando há mês específico (Visão geral) */
  matriculadosCount?: number
  matriculadosValorTotal?: number
  inativadosCount?: number
  valorPerdidoInativos?: number
  /** Soma das movimentações tipo Entrada (administração) no período filtrado */
  totalEntradaRegis?: number
  /** Soma das saídas (Débito / Saída) alinhada à tela Movimentações */
  totalSaidaRegis?: number
  movimentacoesSaidaLinhas?: MovimentacaoSaidaLinhaRelatorio[]
  /** Total pago pelos alunos no período (mesma base do cubo Receita) */
  totalPagoAlunos?: number
  entradasAlunosPagosLinhas?: EntradaAlunoPagoLinhaRelatorio[]
  /** Visão anual: KPIs por mês + resumo */
  kpisPorMes?: KpisMesItem[]
  resumoAnual?: ResumoAnualPayload
  escolaSaude?: EscolaSaudePayload
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

type GeralChartRow = {
  name: string
  receita: number
  despesas: number
  valorMatriculas: number
  valorPerdido: number
  qtdMatriculados: number
  qtdInativos: number
}

function VisaoGeralComposedChart({ chartRows, compact }: { chartRows: GeralChartRow[]; compact?: boolean }) {
  const maxBar = compact ? 22 : 48
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-800 mb-4">Visão combinada (valores em R$ e quantidades)</h3>
      <div className={`w-full min-h-[320px] ${compact ? 'h-[400px]' : 'h-[380px]'}`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartRows} margin={{ top: 12, right: 16, left: 8, bottom: compact ? 20 : 8 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
            <XAxis dataKey="name" tick={{ fontSize: compact ? 10 : 11 }} interval={0} />
            <YAxis
              yAxisId="left"
              tickFormatter={(v) =>
                Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : String(Math.round(v))
              }
              width={48}
            />
            <YAxis yAxisId="right" orientation="right" allowDecimals={false} width={36} />
            <Tooltip
              formatter={(value: number, name: string) => {
                if (name.includes('Qtd') || name.includes('matriculados') || name.includes('inativados'))
                  return [value, name]
                return [formatMoney(value), name]
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="left" dataKey="receita" name="Receita" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={maxBar} />
            <Bar yAxisId="left" dataKey="despesas" name="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={maxBar} />
            <Bar yAxisId="left" dataKey="valorMatriculas" name="Valor mensalidades (ativos)" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={maxBar} />
            <Bar yAxisId="left" dataKey="valorPerdido" name="Valor perdido (inativos)" fill="#f97316" radius={[4, 4, 0, 0]} maxBarSize={maxBar} />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="qtdMatriculados"
              name="Qtd. matriculados"
              stroke="#6366f1"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="qtdInativos"
              name="Qtd. inativados"
              stroke="#a855f7"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function CuboSaudeEscola({ saude, descricaoIndicador }: { saude: EscolaSaudePayload; descricaoIndicador: string }) {
  const cubeBorder =
    saude.cor === 'green'
      ? 'border-emerald-300 from-emerald-50 to-teal-50'
      : saude.cor === 'amber'
        ? 'border-amber-300 from-amber-50 to-orange-50'
        : 'border-rose-300 from-rose-50 to-red-50'

  return (
    <div
      className={`relative rounded-2xl border-2 bg-gradient-to-br p-6 shadow-lg transition-transform hover:scale-[1.01] ${cubeBorder}`}
      style={{ transformStyle: 'preserve-3d' }}
    >
      <div className="flex flex-col md:flex-row md:items-start gap-6">
        <div className="flex-shrink-0 mx-auto md:mx-0">
          <div className="relative w-28 h-28 rounded-2xl bg-white/80 border border-black/5 shadow-inner flex flex-col items-center justify-center rotate-[-2deg]">
            <HeartPulse
              className={`w-8 h-8 mb-1 ${saude.cor === 'green' ? 'text-emerald-600' : saude.cor === 'amber' ? 'text-amber-600' : 'text-rose-600'}`}
            />
            <span className="text-3xl font-black text-gray-900">{saude.score}</span>
            <span className="text-[10px] uppercase font-bold text-gray-500">índice</span>
          </div>
          <p className="text-center text-xs text-gray-600 mt-2">Saúde da escola</p>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <h3 className="text-lg font-bold text-gray-900">Cubo de saúde</h3>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                saude.cor === 'green'
                  ? 'bg-emerald-200 text-emerald-900'
                  : saude.cor === 'amber'
                    ? 'bg-amber-200 text-amber-900'
                    : 'bg-rose-200 text-rose-900'
              }`}
            >
              {saude.label}
            </span>
          </div>
          <p className="text-sm text-gray-700 mb-4">{descricaoIndicador}</p>
          <ul className="space-y-2">
            {saude.sugestoes.map((s, idx) => (
              <li key={idx} className="flex gap-2 text-sm text-gray-800">
                <Lightbulb className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

const SCROLL_LIST_RELATORIO_7 =
  'max-h-[calc(7*3.25rem)] overflow-y-auto rounded-lg border border-gray-200/90 bg-white/80 [scrollbar-width:thin] [scrollbar-color:rgb(209_213_219)_rgb(243_244_246)] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 hover:[&::-webkit-scrollbar-thumb]:bg-gray-400 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-gray-100'

function CubosSaidasMovimentacaoEEntradasAlunos({
  totalSaidaRegis,
  movimentacoesSaidaLinhas,
  totalPagoAlunos,
  entradasAlunosPagosLinhas,
  hasMonth,
}: {
  totalSaidaRegis: number
  movimentacoesSaidaLinhas: MovimentacaoSaidaLinhaRelatorio[]
  totalPagoAlunos: number
  entradasAlunosPagosLinhas: EntradaAlunoPagoLinhaRelatorio[]
  hasMonth: boolean
}) {
  const [abrirSaidas, setAbrirSaidas] = useState(false)
  const [abrirEntradas, setAbrirEntradas] = useState(false)

  const nSaidas = movimentacoesSaidaLinhas.length
  const nEntradas = entradasAlunosPagosLinhas.length

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-xl border-2 border-rose-200 bg-rose-50 p-4 shadow-sm">
        <p className="text-xs font-semibold text-rose-900 uppercase">Saídas registradas (movimentações)</p>
        <p className="text-xl font-bold text-rose-950 mt-1 tabular-nums">{formatMoney(totalSaidaRegis)}</p>
        <p className="text-xs font-normal text-rose-900/90 mt-2">
          Soma das linhas em que o tipo de transação é <strong>Débito</strong> (ou Saída manual sem extrato), com a mesma
          deduplicação da tela Movimentações.
        </p>
        {nSaidas > 0 ? (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setAbrirSaidas((v) => !v)}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-rose-200 bg-white/90 px-3 py-2 text-left text-xs font-medium text-rose-900 shadow-sm hover:bg-white"
            >
              <span className="flex items-center gap-2">
                {abrirSaidas ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                {abrirSaidas ? 'Ocultar lançamentos' : `Ver lançamentos (${nSaidas})`}
              </span>
            </button>
            {abrirSaidas ? (
              <>
                <ul className={`mt-2 space-y-0 divide-y divide-rose-100 px-2 py-1 text-xs text-rose-950 ${SCROLL_LIST_RELATORIO_7}`}>
                  {movimentacoesSaidaLinhas.map((l) => (
                    <li key={l.id} className="flex flex-col gap-0.5 py-2 pr-1">
                      <span className="font-medium text-gray-900 break-words">{l.identificacao}</span>
                      <span className="text-gray-600 line-clamp-2">
                        {[l.data, l.transacao].filter(Boolean).join(' · ') || l.name}
                        {!hasMonth ? (
                          <span className="text-rose-700/90">
                            {' '}
                            · {MESES_LABELS[l.month] ?? l.month}/{l.year}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-sm font-semibold text-rose-900 tabular-nums">{formatMoney(l.valor)}</span>
                    </li>
                  ))}
                </ul>
                {!hasMonth ? (
                  <p className="mt-1 text-[10px] text-rose-800/75">Até 120 lançamentos do período filtrado, ordenados por data.</p>
                ) : null}
              </>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-xs text-rose-800/80 rounded-lg border border-rose-100 bg-white/50 px-2 py-2">
            Nenhuma saída registrada neste período.
          </p>
        )}
      </div>
      <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4 shadow-sm">
        <p className="text-xs font-semibold text-emerald-900 uppercase">Entradas (pagamentos de alunos)</p>
        <p className="text-xl font-bold text-emerald-950 mt-1 tabular-nums">{formatMoney(totalPagoAlunos)}</p>
        <p className="text-xs font-normal text-emerald-900/90 mt-2">
          Total <strong>pago</strong> no mês competência (status PAGO nos pagamentos mensais dos alunos). Equivale ao valor
          do cubo <strong>Receita</strong> quando o filtro é um mês.
        </p>
        {hasMonth && nEntradas > 0 ? (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setAbrirEntradas((v) => !v)}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-white/90 px-3 py-2 text-left text-xs font-medium text-emerald-900 shadow-sm hover:bg-white"
            >
              <span className="flex items-center gap-2">
                {abrirEntradas ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                {abrirEntradas ? 'Ocultar alunos' : `Ver alunos pagos (${nEntradas})`}
              </span>
            </button>
            {abrirEntradas ? (
              <ul className={`mt-2 space-y-0 divide-y divide-emerald-100 px-2 py-1 text-xs text-emerald-950 ${SCROLL_LIST_RELATORIO_7}`}>
                {entradasAlunosPagosLinhas.map((l, idx) => (
                  <li key={`${l.aluno}-${idx}`} className="flex items-start justify-between gap-2 py-2 pr-1">
                    <span className="font-medium text-gray-900 break-words min-w-0">{l.aluno}</span>
                    <span className="shrink-0 text-sm font-semibold text-emerald-900 tabular-nums">{formatMoney(l.valor)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-xs text-emerald-800/80 rounded-lg border border-emerald-100 bg-white/50 px-2 py-2">
            {hasMonth
              ? 'Nenhum pagamento com status PAGO neste mês.'
              : 'Selecione um mês no filtro para listar os alunos com mensalidade paga. O total acima é a soma de todo o ano.'}
          </p>
        )}
      </div>
    </div>
  )
}

// --- Geral ---
function ReportGeral({ data, hasMonth, month, year }: { data: GeralData; hasMonth: boolean; month: number; year: number }) {
  const items = data?.items ?? []
  const receitaTotal = items.reduce((s, i) => s + (i.receita ?? 0), 0)
  const despesaTotal = items.reduce((s, i) => s + (i.totalDespesas ?? 0), 0)
  const saldoTotal = items.reduce((s, i) => s + (i.saldo ?? 0), 0)

  if (hasMonth && items.length === 1) {
    const i = items[0]
    const md = data
    const labelMes = MESES_LABELS[month] ?? `Mês ${month}`
    const chartRows = [
      {
        name: `${labelMes} ${year}`,
        receita: i?.receita ?? 0,
        despesas: i?.totalDespesas ?? 0,
        valorMatriculas: md.matriculadosValorTotal ?? 0,
        valorPerdido: md.valorPerdidoInativos ?? 0,
        qtdMatriculados: md.matriculadosCount ?? 0,
        qtdInativos: md.inativadosCount ?? 0,
      },
    ]

    const saude = md.escolaSaude

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
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
          <div className="rounded-xl border-2 border-violet-200 bg-violet-50 p-4">
            <p className="text-xs font-semibold text-violet-800 uppercase">Total Entrada Regis</p>
            <p className="text-xl font-bold text-violet-900 mt-1">{formatMoney(md.totalEntradaRegis ?? 0)}</p>
            <p className="text-xs font-normal text-violet-800/90 mt-2">
              Soma apenas das linhas em que o tipo de transação é <strong>Crédito</strong> (como na tabela de
              Movimentações). Lançamentos manuais sem extrato seguem o tipo Entrada/Saída.
            </p>
          </div>
        </div>

        <CubosSaidasMovimentacaoEEntradasAlunos
          totalSaidaRegis={data.totalSaidaRegis ?? 0}
          movimentacoesSaidaLinhas={data.movimentacoesSaidaLinhas ?? []}
          totalPagoAlunos={data.totalPagoAlunos ?? 0}
          entradasAlunosPagosLinhas={data.entradasAlunosPagosLinhas ?? []}
          hasMonth
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4">
            <p className="text-xs font-semibold text-blue-800 uppercase">Alunos matriculados (no mês)</p>
            <p className="text-2xl font-bold text-blue-900 mt-1">{md.matriculadosCount ?? '—'}</p>
            <p className="text-sm text-blue-800 mt-2">
              Valor total mensalidades: <span className="font-semibold">{formatMoney(md.matriculadosValorTotal)}</span>
              <span className="block text-xs font-normal text-blue-700/90 mt-1">
                Novos alunos no financeiro (formulário, cadastro manual, etc.).{' '}
                <strong>Não inclui</strong> quem entrou por importação de planilha (CSV). Bolsistas contam na quantidade;
                R$ 0 no valor.
              </span>
            </p>
          </div>
          <div className="rounded-xl border-2 border-orange-200 bg-orange-50 p-4">
            <p className="text-xs font-semibold text-orange-800 uppercase">Inativados neste mês</p>
            <p className="text-2xl font-bold text-orange-900 mt-1">{md.inativadosCount ?? '—'}</p>
            <p className="text-sm text-orange-800 mt-2">
              Valor estimado perdido: <span className="font-semibold">{formatMoney(md.valorPerdidoInativos)}</span>
              <span className="block text-xs font-normal text-orange-700/90 mt-1">Com base na mensalidade no cadastro (exceto bolsistas).</span>
            </p>
          </div>
        </div>

        <div className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
          Detalhe despesas — Prof.: {formatMoney(i?.despesaProfessores)} | Admin: {formatMoney(i?.despesaAdmin)} | Outras:{' '}
          {formatMoney(i?.despesaOutras)}
        </div>

        <VisaoGeralComposedChart chartRows={chartRows} />

        {saude && (
          <CuboSaudeEscola
            saude={saude}
            descricaoIndicador="Indicador automático a partir do saldo do mês, proporção receita/despesa e movimentação de alunos (matrículas x inativações)."
          />
        )}
      </div>
    )
  }

  if (!hasMonth && data.resumoAnual && items.length > 0) {
    const ra = data.resumoAnual
    const kpisPorMes = data.kpisPorMes ?? []
    const chartRowsAnual: GeralChartRow[] = items.map((row) => {
      const kp = kpisPorMes.find((k) => k.month === row.mes)
      return {
        name: `${(MESES_LABELS[row.mes] ?? row.mes).slice(0, 3)}.`,
        receita: row.receita,
        despesas: row.totalDespesas,
        valorMatriculas: kp?.matriculadosValorTotal ?? 0,
        valorPerdido: kp?.valorPerdidoInativos ?? 0,
        qtdMatriculados: kp?.matriculadosCount ?? 0,
        qtdInativos: kp?.inativadosCount ?? 0,
      }
    })
    const saudeAno = data.escolaSaude

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
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
          <div className="rounded-xl border-2 border-violet-200 bg-violet-50 p-4">
            <p className="text-xs font-semibold text-violet-800 uppercase">Total Entrada Regis</p>
            <p className="text-xl font-bold text-violet-900 mt-1">{formatMoney(data.totalEntradaRegis ?? 0)}</p>
            <p className="text-xs font-normal text-violet-800/90 mt-2">
              No ano, só entram linhas com tipo de transação <strong>Crédito</strong> (ou Entrada manual sem extrato).
            </p>
          </div>
        </div>

        <CubosSaidasMovimentacaoEEntradasAlunos
          totalSaidaRegis={data.totalSaidaRegis ?? 0}
          movimentacoesSaidaLinhas={data.movimentacoesSaidaLinhas ?? []}
          totalPagoAlunos={data.totalPagoAlunos ?? 0}
          entradasAlunosPagosLinhas={data.entradasAlunosPagosLinhas ?? []}
          hasMonth={false}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4">
            <p className="text-xs font-semibold text-blue-800 uppercase">Média mensal — novos alunos (financeiro)</p>
            <p className="text-2xl font-bold text-blue-900 mt-1">{ra.mediaMatriculados}</p>
            <p className="text-sm text-blue-800 mt-2">
              Média do valor mensalidades: <span className="font-semibold">{formatMoney(ra.mediaValorMensalidades)}</span>
              <span className="block text-xs font-normal text-blue-700/90 mt-1">
                Média dos 12 meses; conta só matrículas que <strong>não</strong> vieram de importação em lista (CSV).
                Bolsistas na quantidade; R$ 0 no valor.
              </span>
            </p>
          </div>
          <div className="rounded-xl border-2 border-orange-200 bg-orange-50 p-4">
            <p className="text-xs font-semibold text-orange-800 uppercase">Inativados no ano</p>
            <p className="text-2xl font-bold text-orange-900 mt-1">{ra.totalInativadosAno}</p>
            <p className="text-sm text-orange-800 mt-2">
              Valor estimado perdido (soma dos meses): <span className="font-semibold">{formatMoney(ra.valorPerdidoAno)}</span>
            </p>
          </div>
        </div>

        <VisaoGeralComposedChart chartRows={chartRowsAnual} compact />

        {saudeAno && (
          <CuboSaudeEscola
            saude={saudeAno}
            descricaoIndicador="Indicador automático a partir do saldo anual, proporção receita/despesa, média de alunos ativos e inativações no ano."
          />
        )}

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
                  <td className="px-4 py-2 text-sm text-gray-900">
                    {MESES_LABELS[r.mes]} {r.ano}
                  </td>
                  <td className="px-4 py-2 text-sm text-right text-gray-900">{formatMoney(r.receita)}</td>
                  <td className="px-4 py-2 text-sm text-right text-gray-900">{formatMoney(r.despesaProfessores)}</td>
                  <td className="px-4 py-2 text-sm text-right text-gray-900">{formatMoney(r.despesaAdmin)}</td>
                  <td className="px-4 py-2 text-sm text-right text-gray-900">{formatMoney(r.despesaOutras)}</td>
                  <td className="px-4 py-2 text-sm text-right text-gray-900">{formatMoney(r.totalDespesas)}</td>
                  <td className={`px-4 py-2 text-sm text-right font-medium ${r.saldo >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {formatMoney(r.saldo)}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                <td className="px-4 py-2 text-sm text-gray-900">Total {year}</td>
                <td className="px-4 py-2 text-sm text-right text-gray-900">{formatMoney(receitaTotal)}</td>
                <td className="px-4 py-2 text-sm text-right text-gray-900">
                  {formatMoney(items.reduce((s, i) => s + i.despesaProfessores, 0))}
                </td>
                <td className="px-4 py-2 text-sm text-right text-gray-900">
                  {formatMoney(items.reduce((s, i) => s + i.despesaAdmin, 0))}
                </td>
                <td className="px-4 py-2 text-sm text-right text-gray-900">
                  {formatMoney(items.reduce((s, i) => s + i.despesaOutras, 0))}
                </td>
                <td className="px-4 py-2 text-sm text-right text-gray-900">{formatMoney(despesaTotal)}</td>
                <td className={`px-4 py-2 text-sm text-right ${saldoTotal >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {formatMoney(saldoTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
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
        <div className="rounded-xl border-2 border-violet-200 bg-violet-50 p-4">
          <p className="text-xs font-semibold text-violet-800 uppercase">Total Entrada Regis</p>
          <p className="text-xl font-bold text-violet-900 mt-1">{formatMoney(data.totalEntradaRegis ?? 0)}</p>
          <p className="text-xs font-normal text-violet-800/90 mt-2">
            Apenas <strong>Crédito</strong> no período (mesma regra da coluna Tipo Transação em Movimentações).
          </p>
        </div>
      </div>

      <CubosSaidasMovimentacaoEEntradasAlunos
        totalSaidaRegis={data.totalSaidaRegis ?? 0}
        movimentacoesSaidaLinhas={data.movimentacoesSaidaLinhas ?? []}
        totalPagoAlunos={data.totalPagoAlunos ?? 0}
        entradasAlunosPagosLinhas={data.entradasAlunosPagosLinhas ?? []}
        hasMonth={hasMonth}
      />

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

