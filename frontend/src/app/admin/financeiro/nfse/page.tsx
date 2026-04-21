/**
 * Financeiro – Notas Fiscais de Serviço (NFSe)
 * Interface para gerenciar emissão, consulta e cancelamento de NFSe.
 */

'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
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
  DollarSign,
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

type ExportErrorPayload = { message?: string; installCommand?: string }

/**
 * Baixa o arquivo de exportação com feedback de progresso: estimativa enquanto o servidor prepara
 * a resposta; depois percentual real se houver Content-Length, senão estimativa suave até concluir.
 */
async function downloadExportBlobWithProgress(
  url: string,
  setPercent: (n: number) => void
): Promise<Blob> {
  let waitTimer: ReturnType<typeof setInterval> | null = null
  let headersReceived = false
  const startWait = Date.now()

  waitTimer = setInterval(() => {
    if (headersReceived) return
    const t = (Date.now() - startWait) / 1000
    const p = Math.min(78, Math.round(78 * (1 - Math.exp(-t / 2.2))))
    setPercent(p)
  }, 120)

  const res = await fetch(url, { credentials: 'include' })
  headersReceived = true
  if (waitTimer) clearInterval(waitTimer)

  if (!res.ok) {
    setPercent(0)
    const json = (await res.json().catch(() => ({}))) as ExportErrorPayload
    const err = new Error(json.message || 'Erro na exportação') as Error & { payload?: ExportErrorPayload }
    err.payload = json
    throw err
  }

  const lenHeader = res.headers.get('content-length')
  const total = lenHeader ? parseInt(lenHeader, 10) : 0
  const body = res.body
  if (!body) {
    setPercent(100)
    return res.blob()
  }

  const reader = body.getReader()
  const chunks: BlobPart[] = []
  let received = 0
  const dlStart = Date.now()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      received += value.length
      if (total > 0) {
        setPercent(Math.min(99, 78 + Math.round((22 * received) / total)))
      } else {
        const t = (Date.now() - dlStart) / 1000
        setPercent(Math.min(99, 78 + Math.round(21 * (1 - Math.exp(-t / 1.2)))))
      }
    }
  }

  setPercent(100)
  return new Blob(chunks)
}

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

/** Alinha ao contador de erros da API (erro_autorizacao e variantes). */
function notaStatusErro(status: string): boolean {
  return status === 'erro_autorizacao' || status === 'erro'
}

function notaAutorizadaAtiva(n: NfseRecord): boolean {
  return n.status === 'autorizado' && !n.cancelledAt
}

function notaPendenteEmissao(n: NfseRecord): boolean {
  return n.status === 'processando_autorizacao'
}

type FiltroResumoNfse = 'todos' | 'erros' | 'autorizadas' | 'pendentes'

const FILTRO_VAZIO_TEXTO: Record<Exclude<FiltroResumoNfse, 'todos'>, string> = {
  erros: 'com erro de autorização',
  autorizadas: 'autorizadas (ativas)',
  pendentes: 'em processamento na prefeitura',
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

function NfseExportMenu({
  onExportXml,
  onExportCsv,
  align = 'right',
  disabled = false,
}: {
  onExportXml: () => void
  onExportCsv: () => void
  align?: 'left' | 'right'
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        title="Exportar"
        aria-label="Exportar notas"
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex items-center justify-center w-11 h-11 rounded-lg border-2 border-brand-orange text-brand-orange hover:bg-brand-orange hover:text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-orange focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none disabled:hover:bg-transparent disabled:hover:text-brand-orange"
      >
        <Download className="w-5 h-5" />
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute top-full mt-1 py-1 min-w-[220px] bg-white border border-gray-200 rounded-lg shadow-lg z-[60] ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <button
            type="button"
            role="menuitem"
            className="w-full text-left px-4 py-2.5 text-sm text-gray-800 hover:bg-gray-50 flex items-center gap-2"
            onClick={() => {
              setOpen(false)
              onExportXml()
            }}
          >
            <Download className="w-4 h-4 shrink-0 text-brand-orange" />
            Exportar XMLs (ZIP)
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full text-left px-4 py-2.5 text-sm text-gray-800 hover:bg-gray-50 flex items-center gap-2"
            onClick={() => {
              setOpen(false)
              onExportCsv()
            }}
          >
            <FileDown className="w-4 h-4 shrink-0 text-brand-orange" />
            Exportar CSV
          </button>
        </div>
      )}
    </div>
  )
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
  const [cancelarModalOpen, setCancelarModalOpen] = useState(false)
  const [notaParaCancelar, setNotaParaCancelar] = useState<NfseRecord | null>(null)
  const [justificativa, setJustificativa] = useState('')
  const [cancelando, setCancelando] = useState(false)
  const [atualizandoRef, setAtualizandoRef] = useState<string | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [manualModalOpen, setManualModalOpen] = useState(false)
  const [enrollmentsList, setEnrollmentsList] = useState<Array<{ id: string; nome: string; valorMensal: number | null }>>([])
  const [manualEnrollmentId, setManualEnrollmentId] = useState('')
  const [manualAmount, setManualAmount] = useState('')
  const [manualExtraDesc, setManualExtraDesc] = useState('')
  const [manualYear, setManualYear] = useState(anoAtual)
  const [manualMonth, setManualMonth] = useState(mesAtual)
  const [manualEmitting, setManualEmitting] = useState(false)
  const [atualizandoStatusTodas, setAtualizandoStatusTodas] = useState(false)
  const [filtroResumo, setFiltroResumo] = useState<FiltroResumoNfse>('todos')
  const [exporting, setExporting] = useState<null | 'xml' | 'csv'>(null)
  const [exportPercent, setExportPercent] = useState(0)

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

  useEffect(() => {
    setFiltroResumo('todos')
  }, [year, month])

  const setFiltroOuToggle = (next: FiltroResumoNfse) => {
    setFiltroResumo((prev) => {
      if (next === 'todos') return 'todos'
      return prev === next ? 'todos' : next
    })
  }

  const valorTotalAutorizadas = useMemo(
    () =>
      notas.filter(notaAutorizadaAtiva).reduce((sum, n) => sum + Number(n.amount), 0),
    [notas]
  )

  const notasExibidas = useMemo(() => {
    switch (filtroResumo) {
      case 'erros':
        return notas.filter((n) => notaStatusErro(n.status))
      case 'autorizadas':
        return notas.filter(notaAutorizadaAtiva)
      case 'pendentes':
        return notas.filter(notaPendenteEmissao)
      default:
        return notas
    }
  }, [notas, filtroResumo])

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
        const msg = json.error || json.message || 'Erro ao reemitir nota'
        setToast({ message: msg, type: 'error' })
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
        const msg = json.error || json.message || 'Erro ao emitir nota'
        setToast({ message: msg, type: 'error' })
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
    setExporting('xml')
    setExportPercent(0)
    try {
      const blob = await downloadExportBlobWithProgress(
        `/api/admin/nfse/export?year=${year}&month=${month}&format=xml`,
        setExportPercent
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `NFSe_Seidmann_${MESES_LABELS[month]}_${year}.zip`
      a.click()
      URL.revokeObjectURL(url)
      setToast({ message: 'XMLs exportados com sucesso', type: 'success' })
      await new Promise((r) => setTimeout(r, 450))
    } catch (e: unknown) {
      const err = e as Error & { payload?: ExportErrorPayload }
      if (err.payload?.installCommand) {
        setToast({
          message: 'Biblioteca archiver não instalada. Instale: npm install archiver @types/archiver',
          type: 'error',
        })
      } else {
        setToast({ message: err.message || 'Erro ao exportar XMLs', type: 'error' })
      }
    } finally {
      setExporting(null)
      setExportPercent(0)
    }
  }

  const handleExportCsv = async () => {
    setExporting('csv')
    setExportPercent(0)
    try {
      const blob = await downloadExportBlobWithProgress(
        `/api/admin/nfse/export?year=${year}&month=${month}&format=csv`,
        setExportPercent
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `NFSe_Seidmann_${month}_${year}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setToast({ message: 'CSV exportado com sucesso', type: 'success' })
      await new Promise((r) => setTimeout(r, 450))
    } catch (e: unknown) {
      const err = e as Error & { payload?: ExportErrorPayload }
      setToast({ message: err.message || 'Erro ao exportar CSV', type: 'error' })
    } finally {
      setExporting(null)
      setExportPercent(0)
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Cabeçalho */}
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Financeiro – Notas Fiscais</h1>
          <p className="text-gray-600 mt-1 text-sm md:text-base">
            Gerenciar emissão, consulta e cancelamento de Notas Fiscais de Serviço (NFSe). A tabela e os totais seguem o{' '}
            <strong>ano e mês de competência</strong> selecionados abaixo.
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

        {/* Competência: filtra lista, cards e exportação */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs text-gray-500 mb-3">
            <span className="font-semibold text-gray-700">Competência</span> — altere o ano ou o mês para ver as notas daquele
            período; o mesmo período vale para exportação XML/CSV e emissão manual.
          </p>
          <p className="text-xs text-gray-500 mb-3">
            O status das NF em <strong>processamento</strong> ou <strong>erro</strong> é consultado na prefeitura{' '}
            <strong>automaticamente a cada 5 minutos</strong>. O botão &quot;Atualizar status de todas&quot; força a consulta
            agora para <strong>todas as notas, exceto as já autorizadas</strong> (até 500 por clique; se houver mais, clique de
            novo).
          </p>
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
              <Button
                variant="outline"
                disabled={atualizandoStatusTodas}
                onClick={async () => {
                  setAtualizandoStatusTodas(true)
                  try {
                    const res = await fetch('/api/cron/nfse-status', {
                      method: 'POST',
                      credentials: 'include',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ manual: true }),
                    })
                    const json = await res.json()
                    if (!res.ok || !json.ok) {
                      setToast({ message: json.message || 'Erro ao atualizar status das NFSe', type: 'error' })
                      return
                    }
                    let msg = `${json.processadas ?? 0} nota(s) consultada(s) na prefeitura`
                    if (typeof json.autorizadas === 'number' && json.autorizadas > 0) {
                      msg += ` (${json.autorizadas} passaram a autorizada nesta rodada)`
                    }
                    msg += '.'
                    if (json.truncadas) {
                      msg +=
                        ' Ainda há mais notas elegíveis (limite 500 por vez) — clique de novo para continuar, se necessário.'
                    }
                    setToast({ message: msg, type: 'success' })
                    await fetchNotas()
                  } catch {
                    setToast({ message: 'Erro ao atualizar status das NFSe', type: 'error' })
                  } finally {
                    setAtualizandoStatusTodas(false)
                  }
                }}
              >
                {atualizandoStatusTodas ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4 mr-2" />
                )}
                Atualizar status de todas
              </Button>
              <Button variant="outline" onClick={() => { setManualModalOpen(true); loadEnrollments(); setManualYear(year); setManualMonth(month); setManualEnrollmentId(''); setManualAmount(''); setManualExtraDesc(''); }}>
                <FileText className="w-4 h-4 mr-2" />
                Emitir Nota Manual
              </Button>
              <NfseExportMenu
                onExportXml={handleExportXml}
                onExportCsv={handleExportCsv}
                align="right"
                disabled={!!exporting}
              />
            </div>
          </div>
        </div>

        {/* Cards Resumo — clique para filtrar a tabela (Total / Valor = mostrar todas) */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          <button
            type="button"
            onClick={() => setFiltroResumo('todos')}
            title="Mostrar todas as notas do período"
            className={`rounded-xl border shadow-sm p-4 text-left w-full transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2 bg-white ${
              filtroResumo === 'todos'
                ? 'ring-2 ring-gray-400 border-gray-300'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-5 h-5 text-gray-600" />
              <p className="text-xs font-semibold text-gray-500 uppercase">Total</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            <p className="text-[10px] text-gray-600 mt-1">Ver todas no período</p>
          </button>
          <button
            type="button"
            onClick={() => setFiltroResumo('todos')}
            title="Mostrar todas as notas do período"
            className={`rounded-xl border shadow-sm p-4 text-left w-full transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 bg-indigo-50/80 ${
              filtroResumo === 'todos'
                ? 'ring-2 ring-indigo-400 border-indigo-300'
                : 'border-indigo-200 hover:border-indigo-300'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-5 h-5 text-indigo-600" />
              <p className="text-xs font-semibold text-indigo-800 uppercase">Valor total NF</p>
            </div>
            <p className="text-xl font-bold text-indigo-950 tabular-nums">{formatMoney(valorTotalAutorizadas)}</p>
            <p className="text-[10px] text-indigo-700/90 mt-1">Soma só das autorizadas · clique para ver todas</p>
          </button>
          <button
            type="button"
            onClick={() => setFiltroOuToggle('autorizadas')}
            disabled={stats.autorizadas === 0 && filtroResumo !== 'autorizadas'}
            title={
              stats.autorizadas === 0 && filtroResumo !== 'autorizadas'
                ? 'Não há notas autorizadas neste período'
                : filtroResumo === 'autorizadas'
                  ? 'Clique para voltar a ver todas'
                  : 'Filtrar só autorizadas'
            }
            className={`rounded-xl border shadow-sm p-4 text-left w-full transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 bg-green-50 ${
              stats.autorizadas === 0 && filtroResumo !== 'autorizadas'
                ? 'border-green-100 opacity-70 cursor-not-allowed'
                : filtroResumo === 'autorizadas'
                  ? 'ring-2 ring-green-500 border-green-400'
                  : 'border-green-200 hover:border-green-300'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <p className="text-xs font-semibold text-green-700 uppercase">Autorizadas</p>
            </div>
            <p className="text-2xl font-bold text-green-900">{stats.autorizadas}</p>
            <p className="text-[10px] text-green-800/90 mt-1">
              {filtroResumo === 'autorizadas' ? 'Filtro ativo — clique para sair' : 'Clique para filtrar'}
            </p>
          </button>
          <button
            type="button"
            onClick={() => setFiltroOuToggle('pendentes')}
            disabled={stats.pendentes === 0 && filtroResumo !== 'pendentes'}
            title={
              stats.pendentes === 0 && filtroResumo !== 'pendentes'
                ? 'Não há notas pendentes neste período'
                : filtroResumo === 'pendentes'
                  ? 'Clique para voltar a ver todas'
                  : 'Filtrar só em processamento'
            }
            className={`rounded-xl border shadow-sm p-4 text-left w-full transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-600 focus-visible:ring-offset-2 bg-yellow-50 ${
              stats.pendentes === 0 && filtroResumo !== 'pendentes'
                ? 'border-yellow-100 opacity-70 cursor-not-allowed'
                : filtroResumo === 'pendentes'
                  ? 'ring-2 ring-yellow-500 border-yellow-400'
                  : 'border-yellow-200 hover:border-yellow-300'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-yellow-600" />
              <p className="text-xs font-semibold text-yellow-700 uppercase">Pendentes</p>
            </div>
            <p className="text-2xl font-bold text-yellow-900">{stats.pendentes}</p>
            <p className="text-[10px] text-yellow-800/90 mt-1">
              {filtroResumo === 'pendentes' ? 'Filtro ativo — clique para sair' : 'Clique para filtrar'}
            </p>
          </button>
          <button
            type="button"
            onClick={() => setFiltroOuToggle('erros')}
            disabled={stats.erros === 0 && filtroResumo !== 'erros'}
            title={
              stats.erros === 0 && filtroResumo !== 'erros'
                ? 'Não há notas com erro neste período'
                : filtroResumo === 'erros'
                  ? 'Clique para voltar a ver todas'
                  : 'Filtrar só com erro'
            }
            className={`rounded-xl border shadow-sm p-4 text-left w-full transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 bg-red-50 ${
              stats.erros === 0 && filtroResumo !== 'erros'
                ? 'border-red-100 opacity-70 cursor-not-allowed'
                : filtroResumo === 'erros'
                  ? 'ring-2 ring-red-400 border-red-400'
                  : 'border-red-200 hover:border-red-300'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="w-5 h-5 text-red-600" />
              <p className="text-xs font-semibold text-red-700 uppercase">Erros</p>
            </div>
            <p className="text-2xl font-bold text-red-900">{stats.erros}</p>
            <p className="text-[10px] text-red-800/90 mt-1">
              {stats.erros === 0 && filtroResumo !== 'erros'
                ? 'Sem erros neste período'
                : filtroResumo === 'erros'
                  ? 'Filtro ativo — clique para sair'
                  : 'Clique para filtrar'}
            </p>
          </button>
        </div>

        {stats.erros > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col gap-2">
            <p className="text-sm font-semibold text-amber-900">Por que a emissão pode dar erro?</p>
            <ul className="text-sm text-amber-800 list-disc list-inside space-y-0.5">
              <li><strong>CPF/CNPJ</strong> com dígitos verificadores inválidos ou irregular na Receita Federal</li>
              <li><strong>Nome/Razão social</strong> do tomador diferente do que consta na base da Receita</li>
              <li>Aluno com <strong>CNPJ</strong> (empresa) deve ter o documento cadastrado corretamente; emissão para pessoa jurídica usa campos específicos</li>
              <li>Restrições do <strong>município</strong> ou ambiente (homologação vs. produção)</li>
            </ul>
            <p className="text-xs text-amber-700">Veja o motivo exato em <strong>Motivo do erro</strong> na linha de cada nota com status Erro. Corrija os dados do aluno (ou da empresa) e use <strong>Reemitir</strong> (ícone de atualizar).</p>
          </div>
        )}

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
        ) : notasExibidas.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center space-y-3">
            <p className="text-gray-600">
              Nenhuma nota{' '}
              {filtroResumo !== 'todos' ? FILTRO_VAZIO_TEXTO[filtroResumo] : ''} em {MESES_LABELS[month]} de {year}.
            </p>
            {filtroResumo !== 'todos' && (
              <Button type="button" variant="outline" onClick={() => setFiltroResumo('todos')}>
                Ver todas as notas do período
              </Button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {filtroResumo === 'erros' && (
              <div className="px-4 py-2 bg-red-50 border-b border-red-100 text-sm text-red-900 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Mostrando apenas notas com <strong>erro de autorização</strong>.
                </span>
                <button
                  type="button"
                  onClick={() => setFiltroResumo('todos')}
                  className="text-red-700 font-semibold underline hover:text-red-900"
                >
                  Limpar filtro
                </button>
              </div>
            )}
            {filtroResumo === 'autorizadas' && (
              <div className="px-4 py-2 bg-green-50 border-b border-green-100 text-sm text-green-900 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Mostrando apenas notas <strong>autorizadas</strong> (não canceladas).
                </span>
                <button
                  type="button"
                  onClick={() => setFiltroResumo('todos')}
                  className="text-green-800 font-semibold underline hover:text-green-950"
                >
                  Limpar filtro
                </button>
              </div>
            )}
            {filtroResumo === 'pendentes' && (
              <div className="px-4 py-2 bg-yellow-50 border-b border-yellow-100 text-sm text-yellow-950 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Mostrando apenas notas <strong>em processamento</strong> na prefeitura.
                </span>
                <button
                  type="button"
                  onClick={() => setFiltroResumo('todos')}
                  className="text-yellow-900 font-semibold underline hover:text-yellow-950"
                >
                  Limpar filtro
                </button>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Aluno</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">CPF</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Competência</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Valor</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Nº Nota</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {notasExibidas.map((nota, idx) => {
                    const statusBadge = getStatusBadge(nota.status, nota.cancelledAt)
                    const StatusIcon = statusBadge.icon
                    return (
                      <tr key={nota.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-700">{idx + 1}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{nota.studentName}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{maskCPF(nota.cpf)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                          {MESES_LABELS[nota.month] ?? nota.month}/{nota.year}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{formatMoney(nota.amount)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{nota.numero || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusBadge.className}`}>
                                <StatusIcon className="w-3.5 h-3.5" />
                                {statusBadge.label}
                              </span>
                            </div>
                            {(nota.status === 'erro_autorizacao' || nota.status === 'erro') && (
                              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5 mt-1 max-w-md">
                                {nota.errorMessage ? (
                                  <>
                                    <span className="font-medium">Motivo do erro:</span>{' '}
                                    <span title={nota.errorMessage}>
                                      {nota.errorMessage.length > 200 ? `${nota.errorMessage.slice(0, 200)}...` : nota.errorMessage}
                                    </span>
                                  </>
                                ) : (
                                  <span className="italic">
                                    Motivo não registrado. Clique em <strong>Atualizar status</strong> (ícone azul) para buscar o motivo na prefeitura.
                                  </span>
                                )}
                              </div>
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

        {exporting && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-[2px]"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-gray-100 p-8 text-center space-y-5">
              <div className="flex justify-center">
                <Loader2 className="w-12 h-12 text-brand-orange animate-spin" aria-hidden />
              </div>
              <div>
                <p className="text-lg font-semibold text-gray-900">Exportando notas</p>
                <p className="text-sm text-gray-600 mt-1">
                  {exporting === 'xml' ? 'Gerando arquivo ZIP com os XMLs…' : 'Gerando planilha CSV…'}
                </p>
                <p className="text-sm font-medium text-brand-orange mt-3">
                  Faltam {Math.max(0, 100 - exportPercent)}%
                </p>
              </div>
              <div>
                <div className="h-2.5 w-full rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-brand-orange transition-[width] duration-200 ease-out"
                    style={{ width: `${exportPercent}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">{exportPercent}% concluído</p>
              </div>
            </div>
          </div>
        )}

        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </div>
    </AdminLayout>
  )
}
