/**
 * Financeiro – Alunos
 * Tabela com dados financeiros por aluno e ações (editar, enviar cobrança).
 */

'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/admin/AdminLayout'
import Modal from '@/components/admin/Modal'
import Button from '@/components/ui/Button'
import Toast from '@/components/admin/Toast'
import { Pencil, Send, Loader2 } from 'lucide-react'

interface AlunoFinanceiro {
  id: string
  nome: string
  tipoAula: string | null
  nomeGrupo: string | null
  nomeResponsavel: string | null
  quemPaga: string | null
  valorMensal: number | null
  valorHora: number | null
  dataPagamento: string | null
  status: string | null
  enrollmentStatus?: string | null
  inactiveAt?: string | null
  metodoPagamento: string | null
  banco: string | null
  periodoPagamento: string | null
  dataUltimoPagamento: string | null
  dataProximoPagamento: string | null
  diaPagamento: number | null
  notaFiscalEmitida: boolean | null
  email: string
  paymentInfoId: string | null
}

/** Status efetivo: se não está PAGO e a data de próximo pagamento já passou → ATRASADO. */
function getEffectiveStatus(a: AlunoFinanceiro): 'PAGO' | 'ATRASADO' | 'PENDING' {
  if (a.status === 'PAGO') return 'PAGO'
  const prox = a.dataProximoPagamento ? new Date(a.dataProximoPagamento) : null
  if (prox && prox < new Date()) return 'ATRASADO'
  return (a.status as 'PENDING') || 'PENDING'
}

const STATUS_OPCOES = [
  { value: '', label: '—' },
  { value: 'PAGO', label: 'Pago' },
  { value: 'ATRASADO', label: 'Atrasado' },
  { value: 'PENDING', label: 'Pendente' },
]

const PERIODO_OPCOES = [
  { value: '', label: '—' },
  { value: 'MENSAL', label: 'Mensal' },
  { value: 'TRIMESTRAL', label: 'Trimestral' },
  { value: 'SEMESTRAL', label: 'Semestral' },
  { value: 'ANUAL', label: 'Anual' },
]

const PERIODO_SHORT: Record<string, string> = {
  MENSAL: 'Men.',
  TRIMESTRAL: 'Tri.',
  SEMESTRAL: 'Sem.',
  ANUAL: 'An.',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

function formatMoney(n: number | null): string {
  if (n == null) return '—'
  return `R$ ${Number(n).toFixed(2).replace('.', ',')}`
}

const MESES_LABELS: Record<number, string> = {
  1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 6: 'Junho',
  7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro',
}
const MESES_ABREV: Record<number, string> = {
  1: 'Jan', 2: 'Fev', 3: 'Mar', 4: 'Abr', 5: 'Mai', 6: 'Jun',
  7: 'Jul', 8: 'Ago', 9: 'Set', 10: 'Out', 11: 'Nov', 12: 'Dez',
}
const ANOS_DISPONIVEIS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i)

const COBRANCA_TODOS_DEFAULT_SUBJECT = 'Lembrete de vencimento'
const COBRANCA_TODOS_DEFAULT_TEXT = `Olá,

Segue lembrete de pagamento referente as aulas com a Seidmann Institute.

Valor e vencimento: conforme seu cadastro.

Por favor,

Em caso de dúvidas, entre em contato conosco.

Atenciosamente,
Equipe Seidmann Institute`

export default function FinanceiroAlunosPage() {
  const router = useRouter()
  const [alunos, setAlunos] = useState<AlunoFinanceiro[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [sendingCobranca, setSendingCobranca] = useState<string | null>(null)
  const [cobrancaModal, setCobrancaModal] = useState<{ id: string; nome: string; to: string } | null>(null)
  const [cobrancaSubject, setCobrancaSubject] = useState('')
  const [cobrancaText, setCobrancaText] = useState('')
  const [loadingCobrancaTemplate, setLoadingCobrancaTemplate] = useState(false)
  const [loadingCobrancaForId, setLoadingCobrancaForId] = useState<string | null>(null)
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null)
  const [cellValue, setCellValue] = useState<string | number | boolean>('')
  const [form, setForm] = useState({
    quemPaga: '',
    paymentStatus: '',
    metodoPagamento: '',
    banco: '',
    periodoPagamento: '',
    valorMensal: '' as string | number,
    valorHora: '' as string | number,
    dataUltimoPagamento: '',
    dataProximoPagamento: '',
    notaFiscalEmitida: false,
  })

  const anoAtual = new Date().getFullYear()
  const mesAtual = new Date().getMonth() + 1
  const [selectedAno, setSelectedAno] = useState<number>(anoAtual)
  const [selectedMes, setSelectedMes] = useState<number>(mesAtual)

  const fetchAlunos = useCallback(async (ano: number, mes: number) => {
    setLoading(true)
    try {
      const url = `/api/admin/financeiro/alunos?year=${ano}&month=${mes}`
      const res = await fetch(url, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        if (res.status === 401 || res.status === 403) router.push('/login?tab=admin')
        else setToast({ message: json.message || 'Erro ao carregar', type: 'error' })
        return
      }
      setAlunos(json.data.alunos || [])
    } catch {
      setToast({ message: 'Erro ao carregar alunos', type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    fetchAlunos(selectedAno, selectedMes)
  }, [selectedAno, selectedMes, fetchAlunos])

  const hoje = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  /** Alunos ativos no mês selecionado (para cubos e base da tabela). */
  const wasActiveInMonth = useCallback((a: AlunoFinanceiro, ano: number, mes: number) => {
    if (a.enrollmentStatus !== 'INACTIVE') return true
    if (!a.inactiveAt) return false
    const d = new Date(a.inactiveAt)
    const anoInativo = d.getFullYear()
    const mesInativo = d.getMonth() + 1
    return ano < anoInativo || (ano === anoInativo && mes < mesInativo)
  }, [])

  const alunosNoMes = useMemo(
    () => alunos.filter((a) => wasActiveInMonth(a, selectedAno, selectedMes)),
    [alunos, selectedAno, selectedMes, wasActiveInMonth]
  )

  const { totalAtrasado, totalPago, totalAReceber, totalAlunos, nfEmAberto, nfEmitida, alunosAtrasado, alunosPago, alunosAReceber, alunosNFEmAberto, alunosNFEmitida } = useMemo(() => {
    let atrasado = 0
    let pago = 0
    let aReceber = 0
    let emAberto = 0
    let emitida = 0
    const atrasadoList: AlunoFinanceiro[] = []
    const pagoList: AlunoFinanceiro[] = []
    const aReceberList: AlunoFinanceiro[] = []
    const nfEmAbertoList: AlunoFinanceiro[] = []
    const nfEmitidaList: AlunoFinanceiro[] = []
    alunosNoMes.forEach((a) => {
      const status = getEffectiveStatus(a)
      const valor = a.valorMensal ?? 0
      if (status === 'ATRASADO') {
        atrasado += valor
        aReceber += valor
        atrasadoList.push(a)
        aReceberList.push(a)
      } else if (status === 'PAGO') {
        pago += valor
        pagoList.push(a)
      } else {
        aReceber += valor
        aReceberList.push(a)
      }
      if (a.notaFiscalEmitida === true) {
        emitida++
        nfEmitidaList.push(a)
      } else {
        emAberto++
        nfEmAbertoList.push(a)
      }
    })
    return {
      totalAtrasado: atrasado,
      totalPago: pago,
      totalAReceber: aReceber,
      totalAlunos: alunosNoMes.length,
      nfEmAberto: emAberto,
      nfEmitida: emitida,
      alunosAtrasado: atrasadoList,
      alunosPago: pagoList,
      alunosAReceber: aReceberList,
      alunosNFEmAberto: nfEmAbertoList,
      alunosNFEmitida: nfEmitidaList,
    }
  }, [alunosNoMes])

  const [cubeModal, setCubeModal] = useState<'atrasado' | 'pago' | 'aReceber' | 'alunos' | 'nfEmAberto' | 'nfEmitida' | null>(null)
  const [filterBusca, setFilterBusca] = useState('')
  const [filterProximos5Dias, setFilterProximos5Dias] = useState(false)
  const [sendingCobrancaTodos, setSendingCobrancaTodos] = useState(false)
  const [cobrancaTodosModalOpen, setCobrancaTodosModalOpen] = useState(false)
  const [cobrancaTodosSubject, setCobrancaTodosSubject] = useState(COBRANCA_TODOS_DEFAULT_SUBJECT)
  const [cobrancaTodosText, setCobrancaTodosText] = useState(COBRANCA_TODOS_DEFAULT_TEXT)

  const filteredAlunos = useMemo(() => {
    let list = [...alunosNoMes]
    const busca = filterBusca.trim().toLowerCase()
    if (busca) {
      list = list.filter(
        (a) =>
          (a.nome && a.nome.toLowerCase().includes(busca)) ||
          (a.email && a.email.toLowerCase().includes(busca)) ||
          (a.nomeGrupo && a.nomeGrupo.toLowerCase().includes(busca)) ||
          (a.quemPaga && a.quemPaga.toLowerCase().includes(busca))
      )
    }
    if (filterProximos5Dias) {
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)
      const em5 = new Date(hoje)
      em5.setDate(em5.getDate() + 5)
      list = list.filter((a) => {
        if (!a.dataProximoPagamento) return false
        const d = new Date(a.dataProximoPagamento)
        d.setHours(0, 0, 0, 0)
        return d >= hoje && d <= em5
      })
    }
    return list
  }, [alunosNoMes, filterBusca, filterProximos5Dias])

  const selected = editId ? alunos.find((a) => a.id === editId) : null

  const patchCell = useCallback(
    async (id: string, field: string, value: string | number | boolean | null) => {
      const body: Record<string, unknown> = {}
      if (field === 'quemPaga') body.quemPaga = value
      else if (field === 'paymentStatus') body.paymentStatus = value
      else if (field === 'valorMensal') body.valorMensal = value != null ? Number(value) : null
      // valorHora não é editável: sempre calculado na API (valor mensal ÷ total horas do mês)
      else if (field === 'metodoPagamento') body.metodoPagamento = value
      else if (field === 'banco') body.banco = value
      else if (field === 'periodoPagamento') body.periodoPagamento = value
      else if (field === 'dataUltimoPagamento') body.dataUltimoPagamento = value || null
      else if (field === 'dataProximoPagamento') body.dataProximoPagamento = value || null
      else if (field === 'notaFiscalEmitida') body.notaFiscalEmitida = Boolean(value)
      body.year = selectedAno
      body.month = selectedMes
      const res = await fetch(`/api/admin/financeiro/alunos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.message || 'Erro ao salvar')
      fetchAlunos(selectedAno, selectedMes)
    },
    [fetchAlunos, selectedAno, selectedMes]
  )

  const patchCellBody = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      const b = { ...body, year: selectedAno, month: selectedMes }
      const res = await fetch(`/api/admin/financeiro/alunos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(b),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.message || 'Erro ao salvar')
      fetchAlunos(selectedAno, selectedMes)
    },
    [fetchAlunos, selectedAno, selectedMes]
  )

  const handlePagoAtrasadoCheck = useCallback(
    async (a: AlunoFinanceiro, tipo: 'PAGO' | 'ATRASADO', checked: boolean) => {
      setSaving(true)
      try {
        if (tipo === 'PAGO' && checked) {
          const hoje = new Date().toISOString().slice(0, 10)
          await patchCellBody(a.id, { paymentStatus: 'PAGO', dataUltimoPagamento: hoje })
          setToast({ message: 'Marcado como Pago. Data do último pagamento atualizada.', type: 'success' })
        } else if (tipo === 'PAGO' && !checked) {
          await patchCellBody(a.id, { paymentStatus: 'PENDING', dataUltimoPagamento: null })
          setToast({ message: 'Status alterado para Pendente. Data do último pagamento removida.', type: 'success' })
        } else if (tipo === 'ATRASADO') {
          await patchCellBody(a.id, { paymentStatus: checked ? 'ATRASADO' : 'PENDING' })
          setToast({ message: checked ? 'Marcado como Atrasado.' : 'Status alterado para Pendente.', type: 'success' })
        }
      } catch {
        setToast({ message: 'Erro ao atualizar status', type: 'error' })
      } finally {
        setSaving(false)
      }
    },
    [patchCellBody, selectedAno, selectedMes]
  )

  const handlePeriodoCheck = useCallback(
    async (id: string, value: string) => {
      setSaving(true)
      try {
        await patchCell(id, 'periodoPagamento', value || null)
        setToast({ message: 'Período atualizado.', type: 'success' })
      } catch {
        setToast({ message: 'Erro ao atualizar período', type: 'error' })
      } finally {
        setSaving(false)
      }
    },
    [patchCell]
  )

  const handleNFCheck = useCallback(
    async (id: string, checked: boolean) => {
      setSaving(true)
      try {
        await patchCell(id, 'notaFiscalEmitida', checked)
        setToast({ message: checked ? 'NF marcada como emitida.' : 'NF desmarcada.', type: 'success' })
      } catch {
        setToast({ message: 'Erro ao atualizar NF', type: 'error' })
      } finally {
        setSaving(false)
      }
    },
    [patchCell]
  )

  const startEditCell = (a: AlunoFinanceiro, field: string) => {
    setEditingCell({ id: a.id, field })
    const v = (a as Record<string, unknown>)[field === 'paymentStatus' ? 'status' : field]
    if (field === 'notaFiscalEmitida') setCellValue(Boolean(v))
    else setCellValue((v ?? '') as string | number)
  }

  const saveCell = useCallback(async () => {
    if (!editingCell) return
    setSaving(true)
    try {
      const field = editingCell.field
      let value: string | number | boolean | null =
        field === 'notaFiscalEmitida' ? Boolean(cellValue) : (cellValue as string | number) || null
      if (field === 'valorMensal') value = cellValue === '' ? null : Number(cellValue)
      await patchCell(editingCell.id, field, value)
      setToast({ message: 'Salvo', type: 'success' })
      setEditingCell(null)
    } catch {
      setToast({ message: 'Erro ao salvar célula', type: 'error' })
    } finally {
      setSaving(false)
    }
  }, [editingCell, cellValue, patchCell])

  const openEdit = (a: AlunoFinanceiro) => {
    setEditId(a.id)
    setForm({
      quemPaga: a.quemPaga ?? '',
      paymentStatus: a.status ?? '',
      metodoPagamento: a.metodoPagamento ?? '',
      banco: a.banco ?? '',
      periodoPagamento: a.periodoPagamento ?? '',
      valorMensal: a.valorMensal ?? '',
      valorHora: '', // somente leitura (calculado na API)
      dataUltimoPagamento: a.dataUltimoPagamento ? a.dataUltimoPagamento.slice(0, 10) : '',
      dataProximoPagamento: a.dataProximoPagamento ? a.dataProximoPagamento.slice(0, 10) : '',
      notaFiscalEmitida: a.notaFiscalEmitida ?? false,
    })
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/financeiro/alunos/${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          quemPaga: form.quemPaga.trim() || null,
          paymentStatus: form.paymentStatus || null,
          metodoPagamento: form.metodoPagamento.trim() || null,
          banco: form.banco.trim() || null,
          periodoPagamento: form.periodoPagamento || null,
          valorMensal: form.valorMensal !== '' ? Number(form.valorMensal) : null,
          dataUltimoPagamento: form.dataUltimoPagamento || null,
          dataProximoPagamento: form.dataProximoPagamento || null,
          notaFiscalEmitida: form.notaFiscalEmitida,
          year: selectedAno,
          month: selectedMes,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao salvar', type: 'error' })
        return
      }
      setToast({ message: 'Dados atualizados', type: 'success' })
      setEditId(null)
      fetchAlunos(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao salvar', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const openCobrancaModal = useCallback(async (id: string, nome: string) => {
    setLoadingCobrancaTemplate(true)
    setLoadingCobrancaForId(id)
    try {
      const res = await fetch(`/api/admin/financeiro/alunos/${id}/enviar-cobranca`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao carregar modelo do e-mail', type: 'error' })
        return
      }
      const { to, subject, text } = json.data
      setCobrancaModal({ id, nome, to })
      setCobrancaSubject(subject ?? '')
      setCobrancaText(text ?? '')
    } catch {
      setToast({ message: 'Erro ao carregar modelo do e-mail', type: 'error' })
    } finally {
      setLoadingCobrancaTemplate(false)
      setLoadingCobrancaForId(null)
    }
  }, [])

  const handleEnviarCobranca = useCallback(async () => {
    if (!cobrancaModal) return
    setSendingCobranca(cobrancaModal.id)
    try {
      const res = await fetch(`/api/admin/financeiro/alunos/${cobrancaModal.id}/enviar-cobranca`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ subject: cobrancaSubject.trim(), text: cobrancaText.trim() }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao enviar cobrança', type: 'error' })
        return
      }
      setToast({ message: 'Cobrança enviada', type: 'success' })
      setCobrancaModal(null)
    } catch {
      setToast({ message: 'Erro ao enviar cobrança', type: 'error' })
    } finally {
      setSendingCobranca(null)
    }
  }, [cobrancaModal, cobrancaSubject, cobrancaText])

  const atrasadosComEmail = useMemo(
    () => alunos.filter((a) => getEffectiveStatus(a) === 'ATRASADO' && a.email?.trim()),
    [alunos]
  )

  const openCobrancaTodosModal = useCallback(() => {
    if (atrasadosComEmail.length === 0) {
      setToast({ message: 'Nenhum aluno em atraso com e-mail cadastrado.', type: 'error' })
      return
    }
    setCobrancaTodosSubject(COBRANCA_TODOS_DEFAULT_SUBJECT)
    setCobrancaTodosText(COBRANCA_TODOS_DEFAULT_TEXT)
    setCobrancaTodosModalOpen(true)
  }, [atrasadosComEmail.length])

  const handleConfirmEnviarCobrancaTodos = useCallback(async () => {
    if (atrasadosComEmail.length === 0) return
    const subject = cobrancaTodosSubject.trim()
    const text = cobrancaTodosText.trim()
    if (!subject || !text) {
      setToast({ message: 'Preencha assunto e mensagem.', type: 'error' })
      return
    }
    setSendingCobrancaTodos(true)
    let enviados = 0
    const erros: string[] = []
    for (const a of atrasadosComEmail) {
      try {
        const res = await fetch(`/api/admin/financeiro/alunos/${a.id}/enviar-cobranca`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ subject, text }),
        })
        const json = await res.json()
        if (res.ok && json.ok) enviados++
        else erros.push(a.nome)
      } catch {
        erros.push(a.nome)
      }
    }
    setSendingCobrancaTodos(false)
    setCobrancaTodosModalOpen(false)
    if (enviados > 0) {
      const msg = erros.length > 0
        ? `Cobrança enviada para ${enviados} aluno(s). Falha para: ${erros.join(', ')}`
        : `Cobrança enviada para ${enviados} aluno(s) em atraso.`
      setToast({ message: msg, type: 'success' })
    } else {
      setToast({ message: erros.length ? `Falha ao enviar para: ${erros.join(', ')}` : 'Não foi possível enviar as cobranças.', type: 'error' })
    }
  }, [atrasadosComEmail, cobrancaTodosSubject, cobrancaTodosText])

  return (
    <AdminLayout>
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Financeiro – Alunos</h1>
        <p className="text-gray-600 mt-1">
          Gestão financeira por aluno: valor mensal, status de pagamento, datas e envio de cobrança.
        </p>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setCubeModal('atrasado')}
            onKeyDown={(e) => e.key === 'Enter' && setCubeModal('atrasado')}
            className="rounded-xl border-2 border-red-200 bg-red-50 p-4 shadow-sm cursor-pointer hover:bg-red-100 transition-colors"
          >
            <p className="text-sm font-semibold text-red-800 uppercase tracking-wide">Total atrasado</p>
            <p className="mt-1 text-2xl font-bold text-red-900">{formatMoney(totalAtrasado)}</p>
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setCubeModal('pago')}
            onKeyDown={(e) => e.key === 'Enter' && setCubeModal('pago')}
            className="rounded-xl border-2 border-green-200 bg-green-50 p-4 shadow-sm cursor-pointer hover:bg-green-100 transition-colors"
          >
            <p className="text-sm font-semibold text-green-800 uppercase tracking-wide">Total pago</p>
            <p className="mt-1 text-2xl font-bold text-green-900">{formatMoney(totalPago)}</p>
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setCubeModal('aReceber')}
            onKeyDown={(e) => e.key === 'Enter' && setCubeModal('aReceber')}
            className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4 shadow-sm cursor-pointer hover:bg-amber-100 transition-colors"
          >
            <p className="text-sm font-semibold text-amber-800 uppercase tracking-wide">Total a receber</p>
            <p className="mt-1 text-2xl font-bold text-amber-900">{formatMoney(totalAReceber)}</p>
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setCubeModal('alunos')}
            onKeyDown={(e) => e.key === 'Enter' && setCubeModal('alunos')}
            className="rounded-xl border-2 border-slate-200 bg-slate-50 p-4 shadow-sm cursor-pointer hover:bg-slate-100 transition-colors"
          >
            <p className="text-sm font-semibold text-slate-800 uppercase tracking-wide">Total de alunos</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{totalAlunos}</p>
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setCubeModal('nfEmAberto')}
            onKeyDown={(e) => e.key === 'Enter' && setCubeModal('nfEmAberto')}
            className="rounded-xl border-2 border-orange-200 bg-orange-50 p-4 shadow-sm cursor-pointer hover:bg-orange-100 transition-colors"
          >
            <p className="text-sm font-semibold text-orange-800 uppercase tracking-wide">NF em aberto</p>
            <p className="mt-1 text-2xl font-bold text-orange-900">{nfEmAberto}</p>
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setCubeModal('nfEmitida')}
            onKeyDown={(e) => e.key === 'Enter' && setCubeModal('nfEmitida')}
            className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4 shadow-sm cursor-pointer hover:bg-emerald-100 transition-colors"
          >
            <p className="text-sm font-semibold text-emerald-800 uppercase tracking-wide">NF emitida</p>
            <p className="mt-1 text-2xl font-bold text-emerald-900">{nfEmitida}</p>
          </div>
        </div>

        {loading ? (
          <div className="mt-8 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
          </div>
        ) : (
          <>
            {/* Abas: ano (principal) e mês */}
            <div className="mt-6 space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase mb-2">Selecione o ano</p>
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
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase mb-2">Mês</p>
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
            </div>

            <p className="mt-4 text-sm font-medium text-gray-700">
              Controle financeiro – {MESES_LABELS[selectedMes]} de {selectedAno}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Buscar</label>
                <input
                  type="text"
                  value={filterBusca}
                  onChange={(e) => setFilterBusca(e.target.value)}
                  placeholder="Nome, email, grupo..."
                  className="input w-full"
                />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterProximos5Dias}
                    onChange={(e) => setFilterProximos5Dias(e.target.checked)}
                    className="rounded border-gray-300 text-amber-600"
                  />
                  <span className="text-sm font-medium text-gray-700">Vencimento em 5 dias</span>
                </label>
              </div>
              <div className="pt-6">
                <Button
                  variant="primary"
                  onClick={openCobrancaTodosModal}
                  disabled={atrasadosComEmail.length === 0}
                >
                  <Send className="w-4 h-4 mr-2" />
                  Enviar cobrança para todos atrasados
                </Button>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              As informações de pagamento (Status, NF emitida?) são <strong>independentes por mês</strong>; a única informação que acompanha é <strong>Último pag.</strong> Os cubos e a tabela refletem {MESES_LABELS[selectedMes]}/{selectedAno}. Alunos ativos aparecem em todos os meses; inativos somem a partir do mês em que foram marcados como inativos. Clique duas vezes em uma célula para editar (Quem paga, Valor mensal, Status, Método pag., Banco, Período, datas, NF).
            </p>
            <div className="mt-4 overflow-x-auto bg-white rounded-xl border border-gray-200 shadow-sm">
            <table className="w-full min-w-[1400px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Aluno</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Tipo aula</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Nome grupo</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Responsável</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Quem paga</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Valor mensal</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Valor hora</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Método pag.</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Banco</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Período</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Último pag.</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Próx. pag.</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase">NF emitida?</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredAlunos.map((a) => {
                  const effective = getEffectiveStatus(a)
                  const isAtrasado = effective === 'ATRASADO'
                  const isEditing = (id: string, field: string) => editingCell?.id === id && editingCell?.field === field
                  const EdCell = (field: string, children: React.ReactNode, inputNode?: React.ReactNode) => (
                    <td
                      className={`px-3 py-1 text-sm ${isAtrasado ? 'bg-red-50 text-red-900' : 'text-gray-900'}`}
                      onDoubleClick={() => !editingCell && startEditCell(a, field)}
                    >
                      {isEditing(a.id, field) && inputNode ? inputNode : children}
                    </td>
                  )
                  return (
                    <tr key={a.id} className={isAtrasado ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}>
                      <td className="px-3 py-2 text-sm text-gray-900 whitespace-nowrap">{a.nome}</td>
                      <td className="px-3 py-2 text-sm text-gray-600">{a.tipoAula === 'GRUPO' ? 'Grupo' : a.tipoAula === 'PARTICULAR' ? 'Particular' : a.tipoAula ?? '—'}</td>
                      <td className="px-3 py-2 text-sm text-gray-600">{a.nomeGrupo ?? '—'}</td>
                      <td className="px-3 py-2 text-sm text-gray-600">{a.nomeResponsavel ?? '—'}</td>
                      {EdCell(
                        'quemPaga',
                        a.quemPaga ?? '—',
                        <input
                          type="text"
                          className="input w-full py-1 text-sm"
                          value={String(cellValue)}
                          onChange={(e) => setCellValue(e.target.value)}
                          onBlur={saveCell}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveCell(); if (e.key === 'Escape') setEditingCell(null) }}
                          autoFocus
                        />
                      )}
                      {EdCell(
                        'valorMensal',
                        formatMoney(a.valorMensal),
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="input w-full py-1 text-sm text-right"
                          value={cellValue === '' ? '' : cellValue}
                          onChange={(e) => setCellValue(e.target.value === '' ? '' : e.target.value)}
                          onBlur={saveCell}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveCell(); if (e.key === 'Escape') setEditingCell(null) }}
                          autoFocus
                        />
                      )}
                      <td className="px-3 py-1 text-sm text-right text-gray-700" title="Calculado: valor mensal ÷ (frequência semanal × duração da aula × 4 semanas)">
                        {formatMoney(a.valorHora)}
                      </td>
                      <td className={`px-3 py-1 text-sm ${isAtrasado ? 'bg-red-50 text-red-900' : 'text-gray-900'}`}>
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={a.status === 'PAGO'}
                              disabled={saving}
                              onChange={(e) => handlePagoAtrasadoCheck(a, 'PAGO', e.target.checked)}
                              className="rounded border-gray-300 text-green-600"
                            />
                            <span className="text-xs font-medium">Pago</span>
                          </label>
                          <label className={`flex items-center gap-1.5 whitespace-nowrap ${isAtrasado ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                            <input
                              type="checkbox"
                              checked={isAtrasado || a.status === 'ATRASADO'}
                              disabled={saving || isAtrasado}
                              onChange={(e) => !isAtrasado && handlePagoAtrasadoCheck(a, 'ATRASADO', e.target.checked)}
                              className="rounded border-gray-300 text-red-600"
                              title={isAtrasado ? 'Atrasado automaticamente (data passou). Marque Pago para limpar.' : undefined}
                            />
                            <span className="text-xs font-medium">Atras.</span>
                          </label>
                        </div>
                      </td>
                      {EdCell(
                        'metodoPagamento',
                        a.metodoPagamento ?? '—',
                        <input
                          type="text"
                          className="input w-full py-1 text-sm"
                          value={String(cellValue)}
                          onChange={(e) => setCellValue(e.target.value)}
                          onBlur={saveCell}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveCell(); if (e.key === 'Escape') setEditingCell(null) }}
                          autoFocus
                        />
                      )}
                      {EdCell(
                        'banco',
                        a.banco ?? '—',
                        <input
                          type="text"
                          className="input w-full py-1 text-sm"
                          value={String(cellValue)}
                          onChange={(e) => setCellValue(e.target.value)}
                          onBlur={saveCell}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveCell(); if (e.key === 'Escape') setEditingCell(null) }}
                          autoFocus
                        />
                      )}
                      <td className={`px-3 py-1 text-sm ${isAtrasado ? 'bg-red-50 text-red-900' : 'text-gray-900'}`}>
                        <div className="flex flex-col gap-1">
                          {(['MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'] as const).map((per) => (
                            <label key={per} className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={(a.periodoPagamento ?? 'MENSAL') === per}
                                disabled={saving}
                                onChange={() => handlePeriodoCheck(a.id, per)}
                                className="rounded border-gray-300"
                              />
                              <span className="text-xs">{PERIODO_SHORT[per] ?? per}</span>
                            </label>
                          ))}
                        </div>
                      </td>
                      {EdCell('dataUltimoPagamento', formatDate(a.dataUltimoPagamento), (
                        <input
                          type="date"
                          className="input w-full py-1 text-sm"
                          value={String(cellValue).slice(0, 10)}
                          onChange={(e) => setCellValue(e.target.value)}
                          onBlur={saveCell}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveCell(); if (e.key === 'Escape') setEditingCell(null) }}
                          autoFocus
                        />
                      ))}
                      {EdCell('dataProximoPagamento', formatDate(a.dataProximoPagamento), (
                        <input
                          type="date"
                          className="input w-full py-1 text-sm"
                          value={String(cellValue).slice(0, 10)}
                          onChange={(e) => setCellValue(e.target.value)}
                          onBlur={saveCell}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveCell(); if (e.key === 'Escape') setEditingCell(null) }}
                          autoFocus
                        />
                      ))}
                      <td className={`px-3 py-1 text-sm ${isAtrasado ? 'bg-red-50' : 'text-gray-900'}`}>
                        <div className="flex flex-col gap-1.5">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={a.notaFiscalEmitida !== true}
                              disabled={saving}
                              onChange={() => handleNFCheck(a.id, false)}
                              className="rounded border-gray-300"
                            />
                            <span className="text-xs font-medium">Em aberto</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={a.notaFiscalEmitida === true}
                              disabled={saving}
                              onChange={() => handleNFCheck(a.id, true)}
                              className="rounded border-gray-300"
                            />
                            <span className="text-xs font-medium">Emitida</span>
                          </label>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button type="button" onClick={() => openEdit(a)} className="text-gray-600 hover:text-brand-orange p-1" title="Editar (modal)">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openCobrancaModal(a.id, a.nome)}
                          disabled={!a.email || loadingCobrancaForId === a.id}
                          className="ml-1 text-gray-600 hover:text-green-600 p-1 disabled:opacity-50"
                          title="Enviar cobrança por e-mail"
                        >
                          {loadingCobrancaForId === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filteredAlunos.length === 0 && (
              <div className="py-12 text-center text-gray-500">
                {alunos.length === 0 ? 'Nenhum aluno encontrado.' : 'Nenhum aluno corresponde aos filtros.'}
              </div>
            )}
            </div>
          </>
        )}

        <Modal
          isOpen={!!editId}
          onClose={() => setEditId(null)}
          title={selected ? `Editar financeiro – ${selected.nome}` : 'Editar'}
          size="lg"
          footer={
            <>
              <Button variant="outline" onClick={() => setEditId(null)} disabled={saving}>Cancelar</Button>
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Salvar
              </Button>
            </>
          }
        >
          {selected && (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Quem paga</label>
                  <input type="text" value={form.quemPaga} onChange={(e) => setForm({ ...form, quemPaga: e.target.value })} className="input w-full" placeholder="Nome de quem paga" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Status</label>
                  <select value={form.paymentStatus} onChange={(e) => setForm({ ...form, paymentStatus: e.target.value })} className="input w-full">
                    {STATUS_OPCOES.map((o) => (
                      <option key={o.value || 'x'} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Valor mensal (R$)</label>
                  <input type="number" step="0.01" min="0" value={form.valorMensal === '' ? '' : form.valorMensal} onChange={(e) => setForm({ ...form, valorMensal: e.target.value === '' ? '' : Number(e.target.value) })} className="input w-full" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Valor da hora (R$)</label>
                  <p className="text-sm text-gray-600 py-1.5">
                    {selected ? formatMoney(selected.valorHora) : '—'} <span className="text-gray-400">(calculado: valor mensal ÷ horas do mês; horas = freq. semanal × duração da aula × 4 semanas)</span>
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Método de pagamento</label>
                  <input type="text" value={form.metodoPagamento} onChange={(e) => setForm({ ...form, metodoPagamento: e.target.value })} className="input w-full" placeholder="PIX, Cartão, etc." />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Banco</label>
                  <input type="text" value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })} className="input w-full" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Período de pagamento</label>
                  <select value={form.periodoPagamento} onChange={(e) => setForm({ ...form, periodoPagamento: e.target.value })} className="input w-full">
                    {PERIODO_OPCOES.map((o) => (
                      <option key={o.value || 'x'} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Data último pagamento</label>
                  <input type="date" value={form.dataUltimoPagamento} onChange={(e) => setForm({ ...form, dataUltimoPagamento: e.target.value })} className="input w-full" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Data próximo pagamento</label>
                  <input type="date" value={form.dataProximoPagamento} onChange={(e) => setForm({ ...form, dataProximoPagamento: e.target.value })} className="input w-full" />
                </div>
                <div className="sm:col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.notaFiscalEmitida} onChange={(e) => setForm({ ...form, notaFiscalEmitida: e.target.checked })} className="rounded border-gray-300" />
                    <span className="text-sm font-semibold text-gray-700">Nota fiscal emitida?</span>
                  </label>
                </div>
              </div>
            </form>
          )}
        </Modal>

        {/* Modal da lista de nomes ao clicar no cubo */}
        <Modal
          isOpen={cubeModal !== null}
          onClose={() => setCubeModal(null)}
          title={
            cubeModal === 'atrasado'
              ? 'Alunos em atraso'
              : cubeModal === 'pago'
                ? 'Alunos com pagamento em dia'
                : cubeModal === 'aReceber'
                  ? 'Alunos a receber'
                  : cubeModal === 'alunos'
                    ? 'Todos os alunos'
                    : cubeModal === 'nfEmAberto'
                      ? 'NF em aberto'
                      : cubeModal === 'nfEmitida'
                        ? 'NF emitida'
                        : 'Lista'
          }
          size="md"
        >
          {(() => {
            const list =
              cubeModal === 'atrasado'
                ? alunosAtrasado
                : cubeModal === 'pago'
                  ? alunosPago
                  : cubeModal === 'aReceber'
                    ? alunosAReceber
                    : cubeModal === 'alunos'
                      ? alunos
                      : cubeModal === 'nfEmAberto'
                        ? alunosNFEmAberto
                        : cubeModal === 'nfEmitida'
                          ? alunosNFEmitida
                          : []
            if (list.length === 0) {
              return <p className="text-gray-500 text-sm">Nenhum aluno nesta lista.</p>
            }
            return (
              <ul className="space-y-2 max-h-80 overflow-y-auto">
                {list.map((a) => (
                  <li key={a.id} className="py-1.5 px-2 rounded bg-gray-50 text-gray-800">
                    {a.nome}
                  </li>
                ))}
              </ul>
            )
          })()}
        </Modal>

        {/* Modal Enviar cobrança: modelo editável */}
        <Modal
          isOpen={!!cobrancaModal}
          onClose={() => setCobrancaModal(null)}
          title={cobrancaModal ? `Enviar cobrança – ${cobrancaModal.nome}` : 'Enviar cobrança'}
          size="lg"
          footer={
            <>
              <Button variant="outline" onClick={() => setCobrancaModal(null)} disabled={!!sendingCobranca}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={handleEnviarCobranca}
                disabled={!cobrancaSubject.trim() || !cobrancaText.trim() || !!sendingCobranca}
              >
                {sendingCobranca ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Enviar
              </Button>
            </>
          }
        >
          {cobrancaModal && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                <span className="font-semibold">Para:</span> {cobrancaModal.to}
              </p>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Assunto</label>
                <input
                  type="text"
                  value={cobrancaSubject}
                  onChange={(e) => setCobrancaSubject(e.target.value)}
                  className="input w-full"
                  placeholder="Assunto do e-mail"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Mensagem</label>
                <textarea
                  value={cobrancaText}
                  onChange={(e) => setCobrancaText(e.target.value)}
                  className="input w-full min-h-[200px] resize-y"
                  placeholder="Corpo do e-mail"
                  rows={10}
                />
              </div>
            </div>
          )}
        </Modal>

        {/* Modal Enviar cobrança para todos atrasados: modelo editável */}
        <Modal
          isOpen={cobrancaTodosModalOpen}
          onClose={() => !sendingCobrancaTodos && setCobrancaTodosModalOpen(false)}
          title="Enviar cobrança para todos atrasados"
          size="lg"
          footer={
            <>
              <Button variant="outline" onClick={() => setCobrancaTodosModalOpen(false)} disabled={!!sendingCobrancaTodos}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmEnviarCobrancaTodos}
                disabled={!cobrancaTodosSubject.trim() || !cobrancaTodosText.trim() || !!sendingCobrancaTodos}
              >
                {sendingCobrancaTodos ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                Enviar para todos
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              <span className="font-semibold">Será enviado para:</span> {atrasadosComEmail.length} aluno(s) em atraso
              {atrasadosComEmail.length > 0 && (
                <span className="block mt-1 text-gray-500">
                  {atrasadosComEmail.map((a) => a.nome).join(', ')}
                </span>
              )}
            </p>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Assunto</label>
              <input
                type="text"
                value={cobrancaTodosSubject}
                onChange={(e) => setCobrancaTodosSubject(e.target.value)}
                className="input w-full"
                placeholder="Assunto do e-mail"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Mensagem</label>
              <textarea
                value={cobrancaTodosText}
                onChange={(e) => setCobrancaTodosText(e.target.value)}
                className="input w-full min-h-[200px] resize-y"
                placeholder="Corpo do e-mail (será o mesmo para todos)"
                rows={10}
              />
            </div>
          </div>
        </Modal>

        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </div>
    </AdminLayout>
  )
}
