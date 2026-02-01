/**
 * Financeiro – Geral: painel com gráficos de entradas e saídas
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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

// Dados de exemplo – depois podem vir da API
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function getDadosExemplo() {
  const ano = new Date().getFullYear()
  return MESES.map((mes, i) => ({
    mes,
    ano,
    entradas: Math.round(12000 + Math.random() * 8000),
    saidas: Math.round(6000 + Math.random() * 5000),
  }))
}

export default function FinanceiroGeralPage() {
  const router = useRouter()
  const [dados, setDados] = useState<{ mes: string; entradas: number; saidas: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Simula carregamento – depois substituir por API real
    const t = setTimeout(() => {
      setDados(getDadosExemplo())
      setLoading(false)
    }, 600)
    return () => clearTimeout(t)
  }, [])

  const totalEntradas = dados.reduce((s, d) => s + d.entradas, 0)
  const totalSaidas = dados.reduce((s, d) => s + d.saidas, 0)
  const saldo = totalEntradas - totalSaidas

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Financeiro – Geral</h1>
          <p className="text-gray-600 mt-1">Painel de entradas e saídas</p>
        </div>

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
                    R$ {totalEntradas.toLocaleString('pt-BR')}
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
                    R$ {totalSaidas.toLocaleString('pt-BR')}
                  </p>
                </div>
              </Card>
              <Card className="p-4 flex items-center gap-4">
                <div className={`p-3 rounded-full ${saldo >= 0 ? 'bg-blue-100' : 'bg-amber-100'}`}>
                  <span className={`text-xl font-bold ${saldo >= 0 ? 'text-blue-600' : 'text-amber-600'}`}>
                    {saldo >= 0 ? '+' : ''}R$ {saldo.toLocaleString('pt-BR')}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Saldo</p>
                  <p className={`text-xl font-bold ${saldo >= 0 ? 'text-gray-900' : 'text-amber-700'}`}>
                    Saldo do período
                  </p>
                </div>
              </Card>
            </div>

            <Card className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Entradas x Saídas por mês</h2>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dados} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, '']}
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
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Evolução mensal (saldo)</h2>
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
                      formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, 'Saldo']}
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
