/**
 * Financeiro – Alunos
 * Tabela com dados financeiros por aluno e ações (editar, enviar cobrança).
 */

'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/admin/AdminLayout'
import Modal from '@/components/admin/Modal'
import Button from '@/components/ui/Button'
import Toast from '@/components/admin/Toast'
import { Pencil, Send, Loader2, Copy, Columns, ChevronDown, FileDown, MessageSquare, Trash2, Info, ChevronRight, Calendar, Search, Receipt, QrCode, RefreshCw, ExternalLink, CircleChevronDown, CheckCircle2 } from 'lucide-react'

interface AlunoFinanceiro {
  id: string
  nome: string
  cpf: string | null
  endereco: string | null
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
  escolaMatricula: string | null
  paymentInfoId: string | null
  hasFinanceObservations?: boolean
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
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
}

/** Dados da cobrança Cora retornados pela API. */
interface CobrancaCora {
  coraInvoiceId: string | null
  coraStatus: string | null
  valorMensalidade?: number
  dueDate?: string
  pixQrCode?: string | null
  boletoUrl?: string | null
  paidAt?: string | null
  paymentMethod?: string | null
}

type CobrancaStatusDisplay = 
  | { type: 'pago'; label: string; variant: 'success' }
  | { type: 'pago_pix'; label: string; variant: 'success' }
  | { type: 'pago_boleto'; label: string; variant: 'success' }
  | { type: 'aguardando'; label: string; variant: 'info' }
  | { type: 'vencido'; label: string; variant: 'danger' }
  | { type: 'atrasado'; label: string; variant: 'danger' }
  | { type: 'pendente'; label: string; variant: 'neutral' }

function getCobrancaStatusDisplay(
  paymentStatus: string | null,
  cobranca: CobrancaCora | null
): CobrancaStatusDisplay {
  // 1. Se EnrollmentPaymentMonth.paymentStatus === 'PAGO' → badge verde "Pago"
  if (paymentStatus === 'PAGO') {
    return { type: 'pago', label: 'Pago', variant: 'success' }
  }
  // 2. Se tem cobrança Cora e status Cora é 'PAID' → badge verde "Pago via PIX" ou "Pago via Boleto"
  if (cobranca?.coraStatus === 'PAID') {
    const method = (cobranca.paymentMethod ?? '').toLowerCase()
    const viaBoleto = method.includes('bank_slip') || method.includes('boleto')
    return viaBoleto
      ? { type: 'pago_boleto', label: 'Pago via Boleto', variant: 'success' }
      : { type: 'pago_pix', label: 'Pago via PIX', variant: 'success' }
  }
  // 3. Se tem cobrança Cora e status Cora é 'OPEN' → badge azul "Aguardando pagamento"
  if (cobranca?.coraStatus === 'OPEN') {
    return { type: 'aguardando', label: 'Aguardando pagamento', variant: 'info' }
  }
  // 4. Se tem cobrança Cora e status Cora é 'LATE' → badge vermelho "Vencido"
  if (cobranca?.coraStatus === 'LATE') {
    return { type: 'vencido', label: 'Vencido', variant: 'danger' }
  }
  // 5. Se paymentStatus === 'ATRASADO' (sem cobrança Cora) → badge vermelho "Atrasado"
  if (paymentStatus === 'ATRASADO') {
    return { type: 'atrasado', label: 'Atrasado', variant: 'danger' }
  }
  // 6. Se paymentStatus === 'PENDING' ou null → badge cinza "Pendente"
  return { type: 'pendente', label: 'Pendente', variant: 'neutral' }
}

const BADGE_CLASSES: Record<CobrancaStatusDisplay['variant'], string> = {
  success: 'bg-green-100 text-green-800',
  info: 'bg-blue-100 text-blue-800',
  danger: 'bg-red-100 text-red-800',
  neutral: 'bg-gray-100 text-gray-700',
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
  const [obsModal, setObsModal] = useState<{ enrollmentId: string; nome: string } | null>(null)
  const [obsList, setObsList] = useState<{ id: string; message: string; criadoEm: string }[]>([])
  const [obsNewMessage, setObsNewMessage] = useState('')
  const [obsLoading, setObsLoading] = useState(false)
  const [obsSaving, setObsSaving] = useState(false)
  const [validacaoData, setValidacaoData] = useState<{
    total: number
    comProblema: number
    semProblema: number
    alunos: Array<{
      enrollmentId: string
      nome: string
      email: string | null
      cpf: string | null
      valorMensalidade: number | null
      dueDay: number | null
      problemas: string[]
    }>
  } | null>(null)
  const [validacaoLoading, setValidacaoLoading] = useState(false)
  const [validacaoModalOpen, setValidacaoModalOpen] = useState(false)
  const [editAlunoModalOpen, setEditAlunoModalOpen] = useState(false)
  const [editAlunoData, setEditAlunoData] = useState<{
    enrollmentId: string
    nome: string
    cpf: string
    email: string
    whatsapp: string
    valorMensalidade: string
    dueDay: string
    problemas: string[]
  } | null>(null)
  const [editAlunoSaving, setEditAlunoSaving] = useState(false)
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
    // notaFiscalEmitida removido: agora é calculado automaticamente da tabela nfse_invoices (read-only)
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

  const fetchCobrancas = useCallback(async (ano: number, mes: number) => {
    try {
      const res = await fetch(`/api/admin/financeiro/cobranca?year=${ano}&month=${mes}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok || !json.ok) return
      const data = (json.data || []) as Array<{
        enrollmentId: string
        coraInvoiceId: string | null
        coraStatus: string | null
        valorMensalidade?: number
        dueDate?: string
        pixQrCode?: string | null
        boletoUrl?: string | null
        paidAt?: string | null
        paymentMethod?: string | null
      }>
      const map = new Map<string, CobrancaCora>()
      data.forEach((d) => {
        if (d.coraInvoiceId) {
          map.set(d.enrollmentId, {
            coraInvoiceId: d.coraInvoiceId,
            coraStatus: d.coraStatus ?? null,
            valorMensalidade: d.valorMensalidade,
            dueDate: d.dueDate,
            pixQrCode: d.pixQrCode,
            boletoUrl: d.boletoUrl,
            paidAt: d.paidAt,
            paymentMethod: d.paymentMethod,
          })
        }
      })
      setCobrancasMap(map)
    } catch {
      setCobrancasMap(new Map())
    }
  }, [])

  const fetchValidacao = useCallback(async () => {
    setValidacaoLoading(true)
    try {
      const res = await fetch('/api/admin/financeiro/validacao', { credentials: 'include' })
      const json = await res.json()
      if (res.ok && json.ok) {
        setValidacaoData(json)
      }
    } catch {
      // Ignora erros silenciosamente
    } finally {
      setValidacaoLoading(false)
    }
  }, [])

  const formatCPF = (cpf: string | null): string => {
    if (!cpf) return ''
    const digits = cpf.replace(/\D/g, '')
    if (digits.length !== 11) return digits
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
  }

  const handleEditAluno = (aluno: typeof validacaoData!.alunos[0]) => {
    setEditAlunoData({
      enrollmentId: aluno.enrollmentId,
      nome: aluno.nome,
      cpf: aluno.cpf || '',
      email: aluno.email || '',
      whatsapp: aluno.whatsapp || '',
      valorMensalidade: aluno.valorMensalidade ? aluno.valorMensalidade.toString() : '',
      dueDay: aluno.dueDay ? aluno.dueDay.toString() : '',
      problemas: aluno.problemas,
    })
    setEditAlunoModalOpen(true)
  }

  const handleSaveAluno = async () => {
    if (!editAlunoData) return
    setEditAlunoSaving(true)
    try {
      // Atualizar enrollment (CPF, email, valorMensalidade, diaPagamento)
      // O endpoint exige nome, email e whatsapp obrigatoriamente
      const res = await fetch(`/api/admin/enrollments/${editAlunoData.enrollmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'update',
          nome: editAlunoData.nome, // Obrigatório
          email: editAlunoData.email.trim(), // Obrigatório
          whatsapp: editAlunoData.whatsapp || '', // Obrigatório
          cpf: editAlunoData.cpf.replace(/\D/g, ''),
          valorMensalidade: editAlunoData.valorMensalidade ? parseFloat(editAlunoData.valorMensalidade.replace(',', '.')) : null,
          diaPagamento: editAlunoData.dueDay ? parseInt(editAlunoData.dueDay, 10) : null,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao salvar dados', type: 'error' })
        return
      }
      // Atualizar PaymentInfo.dueDay se necessário
      if (editAlunoData.dueDay) {
        const resPayment = await fetch(`/api/admin/financeiro/alunos/${editAlunoData.enrollmentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            dueDay: parseInt(editAlunoData.dueDay, 10),
          }),
        })
        await resPayment.json()
      }
      setToast({ message: 'Dados atualizados com sucesso', type: 'success' })
      setEditAlunoModalOpen(false)
      fetchValidacao()
      fetchAlunos(selectedAno, selectedMes) // Recarregar lista de alunos
    } catch (error) {
      console.error('Erro ao salvar aluno:', error)
      setToast({ message: 'Erro ao salvar dados', type: 'error' })
    } finally {
      setEditAlunoSaving(false)
    }
  }

  useEffect(() => {
    fetchAlunos(selectedAno, selectedMes)
    fetchValidacao()
  }, [selectedAno, selectedMes, fetchAlunos, fetchValidacao])

  useEffect(() => {
    fetchCobrancas(selectedAno, selectedMes)
  }, [selectedAno, selectedMes, fetchCobrancas])

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
  const [filterAtrasados, setFilterAtrasados] = useState(false)
  const [filterPeriodo, setFilterPeriodo] = useState<string>('')
  const [filterNfEmitida, setFilterNfEmitida] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterEscola, setFilterEscola] = useState<string>('')
  const [itemsPerPage, setItemsPerPage] = useState<number>(30)
  const [showDicas, setShowDicas] = useState(false)
  const [showBuscarFiltros, setShowBuscarFiltros] = useState(true)
  const [showPeriodo, setShowPeriodo] = useState(false)

  const [cobrancasMap, setCobrancasMap] = useState<Map<string, CobrancaCora>>(new Map())
  const [refreshCobrancasLoading, setRefreshCobrancasLoading] = useState(false)
  const [cobrancaPopoverOpen, setCobrancaPopoverOpen] = useState<string | null>(null)
  const cobrancaPopoverRef = useRef<HTMLDivElement>(null)

  const FINANCE_COLUMNS = [
    { key: 'aluno', label: 'Aluno', fixed: true },
    { key: 'cpf', label: 'CPF', fixed: false },
    { key: 'endereco', label: 'Endereço', fixed: false },
    { key: 'tipoAula', label: 'Tipo aula', fixed: false },
    { key: 'nomeGrupo', label: 'Nome grupo', fixed: false },
    { key: 'responsavel', label: 'Responsável', fixed: false },
    { key: 'quemPaga', label: 'Quem paga', fixed: false },
    { key: 'valorMensal', label: 'Valor mensal', fixed: false },
    { key: 'valorHora', label: 'Valor hora', fixed: false },
    { key: 'status', label: 'Status', fixed: false },
    { key: 'metodoPagamento', label: 'Método pag.', fixed: false },
    { key: 'banco', label: 'Banco', fixed: false },
    { key: 'periodo', label: 'Período', fixed: false },
    { key: 'ultimoPag', label: 'Último pag.', fixed: false },
    { key: 'proxPag', label: 'Próx. pag.', fixed: false },
    { key: 'nfEmitida', label: 'NF emitida?', fixed: false },
    { key: 'acoes', label: 'Ações', fixed: true },
  ] as const
  /** Por padrão ocultamos: endereço, CPF, tipo aula, nome grupo (só aparecem se marcar em Colunas). */
  const defaultVisibleKeys = FINANCE_COLUMNS.filter(
    (c) => !['endereco', 'cpf', 'tipoAula', 'nomeGrupo'].includes(c.key)
  ).map((c) => c.key)
  const [visibleFinanceKeys, setVisibleFinanceKeys] = useState<string[]>(() => defaultVisibleKeys)
  const [columnsDropdownOpen, setColumnsDropdownOpen] = useState(false)
  const columnsDropdownRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (columnsDropdownRef.current && !columnsDropdownRef.current.contains(e.target as Node)) setColumnsDropdownOpen(false)
      if (cobrancaPopoverRef.current && !cobrancaPopoverRef.current.contains(e.target as Node)) setCobrancaPopoverOpen(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleRefreshCobrancas = useCallback(async () => {
    setRefreshCobrancasLoading(true)
    try {
      await fetchCobrancas(selectedAno, selectedMes)
    } finally {
      setRefreshCobrancasLoading(false)
    }
  }, [fetchCobrancas, selectedAno, selectedMes])

  /** Polling: a cada 60s, se há cobranças OPEN ou LATE. */
  const hasOpenOrLate = useMemo(() => {
    if (!cobrancasMap || typeof cobrancasMap.values !== 'function') return false
    for (const c of cobrancasMap.values()) {
      if (c?.coraStatus === 'OPEN' || c?.coraStatus === 'LATE') return true
    }
    return false
  }, [cobrancasMap])

  useEffect(() => {
    if (!hasOpenOrLate) return
    const interval = setInterval(() => fetchCobrancas(selectedAno, selectedMes), 60_000)
    return () => clearInterval(interval)
  }, [hasOpenOrLate, selectedAno, selectedMes, fetchCobrancas])
  const visibleSet = new Set(visibleFinanceKeys)
  const displayColumns = FINANCE_COLUMNS.filter((c) => visibleSet.has(c.key))
  const toggleFinanceColumn = (key: string) => {
    const fixed = FINANCE_COLUMNS.filter((c) => c.fixed).map((c) => c.key)
    if ((fixed as readonly string[]).includes(key)) return
    setVisibleFinanceKeys((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      return [...fixed, ...next.filter((k) => !(fixed as readonly string[]).includes(k))]
    })
  }
  const [sendingCobrancaTodos, setSendingCobrancaTodos] = useState(false)
  const [cobrancaTodosModalOpen, setCobrancaTodosModalOpen] = useState(false)
  const [cobrancaTodosSubject, setCobrancaTodosSubject] = useState(COBRANCA_TODOS_DEFAULT_SUBJECT)
  const [cobrancaTodosText, setCobrancaTodosText] = useState(COBRANCA_TODOS_DEFAULT_TEXT)

  const [gerarCobrancasModalOpen, setGerarCobrancasModalOpen] = useState(false)
  const [gerarCobrancasLoading, setGerarCobrancasLoading] = useState(false)
  const [gerarCobrancaIndividualLoading, setGerarCobrancaIndividualLoading] = useState<string | null>(null)

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
    if (filterAtrasados) {
      list = list.filter((a) => getEffectiveStatus(a) === 'ATRASADO')
    }
    if (filterStatus) {
      list = list.filter((a) => getEffectiveStatus(a) === filterStatus)
    }
    if (filterPeriodo) {
      list = list.filter((a) => (a.periodoPagamento ?? '') === filterPeriodo)
    }
    if (filterNfEmitida === 'emitida') {
      list = list.filter((a) => a.notaFiscalEmitida === true)
    } else if (filterNfEmitida === 'aberto') {
      list = list.filter((a) => a.notaFiscalEmitida !== true)
    }
    if (filterEscola) {
      if (filterEscola === 'OUTROS') {
        list = list.filter((a) => !a.escolaMatricula || a.escolaMatricula === 'OUTRO')
      } else {
        list = list.filter((a) => a.escolaMatricula === filterEscola)
      }
    }
    return list
  }, [alunosNoMes, filterBusca, filterProximos5Dias, filterAtrasados, filterStatus, filterPeriodo, filterNfEmitida, filterEscola])

  const displayedAlunos = useMemo(
    () => filteredAlunos.slice(0, itemsPerPage),
    [filteredAlunos, itemsPerPage]
  )

  const selected = editId ? alunos.find((a) => a.id === editId) : null

  useEffect(() => {
    if (!obsModal) {
      setObsList([])
      setObsNewMessage('')
      return
    }
    setObsLoading(true)
    fetch(`/api/admin/financeiro/observations?enrollmentId=${encodeURIComponent(obsModal.enrollmentId)}`, {
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && Array.isArray(j.data)) setObsList(j.data)
        else setObsList([])
      })
      .catch(() => setObsList([]))
      .finally(() => setObsLoading(false))
  }, [obsModal?.enrollmentId])

  const addObservation = async () => {
    if (!obsModal || !obsNewMessage.trim() || obsSaving) return
    setObsSaving(true)
    try {
      const res = await fetch('/api/admin/financeiro/observations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enrollmentId: obsModal.enrollmentId, message: obsNewMessage.trim() }),
      })
      const j = await res.json()
      if (res.ok && j.ok && j.data) {
        setObsList((prev) => [j.data, ...prev])
        setObsNewMessage('')
        setToast({ message: 'Observação adicionada', type: 'success' })
        fetchAlunos(selectedAno, selectedMes)
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
        fetchAlunos(selectedAno, selectedMes)
      } else {
        setToast({ message: j.message || 'Erro ao remover', type: 'error' })
      }
    } catch {
      setToast({ message: 'Erro ao remover', type: 'error' })
    }
  }

  const handleCopy = useCallback(() => {
    setToast({ message: 'Copiado para a área de transferência', type: 'success' })
  }, [])

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
      // notaFiscalEmitida agora é calculado automaticamente da tabela nfse_invoices (read-only)
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

  const handlePagoCheck = useCallback(
    async (a: AlunoFinanceiro, checked: boolean) => {
      setSaving(true)
      try {
        if (checked) {
          const hoje = new Date().toISOString().slice(0, 10)
          await patchCellBody(a.id, { paymentStatus: 'PAGO', dataUltimoPagamento: hoje })
          setToast({ message: 'Marcado como Pago. Data do último pagamento atualizada.', type: 'success' })
        } else {
          await patchCellBody(a.id, { paymentStatus: 'PENDING', dataUltimoPagamento: null })
          setToast({ message: 'Status alterado para Pendente. Data do último pagamento removida.', type: 'success' })
        }
      } catch {
        setToast({ message: 'Erro ao atualizar status', type: 'error' })
      } finally {
        setSaving(false)
      }
    },
    [patchCellBody, selectedAno, selectedMes]
  )

  // notaFiscalEmitida agora é calculado automaticamente da tabela nfse_invoices (read-only)

  const startEditCell = (a: AlunoFinanceiro, field: string) => {
    // notaFiscalEmitida não é editável (calculado automaticamente)
    if (field === 'notaFiscalEmitida') return
    setEditingCell({ id: a.id, field })
    const v = (a as unknown as Record<string, unknown>)[field === 'paymentStatus' ? 'status' : field]
    setCellValue((v ?? '') as string | number)
  }

  const saveCell = useCallback(async () => {
    if (!editingCell) return
    setSaving(true)
    try {
      const field = editingCell.field
      // notaFiscalEmitida não é editável (calculado automaticamente)
      if (field === 'notaFiscalEmitida') return
      let value: string | number | boolean | null = (cellValue as string | number) || null
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
      // notaFiscalEmitida removido: agora é calculado automaticamente (read-only)
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
          // notaFiscalEmitida removido: agora é calculado automaticamente (read-only)
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

  const handleGerarCobrancasLote = useCallback(async () => {
    setGerarCobrancasLoading(true)
    try {
      const res = await fetch('/api/admin/financeiro/cobranca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ year: selectedAno, month: selectedMes }),
      })
      const json = await res.json()
      setGerarCobrancasModalOpen(false)
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao gerar cobranças', type: 'error' })
        return
      }
      const success = json.success ?? 0
      const errors = (json.errors || []) as Array<{ name: string; error: string }>
      const totalErros = errors.length
      if (totalErros > 0) {
        const msg = errors.slice(0, 5).map((e) => `${e.name}: ${e.error}`).join('; ')
        setToast({
          message: `${success} cobrança(s) gerada(s). ${totalErros} erro(s): ${msg}${totalErros > 5 ? '...' : ''}`,
          type: success > 0 ? 'success' : 'error',
        })
      } else {
        setToast({ message: `${success} cobrança(s) gerada(s).`, type: 'success' })
      }
      fetchAlunos(selectedAno, selectedMes)
      fetchCobrancas(selectedAno, selectedMes)
    } catch {
      setGerarCobrancasModalOpen(false)
      setToast({ message: 'Erro ao gerar cobranças', type: 'error' })
    } finally {
      setGerarCobrancasLoading(false)
    }
  }, [selectedAno, selectedMes, fetchAlunos, fetchCobrancas])

  const handleGerarCobrancaIndividual = useCallback(
    async (a: AlunoFinanceiro) => {
      setGerarCobrancaIndividualLoading(a.id)
      try {
        const res = await fetch('/api/admin/financeiro/cobranca', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ enrollmentId: a.id, year: selectedAno, month: selectedMes }),
        })
        const json = await res.json()
        if (!res.ok || !json.ok) {
          setToast({ message: json.message || 'Erro ao gerar cobrança', type: 'error' })
          return
        }
        setToast({ message: 'Cobrança gerada com sucesso', type: 'success' })
        fetchAlunos(selectedAno, selectedMes)
        fetchCobrancas(selectedAno, selectedMes)
      } catch {
        setToast({ message: 'Erro ao gerar cobrança', type: 'error' })
      } finally {
        setGerarCobrancaIndividualLoading(null)
      }
    },
    [selectedAno, selectedMes, fetchAlunos, fetchCobrancas]
  )

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Cabeçalho */}
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Financeiro – Alunos</h1>
          <p className="text-gray-600 mt-1 text-sm md:text-base">
            Gestão financeira por aluno: valor mensal, status de pagamento, datas e envio de cobrança.
          </p>
        </div>

        {/* Seção: Período (ano e mês) - Recolhível */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
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
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setGerarCobrancasModalOpen(true)}
                  className="shrink-0"
                  title="Gerar boleto/PIX na Cora para todos os alunos ativos"
                >
                  <Receipt className="w-4 h-4 mr-2" />
                  Gerar Cobranças do Mês
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Gerar Cobranças do Mês (Cora) */}
        <Modal
          isOpen={gerarCobrancasModalOpen}
          onClose={() => !gerarCobrancasLoading && setGerarCobrancasModalOpen(false)}
          title="Gerar cobranças via Cora"
          size="md"
          footer={
            <>
              <Button variant="outline" onClick={() => setGerarCobrancasModalOpen(false)} disabled={!!gerarCobrancasLoading}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={handleGerarCobrancasLote} disabled={!!gerarCobrancasLoading}>
                {gerarCobrancasLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Receipt className="w-4 h-4 mr-2" />}
                Gerar Cobranças
              </Button>
            </>
          }
        >
          <p className="text-gray-700">
            Gerar cobranças para <strong>{MESES_LABELS[selectedMes]} de {selectedAno}</strong> para todos os alunos ativos com valor de mensalidade definido?
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Serão criados boleto e QR Code PIX na Cora. Alunos sem CPF ou email não serão incluídos.
          </p>
        </Modal>

        {/* Seção: Resumo do mês (cubos) */}
        <section>
          <h2 className="text-base font-semibold text-gray-800 mb-3">Resumo do mês</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setCubeModal('atrasado')}
              onKeyDown={(e) => e.key === 'Enter' && setCubeModal('atrasado')}
              className="rounded-xl border-2 border-red-200 bg-red-50 p-4 shadow-sm cursor-pointer hover:bg-red-100 transition-colors"
            >
              <p className="text-xs font-semibold text-red-800 uppercase tracking-wide">Total atrasado</p>
              <p className="mt-1 text-xl font-bold text-red-900">{formatMoney(totalAtrasado)}</p>
            </div>
            <div
              role="button"
              tabIndex={0}
              onClick={() => setCubeModal('pago')}
              onKeyDown={(e) => e.key === 'Enter' && setCubeModal('pago')}
              className="rounded-xl border-2 border-green-200 bg-green-50 p-4 shadow-sm cursor-pointer hover:bg-green-100 transition-colors"
            >
              <p className="text-xs font-semibold text-green-800 uppercase tracking-wide">Total pago</p>
              <p className="mt-1 text-xl font-bold text-green-900">{formatMoney(totalPago)}</p>
            </div>
            <div
              role="button"
              tabIndex={0}
              onClick={() => setCubeModal('aReceber')}
              onKeyDown={(e) => e.key === 'Enter' && setCubeModal('aReceber')}
              className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4 shadow-sm cursor-pointer hover:bg-amber-100 transition-colors"
            >
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">A receber</p>
              <p className="mt-1 text-xl font-bold text-amber-900">{formatMoney(totalAReceber)}</p>
            </div>
            <div
              role="button"
              tabIndex={0}
              onClick={() => setValidacaoModalOpen(true)}
              onKeyDown={(e) => e.key === 'Enter' && setValidacaoModalOpen(true)}
              className="rounded-xl border-2 border-slate-200 bg-slate-50 p-4 shadow-sm cursor-pointer hover:bg-slate-100 transition-colors"
            >
              <p className="text-xs font-semibold text-slate-800 uppercase tracking-wide">Alunos com problemas nas infos</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{validacaoLoading ? '—' : (validacaoData?.comProblema ?? 0)}</p>
            </div>
            <div
              role="button"
              tabIndex={0}
              onClick={() => setCubeModal('nfEmAberto')}
              onKeyDown={(e) => e.key === 'Enter' && setCubeModal('nfEmAberto')}
              className="rounded-xl border-2 border-orange-200 bg-orange-50 p-4 shadow-sm cursor-pointer hover:bg-orange-100 transition-colors"
            >
              <p className="text-xs font-semibold text-orange-800 uppercase tracking-wide">NF aberto</p>
              <p className="mt-1 text-xl font-bold text-orange-900">{nfEmAberto}</p>
            </div>
            <div
              role="button"
              tabIndex={0}
              onClick={() => setCubeModal('nfEmitida')}
              onKeyDown={(e) => e.key === 'Enter' && setCubeModal('nfEmitida')}
              className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4 shadow-sm cursor-pointer hover:bg-emerald-100 transition-colors"
            >
              <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">NF emitida</p>
              <p className="mt-1 text-xl font-bold text-emerald-900">{nfEmitida}</p>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
          </div>
        ) : (
          <>
            {/* Seção: Buscar e filtros (recolhível) */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
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
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nome, email ou grupo</label>
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
                          checked={filterProximos5Dias}
                          onChange={(e) => setFilterProximos5Dias(e.target.checked)}
                          className="rounded border-gray-300 text-amber-600"
                        />
                        <span className="text-sm text-gray-700">Venc. em 5 dias</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filterAtrasados}
                          onChange={(e) => setFilterAtrasados(e.target.checked)}
                          className="rounded border-gray-300 text-red-600"
                        />
                        <span className="text-sm text-gray-700">Atrasados</span>
                      </label>
                    </div>
                    <Button
                      variant="primary"
                      onClick={openCobrancaTodosModal}
                      disabled={atrasadosComEmail.length === 0}
                      className="shrink-0"
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Enviar cobrança (atrasados)
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-end gap-4 pt-2 border-t border-gray-100">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Status</label>
                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="input min-w-[140px] text-sm py-2"
                      >
                        <option value="">Todos</option>
                        {STATUS_OPCOES.filter((o) => o.value).map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Período</label>
                      <select
                        value={filterPeriodo}
                        onChange={(e) => setFilterPeriodo(e.target.value)}
                        className="input min-w-[140px] text-sm py-2"
                      >
                        <option value="">Todos</option>
                        {PERIODO_OPCOES.filter((o) => o.value).map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">NF emitida?</label>
                      <select
                        value={filterNfEmitida}
                        onChange={(e) => setFilterNfEmitida(e.target.value)}
                        className="input min-w-[140px] text-sm py-2"
                      >
                        <option value="">Todos</option>
                        <option value="aberto">Em aberto</option>
                        <option value="emitida">Emitida</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Escola</label>
                      <select
                        value={filterEscola}
                        onChange={(e) => setFilterEscola(e.target.value)}
                        className="input min-w-[140px] text-sm py-2"
                      >
                        <option value="">Todos</option>
                        <option value="SEIDMANN">Seidmann</option>
                        <option value="YOUBECOME">Youbecome</option>
                        <option value="HIGHWAY">Highway</option>
                        <option value="OUTROS">Outros</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Dicas (recolhível) */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowDicas((v) => !v)}
                className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                <Info className="w-4 h-4 text-brand-orange shrink-0" />
                <span>Como usar esta página</span>
                {showDicas ? <ChevronDown className="w-4 h-4 ml-auto" /> : <ChevronRight className="w-4 h-4 ml-auto" />}
              </button>
              {showDicas && (
                <div className="px-4 pb-4 pt-0 text-xs text-gray-600 border-t border-gray-200">
                  <p className="pt-3">
                    As informações de pagamento (Status, NF emitida?) são <strong>independentes por mês</strong>; a única que acompanha o aluno é <strong>Último pag.</strong> Os números e a tabela refletem {MESES_LABELS[selectedMes]}/{selectedAno}. Alunos ativos aparecem em todos os meses; inativos somem a partir do mês em que foram marcados como inativos.
                  </p>
                  <p className="mt-2">
                    <strong>Edição rápida:</strong> clique duas vezes em uma célula para editar (Quem paga, Valor mensal, Status, Método pag., Banco, Período, datas, NF).
                  </p>
                </div>
              )}
            </div>

            {/* Seção: Lista de alunos */}
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 flex flex-wrap items-center gap-3">
                <h2 className="text-base font-semibold text-gray-800 mr-2">Lista de alunos</h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshCobrancas}
                  disabled={refreshCobrancasLoading}
                  title="Atualizar status das cobranças Cora"
                >
                  {refreshCobrancasLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  Atualizar Status
                </Button>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500">Itens por página</label>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => setItemsPerPage(Number(e.target.value))}
                    className="input min-w-[72px] text-sm py-1.5"
                  >
                    <option value={5}>5</option>
                    <option value={30}>30</option>
                    <option value={500}>500</option>
                  </select>
                </div>
                <div className="relative" ref={columnsDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setColumnsDropdownOpen((v) => !v)}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Columns className="w-4 h-4" />
                    Colunas
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  {columnsDropdownOpen && (
                    <div className="absolute left-0 top-full z-20 mt-1 min-w-[200px] rounded-lg border border-gray-200 bg-white py-2 shadow-lg">
                      <p className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase">Exibir colunas</p>
                      {FINANCE_COLUMNS.filter((c) => !c.fixed).map((col) => (
                        <label key={col.key} className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-gray-50">
                          <input type="checkbox" checked={visibleSet.has(col.key)} onChange={() => toggleFinanceColumn(col.key)} className="rounded border-gray-300" />
                          <span className="text-sm text-gray-800">{col.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const headers = displayColumns.map((c) => c.label).join(';')
                    const rows = filteredAlunos.map((a) =>
                      displayColumns
                      .map((col) => {
                        if (col.key === 'aluno') return (a.nome ?? '').replace(/;/g, ',')
                        if (col.key === 'cpf') return (a.cpf ?? '').replace(/;/g, ',')
                        if (col.key === 'endereco') return (a.endereco ?? '').replace(/;|\n/g, ' ').replace(/"/g, '""')
                        if (col.key === 'tipoAula') return a.tipoAula === 'GRUPO' ? 'Grupo' : a.tipoAula === 'PARTICULAR' ? 'Particular' : a.tipoAula ?? ''
                        if (col.key === 'nomeGrupo') return (a.nomeGrupo ?? '').replace(/;/g, ',')
                        if (col.key === 'responsavel') return (a.nomeResponsavel ?? '').replace(/;/g, ',')
                        if (col.key === 'quemPaga') return (a.quemPaga ?? '').replace(/;/g, ',')
                        if (col.key === 'valorMensal') return a.valorMensal != null ? String(a.valorMensal).replace('.', ',') : ''
                        if (col.key === 'valorHora') return a.valorHora != null ? String(a.valorHora).replace('.', ',') : ''
                        if (col.key === 'status') return a.status ?? ''
                        if (col.key === 'metodoPagamento') return (a.metodoPagamento ?? '').replace(/;/g, ',')
                        if (col.key === 'banco') return (a.banco ?? '').replace(/;/g, ',')
                        if (col.key === 'periodo') return PERIODO_SHORT[(a.periodoPagamento && ['MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'].includes(a.periodoPagamento)) ? a.periodoPagamento : 'MENSAL'] ?? 'Men.'
                        if (col.key === 'ultimoPag') return formatDate(a.dataUltimoPagamento)
                        if (col.key === 'proxPag') return formatDate(a.dataProximoPagamento)
                        if (col.key === 'nfEmitida') return a.notaFiscalEmitida === true ? 'Emitida' : 'Em aberto'
                        if (col.key === 'acoes') return ''
                        return ''
                      })
                      .map((v) => (v.includes(';') ? `"${v}"` : v))
                      .join(';')
                  )
                  const csv = '\uFEFF' + [headers, ...rows].join('\r\n')
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `financeiro-alunos-${selectedAno}-${String(selectedMes).padStart(2, '0')}.csv`
                  a.click()
                  URL.revokeObjectURL(url)
                  setToast({ message: 'Planilha exportada. Abra o arquivo no Excel.', type: 'success' })
                }}
                disabled={filteredAlunos.length === 0}
              >
                <FileDown className="w-4 h-4 mr-2" />
                Exportar Excel
              </Button>
                {filteredAlunos.length > itemsPerPage && (
                  <span className="text-sm text-gray-500 ml-auto">
                    Mostrando {displayedAlunos.length} de {filteredAlunos.length} alunos
                  </span>
                )}
              </div>
              <div className="overflow-x-auto px-5 pb-5">
            <table className="w-full min-w-[1400px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {displayColumns.map((col) => (
                    <th
                      key={col.key}
                      className={
                        col.key === 'valorMensal' || col.key === 'valorHora' ? 'px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase' :
                        col.key === 'nfEmitida' ? 'px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase' :
                        col.key === 'acoes' ? 'px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase' :
                        'px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase'
                      }
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayedAlunos.map((a) => {
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
                  const baseTd = `px-3 py-1 text-sm ${isAtrasado ? 'bg-red-50 text-red-900' : 'text-gray-900'}`
                  return (
                    <tr key={a.id} className={isAtrasado ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}>
                      {displayColumns.some((c) => c.key === 'aluno') && <td className={`px-3 py-2 text-sm ${baseTd}`}><CellWithCopy value={a.nome ?? ''} onCopy={handleCopy} /></td>}
                      {displayColumns.some((c) => c.key === 'cpf') && <td className={`px-3 py-2 text-sm max-w-[140px] ${baseTd}`}><CellWithCopy value={a.cpf ?? ''} onCopy={handleCopy} truncate /></td>}
                      {displayColumns.some((c) => c.key === 'endereco') && <td className={`px-3 py-2 text-sm max-w-[220px] ${baseTd}`}><CellWithCopy value={a.endereco ?? ''} onCopy={handleCopy} truncate /></td>}
                      {displayColumns.some((c) => c.key === 'tipoAula') && <td className="px-3 py-2 text-sm text-gray-600">{a.tipoAula === 'GRUPO' ? 'Grupo' : a.tipoAula === 'PARTICULAR' ? 'Particular' : a.tipoAula ?? '—'}</td>}
                      {displayColumns.some((c) => c.key === 'nomeGrupo') && <td className="px-3 py-2 text-sm text-gray-600">{a.nomeGrupo ?? '—'}</td>}
                      {displayColumns.some((c) => c.key === 'responsavel') && <td className="px-3 py-2 text-sm text-gray-600">{a.nomeResponsavel ?? '—'}</td>}
                      {displayColumns.some((c) => c.key === 'quemPaga') && EdCell(
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
                      {displayColumns.some((c) => c.key === 'valorMensal') && EdCell(
                        'valorMensal',
                        <CellWithCopy value={formatMoney(a.valorMensal)} onCopy={handleCopy} className="text-right" />,
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="input w-full py-1 text-sm text-right"
                          value={cellValue === '' || typeof cellValue === 'boolean' ? '' : cellValue}
                          onChange={(e) => setCellValue(e.target.value === '' ? '' : e.target.value)}
                          onBlur={saveCell}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveCell(); if (e.key === 'Escape') setEditingCell(null) }}
                          autoFocus
                        />
                      )}
                      {displayColumns.some((c) => c.key === 'valorHora') && (
                        <td className="px-3 py-1 text-sm text-right text-gray-700" title="Calculado: valor mensal ÷ (frequência semanal × duração da aula × 4 semanas)">
                          {formatMoney(a.valorHora)}
                        </td>
                      )}
                      {displayColumns.some((c) => c.key === 'status') && (
                      <td className={`px-3 py-1 text-sm ${isAtrasado ? 'bg-red-50 text-red-900' : 'text-gray-900'}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          {(() => {
                            const cobranca = cobrancasMap.get(a.id) ?? null
                            // Atrasado é automático quando a data de vencimento passou; senão usa status da API/cobrança
                            const display = isAtrasado
                              ? { type: 'atrasado' as const, label: 'Atrasado', variant: 'danger' as const }
                              : getCobrancaStatusDisplay(a.status, cobranca)
                            const badgeClasses = `inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${BADGE_CLASSES[display.variant]}`
                            const hasCobrancaDetails = cobranca?.coraInvoiceId
                            const isPopoverOpen = cobrancaPopoverOpen === a.id
                            return (
                              <div ref={hasCobrancaDetails && isPopoverOpen ? cobrancaPopoverRef : undefined} className="relative inline-flex">
                                <button
                                  type="button"
                                  onClick={() => hasCobrancaDetails && setCobrancaPopoverOpen(isPopoverOpen ? null : a.id)}
                                  className={`${badgeClasses} ${hasCobrancaDetails ? 'cursor-pointer hover:opacity-90' : 'cursor-default'}`}
                                  title={hasCobrancaDetails ? 'Clique para ver detalhes da cobrança' : isAtrasado ? 'Atrasado automaticamente (vencimento passou). Marque Pago para registrar.' : undefined}
                                >
                                  {display.label}
                                  {hasCobrancaDetails && <CircleChevronDown className="w-3.5 h-3.5 opacity-70" />}
                                </button>
                                {hasCobrancaDetails && isPopoverOpen && cobranca && (
                                  <div className="absolute left-0 top-full z-30 mt-1 min-w-[260px] rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
                                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Detalhes da cobrança Cora</p>
                                    <div className="space-y-2 text-sm">
                                      <p><span className="text-gray-500">Status:</span> <span className="font-medium">{display.label}</span></p>
                                      <p><span className="text-gray-500">Valor:</span> {formatMoney(cobranca.valorMensalidade ?? 0)}</p>
                                      <p><span className="text-gray-500">Vencimento:</span> {cobranca.dueDate ? formatDate(cobranca.dueDate) : '—'}</p>
                                      {cobranca.paidAt && <p><span className="text-gray-500">Pago em:</span> {formatDate(cobranca.paidAt)}</p>}
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      {cobranca.boletoUrl && (
                                        <a
                                          href={cobranca.boletoUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
                                        >
                                          <ExternalLink className="w-3.5 h-3.5" />
                                          Ver Boleto
                                        </a>
                                      )}
                                      {cobranca.pixQrCode && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            navigator.clipboard.writeText(cobranca.pixQrCode!).then(() => {
                                              setToast({ message: 'PIX copiado para a área de transferência', type: 'success' })
                                            })
                                          }}
                                          className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-200"
                                        >
                                          <QrCode className="w-3.5 h-3.5" />
                                          Copiar PIX
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })()}
                          <label className="flex items-center gap-1.5 cursor-pointer whitespace-nowrap" title="Marque quando o pagamento for realizado">
                            <input
                              type="checkbox"
                              checked={a.status === 'PAGO'}
                              disabled={saving}
                              onChange={(e) => handlePagoCheck(a, e.target.checked)}
                              className="rounded border-gray-300 text-green-600"
                            />
                            <span className="text-xs font-medium">Pago</span>
                          </label>
                        </div>
                      </td>
                      )}
                      {displayColumns.some((c) => c.key === 'metodoPagamento') && EdCell(
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
                      {displayColumns.some((c) => c.key === 'banco') && EdCell(
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
                      {displayColumns.some((c) => c.key === 'periodo') && (
                      <td className={`px-3 py-2 text-sm ${isAtrasado ? 'bg-red-50 text-red-900' : 'text-gray-900'}`}>
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-gray-800 font-medium">
                          {PERIODO_SHORT[(a.periodoPagamento && ['MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'].includes(a.periodoPagamento)) ? a.periodoPagamento : 'MENSAL']}
                        </span>
                      </td>
                      )}
                      {displayColumns.some((c) => c.key === 'ultimoPag') && EdCell('dataUltimoPagamento', formatDate(a.dataUltimoPagamento), (
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
                      {displayColumns.some((c) => c.key === 'proxPag') && EdCell('dataProximoPagamento', formatDate(a.dataProximoPagamento), (
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
                      {displayColumns.some((c) => c.key === 'nfEmitida') && (
                      <td className={`px-3 py-2 text-sm text-center ${isAtrasado ? 'bg-red-50' : ''}`}>
                        {a.notaFiscalEmitida === true ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Emitida
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                            Em aberto
                          </span>
                        )}
                      </td>
                      )}
                      {displayColumns.some((c) => c.key === 'acoes') && (
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button type="button" onClick={() => openEdit(a)} className="text-gray-600 hover:text-brand-orange p-1" title="Editar (modal)">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setObsModal({ enrollmentId: a.id, nome: a.nome })}
                          className={`ml-1 p-1 ${a.hasFinanceObservations ? 'text-orange-600 hover:text-orange-700' : 'text-gray-600 hover:text-blue-600'}`}
                          title={a.hasFinanceObservations ? 'Observações (há notificações)' : 'Observações'}
                        >
                          <MessageSquare className={`w-4 h-4 ${a.hasFinanceObservations ? 'fill-current' : ''}`} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleGerarCobrancaIndividual(a)}
                          disabled={gerarCobrancaIndividualLoading === a.id}
                          className="ml-1 text-gray-500 hover:text-brand-orange p-1 disabled:opacity-50"
                          title="Gerar boleto/PIX na Cora"
                        >
                          {gerarCobrancaIndividualLoading === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
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
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {displayedAlunos.length === 0 && (
              <div className="py-12 text-center text-gray-500 px-5">
                {alunos.length === 0 ? 'Nenhum aluno encontrado.' : 'Nenhum aluno corresponde aos filtros.'}
              </div>
            )}
              </div>
            </section>
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
              <Button variant="primary" onClick={() => void handleSave({ preventDefault: () => {} } as React.FormEvent)} disabled={saving}>
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
                {/* notaFiscalEmitida removido: agora é calculado automaticamente da tabela nfse_invoices (read-only) */}
              </div>
            </form>
          )}
        </Modal>

        {/* Modal Observações financeiras (aluno) */}
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
          footer={
            (() => {
              const list =
                cubeModal === 'atrasado'
                  ? alunosAtrasado
                  : cubeModal === 'pago'
                    ? alunosPago
                    : cubeModal === 'aReceber'
                      ? alunosAReceber
                      : cubeModal === 'alunos'
                        ? alunosNoMes
                        : cubeModal === 'nfEmAberto'
                          ? alunosNFEmAberto
                          : cubeModal === 'nfEmitida'
                            ? alunosNFEmitida
                            : []
              if (list.length === 0) return null
              const showVencimento = cubeModal === 'atrasado' || cubeModal === 'aReceber'
              const showUltimoPag = cubeModal === 'pago'
              const copyText =
                (showVencimento
                  ? 'Aluno\tVencimento\n' + list.map((a) => `${a.nome}\t${formatDate(a.dataProximoPagamento)}`).join('\n')
                  : showUltimoPag
                    ? 'Aluno\tÚltimo pag.\n' + list.map((a) => `${a.nome}\t${formatDate(a.dataUltimoPagamento)}`).join('\n')
                    : 'Aluno\n' + list.map((a) => a.nome).join('\n'))
              return (
                <div className="flex justify-end w-full">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(copyText).then(
                        () => setToast({ message: 'Lista copiada para a área de transferência', type: 'success' }),
                        () => setToast({ message: 'Não foi possível copiar', type: 'error' })
                      )
                    }}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copiar lista completa
                  </Button>
                </div>
              )
            })()
          }
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
                      ? alunosNoMes
                      : cubeModal === 'nfEmAberto'
                        ? alunosNFEmAberto
                        : cubeModal === 'nfEmitida'
                          ? alunosNFEmitida
                          : []
            if (list.length === 0) {
              return <p className="text-gray-500 text-sm">Nenhum aluno nesta lista.</p>
            }
            const showVencimento = cubeModal === 'atrasado' || cubeModal === 'aReceber'
            const showUltimoPag = cubeModal === 'pago'
            return (
              <>
                <ul className="space-y-2 max-h-80 overflow-y-auto">
                  {list.map((a) => (
                    <li key={a.id} className="py-1.5 px-2 rounded bg-gray-50 text-gray-800 flex flex-wrap items-baseline justify-between gap-x-2">
                      <span>{a.nome}</span>
                      {(showVencimento || showUltimoPag) && (
                        <span className="text-sm text-gray-600 shrink-0">
                          {showVencimento && (
                            <>Venc.: {formatDate(a.dataProximoPagamento)}</>
                          )}
                          {showUltimoPag && !showVencimento && (
                            <>Últ. pag.: {formatDate(a.dataUltimoPagamento)}</>
                          )}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
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

        {/* Modal Lista de Alunos com Problemas */}
        <Modal
          isOpen={validacaoModalOpen}
          onClose={() => setValidacaoModalOpen(false)}
          title="Cobrança"
          size="lg"
        >
          {validacaoData && validacaoData.alunos.length > 0 ? (
            <div className="space-y-4">
              {validacaoData.alunos.map((aluno) => {
                const problemaCount = aluno.problemas.length
                const corBadge = problemaCount >= 3 ? '🔴' : problemaCount === 2 ? '🟡' : '🟡'
                return (
                  <div key={aluno.enrollmentId} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{corBadge}</span>
                        <span className="font-semibold text-gray-900">{aluno.nome}</span>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => handleEditAluno(aluno)}>
                        Corrigir dados
                      </Button>
                    </div>
                    <ul className="space-y-1 ml-7">
                      {aluno.problemas.map((problema, idx) => (
                        <li key={idx} className="text-sm text-gray-700">
                          • {problema}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Nenhum aluno com problemas encontrado.</p>
          )}
        </Modal>

        {/* Modal Editar Aluno */}
        <Modal
          isOpen={editAlunoModalOpen}
          onClose={() => !editAlunoSaving && setEditAlunoModalOpen(false)}
          title={editAlunoData ? `Corrigir dados – ${editAlunoData.nome}` : 'Corrigir dados'}
          size="md"
          footer={
            <>
              <Button variant="outline" onClick={() => setEditAlunoModalOpen(false)} disabled={!!editAlunoSaving}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={handleSaveAluno} disabled={!!editAlunoSaving}>
                {editAlunoSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Salvar
              </Button>
            </>
          }
        >
          {editAlunoData && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  CPF {editAlunoData.problemas.some((p) => p.includes('CPF')) && (
                    <span className="text-red-600">*</span>
                  )}
                </label>
                <input
                  type="text"
                  value={formatCPF(editAlunoData.cpf)}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '')
                    setEditAlunoData({ ...editAlunoData, cpf: digits.slice(0, 11) })
                  }}
                  className={`input w-full ${editAlunoData.problemas.some((p) => p.includes('CPF')) ? 'border-red-300 bg-red-50' : ''}`}
                  placeholder="000.000.000-00"
                  maxLength={14}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Email {editAlunoData.problemas.some((p) => p.includes('Email')) && (
                    <span className="text-red-600">*</span>
                  )}
                </label>
                <input
                  type="email"
                  value={editAlunoData.email}
                  onChange={(e) => setEditAlunoData({ ...editAlunoData, email: e.target.value })}
                  className={`input w-full ${editAlunoData.problemas.some((p) => p.includes('Email')) ? 'border-red-300 bg-red-50' : ''}`}
                  placeholder="email@exemplo.com"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Valor Mensalidade {editAlunoData.problemas.some((p) => p.includes('mensalidade')) && (
                    <span className="text-red-600">*</span>
                  )}
                </label>
                <input
                  type="text"
                  value={editAlunoData.valorMensalidade}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^\d,.]/g, '').replace(',', '.')
                    setEditAlunoData({ ...editAlunoData, valorMensalidade: value })
                  }}
                  className={`input w-full ${editAlunoData.problemas.some((p) => p.includes('mensalidade')) ? 'border-red-300 bg-red-50' : ''}`}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Dia de Pagamento {editAlunoData.problemas.some((p) => p.includes('pagamento')) && (
                    <span className="text-red-600">*</span>
                  )}
                </label>
                <input
                  type="number"
                  value={editAlunoData.dueDay}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10)
                    if (!isNaN(value) && value >= 1 && value <= 31) {
                      setEditAlunoData({ ...editAlunoData, dueDay: value.toString() })
                    } else if (e.target.value === '') {
                      setEditAlunoData({ ...editAlunoData, dueDay: '' })
                    }
                  }}
                  className={`input w-full ${editAlunoData.problemas.some((p) => p.includes('pagamento')) ? 'border-red-300 bg-red-50' : ''}`}
                  placeholder="1-31"
                  min={1}
                  max={31}
                />
              </div>
            </div>
          )}
        </Modal>

        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </div>
    </AdminLayout>
  )
}
