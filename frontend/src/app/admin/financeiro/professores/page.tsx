/**
 * Financeiro – Professores
 * Mesmas regras de mês/ano do financeiro dos alunos: seleção de ano e mês; status e valores por mês (TeacherPaymentMonth).
 */

'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import AdminLayout from '@/components/admin/AdminLayout'
import Table, { Column } from '@/components/admin/Table'
import Modal from '@/components/admin/Modal'
import Button from '@/components/ui/Button'
import Toast from '@/components/admin/Toast'
import { Calendar, Wallet, CheckCircle, Users, Copy, ThumbsUp, AlertTriangle, Clock, MessageSquare, Trash2, Loader2, ChevronDown, ChevronRight, Send, RefreshCw, Pencil } from 'lucide-react'

const MESES_LABELS: Record<number, string> = {
  1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 6: 'Junho',
  7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro',
}
const MESES_ABREV: Record<number, string> = {
  1: 'Jan', 2: 'Fev', 3: 'Mar', 4: 'Abr', 5: 'Mai', 6: 'Jun',
  7: 'Jul', 8: 'Ago', 9: 'Set', 10: 'Out', 11: 'Nov', 12: 'Dez',
}
const ANOS_DISPONIVEIS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i)

interface ProfessorFinanceiro {
  id: string
  nome: string
  valorPorHora: number
  dataInicio: string
  dataTermino: string
  diaPagamento?: number
  totalHorasEstimadas: number
  totalHorasRegistradas: number
  totalRegistrosEsperados: number
  valorPorHoras: number
  valorPorPeriodo: number
  valorExtra: number
  valorAPagar: number
  metodoPagamento: string | null
  infosPagamento: string | null
  statusPagamento: 'PAGO' | 'EM_ABERTO'
  pagamentoProntoParaFazer: boolean
  hasFinanceObservations?: boolean
}

function formatDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR')
}

function formatMoney(n: number): string {
  return `R$ ${Number(n).toFixed(2).replace('.', ',')}`
}

function getDiaPagamento(p: ProfessorFinanceiro): number {
  if (typeof p.diaPagamento === 'number' && p.diaPagamento >= 1 && p.diaPagamento <= 31) {
    return p.diaPagamento
  }
  return new Date(p.dataTermino + 'T12:00:00').getDate()
}

function nextDueDateFromDay(day: number, afterDate: Date): Date {
  const year = afterDate.getFullYear()
  const month = afterDate.getMonth()
  const safeDay = Math.min(day, new Date(year, month + 1, 0).getDate())
  const candidate = new Date(year, month, safeDay)
  candidate.setHours(0, 0, 0, 0)
  if (candidate >= afterDate) return candidate
  const nextSafe = Math.min(day, new Date(year, month + 2, 0).getDate())
  const next = new Date(year, month + 1, nextSafe)
  next.setHours(0, 0, 0, 0)
  return next
}

/** Vencimento (dia pagto.) está nos próximos 7 dias (hoje inclusive). */
function isProximoPagamento(diaPagamento: number): boolean {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const vencimento = nextDueDateFromDay(diaPagamento, hoje)
  const em7Dias = new Date(hoje)
  em7Dias.setDate(em7Dias.getDate() + 7)
  return vencimento.getTime() >= hoje.getTime() && vencimento.getTime() <= em7Dias.getTime()
}

/** Vencimento (dia pagto.) já passou no mês atual. */
function isAtrasado(diaPagamento: number): boolean {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const thisMonthDue = new Date(
    hoje.getFullYear(),
    hoje.getMonth(),
    Math.min(diaPagamento, new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate())
  )
  thisMonthDue.setHours(0, 0, 0, 0)
  return thisMonthDue.getTime() < hoje.getTime()
}

function CellWithCopy({
  value,
  onCopy,
  className = '',
  truncate = false,
}: {
  value: string
  onCopy: () => void
  className?: string
  truncate?: boolean
}) {
  const text = value || '—'
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span className={truncate ? 'max-w-[200px] truncate block' : ''} title={text}>
        {text}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          if (text !== '—') {
            navigator.clipboard.writeText(text).then(() => onCopy())
          }
        }}
        className="p-0.5 rounded text-gray-400 hover:text-orange-600 hover:bg-orange-50 flex-shrink-0"
        title="Copiar"
        aria-label="Copiar"
      >
        <Copy className="w-4 h-4" />
      </button>
    </span>
  )
}

export default function FinanceiroProfessoresPage() {
  const anoAtual = new Date().getFullYear()
  const mesAtual = new Date().getMonth() + 1
  const [selectedAno, setSelectedAno] = useState<number>(anoAtual)
  const [selectedMes, setSelectedMes] = useState<number>(mesAtual)

  const [professores, setProfessores] = useState<ProfessorFinanceiro[]>([])
  const [loading, setLoading] = useState(true)
  const [editPeriodo, setEditPeriodo] = useState<ProfessorFinanceiro | null>(null)
  const [dueDay, setDueDay] = useState('')
  const [valorPorPeriodo, setValorPorPeriodo] = useState('')
  const [valorExtra, setValorExtra] = useState('')
  const [metodoPagamento, setMetodoPagamento] = useState('')
  const [infosPagamento, setInfosPagamento] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [filterAlerta, setFilterAlerta] = useState<'todos' | 'proximo' | 'atrasados'>('todos')
  const [obsModal, setObsModal] = useState<{ teacherId: string; nome: string } | null>(null)
  const [obsList, setObsList] = useState<{ id: string; message: string; criadoEm: string }[]>([])
  const [obsNewMessage, setObsNewMessage] = useState('')
  const [obsLoading, setObsLoading] = useState(false)
  const [obsSaving, setObsSaving] = useState(false)
  const [itemsPerPage, setItemsPerPage] = useState<number>(30)
  const [showPeriodo, setShowPeriodo] = useState(false)
  // Modal Enviar notificação de pagamento (e-mail + anexo)
  const [notifyTeacher, setNotifyTeacher] = useState<ProfessorFinanceiro | null>(null)
  const [notifyMessage, setNotifyMessage] = useState('')
  const [notifyFile, setNotifyFile] = useState<File | null>(null)
  const [sendingNotify, setSendingNotify] = useState(false)
  const [filterBusca, setFilterBusca] = useState('')
  /** Filtro por status: '' = todos, 'em_aberto' | 'pronto_pagar' | 'pago' */
  const [filterStatus, setFilterStatus] = useState<'' | 'em_aberto' | 'pronto_pagar' | 'pago'>('')
  const [filterProximosDias, setFilterProximosDias] = useState(false)
  const [filterDataDe, setFilterDataDe] = useState('')
  const [filterDataAte, setFilterDataAte] = useState('')
  const [showFilterData, setShowFilterData] = useState(false)
  const filterDataRef = useRef<HTMLDivElement>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [modalDueDay, setModalDueDay] = useState<{ open: boolean; day: string }>({ open: false, day: '' })
  const [savingBulkDates, setSavingBulkDates] = useState(false)
  const [zerandoEmAberto, setZerandoEmAberto] = useState(false)
  const [confirmZerarEmAbertoOpen, setConfirmZerarEmAbertoOpen] = useState(false)
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null)
  const COLUMN_KEYS_FINANCEIRO_PROF = [
    'select', 'nome', 'valorPorHora', 'diaPagamento', 'totalHorasEstimadas', 'totalHorasRegistradas',
    'valorPorHoras', 'totalRegistrosEsperados', 'valorPorPeriodo', 'valorExtra', 'valorAPagar',
    'pagamentoProntoParaFazer', 'metodoPagamento', 'infosPagamento', 'statusPagamento', 'acoes',
  ] as const
  // Por padrão ocultar: Registros esperados, Valor por período, Valores extras (podem ser exibidas em Colunas)
  const DEFAULT_VISIBLE_FINANCEIRO_PROF = [
    'select', 'nome', 'valorPorHora', 'diaPagamento', 'totalHorasEstimadas', 'totalHorasRegistradas',
    'valorAPagar', 'pagamentoProntoParaFazer', 'metodoPagamento', 'infosPagamento', 'statusPagamento', 'acoes',
  ]
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>(() => [...DEFAULT_VISIBLE_FINANCEIRO_PROF])

  const fetchData = useCallback(async (ano: number, mes: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/financeiro/professores?year=${ano}&month=${mes}`)
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setProfessores([])
        return
      }
      setProfessores(json.data?.professores ?? [])
    } catch {
      setProfessores([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setFilterAlerta('todos')
    fetchData(selectedAno, selectedMes)
  }, [selectedAno, selectedMes, fetchData])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterDataRef.current && !filterDataRef.current.contains(e.target as Node)) {
        setShowFilterData(false)
      }
    }
    if (showFilterData) {
      document.addEventListener('click', handleClickOutside)
    }
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showFilterData])

  const cubos = useMemo(() => {
    // Valor estimado = soma (valor/hora × horas estimadas) de cada professor
    const valorEstimado = professores.reduce(
      (s, p) => s + (p.valorPorHora ?? 0) * (p.totalHorasEstimadas ?? 0),
      0
    )
    // Valor real de horas preenchidas = soma (horas registradas × valor/hora) de cada professor
    const valorRealHorasPreenchidas = professores.reduce(
      (s, p) => s + (p.totalHorasRegistradas ?? 0) * (p.valorPorHora ?? 0),
      0
    )
    const totalValorPeriodo = professores.reduce((s, p) => s + (p.valorPorPeriodo ?? 0), 0)
    const totalValorExtra = professores.reduce((s, p) => s + (p.valorExtra ?? 0), 0)
    const valorRealTotal = valorRealHorasPreenchidas + totalValorPeriodo + totalValorExtra
    const totalAPagar = professores.reduce((s, p) => s + p.valorAPagar, 0)
    const valoresPagos = professores
      .filter((p) => p.statusPagamento === 'PAGO')
      .reduce((s, p) => s + p.valorAPagar, 0)
    const totalProfessoresAtivos = professores.length
    return {
      valorEstimado: Math.round(valorEstimado * 100) / 100,
      valorRealHorasPreenchidas: Math.round(valorRealHorasPreenchidas * 100) / 100,
      totalValorPeriodo: Math.round(totalValorPeriodo * 100) / 100,
      totalValorExtra: Math.round(totalValorExtra * 100) / 100,
      valorRealTotal: Math.round(valorRealTotal * 100) / 100,
      totalAPagar: Math.round(totalAPagar * 100) / 100,
      valoresPagos: Math.round(valoresPagos * 100) / 100,
      totalProfessoresAtivos,
    }
  }, [professores])

  const { proximoPagamento, atrasados } = useMemo(() => {
    const emAberto = professores.filter((p) => p.statusPagamento === 'EM_ABERTO')
    const proximo = emAberto.filter((p) => isProximoPagamento(getDiaPagamento(p)))
    const atrasadosList = emAberto.filter((p) => isAtrasado(getDiaPagamento(p)))
    return { proximoPagamento: proximo, atrasados: atrasadosList }
  }, [professores])
  const totalEmAberto = useMemo(
    () => professores.filter((p) => p.statusPagamento === 'EM_ABERTO').length,
    [professores]
  )

  /** Próxima data de vencimento (data término) entre os em aberto, e valor estimado nessa data */
  const { proximaDataPagamento, valorEstimadoProximoPagamento, listaProximaData } = useMemo(() => {
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const emAberto = professores.filter((p) => p.statusPagamento === 'EM_ABERTO')
    const comVencimentoFuturo = emAberto.filter((p) => {
      const termino = new Date(p.dataTermino + 'T12:00:00')
      termino.setHours(0, 0, 0, 0)
      return termino.getTime() >= hoje.getTime()
    })
    if (comVencimentoFuturo.length === 0) {
      return { proximaDataPagamento: null as string | null, valorEstimadoProximoPagamento: 0, listaProximaData: [] as ProfessorFinanceiro[] }
    }
    const datasOrdenadas = [...new Set(comVencimentoFuturo.map((p) => p.dataTermino))].sort()
    const proximaData = datasOrdenadas[0]
    const lista = comVencimentoFuturo.filter((p) => p.dataTermino === proximaData)
    const valor = lista.reduce((s, p) => s + p.valorAPagar, 0)
    return {
      proximaDataPagamento: proximaData,
      valorEstimadoProximoPagamento: Math.round(valor * 100) / 100,
      listaProximaData: lista,
    }
  }, [professores])

  const [listCuboOpen, setListCuboOpen] = useState<null | 'proximaData' | 'atrasados'>(null)

  const tabelaData = useMemo(() => {
    let list = professores
    if (filterAlerta === 'proximo') list = proximoPagamento
    else if (filterAlerta === 'atrasados') list = atrasados

    // Filtro por busca (nome)
    const busca = filterBusca.trim().toLowerCase()
    if (busca) {
      list = list.filter((p) => p.nome.toLowerCase().includes(busca))
    }

    // Filtro por status (dropdown)
    if (filterStatus === 'pago') {
      list = list.filter((p) => p.statusPagamento === 'PAGO')
    } else if (filterStatus === 'pronto_pagar') {
      list = list.filter((p) => p.pagamentoProntoParaFazer && p.statusPagamento === 'EM_ABERTO')
    } else if (filterStatus === 'em_aberto') {
      list = list.filter((p) => p.statusPagamento === 'EM_ABERTO' && !p.pagamentoProntoParaFazer)
    }

    // Filtro por data de término (próximos dias)
    if (filterProximosDias) {
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)
      const em7 = new Date(hoje)
      em7.setDate(em7.getDate() + 7)
      list = list.filter((p) => {
        const termino = new Date(p.dataTermino + 'T12:00:00')
        termino.setHours(0, 0, 0, 0)
        return termino.getTime() >= hoje.getTime() && termino.getTime() <= em7.getTime()
      })
    }

    // Filtro por data de pagamento (vencimento)
    if (filterDataDe) {
      const de = new Date(filterDataDe + 'T12:00:00')
      de.setHours(0, 0, 0, 0)
      list = list.filter((p) => {
        const termino = new Date(p.dataTermino + 'T12:00:00')
        termino.setHours(0, 0, 0, 0)
        return termino.getTime() >= de.getTime()
      })
    }
    if (filterDataAte) {
      const ate = new Date(filterDataAte + 'T23:59:59')
      ate.setHours(23, 59, 59, 999)
      list = list.filter((p) => {
        const termino = new Date(p.dataTermino + 'T12:00:00')
        return termino.getTime() <= ate.getTime()
      })
    }

    // Ordenação: com alerta (observações) sempre no topo; depois em aberto por data; depois pagos
    list = [...list].sort((a, b) => {
      const aAlerta = !!a.hasFinanceObservations
      const bAlerta = !!b.hasFinanceObservations
      if (aAlerta && !bAlerta) return -1
      if (!aAlerta && bAlerta) return 1
      const aAberto = a.statusPagamento === 'EM_ABERTO'
      const bAberto = b.statusPagamento === 'EM_ABERTO'
      if (aAberto && !bAberto) return -1
      if (!aAberto && bAberto) return 1
      const ta = new Date(a.dataTermino + 'T12:00:00').getTime()
      const tb = new Date(b.dataTermino + 'T12:00:00').getTime()
      if (aAberto && bAberto) return ta - tb // em aberto: vencimento mais próximo primeiro
      return tb - ta || (a.nome ?? '').localeCompare(b.nome ?? '') // pagos: mais recente primeiro, depois nome
    })

    return list
  }, [professores, filterAlerta, proximoPagamento, atrasados, filterBusca, filterStatus, filterProximosDias, filterDataDe, filterDataAte])

  const displayedData = useMemo(
    () => tabelaData.slice(0, itemsPerPage),
    [tabelaData, itemsPerPage]
  )

  const openEditPeriodo = (row: ProfessorFinanceiro) => {
    setEditPeriodo(row)
    setDueDay(String(new Date(row.dataTermino + 'T12:00:00').getDate()))
    setValorPorPeriodo(row.valorPorPeriodo ? String(row.valorPorPeriodo) : '')
    setValorExtra(row.valorExtra ? String(row.valorExtra) : '')
    setMetodoPagamento(row.metodoPagamento ?? '')
    setInfosPagamento(row.infosPagamento ?? '')
  }

  const handleCopy = useCallback(() => {
    setToast({ message: 'Copiado!', type: 'success' })
    setTimeout(() => setToast(null), 2000)
  }, [])

  const closeEditPeriodo = () => {
    setEditPeriodo(null)
    setToast(null)
  }

  useEffect(() => {
    if (!obsModal) {
      setObsList([])
      setObsNewMessage('')
      return
    }
    setObsLoading(true)
    fetch(`/api/admin/financeiro/observations?teacherId=${encodeURIComponent(obsModal.teacherId)}`, {
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && Array.isArray(j.data)) setObsList(j.data)
        else setObsList([])
      })
      .catch(() => setObsList([]))
      .finally(() => setObsLoading(false))
  }, [obsModal?.teacherId])

  const addObservation = async () => {
    if (!obsModal || !obsNewMessage.trim() || obsSaving) return
    setObsSaving(true)
    try {
      const res = await fetch('/api/admin/financeiro/observations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ teacherId: obsModal.teacherId, message: obsNewMessage.trim() }),
      })
      const j = await res.json()
      if (res.ok && j.ok && j.data) {
        setObsList((prev) => [j.data, ...prev])
        setObsNewMessage('')
        setToast({ message: 'Observação adicionada', type: 'success' })
        fetchData(selectedAno, selectedMes)
      } else {
        setToast({ message: j.message || 'Erro ao adicionar', type: 'error' })
      }
    } catch {
      setToast({ message: 'Erro ao adicionar observação', type: 'error' })
    } finally {
      setObsSaving(false)
    }
  }

  const deleteObservation = async (obsId: string) => {
    try {
      const res = await fetch(`/api/admin/financeiro/observations/${obsId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const j = await res.json()
      if (res.ok && j.ok) {
        setObsList((prev) => prev.filter((o) => o.id !== obsId))
        setToast({ message: 'Observação removida', type: 'success' })
        fetchData(selectedAno, selectedMes)
      } else {
        setToast({ message: j.message || 'Erro ao remover', type: 'error' })
      }
    } catch {
      setToast({ message: 'Erro ao remover', type: 'error' })
    }
  }

  const openNotifyModal = (row: ProfessorFinanceiro) => {
    const mesNome = MESES_LABELS[selectedMes] ?? String(selectedMes)
    const valorStr = formatMoney(row.valorAPagar)
    const defaultMessage = `Olá,

Informamos que o pagamento referente à prestação de serviços de ${mesNome} de ${selectedAno} foi confirmado.
O valor é de ${valorStr}.

Em caso de dúvidas, entre em contato com a gestão financeira.

Atenciosamente,
Equipe Seidmann Institute`
    setNotifyTeacher(row)
    setNotifyMessage(defaultMessage)
    setNotifyFile(null)
  }

  const submitNotifyPayment = async () => {
    if (!notifyTeacher) return
    setSendingNotify(true)
    setToast(null)
    try {
      const formData = new FormData()
      formData.set('year', String(selectedAno))
      formData.set('month', String(selectedMes))
      formData.set('message', notifyMessage)
      if (notifyFile) formData.set('attachment', notifyFile)
      const res = await fetch(`/api/admin/financeiro/professores/${notifyTeacher.id}/notify-payment`, {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao enviar notificação.', type: 'error' })
        return
      }
      setToast({ message: json.message || 'Notificação enviada.', type: 'success' })
      await fetchData(selectedAno, selectedMes)
      setNotifyTeacher(null)
    } catch {
      setToast({ message: 'Erro ao enviar notificação.', type: 'error' })
    } finally {
      setSendingNotify(false)
    }
  }

  const updatePagamento = async (teacherId: string, pago: boolean) => {
    try {
      const res = await fetch(`/api/admin/financeiro/professores/${teacherId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: selectedAno,
          month: selectedMes,
          paymentStatus: pago ? 'PAGO' : 'EM_ABERTO',
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) return
      await fetchData(selectedAno, selectedMes)
    } catch {
      // silencioso
    }
  }

  const zerarPeriodosEmAberto = async () => {
    const idsEmAberto = professores.filter((p) => p.statusPagamento === 'EM_ABERTO').map((p) => p.id)
    if (idsEmAberto.length === 0) {
      setToast({ message: 'Não há pagamentos em aberto para zerar.', type: 'error' })
      return
    }

    setZerandoEmAberto(true)
    setToast(null)
    try {
      let ok = 0
      let err = 0
      for (const id of idsEmAberto) {
        const res = await fetch(`/api/admin/financeiro/professores/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            year: selectedAno,
            month: selectedMes,
            valorPorPeriodo: 0,
          }),
        })
        const json = await res.json().catch(() => ({}))
        if (res.ok && json?.ok) ok++
        else err++
      }

      setToast({
        message:
          err === 0
            ? `Valor por período zerado com sucesso em ${ok} professor(es).`
            : `Zerados: ${ok}. Com erro: ${err}.`,
        type: err === 0 ? 'success' : 'error',
      })
      await fetchData(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao zerar períodos em aberto.', type: 'error' })
    } finally {
      setZerandoEmAberto(false)
    }
  }

  const savePeriodo = async () => {
    if (!editPeriodo) return
    const day = parseInt(dueDay, 10)
    if (!Number.isFinite(day) || day < 1 || day > 31) {
      setToast({ message: 'Informe um dia de pagamento válido (1-31).', type: 'error' })
      return
    }
    setSaving(true)
    setToast(null)
    try {
      const res = await fetch(`/api/admin/financeiro/professores/${editPeriodo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: selectedAno,
          month: selectedMes,
          dueDay: day,
          valorPorPeriodo: valorPorPeriodo ? Number(valorPorPeriodo) : null,
          valorExtra: valorExtra ? Number(valorExtra) : null,
          metodoPagamento: metodoPagamento.trim() || null,
          infosPagamento: infosPagamento.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao salvar.', type: 'error' })
        return
      }
      setToast({ message: 'Dados atualizados (período, valores e infos salvas no professor).', type: 'success' })
      await fetchData(selectedAno, selectedMes)
      setTimeout(() => {
        closeEditPeriodo()
      }, 800)
    } catch {
      setToast({ message: 'Erro ao salvar.', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    const allSelected = tabelaData.length > 0 && tabelaData.every((p) => selectedIds.has(p.id))
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(tabelaData.map((p) => p.id)))
    }
  }

  const allSelected = tabelaData.length > 0 && tabelaData.every((p) => selectedIds.has(p.id))
  const someSelected = tabelaData.some((p) => selectedIds.has(p.id))

  useEffect(() => {
    const el = selectAllCheckboxRef.current
    if (el) el.indeterminate = someSelected && !allSelected
  }, [someSelected, allSelected])

  const openModalDueDay = () => {
    setModalDueDay({ open: true, day: '' })
  }

  const saveBulkDueDay = async () => {
    const day = parseInt(modalDueDay.day, 10)
    if (!Number.isFinite(day) || day < 1 || day > 31) {
      setToast({ message: 'Informe um dia de pagamento válido (1-31).', type: 'error' })
      return
    }
    const ids = Array.from(selectedIds)
    if (ids.length === 0) {
      setToast({ message: 'Selecione ao menos um professor.', type: 'error' })
      return
    }
    setSavingBulkDates(true)
    setToast(null)
    try {
      let ok = 0
      let err = 0
      for (const id of ids) {
        const res = await fetch(`/api/admin/financeiro/professores/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            year: selectedAno,
            month: selectedMes,
            dueDay: day,
          }),
        })
        const json = await res.json()
        if (res.ok && json.ok) ok++
        else err++
      }
      setToast({
        message: err === 0 ? `Dia de pagamento definido para ${ok} professor(es).` : `${ok} atualizado(s), ${err} erro(s).`,
        type: err === 0 ? 'success' : 'error',
      })
      await fetchData(selectedAno, selectedMes)
      setModalDueDay({ open: false, day: '' })
      setSelectedIds(new Set())
    } catch {
      setToast({ message: 'Erro ao atualizar dia de pagamento.', type: 'error' })
    } finally {
      setSavingBulkDates(false)
    }
  }

  const columns: Column<ProfessorFinanceiro>[] = [
    {
      key: 'select',
      label: ' ',
      fixed: true,
      render: (row) => (
        <input
          type="checkbox"
          checked={selectedIds.has(row.id)}
          onChange={() => toggleSelect(row.id)}
          onClick={(e) => e.stopPropagation()}
          className="rounded border-gray-300 text-brand-orange focus:ring-orange-500"
          aria-label={`Selecionar ${row.nome}`}
        />
      ),
    },
    {
      key: 'nome',
      label: 'Professor',
      fixed: true,
      render: (row) => <CellWithCopy value={row.nome} onCopy={handleCopy} />,
    },
    {
      key: 'valorPorHora',
      label: 'Valor/hora',
      render: (row) => (
        <CellWithCopy value={formatMoney(row.valorPorHora)} onCopy={handleCopy} />
      ),
    },
    {
      key: 'diaPagamento',
      label: 'Dia pagto.',
      render: (row) => (
        <CellWithCopy value={String(new Date(row.dataTermino + 'T12:00:00').getDate())} onCopy={handleCopy} />
      ),
    },
    {
      key: 'totalHorasEstimadas',
      label: 'Horas estimadas',
      render: (row) => (
        <CellWithCopy value={row.totalHorasEstimadas.toFixed(2)} onCopy={handleCopy} />
      ),
    },
    {
      key: 'totalHorasRegistradas',
      label: 'Horas registradas',
      render: (row) => (
        <CellWithCopy value={row.totalHorasRegistradas.toFixed(2)} onCopy={handleCopy} />
      ),
    },
    {
      key: 'valorPorHoras',
      label: 'Valor a receber por horas',
      render: (row) => (
        <CellWithCopy value={formatMoney(row.valorPorHoras)} onCopy={handleCopy} />
      ),
    },
    {
      key: 'totalRegistrosEsperados',
      label: 'Registros esperados',
      render: (row) => (
        <CellWithCopy value={String(row.totalRegistrosEsperados)} onCopy={handleCopy} />
      ),
    },
    {
      key: 'valorPorPeriodo',
      label: 'Valor por período',
      render: (row) => (
        <CellWithCopy value={formatMoney(row.valorPorPeriodo)} onCopy={handleCopy} />
      ),
    },
    {
      key: 'valorExtra',
      label: 'Valores extras',
      render: (row) => (
        <CellWithCopy value={formatMoney(row.valorExtra)} onCopy={handleCopy} />
      ),
    },
    {
      key: 'valorAPagar',
      label: 'Valor a pagar',
      fixed: true,
      align: 'right',
      render: (row) => (
        <CellWithCopy value={formatMoney(row.valorAPagar)} onCopy={handleCopy} />
      ),
    },
    {
      key: 'pagamentoProntoParaFazer',
      label: 'Status',
      fixed: true,
      align: 'center',
      render: (row) => {
        if (row.statusPagamento === 'PAGO') {
          return (
            <span
              className="inline-flex items-center gap-1 text-green-700"
              title="Pagamento realizado para este mês"
            >
              <ThumbsUp className="w-5 h-5" />
              <span className="text-xs font-medium hidden sm:inline">Pago</span>
            </span>
          )
        }
        if (row.pagamentoProntoParaFazer) {
          return (
            <span
              className="inline-flex items-center gap-1 text-emerald-700"
              title="Pagamento pronto para fazer (professor confirmou o valor)"
            >
              <ThumbsUp className="w-5 h-5" />
              <span className="text-xs font-medium hidden sm:inline">Pronto p/ pagar</span>
            </span>
          )
        }
        return (
          <span
            className="inline-flex items-center gap-1 text-amber-700"
            title="Pagamento em aberto"
          >
            <Clock className="w-5 h-5" />
            <span className="text-xs font-medium hidden sm:inline">Em aberto</span>
          </span>
        )
      },
    },
    {
      key: 'metodoPagamento',
      label: 'Metodo',
      render: (row) => (
        <CellWithCopy value={row.metodoPagamento ?? ''} onCopy={handleCopy} />
      ),
    },
    {
      key: 'infosPagamento',
      label: 'Infos de pagamento',
      render: (row) => (
        <CellWithCopy value={row.infosPagamento ?? ''} onCopy={handleCopy} truncate />
      ),
    },
    {
      key: 'statusPagamento',
      label: 'Pagamento',
      render: (row) => (
        <select
          value={row.statusPagamento}
          onChange={(e) => updatePagamento(row.id, e.target.value === 'PAGO')}
          className="rounded border border-gray-300 px-2 py-1 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
        >
          <option value="EM_ABERTO">Em aberto</option>
          <option value="PAGO">Pago</option>
        </select>
      ),
    },
    {
      key: 'acoes',
      label: '',
      render: (row) => (
        <div className="inline-flex items-center gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => setObsModal({ teacherId: row.id, nome: row.nome })}
            className={`p-1.5 rounded ${row.hasFinanceObservations ? 'text-orange-600 hover:text-orange-700 hover:bg-orange-50' : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50'}`}
            title={row.hasFinanceObservations ? 'Observações (há notificações)' : 'Observações'}
          >
            <MessageSquare className={`w-4 h-4 ${row.hasFinanceObservations ? 'fill-current' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => openEditPeriodo(row)}
            className="p-1.5 rounded text-orange-600 hover:bg-orange-50"
            title="Editar mês"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => openNotifyModal(row)}
            className="p-1.5 rounded text-green-700 hover:bg-green-50"
            title="Notificar pagamento"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <AdminLayout>
      <div className="min-w-0 w-full">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">Financeiro – Professores</h1>
        <p className="text-gray-600 mt-1 text-sm sm:text-base">
          Gestão financeira relacionada aos professores (pagamento de aulas, etc.). Selecione ano e mês; status e valores são independentes por mês (como no financeiro dos alunos).
        </p>

        {/* Seção: Período (ano e mês) - Recolhível */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mt-6">
          <button
            type="button"
            onClick={() => setShowPeriodo((v) => !v)}
            className="w-full flex items-center gap-2 px-5 py-4 text-left text-base font-semibold text-gray-800 hover:bg-gray-50"
          >
            <Calendar className="w-5 h-5 text-brand-orange shrink-0" />
            <span className="flex-1">Controle financeiro – {MESES_LABELS[selectedMes]} de {selectedAno}</span>
            {showPeriodo ? <ChevronDown className="w-5 h-5 shrink-0" /> : <ChevronRight className="w-5 h-5 shrink-0" />}
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
                          selectedAno === ano ? 'bg-brand-orange text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
                          selectedMes === m ? 'bg-brand-orange text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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

        {/* Seção: Resumo do mês (cubos) */}
        <section className="mt-6">
          <h2 className="text-base font-semibold text-gray-800 mb-3">Resumo do mês</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4 shadow-sm">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Total a pagar (estimado)</p>
              <p className="mt-1 text-xl font-bold text-amber-900">{loading ? '—' : formatMoney(cubos.valorEstimado)}</p>
              <p className="mt-1 text-xs text-amber-700">Valor/hora × horas estimadas</p>
            </div>
            <div className="rounded-xl border-2 border-sky-200 bg-sky-50 p-4 shadow-sm">
              <p className="text-xs font-semibold text-sky-800 uppercase tracking-wide">Valor real de horas preenchidas</p>
              <p className="mt-1 text-xl font-bold text-sky-900">{loading ? '—' : formatMoney(cubos.valorRealTotal)}</p>
              <p className="mt-1 text-xs text-sky-700">Somatório: horas + período + extras</p>
              <div className="mt-2 pt-2 border-t border-sky-200/60 space-y-1">
                <p className="text-xs text-sky-700 flex justify-between gap-2">
                  <span>Horas registradas × valor/hora</span>
                  <span className="font-medium">{loading ? '—' : formatMoney(cubos.valorRealHorasPreenchidas)}</span>
                </p>
                <p className="text-xs text-sky-700 flex justify-between gap-2">
                  <span>Período</span>
                  <span className="font-medium">{loading ? '—' : formatMoney(cubos.totalValorPeriodo)}</span>
                </p>
                <p className="text-xs text-sky-700 flex justify-between gap-2">
                  <span>Extras</span>
                  <span className="font-medium">{loading ? '—' : formatMoney(cubos.totalValorExtra)}</span>
                </p>
              </div>
            </div>
            <div className="rounded-xl border-2 border-green-200 bg-green-50 p-4 shadow-sm">
              <p className="text-xs font-semibold text-green-800 uppercase tracking-wide">Valores pagos</p>
              <p className="mt-1 text-xl font-bold text-green-900">{loading ? '—' : formatMoney(cubos.valoresPagos)}</p>
            </div>
            <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-800 uppercase tracking-wide">Total de professores ativos</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{loading ? '—' : cubos.totalProfessoresAtivos}</p>
            </div>
            <button
              type="button"
              onClick={() => proximoPagamento.length > 0 && setFilterAlerta(filterAlerta === 'proximo' ? 'todos' : 'proximo')}
              disabled={loading || proximoPagamento.length === 0}
              className={`text-left rounded-xl border-2 transition-colors ${
                filterAlerta === 'proximo'
                  ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-300'
                  : proximoPagamento.length > 0
                    ? 'border-amber-200 bg-white hover:border-amber-400 hover:bg-amber-50/50'
                    : 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
              }`}
            >
              <div className="p-4">
                <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Próximo do pagamento</p>
                <p className="mt-1 text-xl font-bold text-amber-900">{loading ? '—' : proximoPagamento.length}</p>
                <p className="mt-1 text-xs text-amber-700">Venc. próximos 7 dias • clique para filtrar</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => atrasados.length > 0 && setListCuboOpen('atrasados')}
              disabled={loading || atrasados.length === 0}
              className={`text-left rounded-xl border-2 transition-colors ${
                filterAlerta === 'atrasados'
                  ? 'border-red-500 bg-red-50 ring-2 ring-red-300'
                  : atrasados.length > 0
                    ? 'border-red-200 bg-white hover:border-red-400 hover:bg-red-50/50 cursor-pointer'
                    : 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
              }`}
            >
              <div className="p-4">
                <p className="text-xs font-semibold text-red-800 uppercase tracking-wide">Atrasados</p>
                <p className="mt-1 text-xl font-bold text-red-900">{loading ? '—' : atrasados.length}</p>
                <p className="mt-1 text-xs text-red-700">Venc. já passou • clique para ver lista</p>
              </div>
            </button>
            <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50 p-4 shadow-sm">
              <p className="text-xs font-semibold text-indigo-800 uppercase tracking-wide">Valor estimado próximo pagamento</p>
              <p className="mt-1 text-xl font-bold text-indigo-900">
                {loading ? '—' : formatMoney(valorEstimadoProximoPagamento)}
              </p>
              <p className="mt-1 text-xs text-indigo-700">Soma na data do próximo venc.</p>
            </div>
            <button
              type="button"
              onClick={() => proximaDataPagamento && listaProximaData.length > 0 && setListCuboOpen('proximaData')}
              disabled={loading || !proximaDataPagamento || listaProximaData.length === 0}
              className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4 shadow-sm text-left transition-colors hover:border-blue-400 hover:bg-blue-100/80 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-blue-50"
            >
              <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide">Próxima data de pagamento</p>
              <p className="mt-1 text-xl font-bold text-blue-900">
                {loading ? '—' : proximaDataPagamento ? formatDate(proximaDataPagamento) : '—'}
              </p>
              <p className="mt-1 text-xs text-blue-700">Venc. mais próximo em aberto • clique para ver lista</p>
            </button>
          </div>
        </section>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
          </div>
        ) : (
          <>
            {/* Seção: Lista de professores */}
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mt-6">
              <div className="px-5 py-4 border-b border-gray-200 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1 sm:flex-initial sm:w-48">
                  <input
                    type="text"
                    value={filterBusca}
                    onChange={(e) => setFilterBusca(e.target.value)}
                    placeholder="Nome do professor"
                    className="input w-full h-9 text-sm"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
                  <input
                    ref={selectAllCheckboxRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={selectAll}
                    className="rounded border-gray-300 text-brand-orange focus:ring-orange-500 h-4 w-4"
                  />
                  <span className="text-sm text-gray-700">Selecionar todos</span>
                </label>
                <div className="flex items-center gap-2 shrink-0">
                  <label htmlFor="filter-status-prof" className="text-sm text-gray-700 whitespace-nowrap">Status</label>
                  <select
                    id="filter-status-prof"
                    value={filterStatus}
                    onChange={(e) => setFilterStatus((e.target.value || '') as '' | 'em_aberto' | 'pronto_pagar' | 'pago')}
                    className="input h-9 text-sm min-w-[140px] py-0 px-3"
                  >
                    <option value="">Todos</option>
                    <option value="em_aberto">Em aberto</option>
                    <option value="pronto_pagar">Pronto para pagar</option>
                    <option value="pago">Pago</option>
                  </select>
                </div>
                <div className="relative shrink-0" ref={filterDataRef}>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowFilterData((v) => !v) }}
                    className={`flex items-center gap-2 h-9 px-3 rounded-lg border text-sm font-medium transition-colors ${
                      filterDataDe || filterDataAte
                        ? 'border-brand-orange bg-brand-orange/10 text-brand-orange'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                    title="Filtrar por data de pagamento"
                    aria-expanded={showFilterData}
                    aria-haspopup="true"
                  >
                    <Calendar className="w-4 h-4" />
                    <span>Data de pagamento</span>
                    {filterDataDe || filterDataAte ? (
                      <span className="text-xs bg-brand-orange/20 px-1 rounded">ativo</span>
                    ) : null}
                    <ChevronDown className={`w-4 h-4 transition-transform ${showFilterData ? 'rotate-180' : ''}`} />
                  </button>
                  {showFilterData && (
                    <div
                      className="absolute left-0 top-full mt-1 z-50 min-w-[240px] rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Filtrar por vencimento</p>
                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">De</label>
                          <input
                            type="date"
                            value={filterDataDe}
                            onChange={(e) => setFilterDataDe(e.target.value)}
                            className="input w-full h-9 text-sm py-0 px-2"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Até</label>
                          <input
                            type="date"
                            value={filterDataAte}
                            onChange={(e) => setFilterDataAte(e.target.value)}
                            className="input w-full h-9 text-sm py-0 px-2"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => { setFilterDataDe(''); setFilterDataAte(''); setShowFilterData(false) }}
                          className="text-xs text-gray-500 hover:text-orange-600"
                        >
                          Limpar datas
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {selectedIds.size > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={openModalDueDay}
                      className="rounded-lg border border-orange-300 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-700 hover:bg-orange-100 h-9"
                    >
                      Definir dia de pagamento para selecionados
                    </button>
                    <span className="text-sm text-gray-500">{selectedIds.size} selecionado(s)</span>
                  </>
                )}
                <div className="flex items-center gap-2 shrink-0 h-9">
                  <label className="text-xs text-gray-500 whitespace-nowrap">Itens por página</label>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => setItemsPerPage(Number(e.target.value))}
                    className="input min-w-[72px] text-sm h-9 py-0 px-2"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={50}>50</option>
                    <option value={500}>500</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => fetchData(selectedAno, selectedMes)}
                  className="rounded-lg bg-brand-orange p-2 h-9 w-9 flex items-center justify-center text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 shrink-0"
                  title="Atualizar lista"
                  aria-label="Atualizar lista"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmZerarEmAbertoOpen(true)}
                  disabled={zerandoEmAberto || totalEmAberto === 0}
                  className="rounded-lg border border-red-300 bg-red-50 px-4 h-9 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60 disabled:cursor-not-allowed shrink-0 inline-flex items-center gap-2"
                  title="Zerar períodos de pagamentos em aberto"
                >
                  {zerandoEmAberto ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Zerar períodos de pagamentos em aberto
                </button>
                {filterAlerta !== 'todos' && (
                  <button
                    type="button"
                    onClick={() => setFilterAlerta('todos')}
                    className="rounded-lg border border-gray-300 px-4 h-9 text-sm font-medium text-gray-700 hover:bg-gray-50 shrink-0"
                  >
                    Limpar filtro • Ver todos
                  </button>
                )}
                {tabelaData.length > itemsPerPage && (
                  <span className="text-sm text-gray-500 ml-auto">
                    Mostrando {displayedData.length} de {tabelaData.length} professores
                  </span>
                )}
              </div>
              <div className="w-full max-w-full overflow-hidden">
                <Table<ProfessorFinanceiro>
                  columns={columns}
                  data={displayedData}
                  loading={false}
                  visibleColumnKeys={visibleColumnKeys}
                  onVisibleColumnsChange={setVisibleColumnKeys}
                  getRowClassName={(row) => (row.hasFinanceObservations ? 'bg-red-50 border-l-4 border-l-red-500' : '')}
                  emptyMessage={
                    filterAlerta === 'proximo'
                      ? 'Nenhum professor com vencimento nos próximos 7 dias (não pagos).'
                      : filterAlerta === 'atrasados'
                        ? 'Nenhum professor atrasado (não pago com vencimento já passado).'
                        : filterStatus === 'em_aberto'
                          ? 'Nenhum professor em aberto.'
                          : filterStatus === 'pronto_pagar'
                            ? 'Nenhum professor pronto para pagar.'
                            : filterStatus === 'pago'
                              ? 'Nenhum professor pago neste mês.'
                              : 'Nenhum professor ativo.'
                  }
                />
              </div>
            </section>
          </>
        )}

        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </div>

      <Modal
        isOpen={!!editPeriodo}
        onClose={closeEditPeriodo}
        title={editPeriodo ? `Editar período e valores – ${editPeriodo.nome}` : 'Editar'}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={closeEditPeriodo}>
              Cancelar
            </Button>
            <Button onClick={savePeriodo} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </>
        }
      >
        {editPeriodo && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Referência: {MESES_LABELS[selectedMes]} de {selectedAno}. Defina apenas o dia de pagamento; o sistema calcula automaticamente o período.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dia de pagamento (1-31)</label>
              <input
                type="number"
                min={1}
                max={31}
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor por período (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={valorPorPeriodo}
                onChange={(e) => setValorPorPeriodo(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valores extras (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={valorExtra}
                onChange={(e) => setValorExtra(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Método de pagamento</label>
              <input
                type="text"
                placeholder="PIX, Cartão, etc."
                value={metodoPagamento}
                onChange={(e) => setMetodoPagamento(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
              <p className="text-xs text-gray-500 mt-0.5">Salvo no cadastro do professor.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Infos de pagamento</label>
              <textarea
                rows={2}
                placeholder="Chave PIX, conta, etc."
                value={infosPagamento}
                onChange={(e) => setInfosPagamento(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
              <p className="text-xs text-gray-500 mt-0.5">Salvo no cadastro do professor.</p>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={modalDueDay.open}
        onClose={() => setModalDueDay({ open: false, day: '' })}
        title="Definir dia de pagamento para selecionados"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalDueDay({ open: false, day: '' })}>
              Cancelar
            </Button>
            <Button onClick={saveBulkDueDay} disabled={savingBulkDates}>
              {savingBulkDates ? 'Salvando...' : 'Definir dia'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Será aplicado o dia de pagamento para os {selectedIds.size} professor(es) selecionado(s) no mês {MESES_LABELS[selectedMes]} de {selectedAno}.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dia de pagamento (1-31)</label>
            <input
              type="number"
              min={1}
              max={31}
              value={modalDueDay.day}
              onChange={(e) => setModalDueDay((prev) => ({ ...prev, day: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={confirmZerarEmAbertoOpen}
        onClose={() => !zerandoEmAberto && setConfirmZerarEmAbertoOpen(false)}
        title="Zerar períodos de pagamentos em aberto"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirmZerarEmAbertoOpen(false)}
              disabled={zerandoEmAberto}
            >
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                await zerarPeriodosEmAberto()
                setConfirmZerarEmAbertoOpen(false)
              }}
              disabled={zerandoEmAberto || totalEmAberto === 0}
            >
              {zerandoEmAberto ? 'Zerando...' : 'Confirmar'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Isso vai definir <strong>Valor por período = R$ 0,00</strong> para todos os professores com status <strong>Em aberto</strong> no mês{' '}
            {MESES_LABELS[selectedMes]} de {selectedAno}.
          </p>
          <p className="text-sm text-gray-600">
            Total de professores em aberto: <strong>{totalEmAberto}</strong>
          </p>
        </div>
      </Modal>

      {/* Modal Enviar notificação de pagamento (e-mail + anexo) */}
      <Modal
        isOpen={!!notifyTeacher}
        onClose={() => setNotifyTeacher(null)}
        title={notifyTeacher ? `Enviar notificação de pagamento – ${notifyTeacher.nome}` : 'Enviar notificação'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNotifyTeacher(null)}>
              Cancelar
            </Button>
            <Button onClick={submitNotifyPayment} disabled={sendingNotify}>
              {sendingNotify ? 'Enviando...' : 'Enviar notificação'}
            </Button>
          </>
        }
      >
        {notifyTeacher && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Revise o e-mail abaixo antes de enviar. Você pode editar a mensagem e anexar um arquivo. Ao clicar em &quot;Enviar notificação&quot;, o pagamento será marcado como pago e a notificação in-app também será registrada.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Para (e-mail)</label>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
                {notifyTeacher.nome}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Notificação será enviada ao e-mail cadastrado do professor.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assunto</label>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
                Pagamento confirmado – {MESES_LABELS[selectedMes]} de {selectedAno}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem</label>
              <textarea
                rows={8}
                value={notifyMessage}
                onChange={(e) => setNotifyMessage(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                placeholder="Texto do e-mail..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Anexo (opcional)</label>
              <input
                type="file"
                accept="*/*"
                onChange={(e) => setNotifyFile(e.target.files?.[0] ?? null)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-orange-50 file:px-3 file:py-1 file:text-orange-700 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
              {notifyFile && (
                <p className="text-xs text-gray-500 mt-1">
                  Arquivo selecionado: {notifyFile.name} ({(notifyFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Observações financeiras (professor) */}
      <Modal
        isOpen={!!obsModal}
        onClose={() => setObsModal(null)}
        title={obsModal ? `Observações – ${obsModal.nome}` : 'Observações'}
        size="md"
      >
        {obsLoading ? (
          <p className="text-gray-500">Carregando...</p>
        ) : (
          <div className="space-y-4">
            <ul className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50">
              {obsList.length === 0 ? (
                <li className="text-gray-500 text-sm">Nenhuma observação anterior.</li>
              ) : (
                obsList.map((o) => (
                  <li key={o.id} className="flex items-start justify-between gap-2 text-sm border-b border-gray-100 pb-2 last:border-0 last:pb-0">
                    <span className="flex-1">{o.message}</span>
                    <span className="text-gray-400 text-xs shrink-0">{new Date(o.criadoEm).toLocaleDateString('pt-BR')}</span>
                    <button
                      type="button"
                      onClick={() => deleteObservation(o.id)}
                      className="p-1 text-gray-400 hover:text-red-600 rounded"
                      title="Apagar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))
              )}
            </ul>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Nova observação</label>
              <textarea
                value={obsNewMessage}
                onChange={(e) => setObsNewMessage(e.target.value)}
                placeholder="Digite a observação..."
                className="input w-full min-h-[80px]"
                rows={3}
              />
              <Button
                type="button"
                variant="primary"
                size="sm"
                className="mt-2"
                disabled={!obsNewMessage.trim() || obsSaving}
                onClick={addObservation}
              >
                {obsSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Adicionar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal lista: Próxima data de pagamento ou Atrasados */}
      <Modal
        isOpen={listCuboOpen !== null}
        onClose={() => setListCuboOpen(null)}
        title={
          listCuboOpen === 'proximaData'
            ? `Próxima data de pagamento – ${proximaDataPagamento ? formatDate(proximaDataPagamento) : ''}`
            : listCuboOpen === 'atrasados'
              ? 'Atrasados (venc. já passou)'
              : 'Lista'
        }
        size="md"
        footer={
          <Button variant="secondary" onClick={() => setListCuboOpen(null)}>
            Fechar
          </Button>
        }
      >
        {listCuboOpen === 'proximaData' && (
          <div className="space-y-2">
            {listaProximaData.length === 0 ? (
              <p className="text-gray-500 text-sm">Nenhum professor com vencimento nesta data.</p>
            ) : (
              <ul className="space-y-2 max-h-72 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                {listaProximaData.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-3 px-3 first:pt-3">
                    <span className="font-medium text-gray-900">{p.nome}</span>
                    <span className="text-gray-600 text-sm">{formatDate(p.dataTermino)}</span>
                    <span className="font-semibold text-gray-900">{formatMoney(p.valorAPagar)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {listCuboOpen === 'atrasados' && (
          <div className="space-y-2">
            {atrasados.length === 0 ? (
              <p className="text-gray-500 text-sm">Nenhum professor atrasado.</p>
            ) : (
              <ul className="space-y-2 max-h-72 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                {atrasados.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-3 px-3 first:pt-3">
                    <span className="font-medium text-gray-900">{p.nome}</span>
                    <span className="text-gray-600 text-sm">{formatDate(p.dataTermino)}</span>
                    <span className="font-semibold text-gray-900">{formatMoney(p.valorAPagar)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>
    </AdminLayout>
  )
}
