/**
 * Financeiro – Notificações
 * Exibe últimas notificações de pagamento enviadas, resumos e alunos em risco.
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import AdminLayout from '@/components/admin/AdminLayout'
import { Loader2, Mail, AlertTriangle, AlertCircle, UserX, Send, ChevronDown } from 'lucide-react'

const MESES_LABELS: Record<number, string> = {
  1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 6: 'Junho',
  7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro',
}

function getTipoLabel(type: string): string {
  const labels: Record<string, string> = {
    reminder_10: 'Lembrete (10 dias)',
    reminder_5: 'Lembrete (5 dias)',
    reminder_3: 'Lembrete (3 dias)',
    payment_confirmed: 'Pagamento confirmado',
    deactivated: 'Matrícula suspensa',
  }
  if (labels[type]) return labels[type]
  const m = type.match(/^overdue_(\d+)$/)
  if (m) return `Atraso (${m[1]} ${Number(m[1]) === 1 ? 'dia' : 'dias'})`
  return type
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

function AlunoAcoesDropdown({
  item,
  variant,
  onEnviarCobranca,
  onDesativar,
  loadingCobranca,
  loadingDesativar,
}: {
  item: AtRiskItem
  variant: 'atRisk' | 'toDeactivate'
  onEnviarCobranca: (id: string, nome: string) => void
  onDesativar: (id: string, nome: string) => void
  loadingCobranca: string | null
  loadingDesativar: string | null
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [open])

  const isRed = variant === 'toDeactivate'
  const baseCls = isRed ? 'text-red-800' : 'text-amber-800'
  return (
    <div ref={ref} className="relative inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1 font-medium hover:underline ${baseCls}`}
      >
        {item.nome}
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-10 min-w-[180px] rounded-lg border border-gray-200 bg-white shadow-lg py-1">
          <button
            type="button"
            onClick={() => {
              onEnviarCobranca(item.id, item.nome)
              setOpen(false)
            }}
            disabled={!!loadingCobranca}
            className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
          >
            {loadingCobranca === item.id ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4 text-green-600" />
            )}
            Enviar cobrança
          </button>
          <button
            type="button"
            onClick={() => {
              onDesativar(item.id, item.nome)
              setOpen(false)
            }}
            disabled={!!loadingDesativar}
            className="w-full px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 flex items-center gap-2"
          >
            {loadingDesativar === item.id ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <UserX className="w-4 h-4" />
            )}
            Desativar aluno
          </button>
        </div>
      )}
    </div>
  )
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
  const [loadingCobranca, setLoadingCobranca] = useState<string | null>(null)
  const [loadingDesativar, setLoadingDesativar] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

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

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const handleEnviarCobranca = useCallback(async (id: string, nome: string) => {
    setLoadingCobranca(id)
    try {
      const res = await fetch(`/api/admin/financeiro/alunos/${id}/enviar-cobranca`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      })
      const json = await res.json()
      if (res.ok && json.ok) {
        setToast({ message: `Cobrança enviada para ${nome}.`, type: 'success' })
        void fetchData()
      } else {
        setToast({ message: json.message || 'Erro ao enviar cobrança.', type: 'error' })
      }
    } catch {
      setToast({ message: 'Erro ao enviar cobrança.', type: 'error' })
    } finally {
      setLoadingCobranca(null)
    }
  }, [fetchData])

  const handleDesativar = useCallback(async (id: string, nome: string) => {
    if (!confirm(`Desativar o aluno ${nome}? Esta ação marcará a matrícula como inativa.`)) return
    setLoadingDesativar(id)
    try {
      const res = await fetch(`/api/admin/enrollments/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'INACTIVE' }),
      })
      const json = await res.json()
      if (res.ok && json.ok) {
        setToast({ message: `${nome} desativado.`, type: 'success' })
        void fetchData()
      } else {
        setToast({ message: json.message || 'Erro ao desativar.', type: 'error' })
      }
    } catch {
      setToast({ message: 'Erro ao desativar.', type: 'error' })
    } finally {
      setLoadingDesativar(null)
    }
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

        {toast && (
          <div
            className={`rounded-lg border p-4 text-sm ${
              toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {toast.message}
          </div>
        )}

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
                      <p className="text-sm text-gray-500">Em risco (20-30 dias atraso)</p>
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
                    <h2 className="font-semibold text-amber-900 mb-2">Alunos em risco (20-30 dias de atraso)</h2>
                    <ul className="space-y-1 text-sm">
                      {atRisk.map((e) => (
                        <li key={e.id} className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                          <AlunoAcoesDropdown
                            item={e}
                            variant="atRisk"
                            onEnviarCobranca={handleEnviarCobranca}
                            onDesativar={handleDesativar}
                            loadingCobranca={loadingCobranca}
                            loadingDesativar={loadingDesativar}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {toDeactivate.length > 0 && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                    <h2 className="font-semibold text-red-900 mb-2">Serão desativados no próximo cron (após 1 mês de atraso)</h2>
                    <ul className="space-y-1 text-sm">
                      {toDeactivate.map((e) => (
                        <li key={e.id} className="flex items-center gap-2">
                          <UserX className="w-4 h-4 text-red-600 shrink-0" />
                          <AlunoAcoesDropdown
                            item={e}
                            variant="toDeactivate"
                            onEnviarCobranca={handleEnviarCobranca}
                            onDesativar={handleDesativar}
                            loadingCobranca={loadingCobranca}
                            loadingDesativar={loadingDesativar}
                          />
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
                  {['reminder_10', 'reminder_5', 'reminder_3', 'overdue_1', 'payment_confirmed', 'deactivated'].map((v) => (
                    <option key={v} value={v}>{getTipoLabel(v)}</option>
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
                          <td className="px-4 py-3 text-gray-700">{getTipoLabel(n.type)}</td>
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
