/**
 * Financeiro – Pagamentos
 * Agenda de desembolso do mês: professores por dia de vencimento + saídas fixas em aberto.
 */

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AdminLayout from '@/components/admin/AdminLayout'
import Modal from '@/components/admin/Modal'
import Toast from '@/components/admin/Toast'
import Button from '@/components/ui/Button'
import SeidmannLoading from '@/components/ui/SeidmannLoading'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  Receipt,
  Users,
  Wallet,
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

const SEM_DIA_KEY = 'sem-dia' as const
type GrupoDiaKey = number | typeof SEM_DIA_KEY

type StatusPagamento = 'PAGO' | 'EM_ABERTO' | 'NF_OK_AGUARDANDO' | 'AGUARDANDO_REENVIO'

interface ProfessorPagamento {
  id: string
  nome: string
  paymentDueDay: number | null
  valorAPagar: number
  totalHorasRegistradas: number
  statusPagamento: StatusPagamento
  proofFileUrl: string | null
  pagamentoProntoParaFazer: boolean
  metodoPagamento: string | null
  dataInicio: string | null
  dataTermino: string | null
}

interface GrupoPagamento {
  key: GrupoDiaKey
  label: string
  professores: ProfessorPagamento[]
  subtotal: number
}

type StatusDespesaFixa = 'PAGO' | 'EM_ABERTO'

interface SaidaFixaPagamento {
  id: string
  name: string
  description: string | null
  valor: number
  paymentStatus: StatusDespesaFixa
  paidAt: string | null
  receiptUrl: string | null
}

const moneyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function formatMoney(value: number): string {
  return moneyFormatter.format(Number(value) || 0)
}

function isStatusPagamento(value: unknown): value is StatusPagamento {
  return (
    value === 'PAGO' ||
    value === 'EM_ABERTO' ||
    value === 'NF_OK_AGUARDANDO' ||
    value === 'AGUARDANDO_REENVIO'
  )
}

function parsePaymentDueDay(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const day = Math.round(value)
  if (day < 1 || day > 31) return null
  return day
}

function humanDescription(description: string | null): string {
  if (!description) return '—'
  const cleaned = description.replace(/\[[^\]]+\]\s*/g, '').trim()
  return cleaned || '—'
}

function parseSaidaFixaPagamento(raw: unknown): SaidaFixaPagamento | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (typeof row.id !== 'string' || typeof row.name !== 'string') return null
  if (row.isFixed !== true) return null

  const statusRaw = row.paymentStatus
  const paymentStatus: StatusDespesaFixa =
    statusRaw === 'PAGO' ? 'PAGO' : 'EM_ABERTO'

  return {
    id: row.id,
    name: row.name,
    description: typeof row.description === 'string' ? row.description : null,
    valor: typeof row.valor === 'number' ? row.valor : Number(row.valor) || 0,
    paymentStatus,
    paidAt: typeof row.paidAt === 'string' ? row.paidAt : null,
    receiptUrl: typeof row.receiptUrl === 'string' ? row.receiptUrl : null,
  }
}

function parseProfessorPagamento(raw: unknown): ProfessorPagamento | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (typeof row.id !== 'string' || typeof row.nome !== 'string') return null
  if (!isStatusPagamento(row.statusPagamento)) return null

  return {
    id: row.id,
    nome: row.nome,
    paymentDueDay: parsePaymentDueDay(row.paymentDueDay),
    valorAPagar: typeof row.valorAPagar === 'number' ? row.valorAPagar : Number(row.valorAPagar) || 0,
    totalHorasRegistradas:
      typeof row.totalHorasRegistradas === 'number'
        ? row.totalHorasRegistradas
        : Number(row.totalHorasRegistradas) || 0,
    statusPagamento: row.statusPagamento,
    proofFileUrl: typeof row.proofFileUrl === 'string' ? row.proofFileUrl : null,
    pagamentoProntoParaFazer: row.pagamentoProntoParaFazer === true,
    metodoPagamento: typeof row.metodoPagamento === 'string' ? row.metodoPagamento : null,
    dataInicio: typeof row.dataInicio === 'string' ? row.dataInicio : null,
    dataTermino: typeof row.dataTermino === 'string' ? row.dataTermino : null,
  }
}

function formatPeriodoLabel(dataInicio: string | null, dataTermino: string | null): string {
  if (!dataInicio || !dataTermino) return ''
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
  }
  return `${fmt(dataInicio)} a ${fmt(dataTermino)}`
}

/** Último dia inclusivo do período ainda não passou (BRT). */
function isPeriodoAindaAberto(dataTermino: string | null): boolean {
  if (!dataTermino) return false
  const now = new Date()
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  const y = brt.getUTCFullYear()
  const m = String(brt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(brt.getUTCDate()).padStart(2, '0')
  const todayKey = `${y}-${m}-${d}`
  return todayKey <= dataTermino
}

async function confirmarMarcarPagoSePeriodoAberto(
  professor: ProfessorPagamento,
  confirm: (opts: {
    title: string
    message: string
    confirmLabel: string
    cancelLabel: string
    variant?: 'danger' | 'default'
  }) => Promise<boolean>
): Promise<boolean> {
  if (!isPeriodoAindaAberto(professor.dataTermino)) return true
  const periodoLabel = formatPeriodoLabel(professor.dataInicio, professor.dataTermino)
  return confirm({
    title: 'Período ainda em andamento',
    message: `O período ${periodoLabel} ainda não terminou. Ao marcar como pago, o professor não poderá mais registrar aulas desse intervalo. Deseja continuar?`,
    confirmLabel: 'Sim, marcar pago',
    cancelLabel: 'Cancelar',
    variant: 'danger',
  })
}

function canMarcarPagoIndividual(p: ProfessorPagamento): boolean {
  return p.statusPagamento === 'EM_ABERTO' || p.statusPagamento === 'NF_OK_AGUARDANDO'
}

function canMarcarPagoGrupo(professores: ProfessorPagamento[]): boolean {
  return professores.some((p) => p.statusPagamento === 'EM_ABERTO')
}

function professoresParaMarcarGrupo(professores: ProfessorPagamento[]): ProfessorPagamento[] {
  return professores.filter((p) => p.statusPagamento === 'EM_ABERTO')
}

function groupProfessoresByDueDay(professores: ProfessorPagamento[]): GrupoPagamento[] {
  const byDay = new Map<number, ProfessorPagamento[]>()
  const semDia: ProfessorPagamento[] = []

  for (const p of professores) {
    if (p.paymentDueDay != null) {
      const list = byDay.get(p.paymentDueDay) ?? []
      list.push(p)
      byDay.set(p.paymentDueDay, list)
    } else {
      semDia.push(p)
    }
  }

  const grupos: GrupoPagamento[] = [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([day, list]) => ({
      key: day,
      label: `Dia ${day}`,
      professores: [...list].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      subtotal: list.reduce((s, p) => s + p.valorAPagar, 0),
    }))

  if (semDia.length > 0) {
    grupos.push({
      key: SEM_DIA_KEY,
      label: 'Sem dia definido',
      professores: [...semDia].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      subtotal: semDia.reduce((s, p) => s + p.valorAPagar, 0),
    })
  }

  return grupos
}

function DespesaStatusBadge({ status }: { status: StatusDespesaFixa }) {
  if (status === 'PAGO') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200">
        <CheckCircle className="w-3 h-3" aria-hidden />
        Pago
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-200">
      Em aberto
    </span>
  )
}

function StatusBadge({ status }: { status: StatusPagamento }) {
  if (status === 'PAGO') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200">
        <CheckCircle className="w-3 h-3" aria-hidden />
        Pago
      </span>
    )
  }
  if (status === 'NF_OK_AGUARDANDO') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 border border-sky-200">
        NF OK – aguardando
      </span>
    )
  }
  if (status === 'AGUARDANDO_REENVIO') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-200">
        Aguardando reenvio NF
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200">
      Em aberto
    </span>
  )
}

async function postMarcarPago(teacherId: string, year: number, month: number): Promise<{ ok: boolean; message: string }> {
  const formData = new FormData()
  formData.set('year', String(year))
  formData.set('month', String(month))
  formData.set('markPaid', 'true')

  const res = await fetch(`/api/admin/financeiro/professores/${teacherId}/notify-payment`, {
    method: 'POST',
    body: formData,
  })
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string }
  if (!res.ok || !json.ok) {
    return { ok: false, message: json.message || 'Erro ao marcar pagamento.' }
  }
  return { ok: true, message: json.message || 'Pagamento marcado como pago.' }
}

export default function FinanceiroPagamentosPage() {
  const { confirm, ConfirmDialog } = useConfirmDialog()
  const anoAtual = new Date().getFullYear()
  const mesAtual = new Date().getMonth() + 1

  const [selectedAno, setSelectedAno] = useState<number>(anoAtual)
  const [selectedMes, setSelectedMes] = useState<number>(mesAtual)
  const [showPeriodo, setShowPeriodo] = useState(true)

  const [professores, setProfessores] = useState<ProfessorPagamento[]>([])
  const [saidasFixas, setSaidasFixas] = useState<SaidaFixaPagamento[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [markingTeacherId, setMarkingTeacherId] = useState<string | null>(null)
  const [markingGroupKey, setMarkingGroupKey] = useState<GrupoDiaKey | null>(null)
  const [modalMarkPaidFixa, setModalMarkPaidFixa] = useState<SaidaFixaPagamento | null>(null)
  const [markPaidData, setMarkPaidData] = useState('')
  const [markPaidFile, setMarkPaidFile] = useState<File | null>(null)
  const [markPaidSaving, setMarkPaidSaving] = useState(false)

  const fetchData = useCallback(async (ano: number, mes: number) => {
    setLoading(true)
    setFetchError(null)
    try {
      const [resProf, resAdm] = await Promise.all([
        fetch(`/api/admin/financeiro/professores?year=${ano}&month=${mes}`),
        fetch(`/api/admin/financeiro/administracao?year=${ano}&month=${mes}`),
      ])
      const [jsonProf, jsonAdm] = await Promise.all([
        resProf.json().catch(() => ({})),
        resAdm.json().catch(() => ({})),
      ])

      const profOk = resProf.ok && jsonProf.ok
      const admOk = resAdm.ok && jsonAdm.ok

      if (profOk) {
        const parsed = (jsonProf.data?.professores ?? [])
          .map(parseProfessorPagamento)
          .filter((p): p is ProfessorPagamento => p != null)
        setProfessores(parsed)
      } else {
        setProfessores([])
      }

      if (admOk) {
        const fixas = (jsonAdm.data?.expenses ?? [])
          .map(parseSaidaFixaPagamento)
          .filter((e): e is SaidaFixaPagamento => e != null)
          .filter((e) => e.paymentStatus === 'EM_ABERTO')
        setSaidasFixas(fixas)
      } else {
        setSaidasFixas([])
      }

      if (!profOk && !admOk) {
        setFetchError(
          jsonProf.message || jsonAdm.message || 'Não foi possível carregar os pagamentos do mês.'
        )
      }
    } catch {
      setProfessores([])
      setSaidasFixas([])
      setFetchError('Erro de conexão ao carregar os pagamentos.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(selectedAno, selectedMes)
  }, [selectedAno, selectedMes, fetchData])

  useEffect(() => {
    if (modalMarkPaidFixa) {
      const t = new Date()
      setMarkPaidData(
        `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
      )
      setMarkPaidFile(null)
    }
  }, [modalMarkPaidFixa])

  const resumo = useMemo(() => {
    const totalProf = professores.reduce((s, p) => s + p.valorAPagar, 0)
    const pagoProf = professores
      .filter((p) => p.statusPagamento === 'PAGO')
      .reduce((s, p) => s + p.valorAPagar, 0)
    const totalFixas = saidasFixas.reduce((s, e) => s + e.valor, 0)
    const total = totalProf + totalFixas
    const pago = pagoProf
    return {
      total,
      pago,
      pendente: Math.round((total - pago) * 100) / 100,
      quantidadeProfessores: professores.length,
      quantidadeFixas: saidasFixas.length,
    }
  }, [professores, saidasFixas])

  const subtotalSaidasFixas = useMemo(
    () => saidasFixas.reduce((s, e) => s + e.valor, 0),
    [saidasFixas]
  )

  const grupos = useMemo(() => groupProfessoresByDueDay(professores), [professores])

  const itensAbertosLista = useMemo(() => {
    const items: {
      id: string
      nome: string
      valor: number
      aPagar: boolean
    }[] = []

    for (const p of professores) {
      if (p.statusPagamento === 'PAGO') continue
      items.push({
        id: `prof-${p.id}`,
        nome: p.nome,
        valor: p.valorAPagar,
        aPagar: p.valorAPagar > 0,
      })
    }

    for (const s of saidasFixas) {
      items.push({
        id: `fixa-${s.id}`,
        nome: s.name,
        valor: s.valor,
        aPagar: s.valor > 0,
      })
    }

    items.sort((a, b) => {
      if (a.aPagar !== b.aPagar) return a.aPagar ? -1 : 1
      if (b.valor !== a.valor) return b.valor - a.valor
      return a.nome.localeCompare(b.nome, 'pt-BR')
    })

    return items
  }, [professores, saidasFixas])

  const temCoisasAPagar = !loading && resumo.pendente > 0

  const handleMarcarPagoIndividual = async (professor: ProfessorPagamento) => {
    if (!canMarcarPagoIndividual(professor)) return
    const ok = await confirmarMarcarPagoSePeriodoAberto(professor, confirm)
    if (!ok) return
    setMarkingTeacherId(professor.id)
    setToast(null)
    try {
      const result = await postMarcarPago(professor.id, selectedAno, selectedMes)
      if (!result.ok) {
        setToast({ message: result.message, type: 'error' })
        return
      }
      setToast({ message: `${professor.nome}: pagamento registrado.`, type: 'success' })
      await fetchData(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao marcar pagamento.', type: 'error' })
    } finally {
      setMarkingTeacherId(null)
    }
  }

  const handleMarcarGrupoPago = async (grupo: GrupoPagamento) => {
    const alvos = professoresParaMarcarGrupo(grupo.professores)
    if (alvos.length === 0) return

    const algumPeriodoAberto = alvos.some((p) => isPeriodoAindaAberto(p.dataTermino))
    if (algumPeriodoAberto) {
      const ok = await confirm({
        title: 'Período ainda em andamento',
        message: `Alguns professores do ${grupo.label} ainda estão em período aberto (aulas podem continuar até o fim do ciclo). Ao marcar como pago, eles não poderão mais registrar aulas desse intervalo. Deseja continuar?`,
        confirmLabel: 'Sim, marcar todos',
        cancelLabel: 'Cancelar',
        variant: 'danger',
      })
      if (!ok) return
    }

    setMarkingGroupKey(grupo.key)
    setToast(null)
    let ok = 0
    let err = 0
    let lastError = ''

    try {
      for (const p of alvos) {
        const result = await postMarcarPago(p.id, selectedAno, selectedMes)
        if (result.ok) ok++
        else {
          err++
          lastError = result.message
        }
      }
      if (err === 0) {
        setToast({
          message: `${ok} professor(es) marcado(s) como pago no dia ${grupo.label}.`,
          type: 'success',
        })
      } else {
        setToast({
          message: `${ok} ok, ${err} erro(s). ${lastError}`,
          type: 'error',
        })
      }
      await fetchData(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao marcar pagamentos do grupo.', type: 'error' })
    } finally {
      setMarkingGroupKey(null)
    }
  }

  const submitMarcarPagoFixa = async () => {
    if (!modalMarkPaidFixa) return
    if (!markPaidData.trim()) {
      setToast({ message: 'Informe a data do pagamento.', type: 'error' })
      return
    }
    if (!markPaidFile) {
      setToast({ message: 'Anexe o comprovante (PDF ou imagem).', type: 'error' })
      return
    }
    setMarkPaidSaving(true)
    setToast(null)
    try {
      const fd = new FormData()
      fd.append('file', markPaidFile)
      const up = await fetch('/api/admin/financeiro/administracao/expenses/upload-receipt', {
        method: 'POST',
        body: fd,
        credentials: 'include',
      })
      const upJson = (await up.json()) as { ok?: boolean; message?: string; data?: { url?: string } }
      if (!up.ok || !upJson.ok || !upJson.data?.url) {
        setToast({ message: upJson.message || 'Falha ao enviar comprovante.', type: 'error' })
        return
      }
      const res = await fetch(`/api/admin/financeiro/administracao/expenses/${modalMarkPaidFixa.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentStatus: 'PAGO',
          paidAt: markPaidData,
          receiptUrl: upJson.data.url,
        }),
      })
      const json = (await res.json()) as { ok?: boolean; message?: string }
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao registrar pagamento.', type: 'error' })
        return
      }
      setToast({ message: `${modalMarkPaidFixa.name}: pagamento registrado.`, type: 'success' })
      setModalMarkPaidFixa(null)
      setMarkPaidFile(null)
      setMarkPaidData('')
      await fetchData(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao registrar pagamento.', type: 'error' })
    } finally {
      setMarkPaidSaving(false)
    }
  }

  const temConteudo = grupos.length > 0 || saidasFixas.length > 0

  return (
    <AdminLayout>
      <div className="min-w-0 w-full">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">Financeiro – Pagamentos</h1>
        <p className="text-gray-600 mt-1 text-sm sm:text-base">
          Agenda de desembolso do mês: professores por dia de vencimento e saídas fixas em aberto, com valores a
          pagar e confirmação de pagamento.
        </p>

        {/* Seletor de mês/ano */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mt-6">
          <button
            type="button"
            onClick={() => setShowPeriodo((v) => !v)}
            className="w-full flex items-center gap-2 px-5 py-4 text-left text-base font-semibold text-gray-800 hover:bg-gray-50"
          >
            <Calendar className="w-5 h-5 text-brand-orange shrink-0" />
            <span className="flex-1">
              Controle financeiro – {MESES_LABELS[selectedMes]} de {selectedAno}
            </span>
            {showPeriodo ? (
              <ChevronDown className="w-5 h-5 shrink-0" />
            ) : (
              <ChevronRight className="w-5 h-5 shrink-0" />
            )}
          </button>
          {showPeriodo && (
            <div className="px-5 pb-5 pt-0 space-y-4 border-t border-gray-200">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4">
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ano</p>
                  <div className="flex flex-wrap gap-2">
                    {ANOS_DISPONIVEIS.map((ano) => (
                      <button
                        key={ano}
                        type="button"
                        onClick={() => setSelectedAno(ano)}
                        className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                          selectedAno === ano
                            ? 'bg-brand-orange text-white shadow-sm'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {ano}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-4">Mês</p>
                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setSelectedMes(m)}
                        className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                          selectedMes === m
                            ? 'bg-brand-orange text-white shadow-sm'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {MESES_ABREV[m]}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-lg font-semibold text-gray-800 border-l-4 border-brand-orange pl-4">
                  Controle financeiro – {MESES_LABELS[selectedMes]} de {selectedAno}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Resumo do mês */}
        <section className="mt-6">
          <h2 className="text-base font-semibold text-gray-800 mb-3">Resumo do mês</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4 shadow-sm">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide flex items-center gap-1">
                <Wallet className="w-3.5 h-3.5" aria-hidden />
                Total a pagar
              </p>
              <p className="mt-1 text-xl font-bold text-amber-900 tabular-nums">
                {loading ? '—' : formatMoney(resumo.total)}
              </p>
            </div>
            <div className="rounded-xl border-2 border-green-200 bg-green-50 p-4 shadow-sm">
              <p className="text-xs font-semibold text-green-800 uppercase tracking-wide flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" aria-hidden />
                Já pago
              </p>
              <p className="mt-1 text-xl font-bold text-green-900 tabular-nums">
                {loading ? '—' : formatMoney(resumo.pago)}
              </p>
            </div>
            <div className="rounded-xl border-2 border-orange-200 bg-orange-50 p-4 shadow-sm">
              <p className="text-xs font-semibold text-orange-800 uppercase tracking-wide flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" aria-hidden />
                Pendente
              </p>
              <p className="mt-1 text-xl font-bold text-orange-900 tabular-nums">
                {loading ? '—' : formatMoney(resumo.pendente)}
              </p>
            </div>
            <div
              className={`rounded-xl border-2 border-slate-200 bg-slate-50 p-4 shadow-sm ${
                temCoisasAPagar ? 'stat-cube-blink' : ''
              }`}
            >
              <p className="text-xs font-semibold text-slate-800 uppercase tracking-wide flex items-center gap-1">
                <Users className="w-3.5 h-3.5" aria-hidden />
                Itens em aberto
              </p>
              <p className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
                {loading ? '—' : itensAbertosLista.length}
              </p>
              {!loading && itensAbertosLista.length > 0 ? (
                <div
                  className={`mt-2 space-y-1 pr-0.5 text-xs ${
                    itensAbertosLista.length > 4 ? 'max-h-[5.5rem] overflow-y-auto' : ''
                  }`}
                >
                  {itensAbertosLista.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between gap-2 rounded-md px-1.5 py-0.5 ${
                        item.aPagar ? 'bg-orange-100/80 text-slate-900' : 'text-slate-600'
                      }`}
                    >
                      <span className="truncate font-medium">{item.nome}</span>
                      <span className="shrink-0 tabular-nums font-semibold">{formatMoney(item.valor)}</span>
                    </div>
                  ))}
                </div>
              ) : !loading ? (
                <p className="mt-1 text-xs text-slate-500">Nenhum item pendente</p>
              ) : null}
            </div>
          </div>
        </section>

        {/* Erro de fetch */}
        {fetchError && !loading && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {fetchError}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <SeidmannLoading message="Carregando pagamentos…" variant="section" className="mt-8 py-16" />
        )}

        {/* Grupos por dia + saídas fixas */}
        {!loading && !fetchError && (
          <section className="mt-8 space-y-6">
            {!temConteudo ? (
              <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-600">
                Nenhum pagamento pendente neste mês.
              </div>
            ) : null}

            {grupos.map((grupo) => {
                const grupoLoading = markingGroupKey === grupo.key
                const podeMarcarGrupo = canMarcarPagoGrupo(grupo.professores)

                return (
                  <div
                    key={String(grupo.key)}
                    className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 bg-gray-50 border-b border-gray-200">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900">{grupo.label}</h3>
                        <p className="text-sm text-gray-600 mt-0.5">
                          {formatMoney(grupo.subtotal)}{' '}
                          <span className="text-gray-400">·</span>{' '}
                          ({grupo.professores.length}{' '}
                          {grupo.professores.length === 1 ? 'professor' : 'professores'})
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="primary"
                        disabled={!podeMarcarGrupo || grupoLoading || markingTeacherId != null}
                        onClick={() => handleMarcarGrupoPago(grupo)}
                        className="shrink-0"
                      >
                        {grupoLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden />
                            Processando…
                          </>
                        ) : (
                          'Marcar todos como pagos'
                        )}
                      </Button>
                    </div>

                    <ul className="divide-y divide-gray-100">
                      {grupo.professores.map((p) => {
                        const rowLoading = markingTeacherId === p.id
                        const showNfAviso = !p.proofFileUrl && p.statusPagamento !== 'PAGO'
                        const podeMarcar = canMarcarPagoIndividual(p)

                        return (
                          <li
                            key={p.id}
                            className="flex flex-col lg:flex-row lg:items-center gap-3 px-5 py-4 hover:bg-gray-50/60"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 truncate">{p.nome}</p>
                              {p.metodoPagamento ? (
                                <p className="text-xs text-gray-500 mt-0.5">{p.metodoPagamento}</p>
                              ) : null}
                            </div>

                            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                              <div>
                                <span className="text-gray-500 text-xs block">Valor a pagar</span>
                                <span className="font-semibold text-gray-900 tabular-nums">
                                  {formatMoney(p.valorAPagar)}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-500 text-xs block">Horas registradas</span>
                                <span className="font-medium text-gray-800 tabular-nums">
                                  {p.totalHorasRegistradas.toFixed(2)} h
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <StatusBadge status={p.statusPagamento} />
                                {showNfAviso && (
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-900 border border-yellow-300"
                                    title="Nota fiscal ou recibo ainda não anexado"
                                  >
                                    <AlertTriangle className="w-3 h-3" aria-hidden />
                                    NF não enviada
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="shrink-0 lg:ml-2">
                              {p.statusPagamento === 'PAGO' ? (
                                <span className="inline-flex items-center gap-1 text-sm font-medium text-green-700 px-3 py-2">
                                  <CheckCircle className="w-4 h-4" aria-hidden />
                                  Pago
                                </span>
                              ) : podeMarcar ? (
                                <Button
                                  type="button"
                                  variant="primary"
                                  disabled={rowLoading || markingGroupKey != null}
                                  onClick={() => handleMarcarPagoIndividual(p)}
                                  className="whitespace-nowrap"
                                >
                                  {rowLoading ? (
                                    <>
                                      <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden />
                                      Enviando…
                                    </>
                                  ) : (
                                    'Marcar pago'
                                  )}
                                </Button>
                              ) : (
                                <span className="text-sm text-gray-400 px-3 py-2">—</span>
                              )}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}

            {saidasFixas.length > 0 ? (
              <div className="bg-white rounded-xl border-2 border-cyan-200 shadow-sm overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 bg-cyan-50 border-b border-cyan-200">
                  <div>
                    <h3 className="text-base font-semibold text-cyan-950 flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-cyan-700" aria-hidden />
                      Saídas fixas
                    </h3>
                    <p className="text-sm text-cyan-800 mt-0.5">
                      {formatMoney(subtotalSaidasFixas)}{' '}
                      <span className="text-cyan-600/70">·</span> ({saidasFixas.length}{' '}
                      {saidasFixas.length === 1 ? 'despesa' : 'despesas'} em aberto)
                    </p>
                    <p className="text-xs text-cyan-700 mt-1">
                      Internet, aluguel etc. Para marcar como pago é obrigatório informar data e anexar comprovante.
                    </p>
                  </div>
                </div>

                <ul className="divide-y divide-gray-100">
                  {saidasFixas.map((e) => (
                    <li
                      key={e.id}
                      className="flex flex-col lg:flex-row lg:items-center gap-3 px-5 py-4 hover:bg-gray-50/60"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{e.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{humanDescription(e.description)}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                        <div>
                          <span className="text-gray-500 text-xs block">Valor a pagar</span>
                          <span className="font-semibold text-gray-900 tabular-nums">{formatMoney(e.valor)}</span>
                        </div>
                        <DespesaStatusBadge status={e.paymentStatus} />
                      </div>

                      <div className="shrink-0 lg:ml-2">
                        <Button
                          type="button"
                          variant="primary"
                          disabled={markPaidSaving || markingTeacherId != null || markingGroupKey != null}
                          onClick={() => setModalMarkPaidFixa(e)}
                          className="whitespace-nowrap"
                        >
                          Marcar pago
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        )}
      </div>

      <Modal
        isOpen={!!modalMarkPaidFixa}
        onClose={() => {
          if (markPaidSaving) return
          setModalMarkPaidFixa(null)
          setMarkPaidFile(null)
        }}
        title="Marcar despesa fixa como paga"
        size="md"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setModalMarkPaidFixa(null)}
              disabled={markPaidSaving}
            >
              Cancelar
            </Button>
            <Button onClick={() => void submitMarcarPagoFixa()} disabled={markPaidSaving}>
              {markPaidSaving ? 'Salvando…' : 'Confirmar pagamento'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            <strong>{modalMarkPaidFixa?.name}</strong>
            {modalMarkPaidFixa ? ` — ${formatMoney(modalMarkPaidFixa.valor)}` : ''}
          </p>
          <div>
            <label htmlFor="pagamentos-fixa-data" className="block text-sm font-medium text-gray-700 mb-1">
              Data em que foi pago *
            </label>
            <input
              id="pagamentos-fixa-data"
              type="date"
              value={markPaidData}
              onChange={(ev) => setMarkPaidData(ev.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>
          <div>
            <label htmlFor="pagamentos-fixa-comprovante" className="block text-sm font-medium text-gray-700 mb-1">
              Comprovante (PDF ou imagem) *
            </label>
            <input
              id="pagamentos-fixa-comprovante"
              type="file"
              accept=".pdf,image/png,image/jpeg,image/webp"
              onChange={(ev) => setMarkPaidFile(ev.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-600"
            />
            {markPaidFile ? (
              <p className="text-xs text-gray-500 mt-1">Arquivo: {markPaidFile.name}</p>
            ) : null}
          </div>
        </div>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <ConfirmDialog />
    </AdminLayout>
  )
}
