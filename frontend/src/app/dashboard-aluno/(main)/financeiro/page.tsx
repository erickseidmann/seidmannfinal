/**
 * Dashboard Aluno – Financeiro (mensalidade e status de pagamento por mês).
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Wallet, Calendar, DollarSign, CheckCircle, AlertCircle } from 'lucide-react'

const MESES_LABELS: Record<number, string> = {
  1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 6: 'Junho',
  7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro',
}
const ANOS_DISPONIVEIS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i)

interface FinanceiroData {
  valorMensal: number | null
  statusMes: string | null
  notaFiscalEmitida: boolean | null
  diaPagamento: number | null
  dataUltimoPagamento: string | null
  metodoPagamento: string | null
  year: number
  month: number
  enrollmentId: string
}

function formatMoney(n: number): string {
  return `R$ ${Number(n).toFixed(2).replace('.', ',')}`
}

function statusLabel(status: string | null): string {
  if (!status) return '—'
  const map: Record<string, string> = {
    PAGO: 'Pago',
    PENDING: 'Pendente',
    ATRASADO: 'Atrasado',
    EM_ABERTO: 'Em aberto',
  }
  return map[status] || status
}

export default function FinanceiroAlunoPage() {
  const anoAtual = new Date().getFullYear()
  const mesAtual = new Date().getMonth() + 1
  const [selectedAno, setSelectedAno] = useState<number>(anoAtual)
  const [selectedMes, setSelectedMes] = useState<number>(mesAtual)

  const [data, setData] = useState<FinanceiroData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async (ano: number, mes: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/student/financeiro?year=${ano}&month=${mes}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setData(null)
        setError(json.message || 'Erro ao carregar')
        return
      }
      setData(json.data ?? null)
    } catch {
      setData(null)
      setError('Erro ao carregar dados financeiros')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(selectedAno, selectedMes)
  }, [selectedAno, selectedMes, fetchData])

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Financeiro</h1>
      <p className="text-gray-600 mb-6">
        Valor da mensalidade e status de pagamento por mês. Dados somente para consulta.
      </p>

      <div className="flex flex-wrap items-center gap-4 mb-6">
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Ano</span>
          <select
            value={selectedAno}
            onChange={(e) => setSelectedAno(Number(e.target.value))}
            className="input w-auto min-w-[100px]"
          >
            {ANOS_DISPONIVEIS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Mês</span>
          <select
            value={selectedMes}
            onChange={(e) => setSelectedMes(Number(e.target.value))}
            className="input w-auto min-w-[140px]"
          >
            {Object.entries(MESES_LABELS).map(([num, label]) => (
              <option key={num} value={num}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm">
          {error}
        </div>
      )}

      {loading && (
        <div className="mb-6 text-gray-500">Carregando...</div>
      )}

      {!loading && data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            <div className="p-5 bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-brand-orange/10">
                  <DollarSign className="w-6 h-6 text-brand-orange" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Valor da mensalidade</p>
                  <p className="text-xl font-bold text-gray-900">
                    {data.valorMensal != null ? formatMoney(data.valorMensal) : '—'}
                  </p>
                </div>
              </div>
            </div>
            <div className="p-5 bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${data.statusMes === 'PAGO' ? 'bg-green-100' : 'bg-amber-100'}`}>
                  {data.statusMes === 'PAGO' ? (
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  ) : (
                    <AlertCircle className="w-6 h-6 text-amber-600" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Status do mês</p>
                  <p className="text-lg font-bold text-gray-900">
                    {statusLabel(data.statusMes)}
                  </p>
                </div>
              </div>
            </div>
            <div className="p-5 bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gray-100">
                  <Calendar className="w-6 h-6 text-gray-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Dia de pagamento</p>
                  <p className="text-xl font-bold text-gray-900">
                    {data.diaPagamento != null ? `${data.diaPagamento}º` : '—'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-lg font-semibold text-gray-800">
                {MESES_LABELS[data.month]} de {data.year}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">Resumo financeiro do mês selecionado</p>
            </div>
            <div className="p-6 space-y-4">
              {data.metodoPagamento && (
                <p className="text-sm">
                  <span className="font-medium text-gray-700">Método de pagamento:</span>{' '}
                  <span className="text-gray-800">{data.metodoPagamento}</span>
                </p>
              )}
              {data.dataUltimoPagamento && (
                <p className="text-sm">
                  <span className="font-medium text-gray-700">Último pagamento registrado:</span>{' '}
                  <span className="text-gray-800">
                    {new Date(data.dataUltimoPagamento).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                </p>
              )}
              {data.notaFiscalEmitida === true && (
                <p className="text-sm text-green-700 font-medium">Nota fiscal emitida para este mês.</p>
              )}
            </div>
          </div>
        </>
      )}

      {!loading && !data && !error && (
        <div className="max-w-md p-8 bg-gray-50 border border-gray-200 rounded-xl text-center">
          <Wallet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Nenhum dado financeiro disponível para o período.</p>
        </div>
      )}
    </div>
  )
}
