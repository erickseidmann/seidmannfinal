/**
 * Financeiro – Cobranças (Boletos Cora)
 * Visualizar e gerenciar boletos PIX/boleto gerados na Cora.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import AdminLayout from '@/components/admin/AdminLayout'
import Button from '@/components/ui/Button'
import Toast from '@/components/admin/Toast'
import {
  Loader2,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  ExternalLink,
  Copy,
  RefreshCw,
  Send,
} from 'lucide-react'

const MESES_LABELS: Record<number, string> = {
  1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 6: 'Junho',
  7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro',
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Aberto',
  PAID: 'Pago',
  CANCELLED: 'Cancelado',
  LATE: 'Atrasado',
}

interface Invoice {
  id: string
  coraInvoiceId: string
  enrollmentId: string
  alunoNome: string
  year: number
  month: number
  amount: number
  dueDate: string
  status: string
  boletoUrl: string | null
  pixCopyPaste: string | null
  paidAt: string | null
  criadoEm: string
}

interface Summary {
  total: number
  open: number
  paid: number
  cancelled: number
  late: number
  thisMonth: number
}

export default function FinanceiroCobrancasPage() {
  const anoAtual = new Date().getFullYear()
  const mesAtual = new Date().getMonth() + 1

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [yearFilter, setYearFilter] = useState(anoAtual)
  const [monthFilter, setMonthFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [webhookStatus, setWebhookStatus] = useState<unknown[] | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (yearFilter) params.set('year', String(yearFilter))
      if (monthFilter) params.set('month', monthFilter)
      if (statusFilter) params.set('status', statusFilter)
      const res = await fetch(`/api/admin/financeiro/cobrancas?${params.toString()}`, {
        credentials: 'include',
      })
      const json = await res.json()
      if (res.ok && json.ok) {
        setInvoices(json.data ?? [])
        setSummary(json.summary ?? null)
      } else {
        setInvoices([])
        setSummary(null)
      }
    } catch {
      setInvoices([])
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }, [yearFilter, monthFilter, statusFilter])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const handleGenerate = async () => {
    setGenerating(true)
    setToast(null)
    try {
      const res = await fetch('/api/admin/financeiro/cobrancas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ year: yearFilter, month: monthFilter || mesAtual }),
      })
      const json = await res.json()
      if (res.ok && json.ok) {
        setToast({ message: `${json.success} boletos gerados com sucesso`, type: 'success' })
        await fetchData()
      } else {
        setToast({
          message: json.message || 'Erro ao gerar boletos',
          type: 'error',
        })
      }
    } catch {
      setToast({ message: 'Erro ao gerar boletos', type: 'error' })
    } finally {
      setGenerating(false)
    }
  }

  const handleCopyPix = (pix: string) => {
    navigator.clipboard.writeText(pix)
    setToast({ message: 'PIX copiado!', type: 'success' })
  }

  const handleCancel = async (invoiceId: string) => {
    if (!confirm('Tem certeza que deseja cancelar este boleto?')) return
    setCancellingId(invoiceId)
    setToast(null)
    try {
      const res = await fetch(`/api/admin/financeiro/cobrancas/${invoiceId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json()
      if (res.ok && json.ok) {
        setToast({ message: 'Boleto cancelado', type: 'success' })
        await fetchData()
      } else {
        setToast({ message: json.message || 'Erro ao cancelar', type: 'error' })
      }
    } catch {
      setToast({ message: 'Erro ao cancelar boleto', type: 'error' })
    } finally {
      setCancellingId(null)
    }
  }

  const fetchWebhookStatus = async () => {
    try {
      const res = await fetch('/api/admin/cora/webhook-status', { credentials: 'include' })
      const json = await res.json()
      if (res.ok && json.ok) {
        setWebhookStatus(json.endpoints ?? [])
      }
    } catch {
      setWebhookStatus([])
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Financeiro – Cobranças</h1>
            <p className="text-gray-600 mt-1">
              Boletos e PIX gerados na Cora. O cron gera boletos automaticamente 15 dias antes do vencimento.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void handleGenerate()} disabled={generating}>
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Gerar boletos do mês
                </>
              )}
            </Button>
            <Button variant="outline" onClick={fetchWebhookStatus}>
              <Send className="w-4 h-4 mr-2" />
              Ver webhooks
            </Button>
          </div>
        </div>

        {toast && (
          <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
        )}

        {webhookStatus !== null && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <h3 className="font-semibold text-gray-800 mb-2">Webhooks Cora</h3>
            {webhookStatus.length === 0 ? (
              <p className="text-sm text-gray-600">Nenhum webhook cadastrado. Execute o script: npx tsx src/scripts/setup-cora-webhook.ts</p>
            ) : (
              <pre className="text-xs overflow-x-auto bg-white p-3 rounded border">
                {JSON.stringify(webhookStatus, null, 2)}
              </pre>
            )}
            <button
              type="button"
              onClick={() => setWebhookStatus(null)}
              className="mt-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Fechar
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
          </div>
        ) : (
          <>
            {summary && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-blue-100 p-2">
                      <FileText className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Este mês</p>
                      <p className="text-2xl font-bold text-gray-900">{summary.thisMonth}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-amber-100 p-2">
                      <Clock className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Pendentes</p>
                      <p className="text-2xl font-bold text-gray-900">{summary.open + summary.late}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-emerald-100 p-2">
                      <CheckCircle className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Pagos</p>
                      <p className="text-2xl font-bold text-gray-900">{summary.paid}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-red-100 p-2">
                      <XCircle className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Cancelados</p>
                      <p className="text-2xl font-bold text-gray-900">{summary.cancelled}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-orange-100 p-2">
                      <AlertCircle className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Total</p>
                      <p className="text-2xl font-bold text-gray-900">{summary.total}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="flex flex-wrap items-center gap-4 p-4 border-b border-gray-100 bg-gray-50">
                <span className="text-sm font-medium text-gray-700">Filtros:</span>
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
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="input py-2 text-sm w-36"
                >
                  <option value="">Todos os status</option>
                  {Object.entries(STATUS_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
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
                      <th className="text-left px-4 py-3 font-semibold text-gray-700">Mês/Ano</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-700">Valor</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-700">Vencimento</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-700">Status</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-700">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                          Nenhum boleto encontrado.
                        </td>
                      </tr>
                    ) : (
                      invoices.map((inv) => (
                        <tr key={inv.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{inv.alunoNome}</td>
                          <td className="px-4 py-3 text-gray-600">
                            {MESES_LABELS[inv.month] ?? inv.month}/{inv.year}
                          </td>
                          <td className="px-4 py-3 text-gray-900">{formatMoney(inv.amount)}</td>
                          <td className="px-4 py-3 text-gray-600">{formatDate(inv.dueDate)}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                                inv.status === 'PAID'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : inv.status === 'CANCELLED'
                                    ? 'bg-red-100 text-red-800'
                                    : inv.status === 'LATE'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {STATUS_LABELS[inv.status] ?? inv.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {inv.boletoUrl && (
                                <a
                                  href={inv.boletoUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-brand-orange hover:underline inline-flex items-center gap-1"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                  Boleto
                                </a>
                              )}
                              {inv.pixCopyPaste && inv.status !== 'PAID' && (
                                <button
                                  type="button"
                                  onClick={() => handleCopyPix(inv.pixCopyPaste!)}
                                  className="text-brand-orange hover:underline inline-flex items-center gap-1"
                                >
                                  <Copy className="w-4 h-4" />
                                  Copiar PIX
                                </button>
                              )}
                              {(inv.status === 'OPEN' || inv.status === 'LATE') && (
                                <button
                                  type="button"
                                  onClick={() => handleCancel(inv.id)}
                                  disabled={cancellingId === inv.id}
                                  className="text-red-600 hover:underline inline-flex items-center gap-1 disabled:opacity-50"
                                >
                                  {cancellingId === inv.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <XCircle className="w-4 h-4" />
                                  )}
                                  Cancelar
                                </button>
                              )}
                            </div>
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
