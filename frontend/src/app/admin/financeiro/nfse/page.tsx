/**
 * Financeiro – Notas Fiscais de Serviço (NFSe)
 * Interface para gerenciar emissão, consulta e cancelamento de NFSe.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import AdminLayout from '@/components/admin/AdminLayout'
import Modal from '@/components/admin/Modal'
import Button from '@/components/ui/Button'
import Toast from '@/components/admin/Toast'
import {
  Loader2,
  FileText,
  Download,
  RefreshCw,
  Trash2,
  FileDown,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Ban,
} from 'lucide-react'

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

const ANOS_DISPONIVEIS = (() => {
  const current = new Date().getFullYear()
  return Array.from({ length: current - 2024 + 2 }, (_, i) => 2024 + i)
})()

interface NfseRecord {
  id: string
  enrollmentId: string
  studentName: string
  cpf: string
  year: number
  month: number
  amount: number
  focusRef: string
  status: string
  numero?: string
  codigoVerificacao?: string
  pdfUrl?: string
  xmlUrl?: string
  errorMessage?: string
  createdAt: string
  updatedAt: string
  cancelledAt?: string
  cancelReason?: string
}

interface NfseListResponse {
  ok: boolean
  enabled?: boolean
  notas: NfseRecord[]
  total: number
  autorizadas: number
  canceladas: number
  pendentes: number
  erros: number
}

function formatMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
}

function maskCPF(cpf: string | null): string {
  if (!cpf) return '—'
  const digits = cpf.replace(/\D/g, '')
  if (digits.length !== 11) return cpf
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`
}

function getStatusBadge(status: string, cancelledAt?: string) {
  if (cancelledAt) {
    return {
      label: 'Cancelada',
      className: 'bg-gray-100 text-gray-700',
      icon: Ban,
    }
  }
  switch (status) {
    case 'autorizado':
      return {
        label: 'Autorizada',
        className: 'bg-green-100 text-green-800',
        icon: CheckCircle2,
      }
    case 'processando_autorizacao':
      return {
        label: 'Processando',
        className: 'bg-yellow-100 text-yellow-800',
        icon: Clock,
      }
    case 'erro_autorizacao':
      return {
        label: 'Erro',
        className: 'bg-red-100 text-red-800',
        icon: XCircle,
      }
    case 'cancelado':
      return {
        label: 'Cancelada',
        className: 'bg-gray-100 text-gray-700',
        icon: Ban,
      }
    default:
      return {
        label: status,
        className: 'bg-gray-100 text-gray-700',
        icon: AlertCircle,
      }
  }
}

export default function FinanceiroNfsePage() {
  const anoAtual = new Date().getFullYear()
  const mesAtual = new Date().getMonth() + 1
  const [year, setYear] = useState(anoAtual)
  const [month, setMonth] = useState(mesAtual)
  const [notas, setNotas] = useState<NfseRecord[]>([])
  const [stats, setStats] = useState({ total: 0, autorizadas: 0, canceladas: 0, pendentes: 0, erros: 0 })
  const [loading, setLoading] = useState(true)
  /** NFSe habilitada no servidor (null = ainda não veio resposta da API) */
  const [nfseEnabled, setNfseEnabled] = useState<boolean | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [emitirModalOpen, setEmitirModalOpen] = useState(false)
  const [emitindo, setEmitindo] = useState(false)
  const [cancelarModalOpen, setCancelarModalOpen] = useState(false)
  const [notaParaCancelar, setNotaParaCancelar] = useState<NfseRecord | null>(null)
  const [justificativa, setJustificativa] = useState('')
  const [cancelando, setCancelando] = useState(false)
  const [atualizandoRef, setAtualizandoRef] = useState<string | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [emitirResultado, setEmitirResultado] = useState<{
    emitidas: number
    erros: number
    detalhes: Array<{ aluno: string; status: string; erro?: string }>
  } | null>(null)
  const [manualModalOpen, setManualModalOpen] = useState(false)
  const [enrollmentsList, setEnrollmentsList] = useState<Array<{ id: string; nome: string; valorMensal: number | null }>>([])
  const [manualEnrollmentId, setManualEnrollmentId] = useState('')
  const [manualAmount, setManualAmount] = useState('')
  const [manualExtraDesc, setManualExtraDesc] = useState('')
  const [manualYear, setManualYear] = useState(anoAtual)
  const [manualMonth, setManualMonth] = useState(mesAtual)
  const [manualEmitting, setManualEmitting] = useState(false)
  const [pendingList, setPendingList] = useState<Array<{ enrollmentId: string; nome: string; valor: number }>>([])
  const [observacoes, setObservacoes] = useState<Record<string, string>>({})
  const [pendingLoading, setPendingLoading] = useState(false)

  const fetchNotas = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/nfse?year=${year}&month=${month}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        if (json.enabled === false) {
          setNfseEnabled(false)
          setNotas([])
          setStats({ total: 0, autorizadas: 0, canceladas: 0, pendentes: 0, erros: 0 })
          return
        }
        setToast({ message: json.message || 'Erro ao carregar notas', type: 'error' })
        return
      }
      const data = json as NfseListResponse
      setNfseEnabled(data.enabled !== false)
      setNotas(data.notas || [])
      setStats({
        total: data.total || 0,
        autorizadas: data.autorizadas || 0,
        canceladas: data.canceladas || 0,
        pendentes: data.pendentes || 0,
        erros: data.erros || 0,
      })
    } catch {
      setToast({ message: 'Erro ao carregar notas', type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => {
    fetchNotas()
  }, [fetchNotas])

  const handleEmitirLote = async () => {
    setEmitindo(true)
    setEmitirResultado(null)
    try {
      const res = await fetch('/api/admin/nfse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ year, month, observacoes }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao emitir notas', type: 'error' })
        return
      }
      setEmitirResultado({
        emitidas: json.emitidas || 0,
        erros: json.erros || 0,
        detalhes: json.detalhes || [],
      })
      if (json.erros === 0) {
        setToast({ message: `${json.emitidas} nota(s) emitida(s) com sucesso`, type: 'success' })
        setEmitirModalOpen(false)
        fetchNotas()
      }
    } catch {
      setToast({ message: 'Erro ao emitir notas', type: 'error' })
    } finally {
      setEmitindo(false)
    }
  }

  const handleCancelar = async () => {
    if (!notaParaCancelar || justificativa.length < 15) return
    setCancelando(true)
    try {
      const res = await fetch(`/api/admin/nfse/${notaParaCancelar.focusRef}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ justificativa }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao cancelar nota', type: 'error' })
        return
      }
      setToast({ message: 'Nota cancelada com sucesso', type: 'success' })
      setCancelarModalOpen(false)
      setNotaParaCancelar(null)
      setJustificativa('')
      fetchNotas()
    } catch {
      setToast({ message: 'Erro ao cancelar nota', type: 'error' })
    } finally {
      setCancelando(false)
    }
  }

  const handleAtualizarStatus = async (ref: string) => {
    setAtualizandoRef(ref)
    try {
      const res = await fetch(`/api/admin/nfse/${ref}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao atualizar status', type: 'error' })
        return
      }
      setToast({ message: 'Status atualizado', type: 'success' })
      fetchNotas()
    } catch {
      setToast({ message: 'Erro ao atualizar status', type: 'error' })
    } finally {
      setAtualizandoRef(null)
    }
  }

  const handleRetryNota = async (nota: NfseRecord) => {
    setRetryingId(nota.enrollmentId)
    try {
      const res = await fetch('/api/admin/nfse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          enrollmentId: nota.enrollmentId,
          year: nota.year,
          month: nota.month,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || json.error || 'Erro ao reemitir nota', type: 'error' })
        return
      }
      setToast({ message: 'Nota reenviada para emissão', type: 'success' })
      fetchNotas()
    } catch {
      setToast({ message: 'Erro ao reemitir nota', type: 'error' })
    } finally {
      setRetryingId(null)
    }
  }

  const loadEnrollments = useCallback(async (q?: string) => {
    const url = q ? `/api/admin/nfse/enrollments?q=${encodeURIComponent(q)}` : '/api/admin/nfse/enrollments'
    const res = await fetch(url, { credentials: 'include' })
    const json = await res.json()
    if (json.ok && json.enrollments) setEnrollmentsList(json.enrollments)
    else setEnrollmentsList([])
  }, [])

  const loadPending = useCallback(async () => {
    setPendingLoading(true)
    try {
      const res = await fetch(`/api/admin/nfse/pending?year=${year}&month=${month}`, { credentials: 'include' })
      const json = await res.json()
      if (json.ok && json.pendentes) {
        setPendingList(json.pendentes)
        setObservacoes({})
      } else {
        setPendingList([])
      }
    } finally {
      setPendingLoading(false)
    }
  }, [year, month])

  const handleOpenEmitirModal = () => {
    setEmitirModalOpen(true)
    setEmitirResultado(null)
    loadPending()
  }

  const handleEmitirManual = async () => {
    if (!manualEnrollmentId.trim()) {
      setToast({ message: 'Selecione um aluno', type: 'error' })
      return
    }
    const amountNum = manualAmount ? parseFloat(manualAmount.replace(',', '.')) : undefined
    if (amountNum != null && (Number.isNaN(amountNum) || amountNum <= 0)) {
      setToast({ message: 'Valor inválido', type: 'error' })
      return
    }
    setManualEmitting(true)
    try {
      const res = await fetch('/api/admin/nfse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          enrollmentId: manualEnrollmentId,
          manual: true,
          amount: amountNum,
          extraDescription: manualExtraDesc.trim() || undefined,
          year: manualYear,
          month: manualMonth,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || json.error || 'Erro ao emitir nota', type: 'error' })
        return
      }
      setToast({ message: 'Nota manual enviada para emissão', type: 'success' })
      setManualModalOpen(false)
      setManualEnrollmentId('')
      setManualAmount('')
      setManualExtraDesc('')
      fetchNotas()
    } catch {
      setToast({ message: 'Erro ao emitir nota', type: 'error' })
    } finally {
      setManualEmitting(false)
    }
  }

  const handleExportXml = async () => {
    try {
      const res = await fetch(`/api/admin/nfse/export?year=${year}&month=${month}&format=xml`, {
        credentials: 'include',
      })
      if (!res.ok) {
        const json = await res.json()
        if (json.installCommand) {
          setToast({
            message: 'Biblioteca archiver não instalada. Instale: npm install archiver @types/archiver',
            type: 'error',
          })
        } else {
          setToast({ message: json.message || 'Erro ao exportar XMLs', type: 'error' })
        }
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `NFSe_Seidmann_${MESES_LABELS[month]}_${year}.zip`
      a.click()
      URL.revokeObjectURL(url)
      setToast({ message: 'XMLs exportados com sucesso', type: 'success' })
    } catch {
      setToast({ message: 'Erro ao exportar XMLs', type: 'error' })
    }
  }

  const handleExportCsv = async () => {
    try {
      const res = await fetch(`/api/admin/nfse/export?year=${year}&month=${month}&format=csv`, {
        credentials: 'include',
      })
      if (!res.ok) {
        setToast({ message: 'Erro ao exportar CSV', type: 'error' })
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `NFSe_Seidmann_${month}_${year}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setToast({ message: 'CSV exportado com sucesso', type: 'success' })
    } catch {
      setToast({ message: 'Erro ao exportar CSV', type: 'error' })
    }
  }

  const valorTotal = notas.filter((n) => n.status === 'autorizado' && !n.cancelledAt).reduce((sum, n) => sum + n.amount, 0)

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Cabeçalho */}
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Financeiro – Notas Fiscais</h1>
          <p className="text-gray-600 mt-1 text-sm md:text-base">
            Gerenciar emissão, consulta e cancelamento de Notas Fiscais de Serviço (NFSe).
          </p>
        </div>

        {/* Verificação de habilitação: só mostra "não configurada" quando a API retorna enabled: false */}
        {nfseEnabled === false && !loading && (
          <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              <div>
                <p className="font-semibold text-amber-900">Emissão de NFSe não está configurada</p>
                <p className="text-sm text-amber-700 mt-1">
                  Configure NFSE_ENABLED=true nas variáveis de ambiente do servidor para habilitar.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Seletor de Mês/Ano */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Ano</label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="input min-w-[100px]"
              >
                {ANOS_DISPONIVEIS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Mês</label>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="input min-w-[150px]"
              >
                {Object.entries(MESES_LABELS).map(([num, label]) => (
                  <option key={num} value={num}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="ml-auto flex gap-2">
              <Button variant="primary" onClick={handleOpenEmitirModal}>
                <FileText className="w-4 h-4 mr-2" />
                Emitir Notas do Mês
              </Button>
              <Button variant="outline" onClick={() => { setManualModalOpen(true); loadEnrollments(); setManualYear(year); setManualMonth(month); setManualEnrollmentId(''); setManualAmount(''); setManualExtraDesc(''); }}>
                <FileText className="w-4 h-4 mr-2" />
                Emitir Nota Manual
              </Button>
              <Button variant="outline" onClick={handleExportXml} title="Baixar todos os XMLs para enviar ao contador">
                <Download className="w-4 h-4 mr-2" />
                Exportar XMLs
              </Button>
              <Button variant="ghost" onClick={handleExportCsv}>
                <FileDown className="w-4 h-4 mr-2" />
                Exportar CSV
              </Button>
            </div>
          </div>
        </div>

        {/* Cards Resumo */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-5 h-5 text-gray-600" />
              <p className="text-xs font-semibold text-gray-500 uppercase">Total</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="bg-white rounded-xl border border-green-200 shadow-sm p-4 bg-green-50">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <p className="text-xs font-semibold text-green-700 uppercase">Autorizadas</p>
            </div>
            <p className="text-2xl font-bold text-green-900">{stats.autorizadas}</p>
          </div>
          <div className="bg-white rounded-xl border border-yellow-200 shadow-sm p-4 bg-yellow-50">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-yellow-600" />
              <p className="text-xs font-semibold text-yellow-700 uppercase">Pendentes</p>
            </div>
            <p className="text-2xl font-bold text-yellow-900">{stats.pendentes}</p>
          </div>
          <div className="bg-white rounded-xl border border-red-200 shadow-sm p-4 bg-red-50">
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="w-5 h-5 text-red-600" />
              <p className="text-xs font-semibold text-red-700 uppercase">Erros</p>
            </div>
            <p className="text-2xl font-bold text-red-900">{stats.erros}</p>
          </div>
        </div>

        {/* Tabela de Notas */}
        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-400" />
            <p className="text-gray-600 mt-2">Carregando notas...</p>
          </div>
        ) : notas.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
            <p className="text-gray-600">
              Nenhuma nota encontrada para {MESES_LABELS[month]} de {year}.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Aluno</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">CPF</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Valor</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Nº Nota</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {notas.map((nota, idx) => {
                    const statusBadge = getStatusBadge(nota.status, nota.cancelledAt)
                    const StatusIcon = statusBadge.icon
                    return (
                      <tr key={nota.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-700">{idx + 1}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{nota.studentName}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{maskCPF(nota.cpf)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{formatMoney(nota.amount)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{nota.numero || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusBadge.className}`}>
                              <StatusIcon className="w-3.5 h-3.5" />
                              {statusBadge.label}
                            </span>
                            {nota.errorMessage && (
                              <span className="text-xs text-red-600" title={nota.errorMessage}>
                                {nota.errorMessage.length > 50 ? `${nota.errorMessage.slice(0, 50)}...` : nota.errorMessage}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {nota.pdfUrl && nota.status === 'autorizado' && !nota.cancelledAt && (
                              <button
                                onClick={() => window.open(nota.pdfUrl!, '_blank')}
                                className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
                                title="Abrir PDF"
                              >
                                <FileText className="w-4 h-4" />
                              </button>
                            )}
                            {nota.status === 'autorizado' && !nota.cancelledAt && (
                              <button
                                onClick={() => {
                                  setNotaParaCancelar(nota)
                                  setCancelarModalOpen(true)
                                }}
                                className="p-1.5 text-red-600 hover:text-red-900 hover:bg-red-50 rounded"
                                title="Cancelar nota"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                            {(nota.status === 'erro_autorizacao' || nota.status === 'erro') && (
                              <button
                                onClick={() => handleRetryNota(nota)}
                                disabled={retryingId === nota.enrollmentId}
                                className="p-1.5 text-green-600 hover:text-green-900 hover:bg-green-50 rounded disabled:opacity-50"
                                title="Reemitir nota"
                              >
                                {retryingId === nota.enrollmentId ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-4 h-4" />
                                )}
                              </button>
                            )}
                            {(nota.status === 'processando_autorizacao' || nota.status === 'erro_autorizacao') && (
                              <button
                                onClick={() => handleAtualizarStatus(nota.focusRef)}
                                disabled={atualizandoRef === nota.focusRef}
                                className="p-1.5 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded disabled:opacity-50"
                                title="Atualizar status"
                              >
                                {atualizandoRef === nota.focusRef ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-4 h-4" />
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Seção Enviar para Contador */}
        {stats.autorizadas > 0 && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
            <div className="flex items-start gap-3 mb-4">
              <FileText className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 mb-1">Enviar para Contador</h3>
                <p className="text-sm text-blue-700">
                  {stats.autorizadas} nota(s) autorizada(s) em {MESES_LABELS[month]} de {year}
                </p>
                <p className="text-sm font-medium text-blue-900 mt-1">Valor total: {formatMoney(valorTotal)}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary" onClick={handleExportXml}>
                <Download className="w-4 h-4 mr-2" />
                Baixar ZIP com XMLs
              </Button>
              <Button variant="outline" onClick={handleExportCsv}>
                <FileDown className="w-4 h-4 mr-2" />
                Baixar CSV de controle
              </Button>
            </div>
            <p className="text-xs text-blue-600 mt-3 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              Envie o arquivo ZIP com os XMLs ao seu contador mensalmente para escrituração.
            </p>
          </div>
        )}

        {/* Modal Emitir Notas do Mês (lote) */}
        <Modal
          isOpen={emitirModalOpen}
          onClose={() => {
            if (!emitindo) {
              setEmitirModalOpen(false)
              setEmitirResultado(null)
            }
          }}
          title="Emitir Notas Fiscais do Mês"
          size="lg"
          footer={
            <>
              <Button variant="outline" onClick={() => setEmitirModalOpen(false)} disabled={!!emitindo}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={handleEmitirLote} disabled={!!emitindo || pendingLoading || pendingList.length === 0}>
                {emitindo ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Emitir ({pendingList.length} nota(s))
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-gray-700">
              Pagamentos confirmados de <strong>{MESES_LABELS[month]} de {year}</strong> que ainda não possuem nota.
              Opcionalmente adicione uma observação extra à descrição de cada nota.
            </p>
            {pendingLoading ? (
              <div className="flex items-center gap-2 text-gray-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando lista...
              </div>
            ) : pendingList.length === 0 ? (
              <p className="text-gray-500 text-sm">Nenhum pagamento confirmado pendente de NFSe para este mês.</p>
            ) : (
              <div className="max-h-[320px] overflow-y-auto border border-gray-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Aluno</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Valor</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Observação extra (opcional)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pendingList.map((p) => (
                      <tr key={p.enrollmentId}>
                        <td className="px-3 py-2 font-medium text-gray-900">{p.nome}</td>
                        <td className="px-3 py-2 text-gray-700">{formatMoney(p.valor)}</td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={observacoes[p.enrollmentId] ?? ''}
                            onChange={(e) => setObservacoes((prev) => ({ ...prev, [p.enrollmentId]: e.target.value }))}
                            className="input w-full text-sm"
                            placeholder="Ex: Referente a material"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {emitirResultado && (
              <div className="border-t border-gray-200 pt-4">
                <p className="text-sm font-semibold text-gray-700 mb-2">
                  Resultado: {emitirResultado.emitidas} emitida(s), {emitirResultado.erros} erro(s)
                </p>
                {emitirResultado.erros > 0 && (
                  <details className="mt-2">
                    <summary className="text-sm text-red-600 cursor-pointer hover:text-red-800">
                      Ver erros ({emitirResultado.erros})
                    </summary>
                    <ul className="mt-2 space-y-1 text-sm text-gray-600">
                      {emitirResultado.detalhes
                        .filter((d) => d.status === 'erro')
                        .map((d, idx) => (
                          <li key={idx}>
                            • {d.aluno}: {d.erro || 'Erro desconhecido'}
                          </li>
                        ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>
        </Modal>

        {/* Modal Emitir Nota Manual */}
        <Modal
          isOpen={manualModalOpen}
          onClose={() => !manualEmitting && setManualModalOpen(false)}
          title="Emitir Nota Manual"
          size="md"
          footer={
            <>
              <Button variant="outline" onClick={() => setManualModalOpen(false)} disabled={!!manualEmitting}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={handleEmitirManual} disabled={!!manualEmitting || !manualEnrollmentId}>
                {manualEmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Emitir
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Aluno</label>
              <input
                type="text"
                placeholder="Digite para buscar por nome..."
                className="input w-full mb-2 text-sm"
                onChange={(e) => { const q = e.target.value; if (q.length >= 2) loadEnrollments(q); else if (!q) loadEnrollments(); }}
              />
              <select
                value={manualEnrollmentId}
                onChange={(e) => {
                  const id = e.target.value
                  setManualEnrollmentId(id)
                  const enr = enrollmentsList.find((x) => x.id === id)
                  setManualAmount(enr?.valorMensal != null ? String(enr.valorMensal) : '')
                }}
                className="input w-full"
              >
                <option value="">Selecione um aluno ({enrollmentsList.length} encontrados)</option>
                {enrollmentsList.map((e) => (
                  <option key={e.id} value={e.id}>{e.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Valor (R$)</label>
              <input
                type="text"
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                className="input w-full"
                placeholder="Valor da mensalidade"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Descrição extra (opcional)</label>
              <textarea
                value={manualExtraDesc}
                onChange={(e) => setManualExtraDesc(e.target.value)}
                className="input w-full min-h-[80px] resize-y"
                placeholder="Ex: Referente a material didático"
              />
              <p className="text-xs text-gray-500 mt-1">Será adicionada ao final da descrição padrão da nota.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Mês/Ano de referência</label>
                <div className="flex gap-2">
                  <select
                    value={manualMonth}
                    onChange={(e) => setManualMonth(Number(e.target.value))}
                    className="input flex-1"
                  >
                    {Object.entries(MESES_LABELS).map(([num, label]) => (
                      <option key={num} value={num}>{label}</option>
                    ))}
                  </select>
                  <select
                    value={manualYear}
                    onChange={(e) => setManualYear(Number(e.target.value))}
                    className="input w-24"
                  >
                    {ANOS_DISPONIVEIS.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </Modal>

        {/* Modal Cancelar Nota */}
        <Modal
          isOpen={cancelarModalOpen}
          onClose={() => {
            if (!cancelando) {
              setCancelarModalOpen(false)
              setNotaParaCancelar(null)
              setJustificativa('')
            }
          }}
          title={notaParaCancelar ? `Cancelar Nota Fiscal #${notaParaCancelar.numero || notaParaCancelar.focusRef}` : 'Cancelar Nota Fiscal'}
          size="md"
          footer={
            <>
              <Button variant="outline" onClick={() => setCancelarModalOpen(false)} disabled={!!cancelando}>
                Voltar
              </Button>
              <Button
                variant="primary"
                onClick={handleCancelar}
                disabled={!!cancelando || justificativa.length < 15}
                className="bg-red-600 hover:bg-red-700"
              >
                {cancelando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Cancelar Nota
              </Button>
            </>
          }
        >
          {notaParaCancelar && (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm">
                  <span className="font-semibold">Aluno:</span> {notaParaCancelar.studentName}
                </p>
                <p className="text-sm">
                  <span className="font-semibold">Valor:</span> {formatMoney(notaParaCancelar.amount)}
                </p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Justificativa <span className="text-red-600">*</span>
                </label>
                <textarea
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  className="input w-full min-h-[100px] resize-y"
                  placeholder="Mínimo 15 caracteres (exigência da prefeitura)"
                  maxLength={500}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {justificativa.length}/15 caracteres mínimos (exigência da prefeitura)
                </p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Esta ação é irreversível na prefeitura. A nota será cancelada definitivamente.
                  </span>
                </p>
              </div>
            </div>
          )}
        </Modal>

        <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
      </div>
    </AdminLayout>
  )
}
