/**
 * Financeiro – Professores
 * Mesmas regras de mês/ano do financeiro dos alunos: seleção de ano e mês; status e valores por mês (TeacherPaymentMonth).
 */

'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import AdminLayout from '@/components/admin/AdminLayout'
import Table, { Column } from '@/components/admin/Table'
import Modal from '@/components/admin/Modal'
import Button from '@/components/ui/Button'
import Toast from '@/components/admin/Toast'
import { Calendar, Wallet, CheckCircle, Users, Copy, ThumbsUp, AlertTriangle, Clock, MessageSquare, Trash2, Loader2, ChevronDown, ChevronRight, Search, Bell } from 'lucide-react'

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

/** Vencimento (data término) está nos próximos 7 dias (hoje inclusive). */
function isProximoPagamento(dataTerminoISO: string): boolean {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const termino = new Date(dataTerminoISO + 'T12:00:00')
  termino.setHours(0, 0, 0, 0)
  const em7Dias = new Date(hoje)
  em7Dias.setDate(em7Dias.getDate() + 7)
  return termino.getTime() >= hoje.getTime() && termino.getTime() <= em7Dias.getTime()
}

/** Vencimento (data término) já passou. */
function isAtrasado(dataTerminoISO: string): boolean {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const termino = new Date(dataTerminoISO + 'T12:00:00')
  termino.setHours(0, 0, 0, 0)
  return termino.getTime() < hoje.getTime()
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
  const [periodoInicio, setPeriodoInicio] = useState('')
  const [periodoTermino, setPeriodoTermino] = useState('')
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
  const [filterValorMin, setFilterValorMin] = useState('')
  const [filterValorMax, setFilterValorMax] = useState('')
  const [filterProximosDias, setFilterProximosDias] = useState(false)
  const [showBuscarFiltros, setShowBuscarFiltros] = useState(true)
  const COLUMN_KEYS_FINANCEIRO_PROF = [
    'nome', 'valorPorHora', 'dataInicio', 'dataTermino', 'totalHorasEstimadas', 'totalHorasRegistradas',
    'valorPorHoras', 'totalRegistrosEsperados', 'valorPorPeriodo', 'valorExtra', 'valorAPagar',
    'pagamentoProntoParaFazer', 'metodoPagamento', 'infosPagamento', 'statusPagamento', 'acoes',
  ] as const
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>(() => [...COLUMN_KEYS_FINANCEIRO_PROF])

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

  const cubos = useMemo(() => {
    const totalAPagar = professores.reduce((s, p) => s + p.valorAPagar, 0)
    const valoresPagos = professores
      .filter((p) => p.statusPagamento === 'PAGO')
      .reduce((s, p) => s + p.valorAPagar, 0)
    const totalProfessoresAtivos = professores.length
    return {
      totalAPagar: Math.round(totalAPagar * 100) / 100,
      valoresPagos: Math.round(valoresPagos * 100) / 100,
      totalProfessoresAtivos,
    }
  }, [professores])

  const { proximoPagamento, atrasados } = useMemo(() => {
    const emAberto = professores.filter((p) => p.statusPagamento === 'EM_ABERTO')
    const proximo = emAberto.filter((p) => isProximoPagamento(p.dataTermino))
    const atrasadosList = emAberto.filter((p) => isAtrasado(p.dataTermino))
    return { proximoPagamento: proximo, atrasados: atrasadosList }
  }, [professores])

  const tabelaData = useMemo(() => {
    let list = professores
    if (filterAlerta === 'proximo') list = proximoPagamento
    else if (filterAlerta === 'atrasados') list = atrasados

    // Filtro por busca (nome)
    const busca = filterBusca.trim().toLowerCase()
    if (busca) {
      list = list.filter((p) => p.nome.toLowerCase().includes(busca))
    }

    // Filtro por valor
    if (filterValorMin) {
      const min = Number(filterValorMin)
      if (!isNaN(min)) {
        list = list.filter((p) => p.valorAPagar >= min)
      }
    }
    if (filterValorMax) {
      const max = Number(filterValorMax)
      if (!isNaN(max)) {
        list = list.filter((p) => p.valorAPagar <= max)
      }
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

    return list
  }, [professores, filterAlerta, proximoPagamento, atrasados, filterBusca, filterValorMin, filterValorMax, filterProximosDias])

  const displayedData = useMemo(
    () => tabelaData.slice(0, itemsPerPage),
    [tabelaData, itemsPerPage]
  )

  const openEditPeriodo = (row: ProfessorFinanceiro) => {
    setEditPeriodo(row)
    setPeriodoInicio(row.dataInicio)
    setPeriodoTermino(row.dataTermino)
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

  const savePeriodo = async () => {
    if (!editPeriodo) return
    if (!periodoInicio || !periodoTermino) {
      setToast({ message: 'Preencha data de início e data de término.', type: 'error' })
      return
    }
    if (new Date(periodoInicio) > new Date(periodoTermino)) {
      setToast({ message: 'Data de início deve ser anterior à data de término.', type: 'error' })
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
          periodoInicio,
          periodoTermino,
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

  const columns: Column<ProfessorFinanceiro>[] = [
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
      key: 'dataInicio',
      label: 'Data início',
      render: (row) => (
        <CellWithCopy value={formatDate(row.dataInicio)} onCopy={handleCopy} />
      ),
    },
    {
      key: 'dataTermino',
      label: 'Data término',
      render: (row) => (
        <CellWithCopy value={formatDate(row.dataTermino)} onCopy={handleCopy} />
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
      render: (row) => (
        <CellWithCopy value={formatMoney(row.valorAPagar)} onCopy={handleCopy} />
      ),
    },
    {
      key: 'pagamentoProntoParaFazer',
      label: 'Pronto p/ pagar',
      fixed: true,
      render: (row) =>
        row.pagamentoProntoParaFazer ? (
          <span
            className="inline-flex items-center gap-1 text-green-700"
            title="Pagamento pronto para fazer (professor confirmou o valor)"
          >
            <ThumbsUp className="w-5 h-5" />
            <span className="text-xs font-medium hidden sm:inline">Pronto p/ pagar</span>
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        ),
    },
    {
      key: 'metodoPagamento',
      label: 'Método de pagamento',
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
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm text-orange-600 hover:bg-orange-50"
            title="Editar valores do mês"
          >
            <Calendar className="w-4 h-4" />
            Editar mês
          </button>
          <button
            type="button"
            onClick={() => openNotifyModal(row)}
            className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm text-green-700 hover:bg-green-50"
            title="Abrir preview e enviar e-mail de notificação de pagamento"
          >
            <Bell className="w-4 h-4" />
            Notificar pagamento
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4 shadow-sm">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Total a pagar (estimado)</p>
              <p className="mt-1 text-xl font-bold text-amber-900">{loading ? '—' : formatMoney(cubos.totalAPagar)}</p>
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
              onClick={() => atrasados.length > 0 && setFilterAlerta(filterAlerta === 'atrasados' ? 'todos' : 'atrasados')}
              disabled={loading || atrasados.length === 0}
              className={`text-left rounded-xl border-2 transition-colors ${
                filterAlerta === 'atrasados'
                  ? 'border-red-500 bg-red-50 ring-2 ring-red-300'
                  : atrasados.length > 0
                    ? 'border-red-200 bg-white hover:border-red-400 hover:bg-red-50/50'
                    : 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
              }`}
            >
              <div className="p-4">
                <p className="text-xs font-semibold text-red-800 uppercase tracking-wide">Atrasados</p>
                <p className="mt-1 text-xl font-bold text-red-900">{loading ? '—' : atrasados.length}</p>
                <p className="mt-1 text-xs text-red-700">Venc. já passou • clique para filtrar</p>
              </div>
            </button>
          </div>
        </section>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
          </div>
        ) : (
          <>
            {/* Seção: Buscar e filtros (recolhível) */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden mt-6">
              <button
                type="button"
                onClick={() => setShowBuscarFiltros((v) => !v)}
                className="w-full flex items-center gap-2 px-5 py-4 text-left text-base font-semibold text-gray-800 hover:bg-gray-50"
              >
                <Search className="w-5 h-5 text-brand-orange shrink-0" />
                <span>Buscar e filtros</span>
                {showBuscarFiltros ? <ChevronDown className="w-5 h-5 ml-auto" /> : <ChevronRight className="w-5 h-5 ml-auto" />}
              </button>
              {showBuscarFiltros && (
                <div className="px-5 pb-5 pt-0 space-y-4 border-t border-gray-200">
                  <div className="flex flex-col lg:flex-row lg:items-end gap-4 pt-4">
                    <div className="flex-1 min-w-0">
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nome do professor</label>
                      <input
                        type="text"
                        value={filterBusca}
                        onChange={(e) => setFilterBusca(e.target.value)}
                        placeholder="Digite para filtrar..."
                        className="input w-full"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-6">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filterProximosDias}
                          onChange={(e) => setFilterProximosDias(e.target.checked)}
                          className="rounded border-gray-300 text-amber-600"
                        />
                        <span className="text-sm text-gray-700">Venc. próximos 7 dias</span>
                      </label>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-end gap-4 pt-2 border-t border-gray-100">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Valor mínimo (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={filterValorMin}
                        onChange={(e) => setFilterValorMin(e.target.value)}
                        placeholder="0,00"
                        className="input min-w-[140px] text-sm py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Valor máximo (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={filterValorMax}
                        onChange={(e) => setFilterValorMax(e.target.value)}
                        placeholder="0,00"
                        className="input min-w-[140px] text-sm py-2"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Seção: Lista de professores */}
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mt-6">
              <div className="px-5 py-4 border-b border-gray-200 flex flex-wrap items-center gap-3">
                <h2 className="text-base font-semibold text-gray-800 mr-2">Lista de professores</h2>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500">Itens por página</label>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => setItemsPerPage(Number(e.target.value))}
                    className="input min-w-[72px] text-sm py-1.5"
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
                  className="rounded-lg bg-brand-orange px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  Atualizar lista
                </button>
                {filterAlerta !== 'todos' && (
                  <button
                    type="button"
                    onClick={() => setFilterAlerta('todos')}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
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
                  emptyMessage={
                    filterAlerta === 'proximo'
                      ? 'Nenhum professor com vencimento nos próximos 7 dias (não pagos).'
                      : filterAlerta === 'atrasados'
                        ? 'Nenhum professor atrasado (não pago com vencimento já passado).'
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
              Referência: {MESES_LABELS[selectedMes]} de {selectedAno}. Período personalizado (ex.: 15/01 a 15/02).
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data início</label>
              <input
                type="date"
                value={periodoInicio}
                onChange={(e) => setPeriodoInicio(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data término</label>
              <input
                type="date"
                value={periodoTermino}
                onChange={(e) => setPeriodoTermino(e.target.value)}
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
    </AdminLayout>
  )
}
