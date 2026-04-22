/**
 * Financeiro – Alunos
 * Tabela com dados financeiros por aluno e ações (editar, enviar cobrança).
 */

'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AdminLayout from '@/components/admin/AdminLayout'
import Modal from '@/components/admin/Modal'
import Button from '@/components/ui/Button'
import Toast from '@/components/admin/Toast'
import { Pencil, Send, Loader2, Copy, Columns, ChevronDown, FileDown, MessageSquare, Trash2, Info, ChevronRight, Calendar, CalendarX, Search, Receipt, QrCode, RefreshCw, ExternalLink, CircleChevronDown, CheckCircle2, Maximize2, Minimize2, Download, FileText, Bell, FilePlus, XCircle, AlertCircle, Clock, Mail } from 'lucide-react'

interface AlunoFinanceiro {
  id: string
  nome: string
  cpf: string | null
  faturamentoTipo?: string
  faturamentoRazaoSocial?: string | null
  faturamentoCnpj?: string | null
  faturamentoEmail?: string | null
  faturamentoEndereco?: string | null
  faturamentoDescricaoNfse?: string | null
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
  dataUltimaCobranca: string | null
  diaPagamento: number | null
  notaFiscalEmitida: boolean | null
  nfseFocusRef?: string | null
  nfseStatus?: string | null
  nfseErrorMessage?: string | null
  nfAgendada?: boolean
  nfsePdfUrl?: string | null
  nfseEmailEnviado?: boolean
  email: string
  escolaMatricula: string | null
  paymentInfoId: string | null
  hasFinanceObservations?: boolean
  /** Matrícula com bolsa integral — tratado como pago; sem boleto/NF na UI */
  bolsista?: boolean
}

interface AlunoRemovidoMes {
  id: string
  nome: string
  motivo: string | null
}

/** Status efetivo: se não está PAGO e o dia de vencimento já passou (em relação a "hoje") → ATRASADO.
 * Quando year/month são informados (mês da lista), o vencimento é calculado nesse mês; assim em abril
 * ninguém aparece Atrasado antes de abril começar. */
function getEffectiveStatus(
  a: AlunoFinanceiro,
  today: Date = new Date(),
  year?: number,
  month?: number
): 'PAGO' | 'ATRASADO' | 'PENDING' {
  if (a.bolsista) return 'PAGO'
  if (a.status === 'PAGO') return 'PAGO'
  const dia = a.diaPagamento
  if (dia == null || dia < 1 || dia > 31) return (a.status as 'PENDING') || 'PENDING'
  const y = year ?? today.getFullYear()
  const m = month ?? today.getMonth() + 1
  const lastDay = new Date(y, m, 0).getDate()
  const dueDay = Math.min(dia, lastDay)
  const dueDate = new Date(y, m - 1, dueDay)
  dueDate.setHours(23, 59, 59, 999)
  if (today > dueDate) return 'ATRASADO'
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

const MESES_NOME = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** Template padrão da descrição da NF para empresa (variáveis: {aluno}, {frequencia}, {curso}, {mes}, {ano}). */
const DEFAULT_DESCRICAO_NF_EMPRESA =
  'Aulas de idioma - Aluno {aluno}, frequência {frequencia}x/semana, curso {curso}.\nPagamento referente ao mês de {mes}/{ano}.'

/** Indica se o campo livre "quem paga" (PaymentInfo) diz que o pagador é o responsável. */
function quemPagaExplicitoResponsavel(quemPaga: string | null): boolean {
  const q = (quemPaga ?? '').trim().toLowerCase()
  if (!q) return false
  return (
    q.includes('respons') ||
    q.includes('pai') ||
    q.includes('mãe') ||
    q.includes('mae') ||
    q.includes('genitor') ||
    q.includes('tutor')
  )
}

function getQuemPagaLabel(a: AlunoFinanceiro): string {
  if (a.faturamentoTipo === 'EMPRESA') {
    return 'Empresa'
  }
  if (quemPagaExplicitoResponsavel(a.quemPaga)) {
    return 'Responsável'
  }
  return 'Aluno'
}

function templateConteudoEmailNf(mes: number, ano: number): string {
  return `Segue NF referente ao mês de ${MESES_NOME[mes - 1]}/${ano}.`
}

/** Converte ISO (UTC) para string "yyyy-MM-ddTHH:mm" no fuso local (para input datetime-local). */
function isoToDateTimeLocal(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day}T${h}:${min}`
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
  cobranca: CobrancaCora | null,
  opts?: { bolsista?: boolean }
): CobrancaStatusDisplay {
  if (opts?.bolsista) {
    return { type: 'pago', label: 'Pago (bolsista)', variant: 'success' }
  }
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

/** Tipo explícito para aluno da validação (API /api/admin/financeiro/validacao) */
interface ValidacaoAluno {
  enrollmentId: string
  nome: string
  email: string | null
  cpf: string | null
  whatsapp?: string | null
  valorMensalidade: number | null
  dueDay: number | null
  problemas: string[]
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
  const [alunosRemovidosMes, setAlunosRemovidosMes] = useState<AlunoRemovidoMes[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [confirmUnpay, setConfirmUnpay] = useState<AlunoFinanceiro | null>(null)
  const [confirmMarkPaid, setConfirmMarkPaid] = useState<AlunoFinanceiro | null>(null)
  const [confirmBulkUnpay, setConfirmBulkUnpay] = useState(false)
  const [bulkReasons, setBulkReasons] = useState<Record<string, string>>({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [fullTableView, setFullTableView] = useState(false)
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
    alunos: ValidacaoAluno[]
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
  const [agendarNfModal, setAgendarNfModal] = useState<AlunoFinanceiro | null>(null)
  const [agendarNfForm, setAgendarNfForm] = useState<{
    email: string
    scheduledFor: string
    faturamentoTipo: 'ALUNO' | 'EMPRESA'
    emailBody: string
    assunto?: string
    nfAttachmentPath?: string
    nfAttachmentName?: string
    repeatMonthly: boolean
  }>({
    email: '',
    scheduledFor: '',
    faturamentoTipo: 'ALUNO',
    emailBody: '',
    assunto: '',
    nfAttachmentPath: '',
    nfAttachmentName: '',
    repeatMonthly: false,
  })
  const [agendarNfLoading, setAgendarNfLoading] = useState(false)
  const [agendarNfSaving, setAgendarNfSaving] = useState(false)
  const nfFileInputRef = useRef<HTMLInputElement | null>(null)
  const [agendarNfFromRepeat, setAgendarNfFromRepeat] = useState(false)
  const [nfErrorModal, setNfErrorModal] = useState<{ nome: string; message: string } | null>(null)
  const [form, setForm] = useState({
    quemPaga: '',
    paymentStatus: '',
    metodoPagamento: '',
    banco: '',
    periodoPagamento: '',
    valorMensal: '' as string | number,
    valorHora: '' as string | number,
    dataUltimoPagamento: '',
    diaPagamento: '',
    faturamentoTipo: 'ALUNO' as 'ALUNO' | 'EMPRESA',
    faturamentoRazaoSocial: '',
    faturamentoCnpj: '',
    faturamentoEmail: '',
    faturamentoEndereco: '',
    faturamentoDescricaoNfse: '',
  })

  const anoAtual = new Date().getFullYear()
  const mesAtual = new Date().getMonth() + 1
  const [selectedAno, setSelectedAno] = useState<number>(anoAtual)
  const [selectedMes, setSelectedMes] = useState<number>(mesAtual)
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null)

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
      setAlunosRemovidosMes(json.data.removidosNesteMes || [])
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

  const handleEditAluno = (aluno: ValidacaoAluno) => {
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

  // Ao abrir o modal de agendar NF, preencher formulário e opcionalmente carregar agendamento existente
  useEffect(() => {
    if (!agendarNfModal) return
    const a = agendarNfModal
    const defaultDate = `${selectedAno}-${String(selectedMes).padStart(2, '0')}-01`
    const defaultDateTime = `${defaultDate}T09:00`
    const tipo = (a.faturamentoTipo as 'ALUNO' | 'EMPRESA') || 'ALUNO'
    const templateBody = templateConteudoEmailNf(selectedMes, selectedAno)
    const descricaoDoAluno = (a as { faturamentoDescricaoNfse?: string | null }).faturamentoDescricaoNfse?.trim()
    setAgendarNfForm({
      email: (tipo === 'EMPRESA' ? a.faturamentoEmail : a.email) || '',
      scheduledFor: defaultDateTime,
      faturamentoTipo: tipo,
      emailBody: tipo === 'EMPRESA' ? templateBody : '',
      assunto: '',
      nfAttachmentPath: '',
      nfAttachmentName: '',
      repeatMonthly: false,
    })
    setAgendarNfFromRepeat(false)
    setAgendarNfLoading(true)
    const url = `/api/admin/financeiro/nfse-agendamento?enrollmentId=${encodeURIComponent(a.id)}&year=${selectedAno}&month=${selectedMes}`
    fetch(url, { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json?.ok && json?.data) {
          const d = json.data
          const bodyTipo = (d.faturamentoTipo as 'ALUNO' | 'EMPRESA') || 'ALUNO'
          const bodyDefault = templateConteudoEmailNf(selectedMes, selectedAno)
          const rawScheduled = d.scheduledFor || defaultDateTime
          const scheduledForValue =
            rawScheduled.length > 10 ? isoToDateTimeLocal(rawScheduled) : `${rawScheduled.slice(0, 10)}T09:00`
          // Se veio de um agendamento "repetir todo mês", usar o texto do mês atual no e-mail
          const emailBodyVal =
            json.fromRepeat && bodyTipo === 'EMPRESA'
              ? bodyDefault
              : (d.emailBody && d.emailBody.trim())
                ? d.emailBody
                : bodyTipo === 'EMPRESA'
                  ? bodyDefault
                  : ''
          setAgendarNfForm({
            email: d.email || '',
            scheduledFor: scheduledForValue,
            faturamentoTipo: bodyTipo,
            emailBody: emailBodyVal,
            assunto: d.emailSubject ?? '',
            nfAttachmentPath: d.nfAttachmentPath ?? '',
            nfAttachmentName: '',
            repeatMonthly: !!d.repeatMonthly,
          })
          setAgendarNfFromRepeat(!!json.fromRepeat)
        }
      })
      .finally(() => setAgendarNfLoading(false))
  }, [agendarNfModal, selectedAno, selectedMes])

  const openAgendarNfModal = (a: AlunoFinanceiro) => setAgendarNfModal(a)

  const handleAgendarNfSubmit = async () => {
    if (!agendarNfModal) return
    const {
      email,
      scheduledFor,
      faturamentoTipo,
      emailBody,
      assunto,
      nfAttachmentPath,
      repeatMonthly,
    } = agendarNfForm
    if (!email.trim()) {
      setToast({ message: 'Informe o e-mail para envio da NF', type: 'error' })
      return
    }
    setAgendarNfSaving(true)
    try {
      const res = await fetch('/api/admin/financeiro/nfse-agendamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          enrollmentId: agendarNfModal.id,
          year: selectedAno,
          month: selectedMes,
          email: email.trim(),
          faturamentoTipo,
          empresaRazaoSocial: undefined,
          empresaCnpj: undefined,
          empresaEnderecoFiscal: undefined,
          empresaDescricaoNfse: undefined,
          emailBody: emailBody.trim() || undefined,
          emailSubject: (assunto ?? '').trim() || undefined,
          nfAttachmentPath: nfAttachmentPath || undefined,
          scheduledFor: new Date(scheduledFor).toISOString(),
          repeatMonthly,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao salvar agendamento', type: 'error' })
        return
      }
      setToast({ message: 'Agendamento salvo', type: 'success' })
      await fetchAlunos(selectedAno, selectedMes)
      setAgendarNfModal(null)
      setAgendarNfFromRepeat(false)
    } catch {
      setToast({ message: 'Erro ao salvar agendamento', type: 'error' })
    } finally {
      setAgendarNfSaving(false)
    }
  }

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

  /** Verdadeiro se o aluno tem dia de vencimento definido (cada mês tem o mesmo dia de vencimento). */
  const isVencimentoNoMes = useCallback((a: AlunoFinanceiro, _ano: number, _mes: number) => {
    const dia = a.diaPagamento
    return dia != null && dia >= 1 && dia <= 31
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
    const today = new Date()
    alunosNoMes.forEach((a) => {
      const status = getEffectiveStatus(a, today, selectedAno, selectedMes)
      const valor = a.valorMensal ?? 0
      const vencimentoNoMes = isVencimentoNoMes(a, selectedAno, selectedMes)
      if (status === 'ATRASADO') {
        atrasado += valor
        if (vencimentoNoMes) {
          aReceber += valor
          aReceberList.push(a)
        }
        atrasadoList.push(a)
      } else if (status === 'PAGO') {
        pago += valor
        pagoList.push(a)
      } else {
        if (vencimentoNoMes) {
          aReceber += valor
          aReceberList.push(a)
        }
      }
      if (a.notaFiscalEmitida === true) {
        emitida++
        nfEmitidaList.push(a)
      } else if (!a.bolsista) {
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
  }, [alunosNoMes, selectedAno, selectedMes, isVencimentoNoMes])

  const [cubeModal, setCubeModal] = useState<'atrasado' | 'atrasadoCancelar' | 'pago' | 'aReceber' | 'alunos' | 'nfEmAberto' | 'nfEmitida' | 'removidos' | null>(null)
  const [filterBusca, setFilterBusca] = useState('')
  const [filterPeriodo, setFilterPeriodo] = useState<string>('')
  const [filterNfEmitida, setFilterNfEmitida] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterQuemPaga, setFilterQuemPaga] = useState<string>('')
  const [filterInfoPagamento, setFilterInfoPagamento] = useState<string>('')
  const [filterEscola, setFilterEscola] = useState<string>('')
  const [itemsPerPage, setItemsPerPage] = useState<number>(7)
  const [showDicas, setShowDicas] = useState(false)
  const [showBuscarFiltros, setShowBuscarFiltros] = useState(true)
  const [showPeriodo, setShowPeriodo] = useState(false)

  const [cobrancasMap, setCobrancasMap] = useState<Map<string, CobrancaCora>>(new Map())
  const [refreshCobrancasLoading, setRefreshCobrancasLoading] = useState(false)
  const [cobrancaPopoverOpen, setCobrancaPopoverOpen] = useState<string | null>(null)
  const cobrancaPopoverRef = useRef<HTMLDivElement>(null)

  const FINANCE_COLUMNS = [
    { key: 'diaVenc', label: 'Dia venc.', fixed: true },
    { key: 'aluno', label: 'Aluno', fixed: true },
    { key: 'cpf', label: 'CPF', fixed: false },
    { key: 'endereco', label: 'Endereço', fixed: false },
    { key: 'tipoAula', label: 'Tipo aula', fixed: false },
    { key: 'nomeGrupo', label: 'Nome grupo', fixed: false },
    { key: 'responsavel', label: 'Responsável', fixed: false },
    { key: 'quemPaga', label: 'Quem paga', fixed: true },
    { key: 'valorMensal', label: 'Valor mensal', fixed: false },
    { key: 'valorHora', label: 'Valor hora', fixed: false },
    { key: 'status', label: 'Status', fixed: false },
    { key: 'metodoPagamento', label: 'Método pag.', fixed: false },
    { key: 'banco', label: 'Banco', fixed: false },
    { key: 'periodo', label: 'Período', fixed: false },
    { key: 'ultimoPag', label: 'Data Pag.', fixed: false },
    { key: 'ultimaCobranca', label: 'Ultima cobran.', fixed: false },
    { key: 'nfEmitida', label: 'Status NF', fixed: false },
    { key: 'acoesNf', label: 'Ações NF', fixed: false },
    { key: 'acoes', label: 'Ações', fixed: true },
  ] as const
  /** Por padrão ocultamos: endereço, CPF, tipo aula, nome grupo, responsável, valor hora, banco (só aparecem se marcar em Colunas). */
  const defaultVisibleKeys = FINANCE_COLUMNS.filter(
    (c) => !['endereco', 'cpf', 'tipoAula', 'nomeGrupo', 'responsavel', 'valorHora', 'banco'].includes(c.key)
  ).map((c) => c.key)
  const [visibleFinanceKeys, setVisibleFinanceKeys] = useState<string[]>(() => defaultVisibleKeys)
  const [columnsDropdownOpen, setColumnsDropdownOpen] = useState(false)
  const [columnsDropdownStyle, setColumnsDropdownStyle] = useState<{ top: number; left: number; maxHeight: number } | null>(null)
  const columnsTriggerRef = useRef<HTMLButtonElement>(null)
  const columnsDropdownRef = useRef<HTMLDivElement>(null)
  const updateColumnsDropdownPosition = useCallback(() => {
    if (!columnsTriggerRef.current || !columnsDropdownOpen) return
    const rect = columnsTriggerRef.current.getBoundingClientRect()
    const padding = 8
    const maxH = Math.min(400, window.innerHeight * 0.6)
    const spaceBelow = window.innerHeight - rect.bottom - padding
    const openUpward = spaceBelow < 120 && rect.top > spaceBelow
    const top = openUpward ? Math.max(padding, rect.top - maxH - 4) : rect.bottom + 4
    const left = Math.max(padding, Math.min(rect.left, window.innerWidth - 220))
    setColumnsDropdownStyle({ top, left, maxHeight: maxH })
  }, [columnsDropdownOpen])
  useEffect(() => {
    if (columnsDropdownOpen) {
      updateColumnsDropdownPosition()
      window.addEventListener('scroll', updateColumnsDropdownPosition, true)
      window.addEventListener('resize', updateColumnsDropdownPosition)
    } else {
      setColumnsDropdownStyle(null)
    }
    return () => {
      window.removeEventListener('scroll', updateColumnsDropdownPosition, true)
      window.removeEventListener('resize', updateColumnsDropdownPosition)
    }
  }, [columnsDropdownOpen, updateColumnsDropdownPosition])
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (columnsTriggerRef.current?.contains(target) || columnsDropdownRef.current?.contains(target)) return
      setColumnsDropdownOpen(false)
      if (cobrancaPopoverRef.current && !cobrancaPopoverRef.current.contains(target)) setCobrancaPopoverOpen(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleRefreshCobrancas = useCallback(async () => {
    setRefreshCobrancasLoading(true)
    try {
      await fetchCobrancas(selectedAno, selectedMes)
      await fetchAlunos(selectedAno, selectedMes)
    } finally {
      setRefreshCobrancasLoading(false)
    }
  }, [fetchCobrancas, fetchAlunos, selectedAno, selectedMes])

  // Atualização agora é somente manual via botão "Atualizar Status" (sem polling automático).
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
  const [emitirNfLoading, setEmitirNfLoading] = useState<string | null>(null)
  const [emitirNfTodosLoading, setEmitirNfTodosLoading] = useState(false)
  const [boletosLembretesLoading, setBoletosLembretesLoading] = useState(false)
  const [processarAgendamentosLoading, setProcessarAgendamentosLoading] = useState(false)
  const [cancelarNfLoading, setCancelarNfLoading] = useState<string | null>(null)
  const [cancelarNfModal, setCancelarNfModal] = useState<AlunoFinanceiro | null>(null)
  const [cancelarNfJustificativa, setCancelarNfJustificativa] = useState('')
  const [cancelarAgendamentoLoading, setCancelarAgendamentoLoading] = useState<string | null>(null)
  const [removeFromMonthAluno, setRemoveFromMonthAluno] = useState<AlunoFinanceiro | null>(null)
  const [removeFromMonthReason, setRemoveFromMonthReason] = useState('')
  const [sortKey, setSortKey] = useState<'default' | 'nome' | 'diaVenc'>('default')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Usar sempre "hoje" para decidir Atrasado: só mostra Atrasado se o vencimento já passou de fato.
  // Assim, em abril (mês futuro) ninguém aparece como Atrasado antes do mês começar.
  const refDateForStatus = new Date()

  const filteredAlunos = useMemo(() => {
    let list = alunosNoMes.filter(
      (a) => isVencimentoNoMes(a, selectedAno, selectedMes) || getEffectiveStatus(a, refDateForStatus, selectedAno, selectedMes) === 'PAGO'
    )
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
    if (filterStatus) {
      list = list.filter((a) => getEffectiveStatus(a, refDateForStatus, selectedAno, selectedMes) === filterStatus)
    }
    if (filterPeriodo) {
      list = list.filter((a) => (a.periodoPagamento ?? '') === filterPeriodo)
    }
    if (filterQuemPaga) {
      list = list.filter((a) => {
        const label = getQuemPagaLabel(a).toLowerCase()
        if (filterQuemPaga === 'ALUNO') return label === 'aluno'
        if (filterQuemPaga === 'RESPONSAVEL') return label === 'responsável' || label === 'responsavel'
        if (filterQuemPaga === 'EMPRESA') return label === 'empresa'
        return true
      })
    }
    if (filterInfoPagamento === 'comUltimoPag') {
      list = list.filter((a) => !!a.dataPagamento)
    } else if (filterInfoPagamento === 'semUltimoPag') {
      list = list.filter((a) => !a.dataPagamento)
    } else if (filterInfoPagamento === 'semValorMensal') {
      list = list.filter((a) => a.valorMensal == null)
    }
    if (filterNfEmitida === 'emitida') {
      list = list.filter((a) => a.notaFiscalEmitida === true)
    } else if (filterNfEmitida === 'aberto') {
      list = list.filter((a) => a.notaFiscalEmitida !== true && !a.bolsista)
    }
    if (filterEscola) {
      if (filterEscola === 'OUTROS') {
        list = list.filter((a) => !a.escolaMatricula || a.escolaMatricula === 'OUTRO')
      } else {
        list = list.filter((a) => a.escolaMatricula === filterEscola)
      }
    }
    // Ordenação
    list.sort((a, b) => {
      const statusOrder = (s: 'PAGO' | 'ATRASADO' | 'PENDING') =>
        s === 'ATRASADO' ? 0 : s === 'PENDING' ? 1 : 2
      if (sortKey === 'default') {
        const sa = getEffectiveStatus(a, refDateForStatus, selectedAno, selectedMes)
        const sb = getEffectiveStatus(b, refDateForStatus, selectedAno, selectedMes)
        const pa = statusOrder(sa)
        const pb = statusOrder(sb)
        if (pa !== pb) return pa - pb
        const da = a.diaPagamento ?? 32
        const db = b.diaPagamento ?? 32
        if (da !== db) return da - db
        return (a.nome ?? '').localeCompare(b.nome ?? '')
      }
      let va: string | number = ''
      let vb: string | number = ''
      if (sortKey === 'nome') {
        va = a.nome ?? ''
        vb = b.nome ?? ''
      } else if (sortKey === 'diaVenc') {
        va = a.diaPagamento ?? 0
        vb = b.diaPagamento ?? 0
      }
      const cmp =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [alunosNoMes, selectedAno, selectedMes, isVencimentoNoMes, refDateForStatus, filterBusca, filterStatus, filterPeriodo, filterQuemPaga, filterInfoPagamento, filterNfEmitida, filterEscola, sortKey, sortDir])

  const displayedAlunos = useMemo(
    () => filteredAlunos.slice(0, itemsPerPage),
    [filteredAlunos, itemsPerPage]
  )

  const allSelected = filteredAlunos.length > 0 && filteredAlunos.every((a) => selectedIds.has(a.id))
  const someSelected = filteredAlunos.some((a) => selectedIds.has(a.id))

  useEffect(() => {
    const el = selectAllCheckboxRef.current
    if (el) el.indeterminate = someSelected && !allSelected
  }, [someSelected, allSelected])

  useEffect(() => {
    if (!fullTableView) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFullTableView(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fullTableView])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSort = (key: 'default' | 'nome' | 'diaVenc') => {
    setSortKey((prev) => {
      if (prev === key && key !== 'default') {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        return prev
      }
      setSortDir('asc')
      return key
    })
  }

  const selectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredAlunos.map((a) => a.id)))
    }
  }

  const bulkMarkPaid = async () => {
    const ids = Array.from(selectedIds).filter((id) => !alunos.find((x) => x.id === id)?.bolsista)
    if (ids.length === 0) {
      setToast({
        message: selectedIds.size > 0
          ? 'Os selecionados são bolsistas (já tratados como pagos).'
          : 'Selecione ao menos um aluno.',
        type: 'error',
      })
      return
    }
    setSaving(true)
    try {
      const hoje = new Date().toISOString().slice(0, 10)
      let ok = 0
      let err = 0
      for (const id of ids) {
        try {
          await patchCellBody(id, { paymentStatus: 'PAGO', dataUltimoPagamento: hoje })
          ok++
        } catch {
          err++
        }
      }
      setToast({
        message: err === 0 ? `Marcado como Pago para ${ok} aluno(s).` : `${ok} atualizado(s), ${err} erro(s).`,
        type: err === 0 ? 'success' : 'error',
      })
      setSelectedIds(new Set())
    } finally {
      setSaving(false)
    }
  }

  const [removingFromMonthId, setRemovingFromMonthId] = useState<string | null>(null)
  const [revertingRemovedId, setRevertingRemovedId] = useState<string | null>(null)

  const revertRemovedFromMonth = useCallback(
    async (enrollmentId: string) => {
      setRevertingRemovedId(enrollmentId)
      try {
        const res = await fetch(`/api/admin/financeiro/alunos/${enrollmentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            paymentStatus: null,
            year: selectedAno,
            month: selectedMes,
          }),
        })
        const json = await res.json()
        if (res.ok && json.ok) {
          setToast({ message: 'Aluno devolvido ao mês.', type: 'success' })
          await fetchAlunos(selectedAno, selectedMes)
        } else {
          setToast({ message: json.message || 'Erro ao reverter.', type: 'error' })
        }
      } catch {
        setToast({ message: 'Erro ao reverter.', type: 'error' })
      } finally {
        setRevertingRemovedId(null)
      }
    },
    [selectedAno, selectedMes, fetchAlunos]
  )

  const removeFromMonth = useCallback(
    (a: AlunoFinanceiro) => {
      setRemoveFromMonthAluno(a)
      setRemoveFromMonthReason('')
    },
    []
  )

  const confirmRemoveFromMonth = useCallback(
    async () => {
      if (!removeFromMonthAluno) return
      const a = removeFromMonthAluno
      setRemovingFromMonthId(a.id)
      try {
        const res = await fetch(`/api/admin/financeiro/alunos/${a.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            paymentStatus: 'REMOVIDO',
            year: selectedAno,
            month: selectedMes,
          }),
        })
        const json = await res.json()
        if (res.ok && json.ok) {
          const reason = removeFromMonthReason.trim()
          if (reason) {
            await fetch('/api/admin/financeiro/observations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ enrollmentId: a.id, message: reason }),
            })
          }
          setToast({ message: `${a.nome} removido deste mês.`, type: 'success' })
          await fetchAlunos(selectedAno, selectedMes)
          setRemoveFromMonthAluno(null)
          setRemoveFromMonthReason('')
        } else {
          setToast({ message: json.message || 'Erro ao remover.', type: 'error' })
        }
      } catch {
        setToast({ message: 'Erro ao remover.', type: 'error' })
      } finally {
        setRemovingFromMonthId(null)
      }
    },
    [removeFromMonthAluno, removeFromMonthReason, selectedAno, selectedMes, fetchAlunos]
  )

  const bulkMarkPending = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) {
      setToast({ message: 'Selecione ao menos um aluno.', type: 'error' })
      return
    }
    setSaving(true)
    let lastError: string | null = null
    try {
      let ok = 0
      let err = 0
      for (const id of ids) {
        try {
          const res = await fetch(`/api/admin/financeiro/alunos/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              paymentStatus: 'REMOVIDO',
              year: selectedAno,
              month: selectedMes,
            }),
          })
          const json = await res.json()
          if (!res.ok || !json.ok) {
            lastError = json.message || 'Erro ao atualizar'
            err++
            continue
          }
          const reason = (bulkReasons[id] ?? '').trim()
          if (reason) {
            await fetch('/api/admin/financeiro/observations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ enrollmentId: id, message: reason }),
            })
          }
          ok++
        } catch (e) {
          lastError = e instanceof Error ? e.message : 'Erro de rede'
          err++
        }
      }
      setToast({
        message:
          err === 0
            ? `${ok} aluno(s) removido(s) deste mês.`
            : `${ok} removido(s), ${err} erro(s).${lastError ? ` Detalhe: ${lastError}` : ''}`,
        type: err === 0 ? 'success' : 'error',
      })
      setSelectedIds(new Set())
      setBulkReasons({})
      setConfirmBulkUnpay(false)
      await fetchAlunos(selectedAno, selectedMes)
    } finally {
      setSaving(false)
    }
  }

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
      else if (field === 'diaPagamento') body.dueDay = value != null && value !== '' ? Math.min(31, Math.max(1, Number(value))) : null
      else if (field === 'dataUltimaCobranca') body.dataUltimaCobranca = value || null
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

  const applyPagoStatus = useCallback(
    async (a: AlunoFinanceiro, checked: boolean) => {
      if (a.bolsista) return
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
    [patchCellBody]
  )

  const handlePagoCheck = useCallback(
    (a: AlunoFinanceiro, checked: boolean) => {
      if (a.bolsista) return
      if (!checked) {
        setConfirmUnpay(a)
        return
      }
      setConfirmMarkPaid(a)
    },
    []
  )

  // notaFiscalEmitida agora é calculado automaticamente da tabela nfse_invoices (read-only)

  const startEditCell = (a: AlunoFinanceiro, field: string) => {
    // notaFiscalEmitida não é editável (calculado automaticamente)
    if (field === 'notaFiscalEmitida') return
    setEditingCell({ id: a.id, field })
    // Data Pag. exibe data do mês (dataPagamento); ao editar usamos ela como valor inicial
    const rawField = field === 'paymentStatus' ? 'status' : field
    const v = rawField === 'dataUltimoPagamento' ? (a.dataPagamento || a.dataUltimoPagamento) : (a as unknown as Record<string, unknown>)[rawField]
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

  const formatCNPJ = (cnpj: string | null | undefined): string => {
    if (!cnpj) return ''
    const d = cnpj.replace(/\D/g, '')
    if (d.length !== 14) return cnpj
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  }

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
      dataUltimoPagamento: (a.dataPagamento || a.dataUltimoPagamento) ? (a.dataPagamento || a.dataUltimoPagamento)!.slice(0, 10) : '',
      diaPagamento: a.diaPagamento != null ? String(a.diaPagamento) : '',
      faturamentoTipo: (a.faturamentoTipo === 'EMPRESA' ? 'EMPRESA' : 'ALUNO') as 'ALUNO' | 'EMPRESA',
      faturamentoRazaoSocial: a.faturamentoRazaoSocial ?? '',
      faturamentoCnpj: a.faturamentoCnpj ? formatCNPJ(a.faturamentoCnpj) : '',
      faturamentoEmail: a.faturamentoEmail ?? '',
      faturamentoEndereco: a.faturamentoEndereco ?? '',
      faturamentoDescricaoNfse: a.faturamentoDescricaoNfse ?? '',
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
          // paymentStatus não é mais editado por este modal; é controlado pelos botões da tabela/mês.
          metodoPagamento: form.metodoPagamento.trim() || null,
          banco: form.banco.trim() || null,
          periodoPagamento: form.periodoPagamento || null,
          valorMensal: form.valorMensal !== '' ? Number(form.valorMensal) : null,
          // dataUltimoPagamento também é preenchida automaticamente quando marca como pago; não precisa editar aqui.
          dueDay: form.diaPagamento ? Math.min(31, Math.max(1, parseInt(form.diaPagamento, 10))) : null,
          faturamentoTipo: form.faturamentoTipo,
          faturamentoRazaoSocial: form.faturamentoTipo === 'EMPRESA' ? form.faturamentoRazaoSocial.trim() || null : null,
          faturamentoCnpj: form.faturamentoTipo === 'EMPRESA' ? form.faturamentoCnpj.replace(/\D/g, '') || null : null,
          faturamentoEmail: form.faturamentoTipo === 'EMPRESA' ? form.faturamentoEmail.trim() || null : null,
          faturamentoEndereco: form.faturamentoTipo === 'EMPRESA' ? form.faturamentoEndereco.trim() || null : null,
          faturamentoDescricaoNfse: form.faturamentoTipo === 'EMPRESA' ? form.faturamentoDescricaoNfse.trim() || null : null,
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
    () => alunos.filter((a) => getEffectiveStatus(a, new Date(), selectedAno, selectedMes) === 'ATRASADO' && a.email?.trim()),
    [alunos, selectedAno, selectedMes]
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
      if (a.bolsista) {
        setToast({ message: 'Bolsista: não é possível gerar boleto ou cobrança.', type: 'error' })
        return
      }
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

  const handleEmitirNf = useCallback(
    async (a: AlunoFinanceiro) => {
      if (a.bolsista) {
        setToast({ message: 'Bolsista: nota fiscal não se aplica.', type: 'error' })
        return
      }
      setEmitirNfLoading(a.id)
      try {
        const res = await fetch('/api/admin/nfse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ enrollmentId: a.id, year: selectedAno, month: selectedMes }),
        })
        const json = await res.json()
        if (!res.ok || !json.ok) {
          setToast({ message: json.message || json.error || 'Erro ao emitir NF', type: 'error' })
          return
        }
        setToast({ message: 'Nota fiscal emitida com sucesso', type: 'success' })
        fetchAlunos(selectedAno, selectedMes)
      } catch {
        setToast({ message: 'Erro ao emitir NF', type: 'error' })
      } finally {
        setEmitirNfLoading(null)
      }
    },
    [selectedAno, selectedMes, fetchAlunos]
  )

  const handleCancelarAgendamento = useCallback(
    async (a: AlunoFinanceiro) => {
      if (!a.nfAgendada) return
      setCancelarAgendamentoLoading(a.id)
      try {
        const url = `/api/admin/financeiro/nfse-agendamento?enrollmentId=${encodeURIComponent(a.id)}&year=${selectedAno}&month=${selectedMes}`
        const res = await fetch(url, { method: 'DELETE', credentials: 'include' })
        const json = await res.json()
        if (!res.ok || !json.ok) {
          setToast({ message: json.message || 'Erro ao cancelar agendamento', type: 'error' })
          return
        }
        setToast({ message: 'Agendamento cancelado. O e-mail não será enviado na data combinada.', type: 'success' })
        fetchAlunos(selectedAno, selectedMes)
      } catch {
        setToast({ message: 'Erro ao cancelar agendamento', type: 'error' })
      } finally {
        setCancelarAgendamentoLoading(null)
      }
    },
    [selectedAno, selectedMes, fetchAlunos]
  )

  const openCancelarNfModal = useCallback((a: AlunoFinanceiro) => {
    if (a.nfseFocusRef && a.nfseStatus === 'autorizado') {
      setCancelarNfModal(a)
      setCancelarNfJustificativa('')
    }
  }, [])

  const handleConfirmCancelarNf = useCallback(async () => {
    const a = cancelarNfModal
    const ref = a?.nfseFocusRef
    if (!ref || !a) return
    const justificativa = cancelarNfJustificativa.trim()
    if (justificativa.length < 15) {
      setToast({ message: 'Justificativa deve ter no mínimo 15 caracteres (exigência da prefeitura).', type: 'error' })
      return
    }
    setCancelarNfLoading(a.id)
    try {
      const res = await fetch(`/api/admin/nfse/${encodeURIComponent(ref)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ justificativa }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || json.error || 'Erro ao cancelar NF', type: 'error' })
        return
      }
      setToast({ message: 'Nota fiscal cancelada', type: 'success' })
      setCancelarNfModal(null)
      setCancelarNfJustificativa('')
      fetchAlunos(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao cancelar NF', type: 'error' })
    } finally {
      setCancelarNfLoading(null)
    }
  }, [cancelarNfModal, cancelarNfJustificativa, fetchAlunos, selectedAno, selectedMes])

  const handleCancelarNf = useCallback((a: AlunoFinanceiro) => openCancelarNfModal(a), [openCancelarNfModal])

  const handleEmitirNfTodos = useCallback(async () => {
    setEmitirNfTodosLoading(true)
    try {
      const res = await fetch('/api/admin/nfse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ year: selectedAno, month: selectedMes }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || json.error || 'Erro ao emitir notas fiscais', type: 'error' })
        return
      }
      const emitidas = json.emitidas ?? 0
      const erros = json.erros ?? 0
      if (emitidas > 0 || erros > 0) {
        setToast({
          message: emitidas > 0
            ? `${emitidas} nota(s) emitida(s).${erros > 0 ? ` ${erros} erro(s).` : ''}`
            : `${erros} erro(s) ao emitir.`,
          type: erros > 0 && emitidas === 0 ? 'error' : 'success',
        })
      } else {
        setToast({ message: 'Nenhum aluno pago sem NF no mês selecionado.', type: 'success' })
      }
      fetchAlunos(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao emitir notas fiscais', type: 'error' })
    } finally {
      setEmitirNfTodosLoading(false)
    }
  }, [selectedAno, selectedMes, fetchAlunos])

  const countPagosSemNf = useMemo(() => {
    return alunos.filter(
      (a) =>
        !a.bolsista &&
        a.status === 'PAGO' &&
        !a.notaFiscalEmitida &&
        a.nfseStatus !== 'processando_autorizacao'
    ).length
  }, [alunos])

  const handleBoletosELembretes = useCallback(async () => {
    setBoletosLembretesLoading(true)
    try {
      const res = await fetch('/api/admin/financeiro/boletos-e-lembretes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ year: selectedAno, month: selectedMes }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao enviar boletos e lembretes', type: 'error' })
        return
      }
      const boletos = json.boletosGerados ?? 0
      const emails = json.emailsEnviados ?? 0
      const errosB = json.boletosErros ?? 0
      const errosE = json.emailsErros ?? 0
      const boletoErrors: { name: string; error: string }[] = Array.isArray(json.errors) ? json.errors : []
      const emailErrors: { name: string; error: string }[] = Array.isArray(json.emailErrors) ? json.emailErrors : []

      if (boletoErrors.length > 0 || emailErrors.length > 0) {
        // Logar detalhes completos no console para depuração
        console.error('[Financeiro/Alunos] Erros ao gerar boletos/lembretes:', {
          boletoErrors,
          emailErrors,
        })
      }

      const parts: string[] = []
      if (boletos > 0) parts.push(`${boletos} boleto(s) gerado(s)`)
      if (emails > 0) parts.push(`${emails} e-mail(s) de lembrete enviado(s)`)
      if (errosB > 0) parts.push(`${errosB} erro(s) ao gerar boleto`)
      if (errosE > 0) parts.push(`${errosE} erro(s) ao enviar e-mail`)

      // Adicionar um detalhe do primeiro erro para ajudar a identificar o problema rapidamente
      const firstError = boletoErrors[0] ?? emailErrors[0]
      if (firstError) {
        parts.push(`Exemplo de erro: ${firstError.name} - ${firstError.error}`)
      }

      setToast({
        message: parts.length ? parts.join('. ') : 'Concluído (alunos com método cartão foram excluídos).',
        type: errosB > 0 || errosE > 0 ? 'error' : 'success',
      })
      fetchAlunos(selectedAno, selectedMes)
      fetchCobrancas(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao enviar boletos e lembretes', type: 'error' })
    } finally {
      setBoletosLembretesLoading(false)
    }
  }, [selectedAno, selectedMes, fetchAlunos, fetchCobrancas])

  const handleProcessarAgendamentosNf = useCallback(async () => {
    setProcessarAgendamentosLoading(true)
    try {
      const res = await fetch('/api/cron/nfse-scheduled', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao processar agendamentos', type: 'error' })
        return
      }
      const n = json.processed ?? 0
      const err = json.errors ?? 0
      if (n > 0) {
        setToast({ message: `${n} agendamento(s) processado(s): NF emitida e e-mail enviado.`, type: 'success' })
        fetchAlunos(selectedAno, selectedMes)
        fetchCobrancas(selectedAno, selectedMes)
      } else if (err > 0 && json.errorDetails?.length) {
        setToast({ message: `Nenhum processado. Erro: ${json.errorDetails[0].error}`, type: 'error' })
      } else {
        setToast({ message: 'Nenhum agendamento com data/hora vencida no momento.', type: 'info' })
      }
    } catch {
      setToast({ message: 'Erro ao processar agendamentos de NF', type: 'error' })
    } finally {
      setProcessarAgendamentosLoading(false)
    }
  }, [selectedAno, selectedMes, fetchAlunos, fetchCobrancas])

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Cabeçalho */}
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Financeiro – Alunos</h1>
          <p className="text-gray-600 mt-1 text-sm md:text-base">
            Gestão financeira por aluno: valor mensal, status de pagamento, datas e envio de cobrança.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            <Link
              href="/admin/financeiro/cobrancas"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 font-medium text-sm transition-colors"
            >
              <Receipt className="w-4 h-4" />
              Cobranças
            </Link>
            <Link
              href="/admin/financeiro/nfse"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 font-medium text-sm transition-colors"
            >
              <FileText className="w-4 h-4" />
              Notas Fiscais
            </Link>
            <Link
              href="/admin/financeiro/notificacoes"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 font-medium text-sm transition-colors"
            >
              <Bell className="w-4 h-4" />
              Notificações
            </Link>
          </div>
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
        {!fullTableView && (
        <section>
          <h2 className="text-base font-semibold text-gray-800 mb-3">Resumo do mês</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3">
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
              onClick={() => setCubeModal('atrasadoCancelar')}
              onKeyDown={(e) => e.key === 'Enter' && setCubeModal('atrasadoCancelar')}
              className="rounded-xl border-2 border-rose-300 bg-rose-50 p-4 shadow-sm cursor-pointer hover:bg-rose-100 transition-colors"
            >
              <p className="text-xs font-semibold text-rose-800 uppercase tracking-wide">Atrasados – cancelar curso</p>
              <p className="mt-1 text-xl font-bold text-rose-900">{alunosAtrasado.length}</p>
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
            <div
              role="button"
              tabIndex={0}
              onClick={() => setCubeModal('removidos')}
              onKeyDown={(e) => e.key === 'Enter' && setCubeModal('removidos')}
              className="rounded-xl border-2 border-slate-300 bg-slate-50 p-4 shadow-sm cursor-pointer hover:bg-slate-100 transition-colors"
            >
              <p className="text-xs font-semibold text-slate-800 uppercase tracking-wide">Alunos removidos deste mês</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{alunosRemovidosMes.length}</p>
            </div>
          </div>
        </section>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
          </div>
        ) : (
          <>
            {/* Seção: Buscar e filtros (recolhível) */}
            {!fullTableView && (
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
                  </div>
                  <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-gray-100">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Status</label>
                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="input w-full sm:min-w-[120px] text-sm py-2"
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
                        className="input w-full sm:min-w-[120px] text-sm py-2"
                      >
                        <option value="">Todos</option>
                        {PERIODO_OPCOES.filter((o) => o.value).map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Quem paga</label>
                      <select
                        value={filterQuemPaga}
                        onChange={(e) => setFilterQuemPaga(e.target.value)}
                        className="input w-full sm:min-w-[130px] text-sm py-2"
                      >
                        <option value="">Todos</option>
                        <option value="ALUNO">Aluno</option>
                        <option value="RESPONSAVEL">Responsável</option>
                        <option value="EMPRESA">Empresa</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Status NF</label>
                      <select
                        value={filterNfEmitida}
                        onChange={(e) => setFilterNfEmitida(e.target.value)}
                        className="input w-full sm:min-w-[120px] text-sm py-2"
                      >
                        <option value="">Todos</option>
                        <option value="aberto">Em aberto</option>
                        <option value="emitida">Emitida</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Info de pagamento</label>
                      <select
                        value={filterInfoPagamento}
                        onChange={(e) => setFilterInfoPagamento(e.target.value)}
                        className="input w-full sm:min-w-[150px] text-sm py-2"
                      >
                        <option value="">Todos</option>
                        <option value="comUltimoPag">Com data de último pag.</option>
                        <option value="semUltimoPag">Sem data de último pag.</option>
                        <option value="semValorMensal">Sem valor mensal</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Escola</label>
                      <select
                        value={filterEscola}
                        onChange={(e) => setFilterEscola(e.target.value)}
                        className="input w-full sm:min-w-[120px] text-sm py-2"
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
            )}

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
                    As informações de pagamento (Status, NF emitida?) são <strong>independentes por mês</strong>; a única que acompanha o aluno é <strong>Data Pag.</strong> Os números e a tabela refletem {MESES_LABELS[selectedMes]}/{selectedAno}. Alunos ativos aparecem em todos os meses; inativos somem a partir do mês em que foram marcados como inativos.
                  </p>
                  <p className="mt-2">
                    <strong>Edição rápida:</strong> clique duas vezes em uma célula para editar (Quem paga, Valor mensal, Status, Método pag., Banco, Período, datas, NF).
                  </p>
                </div>
              )}
            </div>

            {/* Seção: Lista de alunos */}
            <section className={`bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden ${fullTableView ? 'mt-2 h-[calc(100vh-220px)] flex flex-col' : ''}`}>
              <div className="px-5 py-4 border-b border-gray-200 flex flex-wrap items-center gap-3">
                <h2 className="text-base font-semibold text-gray-800 mr-2">Lista de alunos</h2>
                <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      ref={selectAllCheckboxRef}
                      type="checkbox"
                      checked={allSelected}
                      onChange={selectAll}
                      className="rounded border-gray-300 text-brand-orange focus:ring-orange-500"
                    />
                    <span className="text-xs font-medium text-gray-700">Selecionar todos</span>
                  </label>
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {selectedIds.size} selecionado(s)
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={bulkMarkPaid}
                      disabled={selectedIds.size === 0 || saving}
                      className="rounded-lg bg-green-50 border border-green-200 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                    >
                      Marcar selecionados como pagos
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmBulkUnpay(true)}
                      disabled={selectedIds.size === 0 || saving}
                      className="rounded-lg bg-red-50 border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      Remover alunos deste mês de pagamento
                    </button>
                  </div>
                </div>
                <div className="h-6 w-px bg-gray-200 shrink-0" aria-hidden />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleBoletosELembretes}
                    disabled={boletosLembretesLoading}
                    title="Gerar boleto/PIX na Cora para todos os alunos do mês (exceto método cartão) e enviar e-mail de lembrete. Quem já pagou deve desconsiderar o e-mail."
                  >
                    {boletosLembretesLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                    Enviar boletos e emails de lembrete
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleEmitirNfTodos}
                    disabled={emitirNfTodosLoading || countPagosSemNf === 0}
                    title="Emitir notas fiscais para todos os alunos pagos neste mês que ainda não têm NF"
                  >
                    {emitirNfTodosLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FilePlus className="w-4 h-4 mr-2" />}
                    Emitir NF para todos pagos sem NF
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleProcessarAgendamentosNf}
                    disabled={processarAgendamentosLoading}
                    title="Executar agora os agendamentos de NF cuja data/hora já passou (emitir NF e enviar e-mail)"
                  >
                    {processarAgendamentosLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Clock className="w-4 h-4 mr-2" />}
                    Processar agendamentos de NF
                  </Button>
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
                </div>
                <div className="flex flex-wrap items-center gap-2 ml-auto">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500">Itens por página</label>
                    <select
                      value={itemsPerPage}
                      onChange={(e) => setItemsPerPage(Number(e.target.value))}
                      className="input min-w-[72px] text-sm py-1.5"
                    >
                      <option value={7}>7</option>
                      <option value={30}>30</option>
                      <option value={500}>500</option>
                    </select>
                  </div>
                  <div className="relative">
                  <button
                    ref={columnsTriggerRef}
                    type="button"
                    onClick={() => setColumnsDropdownOpen((v) => !v)}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Columns className="w-4 h-4" />
                    Colunas
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  {columnsDropdownOpen && columnsDropdownStyle && typeof document !== 'undefined' && createPortal(
                    <div
                      ref={columnsDropdownRef}
                      className="fixed z-[100] min-w-[200px] w-[200px] rounded-lg border border-gray-200 bg-white py-2 shadow-xl overflow-hidden"
                      style={{ top: columnsDropdownStyle.top, left: columnsDropdownStyle.left, maxHeight: columnsDropdownStyle.maxHeight }}
                    >
                      <div className="overflow-y-auto h-full" style={{ maxHeight: columnsDropdownStyle.maxHeight }}>
                        <p className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase sticky top-0 bg-white">Exibir colunas</p>
                        {FINANCE_COLUMNS.filter((c) => !c.fixed).map((col) => (
                          <label key={col.key} className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-gray-50">
                            <input type="checkbox" checked={visibleSet.has(col.key)} onChange={() => toggleFinanceColumn(col.key)} className="rounded border-gray-300" />
                            <span className="text-sm text-gray-800">{col.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>,
                    document.body
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
                        if (col.key === 'ultimoPag') return formatDate(a.dataPagamento)
                        if (col.key === 'diaVenc') return a.diaPagamento != null ? String(a.diaPagamento) : ''
                        if (col.key === 'ultimaCobranca') return formatDate(a.dataUltimaCobranca)
                        if (col.key === 'nfEmitida') return a.bolsista ? 'Isento (bolsista)' : a.nfseStatus === 'processando_autorizacao' ? 'Em processamento' : a.nfseStatus === 'erro_autorizacao' ? 'Erro' : a.nfseStatus === 'cancelado' ? 'Cancelado' : a.notaFiscalEmitida === true ? 'Emitida' : a.nfseEmailEnviado ? 'E-mail enviado' : a.nfAgendada ? 'Agendada' : 'Em aberto'
                        if (col.key === 'acoesNf') return ''
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFullTableView((v) => !v)}
                    title={fullTableView ? 'Sair da visualização em tela cheia' : 'Visualizar tabela em tela cheia'}
                  >
                    {fullTableView ? (
                      <>
                        <Minimize2 className="w-4 h-4 mr-2" />
                        Sair da janela cheia
                      </>
                    ) : (
                      <>
                        <Maximize2 className="w-4 h-4 mr-2" />
                        Visualizar em janela cheia
                      </>
                    )}
                  </Button>
                {filteredAlunos.length > itemsPerPage && (
                  <span className="text-sm text-gray-500 ml-auto">
                    Mostrando {displayedAlunos.length} de {filteredAlunos.length} alunos
                  </span>
                )}
                </div>
              </div>
              <div
                className={`overflow-x-auto px-5 pb-5 [scrollbar-width:thin] ${
                  fullTableView ? 'flex-1 min-h-0 overflow-y-auto' : 'max-h-[calc(7*6.25rem)] overflow-y-auto'
                }`}
              >
            <table className="w-full min-w-[1400px]">
              <thead className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_0_rgb(229_231_235)]">
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                    {/* coluna de seleção */}
                  </th>
                  {displayColumns.map((col) => {
                    const baseClass =
                      col.key === 'valorMensal' || col.key === 'valorHora'
                        ? 'px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase'
                        : col.key === 'nfEmitida'
                          ? 'px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase'
                          : col.key === 'acoes'
                            ? 'px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase'
                            : 'px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase'
                    const isSortableNome = col.key === 'aluno'
                    const isSortableDiaVenc = col.key === 'diaVenc'
                    const showSort =
                      (isSortableNome && sortKey === 'nome') ||
                      (isSortableDiaVenc && sortKey === 'diaVenc')
                    const arrow =
                      !showSort ? '' : sortDir === 'asc' ? '↑' : '↓'
                    return (
                      <th key={col.key} className={baseClass}>
                        {isSortableNome || isSortableDiaVenc ? (
                          <button
                            type="button"
                            onClick={() => handleSort(isSortableNome ? 'nome' : 'diaVenc')}
                            className="inline-flex items-center gap-1"
                          >
                            <span>{col.label}</span>
                            {showSort && <span>{arrow}</span>}
                          </button>
                        ) : (
                          col.label
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayedAlunos.map((a) => {
                  const effective = getEffectiveStatus(a, refDateForStatus, selectedAno, selectedMes)
                  const isAtrasado = effective === 'ATRASADO'
                  const hasCpfProblem =
                    !!validacaoData?.alunos.some(
                      (aluno) =>
                        aluno.enrollmentId === a.id &&
                        aluno.problemas.some((p) => p.includes('CPF'))
                    )
                  const isEmpresa = a.faturamentoTipo === 'EMPRESA'
                  const cobranca = cobrancasMap.get(a.id) ?? null
                  const display = isAtrasado
                    ? { type: 'atrasado' as const, label: 'Atrasado', variant: 'danger' as const }
                    : getCobrancaStatusDisplay(a.status, cobranca, { bolsista: a.bolsista })
                  const isEditing = (id: string, field: string) => editingCell?.id === id && editingCell?.field === field

                  const baseTextClass = isAtrasado
                    ? 'bg-red-50 text-red-900'
                    : hasCpfProblem || isEmpresa
                      ? 'bg-violet-50 text-violet-900'
                      : 'text-gray-900'

                  const rowClass = isAtrasado
                    ? 'bg-red-50 hover:bg-red-100'
                    : a.bolsista
                      ? 'bg-emerald-50/60 hover:bg-emerald-50'
                      : hasCpfProblem || isEmpresa
                        ? 'bg-violet-50 hover:bg-violet-100'
                        : 'hover:bg-gray-50'

                  const EdCell = (field: string, children: React.ReactNode, inputNode?: React.ReactNode) => (
                    <td
                      className={`px-3 py-1 text-sm ${baseTextClass}`}
                      onDoubleClick={() => !editingCell && startEditCell(a, field)}
                    >
                      {isEditing(a.id, field) && inputNode ? inputNode : children}
                    </td>
                  )
                  const baseTd = `px-3 py-1 text-sm ${baseTextClass}`
                  return (
                    <tr key={a.id} className={rowClass}>
                      <td className={baseTd}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(a.id)}
                          onChange={() => toggleSelect(a.id)}
                          className="rounded border-gray-300 text-brand-orange focus:ring-orange-500"
                        />
                      </td>
                      {displayColumns.some((c) => c.key === 'diaVenc') && EdCell('diaPagamento', a.diaPagamento != null ? String(a.diaPagamento) : '—', (
                        <input
                          type="number"
                          min={1}
                          max={31}
                          className="input w-full py-1 text-sm"
                          value={cellValue === '—' ? '' : String(cellValue)}
                          onChange={(e) => setCellValue(e.target.value)}
                          onBlur={saveCell}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveCell(); if (e.key === 'Escape') setEditingCell(null) }}
                          autoFocus
                        />
                      ))}
                      {displayColumns.some((c) => c.key === 'aluno') && (
                        <td className={`px-3 py-2 text-sm ${baseTd}`}>
                          <CellWithCopy value={a.nome ?? ''} onCopy={handleCopy} />
                        </td>
                      )}
                      {displayColumns.some((c) => c.key === 'cpf') && (
                        <td className={`px-3 py-2 text-sm max-w-[140px] ${baseTd}`}>
                          <CellWithCopy value={a.cpf ?? ''} onCopy={handleCopy} truncate />
                        </td>
                      )}
                      {displayColumns.some((c) => c.key === 'endereco') && (
                        <td className={`px-3 py-2 text-sm max-w-[220px] ${baseTd}`}>
                          <CellWithCopy value={a.endereco ?? ''} onCopy={handleCopy} truncate />
                        </td>
                      )}
                      {displayColumns.some((c) => c.key === 'tipoAula') && <td className="px-3 py-2 text-sm text-gray-600">{a.tipoAula === 'GRUPO' ? 'Grupo' : a.tipoAula === 'PARTICULAR' ? 'Particular' : a.tipoAula ?? '—'}</td>}
                      {displayColumns.some((c) => c.key === 'nomeGrupo') && <td className="px-3 py-2 text-sm text-gray-600">{a.nomeGrupo ?? '—'}</td>}
                      {displayColumns.some((c) => c.key === 'responsavel') && <td className="px-3 py-2 text-sm text-gray-600">{a.nomeResponsavel ?? '—'}</td>}
                      {displayColumns.some((c) => c.key === 'quemPaga') && (
                        <td className={baseTd}>
                          {getQuemPagaLabel(a)}
                        </td>
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
                      <td className={`px-3 py-1 text-sm ${baseTextClass}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          {(() => {
                            const badgeClasses = `inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${BADGE_CLASSES[display.variant]}`
                            const hasCobrancaDetails = cobranca?.coraInvoiceId
                            const isPopoverOpen = cobrancaPopoverOpen === a.id
                            const label = display.label
                            return (
                              <div ref={hasCobrancaDetails && isPopoverOpen ? cobrancaPopoverRef : undefined} className="relative inline-flex">
                                <button
                                  type="button"
                                  onClick={() => hasCobrancaDetails && setCobrancaPopoverOpen(isPopoverOpen ? null : a.id)}
                                  className={`${badgeClasses} ${hasCobrancaDetails ? 'cursor-pointer hover:opacity-90' : 'cursor-default'}`}
                                  title={hasCobrancaDetails ? 'Clique para ver detalhes da cobrança' : isAtrasado ? 'Atrasado automaticamente (vencimento passou). Marque Pago para registrar.' : undefined}
                                >
                                  {label}
                                  {hasCobrancaDetails && <CircleChevronDown className="w-3.5 h-3.5 opacity-70" />}
                                </button>
                                {hasCobrancaDetails && isPopoverOpen && cobranca && (
                                  <div className="absolute left-0 top-full z-30 mt-1 min-w-[260px] rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
                                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Detalhes da cobrança Cora</p>
                                    <div className="space-y-2 text-sm">
                                      <p><span className="text-gray-500">Status:</span> <span className="font-medium">{label}</span></p>
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
                          <label
                            className={`flex items-center gap-1.5 whitespace-nowrap ${a.bolsista ? 'cursor-default opacity-90' : 'cursor-pointer'}`}
                            title={
                              a.bolsista
                                ? 'Bolsista: considerado pago automaticamente (sem cobrança).'
                                : 'Marque quando o pagamento for realizado'
                            }
                          >
                            <input
                              type="checkbox"
                              checked={a.status === 'PAGO' || !!a.bolsista}
                              disabled={saving || !!a.bolsista}
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
                      {displayColumns.some((c) => c.key === 'ultimoPag') && EdCell('dataUltimoPagamento', formatDate(a.dataPagamento), (
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
                      {displayColumns.some((c) => c.key === 'ultimaCobranca') && EdCell('dataUltimaCobranca', formatDate(a.dataUltimaCobranca), (
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
                        {a.bolsista ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700" title="Bolsa integral — não há nota fiscal">
                            Isento (bolsista)
                          </span>
                        ) : emitirNfLoading === a.id ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Em processamento
                          </span>
                        ) : a.nfseStatus === 'processando_autorizacao' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            <Clock className="w-3.5 h-3.5" />
                            Em processamento
                          </span>
                        ) : a.nfseStatus === 'erro_autorizacao' ? (
                          <button
                            type="button"
                            onClick={() => setNfErrorModal({ nome: a.nome, message: a.nfseErrorMessage || 'Erro na emissão da nota fiscal.' })}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 hover:bg-red-200 cursor-pointer"
                            title="Clique para ver o motivo do erro"
                          >
                            <AlertCircle className="w-3.5 h-3.5" />
                            Erro
                          </button>
                        ) : a.nfseStatus === 'cancelado' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-700">
                            <XCircle className="w-3.5 h-3.5" />
                            Cancelado
                          </span>
                        ) : a.notaFiscalEmitida === true ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Emitida
                          </span>
                        ) : a.nfseEmailEnviado ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                            <Mail className="w-3.5 h-3.5" />
                            E-mail enviado
                          </span>
                        ) : a.nfAgendada ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            <Calendar className="w-3.5 h-3.5" />
                            Agendada
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                            Em aberto
                          </span>
                        )}
                      </td>
                      )}
                      {displayColumns.some((c) => c.key === 'acoesNf') && (
                      <td className="px-3 py-2 text-sm whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {a.bolsista ? (
                            <span className="text-xs text-slate-400 px-1" title="Bolsista: emissão e agendamento de NF não se aplicam">
                              —
                            </span>
                          ) : (
                            <>
                              {a.nfseStatus === 'autorizado' && a.nfsePdfUrl ? (
                                <button
                                  type="button"
                                  onClick={() => window.open(a.nfsePdfUrl || '', '_blank', 'noopener,noreferrer')}
                                  className="p-1.5 rounded text-gray-500 hover:text-indigo-600"
                                  title="Baixar NF (PDF)"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleEmitirNf(a)}
                                  disabled={!!emitirNfLoading || emitirNfLoading === a.id}
                                  className={`p-1.5 rounded ${emitirNfLoading === a.id ? 'text-red-600 bg-red-50' : 'text-gray-500 hover:text-green-600'}`}
                                  title="Emitir NF"
                                >
                                  {emitirNfLoading === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <FilePlus className="w-4 h-4" />}
                                </button>
                              )}
                              {a.nfseFocusRef && a.nfseStatus === 'autorizado' && (
                                <button
                                  type="button"
                                  onClick={() => handleCancelarNf(a)}
                                  disabled={!!cancelarNfLoading || cancelarNfLoading === a.id}
                                  className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-50 rounded"
                                  title="Cancelar NF"
                                >
                                  {cancelarNfLoading === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                                </button>
                              )}
                              {a.nfAgendada && !a.nfseEmailEnviado && (
                                <button
                                  type="button"
                                  onClick={() => handleCancelarAgendamento(a)}
                                  disabled={!!cancelarAgendamentoLoading || cancelarAgendamentoLoading === a.id}
                                  className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-50 rounded inline-flex"
                                  title="Cancelar agendamento (e-mail não será enviado na data)"
                                >
                                  {cancelarAgendamentoLoading === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarX className="w-4 h-4" />}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => !a.nfseEmailEnviado && openAgendarNfModal(a)}
                                disabled={!!a.nfseEmailEnviado}
                                className={`p-1.5 rounded inline-flex ${
                                  a.nfseEmailEnviado
                                    ? 'text-gray-400 cursor-not-allowed'
                                    : a.nfAgendada
                                      ? 'text-green-600 hover:text-green-700 hover:bg-green-50'
                                      : 'text-gray-500 hover:text-brand-orange'
                                }`}
                                title={
                                  a.nfseEmailEnviado
                                    ? 'E-mail já enviado neste mês. Não é possível agendar outro envio.'
                                    : a.nfAgendada
                                      ? 'Envio de NF já agendado (clique para revisar/editar)'
                                      : 'Agendar envio de e-mail da NF'
                                }
                              >
                                {a.nfseEmailEnviado ? <Mail className="w-4 h-4" /> : a.nfAgendada ? <CheckCircle2 className="w-4 h-4" /> : <Calendar className="w-4 h-4" />}
                              </button>
                            </>
                          )}
                        </div>
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
                        {(() => {
                          const cobranca = cobrancasMap.get(a.id) ?? null
                          const hasBoleto = !!cobranca?.boletoUrl
                          const isLoading = gerarCobrancaIndividualLoading === a.id && !hasBoleto
                          const handleClick = () => {
                            if (a.bolsista) return
                            if (hasBoleto && cobranca?.boletoUrl) {
                              window.open(cobranca.boletoUrl, '_blank', 'noopener,noreferrer')
                            } else {
                              void handleGerarCobrancaIndividual(a)
                            }
                          }
                          return (
                            <button
                              type="button"
                              onClick={handleClick}
                              disabled={isLoading || !!a.bolsista}
                              className="ml-1 text-gray-500 hover:text-brand-orange p-1 disabled:opacity-50"
                              title={
                                a.bolsista
                                  ? 'Bolsista: sem cobrança/boleto'
                                  : hasBoleto
                                    ? 'Abrir boleto já gerado'
                                    : 'Gerar boleto/PIX na Cora'
                              }
                            >
                              {isLoading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : hasBoleto ? (
                                <Download className="w-4 h-4" />
                              ) : (
                                <Receipt className="w-4 h-4" />
                              )}
                            </button>
                          )
                        })()}
                        <button
                          type="button"
                          onClick={() => openCobrancaModal(a.id, a.nome)}
                          disabled={!a.email || loadingCobrancaForId === a.id || !!a.bolsista}
                          className="ml-1 text-gray-600 hover:text-green-600 p-1 disabled:opacity-50"
                          title={a.bolsista ? 'Bolsista: não enviar cobrança' : 'Enviar cobrança por e-mail'}
                        >
                          {loadingCobrancaForId === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeFromMonth(a)}
                          disabled={removingFromMonthId === a.id}
                          className="ml-1 text-gray-500 hover:text-red-600 p-1 disabled:opacity-50"
                          title="Remover deste mês (não vamos receber dele neste mês; não altera o status na página Alunos)"
                        >
                          {removingFromMonthId === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
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

        {/* Modal: confirmar marcar como pago (gera NF e envia e-mail ao aluno) */}
        <Modal
          isOpen={!!confirmMarkPaid}
          onClose={() => !saving && setConfirmMarkPaid(null)}
          title="Confirmar pagamento"
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmMarkPaid(null)} disabled={!!saving}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={async () => {
                  if (confirmMarkPaid) {
                    await applyPagoStatus(confirmMarkPaid, true)
                    setConfirmMarkPaid(null)
                  }
                }}
                disabled={!!saving}
              >
                {saving ? 'Salvando...' : 'Sim, confirmar pagamento'}
              </Button>
            </>
          }
        >
          {confirmMarkPaid && (
            <div className="space-y-3">
              <p className="text-sm text-gray-700">
                Ao marcar como pago, <strong>será gerada a Nota Fiscal (NF)</strong> e enviada ao aluno a{' '}
                <strong>confirmação de pagamento e a NF</strong> por e-mail.
              </p>
              <p className="text-sm text-gray-700">
                Tem certeza que deseja confirmar o pagamento de{' '}
                <span className="font-semibold text-gray-900">{confirmMarkPaid.nome}</span>?
              </p>
              <p className="text-xs text-gray-500">
                O boleto em aberto na Cora (se existir) será cancelado automaticamente.
              </p>
            </div>
          )}
        </Modal>

        <Modal
          isOpen={!!confirmUnpay}
          onClose={() => setConfirmUnpay(null)}
          title="Desmarcar como Pago"
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmUnpay(null)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={async () => {
                  if (confirmUnpay) {
                    await applyPagoStatus(confirmUnpay, false)
                    setConfirmUnpay(null)
                  }
                }}
                disabled={saving}
              >
                {saving ? 'Salvando...' : 'Sim, desmarcar'}
              </Button>
            </>
          }
        >
          {confirmUnpay && (
            <div className="space-y-3">
              <p className="text-sm text-gray-700">
                Tem certeza que deseja <span className="font-semibold text-red-600">desmarcar como pago</span> o aluno{' '}
                <span className="font-semibold">{confirmUnpay.nome}</span> neste mês?
              </p>
              <p className="text-xs text-gray-500">
                Isso vai alterar o status para <strong>Pendente</strong> e remover a data do último pagamento.
              </p>
            </div>
          )}
        </Modal>

        <Modal
          isOpen={confirmBulkUnpay}
          onClose={() => setConfirmBulkUnpay(false)}
          title="Remover alunos deste mês de pagamento"
          size="md"
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmBulkUnpay(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={() => void bulkMarkPending()}
                disabled={saving || selectedIds.size === 0}
              >
                {saving ? 'Salvando...' : 'Sim, remover deste mês'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              Tem certeza que deseja <span className="font-semibold text-red-600">remover deste mês</span> os{' '}
              <span className="font-semibold">{selectedIds.size}</span> aluno(s) selecionado(s)? Eles não aparecerão mais neste mês do financeiro de alunos.
            </p>
            <p className="text-xs text-gray-500">
              Opcionalmente, informe um motivo para cada aluno (será salvo como observação financeira). Pode deixar em branco.
            </p>
            <div className="max-h-64 overflow-y-auto space-y-2 border-t border-gray-200 pt-3">
              {alunos.filter((a) => selectedIds.has(a.id)).map((a) => (
                <div key={a.id} className="space-y-1">
                  <div className="text-sm font-medium text-gray-800">{a.nome}</div>
                  <input
                    type="text"
                    value={bulkReasons[a.id] ?? ''}
                    onChange={(e) =>
                      setBulkReasons((prev) => ({
                        ...prev,
                        [a.id]: e.target.value,
                      }))
                    }
                    className="input w-full text-sm"
                    placeholder="Motivo (opcional)…"
                  />
                </div>
              ))}
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={!!removeFromMonthAluno}
          onClose={() => setRemoveFromMonthAluno(null)}
          title="Remover aluno deste mês"
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setRemoveFromMonthAluno(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={() => void confirmRemoveFromMonth()}
                disabled={!!removingFromMonthId}
              >
                {removingFromMonthId ? 'Removendo...' : 'Sim, remover deste mês'}
              </Button>
            </>
          }
        >
          {removeFromMonthAluno && (
            <div className="space-y-4">
              <p className="text-sm text-gray-700">
                Tem certeza que deseja{' '}
                <span className="font-semibold text-red-600">remover deste mês</span> o aluno{' '}
                <span className="font-semibold">{removeFromMonthAluno.nome}</span> de{' '}
                <span className="font-semibold">
                  {selectedMes}/{selectedAno}
                </span>
                ?
              </p>
              <p className="text-xs text-gray-500">
                Ele não aparecerá neste mês no Financeiro de Alunos. O status na página{' '}
                <span className="font-semibold">Alunos</span> não será alterado.
              </p>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-500 uppercase">Motivo (opcional)</label>
                <textarea
                  value={removeFromMonthReason}
                  onChange={(e) => setRemoveFromMonthReason(e.target.value)}
                  className="input w-full min-h-[60px] text-sm"
                  placeholder="Ex.: aluno trancou, bolsa, ajuste de valor, etc."
                />
                <p className="text-[11px] text-gray-400">
                  Quando preenchido, o motivo é salvo em Observações financeiras do aluno.
                </p>
              </div>
            </div>
          )}
        </Modal>

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
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Quem paga</label>
                  <input
                    type="text"
                    value={form.quemPaga}
                    onChange={(e) => setForm({ ...form, quemPaga: e.target.value })}
                    className="input w-full"
                    placeholder="Nome de quem paga"
                  />
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
                  <select
                    value={form.periodoPagamento}
                    onChange={(e) => setForm({ ...form, periodoPagamento: e.target.value })}
                    className="input w-full"
                  >
                    {PERIODO_OPCOES.map((o) => (
                      <option key={o.value || 'x'} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Dia de vencimento (1-31)</label>
                  <input type="number" min={1} max={31} value={form.diaPagamento} onChange={(e) => setForm({ ...form, diaPagamento: e.target.value })} className="input w-full" placeholder="Ex.: 10" />
                </div>
              </div>

              {/* Dados de Faturamento (NFSe) */}
              <div className="border-t border-gray-200 pt-4 mt-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Dados de Faturamento</h3>
                <p className="text-xs text-gray-500 mb-3">Define em nome de quem a nota fiscal será emitida (aluno ou empresa).</p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Faturar para</label>
                    <select
                      value={form.faturamentoTipo}
                      onChange={(e) => setForm({ ...form, faturamentoTipo: e.target.value as 'ALUNO' | 'EMPRESA' })}
                      className="input w-full"
                    >
                      <option value="ALUNO">Aluno</option>
                      <option value="EMPRESA">Empresa</option>
                    </select>
                  </div>
                  {form.faturamentoTipo === 'ALUNO' && (
                    <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">E-mail para envio da NF</p>
                      <p className="text-sm text-gray-900">{selected?.email || '—'}</p>
                      <p className="text-xs text-gray-500 mt-1">A nota fiscal será direcionada a este e-mail (cadastro do aluno).</p>
                    </div>
                  )}
                  {form.faturamentoTipo === 'EMPRESA' && (
                    <>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Razão Social *</label>
                        <input
                          type="text"
                          value={form.faturamentoRazaoSocial}
                          onChange={(e) => setForm({ ...form, faturamentoRazaoSocial: e.target.value })}
                          className="input w-full"
                          placeholder="Razão social da empresa"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">CNPJ *</label>
                        <input
                          type="text"
                          value={form.faturamentoCnpj}
                          onChange={(e) => {
                            const d = e.target.value.replace(/\D/g, '').slice(0, 14)
                            const f = d.length <= 2 ? d : d.length <= 5 ? `${d.slice(0,2)}.${d.slice(2)}` : d.length <= 8 ? `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}` : d.length <= 12 ? `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}` : `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`
                            setForm({ ...form, faturamentoCnpj: f })
                          }}
                          className="input w-full"
                          placeholder="00.000.000/0001-00"
                          maxLength={18}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Email para NF *</label>
                        <input
                          type="email"
                          value={form.faturamentoEmail}
                          onChange={(e) => setForm({ ...form, faturamentoEmail: e.target.value })}
                          className="input w-full"
                          placeholder="email@empresa.com"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Endereço fiscal (opcional)</label>
                        <textarea
                          value={form.faturamentoEndereco}
                          onChange={(e) => setForm({ ...form, faturamentoEndereco: e.target.value })}
                          className="input w-full min-h-[60px]"
                          placeholder="Endereço completo da empresa"
                          rows={2}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Descrição da NF (opcional)</label>
                        <textarea
                          value={form.faturamentoDescricaoNfse}
                          onChange={(e) => setForm({ ...form, faturamentoDescricaoNfse: e.target.value })}
                          className="input w-full min-h-[80px] font-mono text-sm"
                          placeholder={'Aulas de idioma - Aluno {aluno}, frequência {frequencia}x/semana, curso {curso}.\nPagamento referente ao mês de {mes}/{ano}.'}
                          rows={3}
                        />
                        <p className="text-xs text-gray-500 mt-1">Use {'{aluno}'}, {'{frequencia}'}, {'{curso}'}, {'{mes}'}, {'{ano}'} como variáveis. Deixe vazio para usar o modelo padrão.</p>
                      </div>
                    </>
                  )}
                </div>
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

        {/* Modal Cancelar NF */}
        <Modal
          isOpen={!!cancelarNfModal}
          onClose={() => {
            if (!cancelarNfLoading) {
              setCancelarNfModal(null)
              setCancelarNfJustificativa('')
            }
          }}
          title={cancelarNfModal ? `Cancelar Nota Fiscal – ${cancelarNfModal.nome}` : 'Cancelar Nota Fiscal'}
          size="md"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setCancelarNfModal(null)} disabled={!!cancelarNfLoading}>
                Voltar
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirmCancelarNf}
                disabled={!!cancelarNfLoading || cancelarNfJustificativa.trim().length < 15}
                className="bg-red-600 hover:bg-red-700"
              >
                {cancelarNfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Cancelar Nota
              </Button>
            </div>
          }
        >
          {cancelarNfModal && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                A nota fiscal será cancelada na prefeitura. Esta ação não pode ser desfeita.
              </p>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Justificativa (mín. 15 caracteres) *
                </label>
                <textarea
                  value={cancelarNfJustificativa}
                  onChange={(e) => setCancelarNfJustificativa(e.target.value)}
                  className="input w-full min-h-[80px]"
                  placeholder="Ex.: Nota emitida em duplicidade; pagamento estornado..."
                  rows={3}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {cancelarNfJustificativa.length}/15 caracteres
                </p>
              </div>
            </div>
          )}
        </Modal>

        {/* Modal Agendar lembrete de NF */}
        <Modal
          isOpen={!!agendarNfModal}
          onClose={() => setAgendarNfModal(null)}
          title={agendarNfModal ? `Agendar lembrete de NF – ${agendarNfModal.nome}` : 'Agendar lembrete de NF'}
          size="md"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setAgendarNfModal(null)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={agendarNfLoading || agendarNfSaving || !agendarNfForm.email.trim()}
                onClick={handleAgendarNfSubmit}
              >
                {agendarNfSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Agendar
              </Button>
            </div>
          }
        >
          {agendarNfLoading ? (
            <p className="text-gray-500">Carregando...</p>
          ) : (
            <div className="space-y-4">
              {agendarNfFromRepeat && (
                <p className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  Preenchido automaticamente a partir do agendamento recorrente de outro mês. Confira os dados e clique em Agendar para este mês.
                </p>
              )}
              {agendarNfModal && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">E-mail do aluno</label>
                  <input
                    type="text"
                    value={agendarNfModal.email || ''}
                    readOnly
                    className="input w-full bg-gray-100 cursor-not-allowed"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Faturar para</label>
                <select
                  value={agendarNfForm.faturamentoTipo}
                  onChange={(e) => {
                    const v = e.target.value as 'ALUNO' | 'EMPRESA'
                    setAgendarNfForm((f) => {
                      const next = { ...f, faturamentoTipo: v }
                      if (v === 'EMPRESA') {
                        next.email = agendarNfModal?.faturamentoEmail ?? f.email
                        next.empresaNome = agendarNfModal?.faturamentoRazaoSocial ?? f.empresaNome
                        if (!f.empresaCnpj && (agendarNfModal as { faturamentoCnpj?: string | null }).faturamentoCnpj)
                          next.empresaCnpj = (agendarNfModal as { faturamentoCnpj?: string | null }).faturamentoCnpj?.replace(/\D/g, '') ?? ''
                        if (!f.empresaEnderecoFiscal && (agendarNfModal as { faturamentoEndereco?: string | null }).faturamentoEndereco)
                          next.empresaEnderecoFiscal = (agendarNfModal as { faturamentoEndereco?: string | null }).faturamentoEndereco ?? ''
                        if (!f.empresaDescricaoNfse.trim())
                          next.empresaDescricaoNfse = (agendarNfModal as { faturamentoDescricaoNfse?: string | null }).faturamentoDescricaoNfse?.trim() || DEFAULT_DESCRICAO_NF_EMPRESA
                        if (!f.emailBody.trim()) next.emailBody = templateConteudoEmailNf(selectedMes, selectedAno)
                      } else {
                        next.email = agendarNfModal?.email ?? f.email
                      }
                      return next
                    })
                  }}
                  className="input w-full"
                >
                  <option value="ALUNO">Aluno</option>
                  <option value="EMPRESA">Empresa</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">E-mail para envio da NF</label>
                <input
                  type="email"
                  value={agendarNfForm.email}
                  onChange={(e) => setAgendarNfForm((f) => ({ ...f, email: e.target.value }))}
                  className="input w-full"
                  placeholder="email@empresa.com, copie o aluno se quiser"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Anexar NF (PDF)</label>
                <div className="flex items-center gap-2">
                  <input
                    ref={nfFileInputRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      if (file.size > 10 * 1024 * 1024) {
                        setToast({ message: 'Arquivo muito grande (máx. 10MB).', type: 'error' })
                        return
                      }
                      try {
                        const formData = new FormData()
                        formData.append('file', file)
                        const res = await fetch('/api/admin/financeiro/nfse-upload', {
                          method: 'POST',
                          body: formData,
                          credentials: 'include',
                        })
                        const json = await res.json()
                        if (!res.ok || !json.ok) {
                          setToast({ message: json.message || 'Erro ao enviar arquivo da NF', type: 'error' })
                          return
                        }
                        setAgendarNfForm((f) => ({
                          ...f,
                          nfAttachmentPath: json.path as string,
                          nfAttachmentName: (json.filename as string) || file.name,
                        }))
                        setToast({ message: 'NF anexada com sucesso.', type: 'success' })
                      } catch {
                        setToast({ message: 'Erro ao anexar NF', type: 'error' })
                      } finally {
                        // limpar input para permitir reanexar o mesmo arquivo se quiser
                        if (nfFileInputRef.current) nfFileInputRef.current.value = ''
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => nfFileInputRef.current?.click()}
                  >
                    {agendarNfForm.nfAttachmentPath ? 'Trocar arquivo' : 'Selecionar arquivo'}
                  </Button>
                  {agendarNfForm.nfAttachmentName && (
                    <span className="text-xs text-gray-600 truncate max-w-[160px]" title={agendarNfForm.nfAttachmentName}>
                      {agendarNfForm.nfAttachmentName}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  O arquivo será enviado em anexo no e-mail agendado.
                </p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Assunto do e-mail</label>
                <input
                  type="text"
                  value={agendarNfForm.assunto ?? ''}
                  onChange={(e) => setAgendarNfForm((f) => ({ ...f, assunto: e.target.value } as any))}
                  className="input w-full"
                  placeholder={`Nota Fiscal – ${agendarNfModal?.nome ?? 'Aluno'} – ${selectedMes}/${selectedAno}`}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Corpo do e-mail</label>
                <textarea
                  value={agendarNfForm.emailBody}
                  onChange={(e) => setAgendarNfForm((f) => ({ ...f, emailBody: e.target.value }))}
                  className="input w-full min-h-[80px]"
                  rows={3}
                  placeholder={templateConteudoEmailNf(selectedMes, selectedAno)}
                />
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-xs text-gray-500">
                    Use {'{aluno}'}, {'{frequencia}'}, {'{curso}'}, {'{mes}'}, {'{ano}'} como variáveis. O modelo padrão já está
                    preenchido. Quando o envio acontecer, <strong>anexe a NF e envie para a empresa com o aluno em cópia</strong>.
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!agendarNfModal) return
                      const prevMonth = selectedMes === 1 ? 12 : selectedMes - 1
                      const prevYear = selectedMes === 1 ? selectedAno - 1 : selectedAno
                      try {
                        const urlPrev = `/api/admin/financeiro/nfse-agendamento?enrollmentId=${encodeURIComponent(
                          agendarNfModal.id
                        )}&year=${prevYear}&month=${prevMonth}`
                        const resPrev = await fetch(urlPrev, { credentials: 'include' })
                        const jsonPrev = await resPrev.json()
                        if (resPrev.ok && jsonPrev.ok && jsonPrev.data?.emailBody) {
                          setAgendarNfForm((f) => ({ ...f, emailBody: jsonPrev.data.emailBody as string }))
                          setToast({
                            message: 'Texto copiado do mês anterior.',
                            type: 'success',
                          })
                        } else {
                          setToast({
                            message: 'Nenhum agendamento encontrado no mês anterior para copiar.',
                            type: 'error',
                          })
                        }
                      } catch {
                        setToast({
                          message: 'Erro ao copiar mensagem do mês anterior.',
                          type: 'error',
                        })
                      }
                    }}
                    className="shrink-0 inline-flex items-center rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Copiar do mês anterior
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Data e horário para envio</label>
                <input
                  type="datetime-local"
                  value={agendarNfForm.scheduledFor}
                  onChange={(e) => setAgendarNfForm((f) => ({ ...f, scheduledFor: e.target.value }))}
                  className="input w-full"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="agendar-repeat-monthly"
                  checked={agendarNfForm.repeatMonthly}
                  onChange={(e) => setAgendarNfForm((f) => ({ ...f, repeatMonthly: e.target.checked }))}
                  className="rounded border-gray-300"
                />
                <label htmlFor="agendar-repeat-monthly" className="text-sm font-medium text-gray-700">
                  Repetir todo mês
                </label>
              </div>
            </div>
          )}
        </Modal>

        {/* Modal motivo do erro na NF */}
        <Modal
          isOpen={!!nfErrorModal}
          onClose={() => setNfErrorModal(null)}
          title={nfErrorModal ? `Erro na NF – ${nfErrorModal.nome}` : 'Erro na NF'}
          size="md"
        >
          {nfErrorModal && (
            <div className="space-y-3">
              <p className="text-sm text-gray-700">Motivo do erro na emissão da nota fiscal:</p>
              <p className="text-sm bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 whitespace-pre-wrap">
                {nfErrorModal.message}
              </p>
              <div className="flex justify-end">
                <Button variant="secondary" size="sm" onClick={() => setNfErrorModal(null)}>
                  Fechar
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
              : cubeModal === 'atrasadoCancelar'
                ? 'Alunos atrasados – precisam cancelar o curso'
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
                        : cubeModal === 'removidos'
                          ? 'Alunos removidos deste mês'
                          : 'Lista'
          }
          size="md"
          footer={
            (() => {
              const list: (AlunoFinanceiro | AlunoRemovidoMes)[] =
                cubeModal === 'atrasado' || cubeModal === 'atrasadoCancelar'
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
                            : cubeModal === 'removidos'
                              ? (Array.isArray(alunosRemovidosMes) ? alunosRemovidosMes : [])
                              : []
              if (!Array.isArray(list) || list.length === 0) return null
              const showVencimento = cubeModal === 'atrasado' || cubeModal === 'atrasadoCancelar' || cubeModal === 'aReceber'
              const showUltimoPag = cubeModal === 'pago'
              const copyText =
                (showVencimento
                  ? 'Aluno\tDia venc.\n' + (list as AlunoFinanceiro[]).map((a) => `${a.nome}\t${a.diaPagamento ?? '—'}`).join('\n')
                  : showUltimoPag
                    ? 'Aluno\tData Pag.\n' + (list as AlunoFinanceiro[]).map((a) => `${a.nome}\t${formatDate(a.dataPagamento)}`).join('\n')
                    : cubeModal === 'removidos'
                      ? 'Aluno\tMotivo\n' + (list as AlunoRemovidoMes[]).map((a) => `${a.nome}\t${a.motivo ?? ''}`).join('\n')
                      : 'Aluno\n' + list.map((a: any) => a.nome).join('\n'))
              return (
                <div className="flex justify-between items-center w-full gap-2 flex-wrap">
                  {(cubeModal === 'atrasado' || cubeModal === 'atrasadoCancelar') && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setCubeModal(null)
                        openCobrancaTodosModal()
                      }}
                      disabled={atrasadosComEmail.length === 0}
                    >
                      Enviar lembrança para todos
                    </Button>
                  )}
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
            const list: (AlunoFinanceiro | AlunoRemovidoMes)[] =
              cubeModal === 'atrasado' || cubeModal === 'atrasadoCancelar'
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
                          : cubeModal === 'removidos'
                            ? (Array.isArray(alunosRemovidosMes) ? alunosRemovidosMes : [])
                            : []
            if (!Array.isArray(list) || list.length === 0) {
              return <p className="text-gray-500 text-sm">Nenhum aluno nesta lista.</p>
            }
            const showVencimento = cubeModal === 'atrasado' || cubeModal === 'atrasadoCancelar' || cubeModal === 'aReceber'
            const showUltimoPag = cubeModal === 'pago'
            return (
              <>
                <ul className="space-y-2 max-h-80 overflow-y-auto">
                  {list.map((a) => (
                    <li key={a.id} className="py-1.5 px-2 rounded bg-gray-50 text-gray-800 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                      <span className="min-w-0 flex-1">
                        {cubeModal === 'removidos' ? (
                          <>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => void revertRemovedFromMonth(a.id)}
                              disabled={revertingRemovedId === a.id}
                              className="mr-2"
                            >
                              {revertingRemovedId === a.id ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : null}
                              Reverter
                            </Button>
                            {a.nome}
                          </>
                        ) : (
                          a.nome
                        )}
                        {cubeModal === 'removidos' && (a as AlunoRemovidoMes).motivo && (
                          <span className="block text-xs text-gray-500 mt-0.5">
                            Motivo: {(a as AlunoRemovidoMes).motivo}
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        {(cubeModal === 'atrasado' || cubeModal === 'atrasadoCancelar') && (
                          <button
                            type="button"
                            onClick={() => openCobrancaModal(a.id, a.nome)}
                            disabled={!(a as AlunoFinanceiro).email || loadingCobrancaForId === a.id}
                            className="text-xs px-2 py-1 rounded bg-brand-orange text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {loadingCobrancaForId === a.id ? (
                              <Loader2 className="w-3 h-3 animate-spin inline" />
                            ) : (
                              'Enviar cobrança'
                            )}
                          </button>
                        )}
                        {(showVencimento || showUltimoPag) && (
                          <span className="text-sm text-gray-600">
                            {showVencimento && (
                              <>Dia venc.: {(a as AlunoFinanceiro).diaPagamento ?? '—'}</>
                            )}
                            {showUltimoPag && !showVencimento && (
                              <>Data pag.: {formatDate((a as AlunoFinanceiro).dataPagamento)}</>
                            )}
                          </span>
                        )}
                      </div>
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
