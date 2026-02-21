/**
 * Financeiro – Geral: painel com entradas, previsão de entradas e todas as saídas.
 * Entradas = mensalidades pagas. Previsão = mensalidades a receber (ativos não pagos).
 * Saídas = professores + admin + gastos (pagos e a pagar).
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import AdminLayout from '@/components/admin/AdminLayout'
import { Card } from '@/components/ui/Card'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts'
import { TrendingUp, TrendingDown, Loader2, ClipboardList } from 'lucide-react'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const ANOS_DISPONIVEIS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i)

interface DadoMes {
  mes: string
  mesNum: number
  entradas: number
  entradasPrevistas: number
  saidasProfessores: number
  saidasProfessoresAPagar: number
  saidasAdmin: number
  saidasAdminAPagar: number
  saidasGastos: number
  saidasGastosAPagar: number
}

function saidasTotal(d: DadoMes) {
  return d.saidasProfessores + d.saidasProfessoresAPagar + d.saidasAdmin + d.saidasAdminAPagar + d.saidasGastos + d.saidasGastosAPagar
}
function saidasPagas(d: DadoMes) {
  return d.saidasProfessores + d.saidasAdmin + d.saidasGastos
}

export default function FinanceiroGeralPage() {
  const anoAtual = new Date().getFullYear()
  const [selectedAno, setSelectedAno] = useState<number>(anoAtual)
  const [dados, setDados] = useState<DadoMes[]>([])
  const [totalEntradas, setTotalEntradas] = useState(0)
  const [totalEntradasPrevistas, setTotalEntradasPrevistas] = useState(0)
  const [totalSaidas, setTotalSaidas] = useState(0)
  const [totalSaidasPagas, setTotalSaidasPagas] = useState(0)
  const [totalSaidasAPagar, setTotalSaidasAPagar] = useState(0)
  const [saldo, setSaldo] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async (ano: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/financeiro/geral?year=${ano}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setDados([])
        setTotalEntradas(0)
        setTotalEntradasPrevistas(0)
        setTotalSaidas(0)
        setTotalSaidasPagas(0)
        setTotalSaidasAPagar(0)
        setSaldo(0)
        setError(json.message || 'Erro ao carregar')
        return
      }
      const data = json.data
      setDados(data.dados ?? [])
      setTotalEntradas(data.totalEntradas ?? 0)
      setTotalEntradasPrevistas(data.totalEntradasPrevistas ?? 0)
      setTotalSaidas(data.totalSaidas ?? 0)
      setTotalSaidasPagas(data.totalSaidasPagas ?? 0)
      setTotalSaidasAPagar(data.totalSaidasAPagar ?? 0)
      setSaldo(data.saldo ?? 0)
    } catch {
      setDados([])
      setTotalEntradas(0)
      setTotalEntradasPrevistas(0)
      setTotalSaidas(0)
      setTotalSaidasPagas(0)
      setTotalSaidasAPagar(0)
      setSaldo(0)
      setError('Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(selectedAno)
  }, [selectedAno, fetchData])

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Financeiro – Geral</h1>
            <p className="text-gray-600 mt-1">
              Entradas (mensalidades pagas + previsão), saídas (professores, admin, gastos – pagos e a pagar)
            </p>
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 mr-2">Ano:</label>
            <select
              value={selectedAno}
              onChange={(e) => setSelectedAno(Number(e.target.value))}
              className="input w-auto min-w-[100px]"
            >
              {ANOS_DISPONIVEIS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <Card className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-full bg-green-100">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Total Entradas</p>
                  <p className="text-xl font-bold text-gray-900">
                    R$ {totalEntradas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-gray-500">Mensalidades pagas</p>
                </div>
              </Card>
              <Card className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-full bg-emerald-100">
                  <ClipboardList className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Previsão Entradas</p>
                  <p className="text-xl font-bold text-gray-900">
                    R$ {totalEntradasPrevistas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-gray-500">A receber (ativos não pagos)</p>
                </div>
              </Card>
              <Card className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-full bg-red-100">
                  <TrendingDown className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Total Saídas</p>
                  <p className="text-xl font-bold text-gray-900">
                    R$ {totalSaidas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-gray-500">
                    Pagas: R$ {totalSaidasPagas.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} · A pagar: R$ {totalSaidasAPagar.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </p>
                </div>
              </Card>
              <Card className="p-4 flex items-center gap-4 col-span-1 lg:col-span-2">
                <div className={`p-3 rounded-full ${saldo >= 0 ? 'bg-blue-100' : 'bg-amber-100'}`}>
                  <span className={`text-xl font-bold ${saldo >= 0 ? 'text-blue-600' : 'text-amber-600'}`}>
                    {saldo >= 0 ? '+' : ''}R$ {saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Saldo do período</p>
                  <p className={`text-xl font-bold ${saldo >= 0 ? 'text-gray-900' : 'text-amber-700'}`}>
                    {selectedAno} (entradas − saídas pagas)
                  </p>
                </div>
              </Card>
            </div>

            <Card className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Entradas e Saídas por mês ({selectedAno})</h2>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={dados.map((d) => ({
                      ...d,
                      saidasPagas: saidasPagas(d),
                      saidasAPagar: saidasTotal(d) - saidasPagas(d),
                    }))}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(value: number) => [`R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, '']}
                      labelFormatter={(label) => `Mês: ${label}`}
                    />
                    <Legend />
                    <Bar dataKey="entradas" name="Entradas (pagas)" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="entradasPrevistas" name="Previsão entradas" fill="#34d399" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="saidasPagas" name="Saídas pagas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="saidasAPagar" name="Saídas a pagar" fill="#f97316" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Evolução mensal (saldo) – {selectedAno}</h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={dados.map((d) => ({
                      ...d,
                      saldo: d.entradas - saidasPagas(d),
                      saldoPrevisto: d.entradas + d.entradasPrevistas - saidasTotal(d),
                    }))}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(value: number) => [
                        `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                      ]}
                      labelFormatter={(label) => `Mês: ${label}`}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="saldo" name="Saldo (real)" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="saldoPrevisto" name="Saldo previsto" stroke="#a78bfa" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </>
        )}
      </div>
    </AdminLayout>
  )
}
