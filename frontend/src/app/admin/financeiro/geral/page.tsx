/**
 * Financeiro – Geral: painel com gráficos de entradas e saídas (dados reais).
 * Entradas = mensalidades dos alunos marcadas como PAGO no mês.
 * Saídas = pagamentos aos professores marcados como PAGO no mês.
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
import { TrendingUp, TrendingDown, Loader2 } from 'lucide-react'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const ANOS_DISPONIVEIS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i)

interface DadoMes {
  mes: string
  mesNum: number
  entradas: number
  saidas: number
}

export default function FinanceiroGeralPage() {
  const anoAtual = new Date().getFullYear()
  const [selectedAno, setSelectedAno] = useState<number>(anoAtual)
  const [dados, setDados] = useState<DadoMes[]>([])
  const [totalEntradas, setTotalEntradas] = useState(0)
  const [totalSaidas, setTotalSaidas] = useState(0)
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
        setTotalSaidas(0)
        setSaldo(0)
        setError(json.message || 'Erro ao carregar')
        return
      }
      const data = json.data
      setDados(data.dados ?? [])
      setTotalEntradas(data.totalEntradas ?? 0)
      setTotalSaidas(data.totalSaidas ?? 0)
      setSaldo(data.saldo ?? 0)
    } catch {
      setDados([])
      setTotalEntradas(0)
      setTotalSaidas(0)
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
            <p className="text-gray-600 mt-1">Entradas (mensalidades pagas) e saídas (pagamentos a professores) por mês</p>
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-full bg-green-100">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Total Entradas</p>
                  <p className="text-xl font-bold text-gray-900">
                    R$ {totalEntradas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
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
                </div>
              </Card>
              <Card className="p-4 flex items-center gap-4">
                <div className={`p-3 rounded-full ${saldo >= 0 ? 'bg-blue-100' : 'bg-amber-100'}`}>
                  <span className={`text-xl font-bold ${saldo >= 0 ? 'text-blue-600' : 'text-amber-600'}`}>
                    {saldo >= 0 ? '+' : ''}R$ {saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Saldo do período</p>
                  <p className={`text-xl font-bold ${saldo >= 0 ? 'text-gray-900' : 'text-amber-700'}`}>
                    {selectedAno}
                  </p>
                </div>
              </Card>
            </div>

            <Card className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Entradas x Saídas por mês ({selectedAno})</h2>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dados} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(value: number) => [`R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, '']}
                      labelFormatter={(label) => `Mês: ${label}`}
                    />
                    <Legend />
                    <Bar dataKey="entradas" name="Entradas" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="saidas" name="Saídas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Evolução mensal (saldo) – {selectedAno}</h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={dados.map((d) => ({ ...d, saldo: d.entradas - d.saidas }))}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(value: number) => [`R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Saldo']}
                      labelFormatter={(label) => `Mês: ${label}`}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="saldo" name="Saldo" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
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
