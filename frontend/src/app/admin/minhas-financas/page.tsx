'use client'

import { useCallback, useEffect, useState } from 'react'
import AdminLayout from '@/components/admin/AdminLayout'
import { Calendar, CheckCircle, ChevronDown, ChevronRight, Clock, Loader2, Wallet } from 'lucide-react'

const MESES_LABELS: Record<number, string> = {
  1: 'Janeiro',
  2: 'Fevereiro',
  3: 'Março',
  4: 'Abril',
  5: 'Maio',
  6: 'Junho',
  7: 'Julho',
  8: 'Agosto',
  9: 'Setembro',
  10: 'Outubro',
  11: 'Novembro',
  12: 'Dezembro',
}

const MESES_ABREV: Record<number, string> = {
  1: 'Jan',
  2: 'Fev',
  3: 'Mar',
  4: 'Abr',
  5: 'Mai',
  6: 'Jun',
  7: 'Jul',
  8: 'Ago',
  9: 'Set',
  10: 'Out',
  11: 'Nov',
  12: 'Dez',
}

const ANOS_DISPONIVEIS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i)

type FinanceSummary = {
  nome: string
  funcao: string | null
  year: number
  month: number
  valorAdm: number | null
  valorRepetido: boolean
  valorProfessorAulas: number | null
  totalAReceber: number
  paymentDueDay: number | null
  paymentStatus: 'PAGO' | 'EM_ABERTO' | null
  paidAt: string | null
  receiptUrl: string | null
  valorPendente: number | null
  linkedTeacherNome: string | null
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
}

export default function AdminMinhasFinancasPage() {
  const anoAtual = new Date().getFullYear()
  const mesAtual = new Date().getMonth() + 1
  const [selectedAno, setSelectedAno] = useState(anoAtual)
  const [selectedMes, setSelectedMes] = useState(mesAtual)
  const [showPeriodo, setShowPeriodo] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<FinanceSummary | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/admin/minhas-financas?year=${selectedAno}&month=${selectedMes}`,
        { credentials: 'include' }
      )
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setError(json.message || 'Erro ao carregar')
        setData(null)
        return
      }
      setData(json.data)
    } catch {
      setError('Erro de conexão')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [selectedAno, selectedMes])

  useEffect(() => {
    void load()
  }, [load])

  const mesNome = MESES_LABELS[selectedMes] ?? String(selectedMes)
  const diaPagamento =
    data?.paymentDueDay != null
      ? `Dia ${data.paymentDueDay} de ${mesNome}`
      : 'Sem dia de pagamento definido'

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Wallet className="w-7 h-7 text-brand-orange" />
          Minhas finanças
        </h1>
        <p className="text-gray-600 mt-1 text-sm">
          Seu salário administrativo e pagamento de aulas (se vinculado a professor), conforme cadastro em
          Financeiro → Administração.
        </p>

        <div className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setShowPeriodo((v) => !v)}
            className="w-full flex items-center gap-2 px-5 py-4 text-left text-base font-semibold text-gray-800 hover:bg-gray-50"
          >
            <Calendar className="w-5 h-5 text-brand-orange shrink-0" />
            <span>Período</span>
            {showPeriodo ? (
              <ChevronDown className="w-5 h-5 ml-auto" />
            ) : (
              <ChevronRight className="w-5 h-5 ml-auto" />
            )}
          </button>
          {showPeriodo && (
            <div className="px-5 pb-5 pt-0 border-t border-gray-100 space-y-4">
              <div className="pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ano</p>
                <div className="flex flex-wrap gap-2">
                  {ANOS_DISPONIVEIS.map((ano) => (
                    <button
                      key={ano}
                      type="button"
                      onClick={() => setSelectedAno(ano)}
                      className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                        selectedAno === ano
                          ? 'bg-brand-orange text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {ano}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Mês</p>
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSelectedMes(m)}
                      className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                        selectedMes === m
                          ? 'bg-brand-orange text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {MESES_ABREV[m]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
          </div>
        ) : error ? (
          <p className="mt-6 text-red-600">{error}</p>
        ) : data ? (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-gray-600">
              {data.nome}
              {data.funcao ? ` · ${data.funcao}` : ''}
              {' · '}
              {mesNome} de {selectedAno}
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-5 shadow-sm">
                <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
                  Total a receber
                </p>
                <p className="mt-2 text-2xl font-bold text-amber-900 tabular-nums">
                  {data.valorAdm != null || data.valorProfessorAulas != null
                    ? formatMoney(data.totalAReceber)
                    : '—'}
                </p>
                {data.valorAdm != null && (
                  <p className="mt-2 text-sm text-amber-900/80">
                    Salário ADM: {formatMoney(data.valorAdm)}
                    {data.valorRepetido ? ' (repetido do mês anterior)' : ''}
                  </p>
                )}
                {data.valorProfessorAulas != null && (
                  <p className="text-sm text-indigo-900/90">
                    Aulas ({data.linkedTeacherNome ?? 'professor'}):{' '}
                    {formatMoney(data.valorProfessorAulas)}
                  </p>
                )}
                {data.valorPendente != null && (
                  <p className="mt-2 text-xs font-medium text-amber-800 bg-amber-100 rounded-md px-2 py-1 inline-block">
                    Proposta de valor aguardando aprovação: {formatMoney(data.valorPendente)}
                  </p>
                )}
              </div>

              <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-5 shadow-sm">
                <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Data de pagamento
                </p>
                <p className="mt-2 text-lg font-semibold text-blue-900">{diaPagamento}</p>
              </div>
            </div>

            <div
              className={`rounded-xl border-2 p-5 shadow-sm ${
                data.paymentStatus === 'PAGO'
                  ? 'border-green-200 bg-green-50'
                  : 'border-orange-200 bg-orange-50'
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1">
                {data.paymentStatus === 'PAGO' ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-700" />
                    <span className="text-green-800">Pagamento realizado</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-4 h-4 text-orange-700" />
                    <span className="text-orange-800">Pagamento em aberto</span>
                  </>
                )}
              </p>
              {data.paymentStatus === 'PAGO' && data.paidAt ? (
                <p className="mt-2 text-green-900 font-medium">
                  Pago em {new Date(data.paidAt).toLocaleDateString('pt-BR')}
                </p>
              ) : (
                <p className="mt-2 text-orange-900 text-sm">
                  O pagamento deste mês ainda não foi confirmado pela administração.
                </p>
              )}
              {data.paymentStatus === 'PAGO' && data.receiptUrl && (
                <a
                  href={data.receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-sm text-brand-orange hover:underline"
                >
                  Ver comprovante
                </a>
              )}
            </div>

            {data.valorAdm == null && data.valorProfessorAulas == null && (
              <p className="text-sm text-gray-500 rounded-lg border border-gray-200 bg-gray-50 p-4">
                Nenhum valor cadastrado para este mês. A gestão define os valores em Financeiro →
                Administração.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </AdminLayout>
  )
}
