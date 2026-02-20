/**
 * Financeiro – Notificações
 * Exibe últimas notificações de pagamento enviadas, resumos e alunos em risco.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import AdminLayout from '@/components/admin/AdminLayout'
import { Loader2, Mail, AlertTriangle, AlertCircle, UserX } from 'lucide-react'

const MESES_LABELS: Record<number, string> = {
  1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 6: 'Junho',
  7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro',
}

const TIPO_LABELS: Record<string, string> = {
  reminder_10: 'Lembrete (10 dias)',
  reminder_5: 'Lembrete (5 dias)',
  reminder_3: 'Lembrete (3 dias)',
  overdue_1: 'Atraso (1 dia)',
  overdue_2: 'Atraso (2 dias)',
  overdue_3: 'Atraso (3 dias)',
  overdue_4: 'Atraso (4 dias)',
  overdue_5: 'Atraso (5 dias)',
  overdue_6: 'Atraso (6 dias)',
  overdue_7: 'Atraso (7 dias)',
  overdue_8: 'Atraso (8 dias)',
  payment_confirmed: 'Pagamento confirmado',
  deactivated: 'Matrícula suspensa',
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface Notification {
  id: string
  enrollmentId: string
  alunoNome: string
  type: string
  year: number
  month: number
  sentAt: string
  emailTo: string
  success: boolean
  errorMessage: string | null
}

interface Summary {
  sentToday: number
  errorsToday: number
  atRiskCount: number
  toDeactivateCount: number
}

interface AtRiskItem {
  id: string
  nome: string
}

export default function FinanceiroNotificacoesPage() {
  const anoAtual = new Date().getFullYear()
  const mesAtual = new Date().getMonth() + 1

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [atRisk, setAtRisk] = useState<AtRiskItem[]>([])
  const [toDeactivate, setToDeactivate] = useState<AtRiskItem[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [yearFilter, setYearFilter] = useState(anoAtual)
  const [monthFilter, setMonthFilter] = useState<string>('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (typeFilter) params.set('type', typeFilter)
      if (yearFilter) params.set('year', String(yearFilter))
      if (monthFilter) params.set('month', monthFilter)
      const res = await fetch(`/api/admin/financeiro/notificacoes?${params.toString()}`, {
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setNotifications([])
        setSummary(null)
        setAtRisk([])
        setToDeactivate([])
        return
      }
      const d = json.data
      setNotifications(d.notifications ?? [])
      setSummary(d.summary ?? null)
      setAtRisk(d.atRisk ?? [])
      setToDeactivate(d.toDeactivate ?? [])
    } catch {
      setNotifications([])
      setSummary(null)
      setAtRisk([])
      setToDeactivate([])
    } finally {
      setLoading(false)
    }
  }, [typeFilter, yearFilter, monthFilter])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Financeiro – Notificações</h1>
          <p className="text-gray-600 mt-1">
            Histórico de emails de cobrança, lembretes e confirmações de pagamento.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
          </div>
        ) : (
          <>
            {summary && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-emerald-100 p-2">
                      <Mail className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Enviados hoje</p>
                      <p className="text-2xl font-bold text-gray-900">{summary.sentToday}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-red-100 p-2">
                      <AlertCircle className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Erros hoje</p>
                      <p className="text-2xl font-bold text-gray-900">{summary.errorsToday}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-amber-100 p-2">
                      <AlertTriangle className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Em risco (5-8 dias atraso)</p>
                      <p className="text-2xl font-bold text-gray-900">{summary.atRiskCount}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-red-100 p-2">
                      <UserX className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Serão desativados</p>
                      <p className="text-2xl font-bold text-gray-900">{summary.toDeactivateCount}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {(atRisk.length > 0 || toDeactivate.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {atRisk.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <h2 className="font-semibold text-amber-900 mb-2">Alunos em risco (5-8 dias de atraso)</h2>
                    <ul className="space-y-1 text-sm">
                      {atRisk.map((e) => (
                        <li key={e.id} className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                          <a
                            href={`/admin/financeiro/alunos?enrollment=${e.id}`}
                            className="text-amber-800 hover:underline"
                          >
                            {e.nome}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {toDeactivate.length > 0 && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                    <h2 className="font-semibold text-red-900 mb-2">Serão desativados no próximo cron</h2>
                    <ul className="space-y-1 text-sm">
                      {toDeactivate.map((e) => (
                        <li key={e.id} className="flex items-center gap-2">
                          <UserX className="w-4 h-4 text-red-600 shrink-0" />
                          <a
                            href={`/admin/financeiro/alunos?enrollment=${e.id}`}
                            className="text-red-800 hover:underline"
                          >
                            {e.nome}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="flex flex-wrap items-center gap-4 p-4 border-b border-gray-100 bg-gray-50">
                <span className="text-sm font-medium text-gray-700">Filtros:</span>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="input py-2 text-sm w-48"
                >
                  <option value="">Todos os tipos</option>
                  {Object.entries(TIPO_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
                <select
                  value={yearFilter}
                  onChange={(e) => setYearFilter(Number(e.target.value))}
                  className="input py-2 text-sm w-24"
                >
                  {[anoAtual, anoAtual - 1, anoAtual - 2].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <select
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  className="input py-2 text-sm w-36"
                >
                  <option value="">Todos os meses</option>
                  {Object.entries(MESES_LABELS).map(([num, label]) => (
                    <option key={num} value={num}>{label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void fetchData()}
                  className="text-sm font-medium text-brand-orange hover:text-orange-700"
                >
                  Atualizar
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-gray-700">Aluno</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-700">Tipo</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-700">Mês/Ano</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-700">Data envio</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-700">Email</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-700">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notifications.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                          Nenhuma notificação encontrada.
                        </td>
                      </tr>
                    ) : (
                      notifications.map((n) => (
                        <tr key={n.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{n.alunoNome}</td>
                          <td className="px-4 py-3 text-gray-700">{TIPO_LABELS[n.type] ?? n.type}</td>
                          <td className="px-4 py-3 text-gray-600">
                            {MESES_LABELS[n.month] ?? n.month}/{n.year}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{formatDate(n.sentAt)}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{n.emailTo}</td>
                          <td className="px-4 py-3">
                            {n.success ? (
                              <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">
                                Enviado
                              </span>
                            ) : (
                              <span
                                className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800"
                                title={n.errorMessage ?? 'Erro'}
                              >
                                Erro
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  )
}
