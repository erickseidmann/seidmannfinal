/**
 * Página de Matrícula
 * 
 * Formulário de cadastro para novos alunos com validação e integração WhatsApp
 */

'use client'

import { useState, FormEvent, Suspense, useMemo, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Button from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import type { MatriculaResponse, ApiResponse, MatriculaPayment } from '@/contracts/api.contract'
import { isValidCPF } from '@/lib/finance/validators'
import { User, BookOpen, FileCheck } from 'lucide-react'

const STEPS = [
  { id: 1, label: 'Dados pessoais', icon: User },
  { id: 2, label: 'Preferências', icon: BookOpen },
  { id: 3, label: 'Termos e pagamento', icon: FileCheck },
] as const

function isMenorDeIdade(dataNascimento: string): boolean {
  if (!dataNascimento || !dataNascimento.trim()) return false
  const nasc = new Date(dataNascimento)
  if (Number.isNaN(nasc.getTime())) return false
  const hoje = new Date()
  let idade = hoje.getFullYear() - nasc.getFullYear()
  const m = hoje.getMonth() - nasc.getMonth()
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--
  return idade < 18
}

interface FormErrors {
  nome?: string
  cpf?: string
  whatsapp?: string
  email?: string
  idioma?: string
  nivel?: string
  melhoresDiasSemana?: string
  melhoresHorarios?: string
  tempoAulaMinutos?: string
  frequenciaSemanal?: string
  metodoPagamento?: string
  cep?: string
  rua?: string
  bairro?: string
  numero?: string
  cidade?: string
  estado?: string
  aceiteTermos?: string
  aceiteFerias?: string
  nomeResponsavel?: string
  cpfResponsavel?: string
  emailResponsavel?: string
}

const TEMPO_AULA_OPCOES = [
  { value: '', label: 'Selecione' },
  { value: '30', label: '30 min' },
  { value: '40', label: '40 min' },
  { value: '60', label: '1 hora' },
  { value: '120', label: '2 horas' },
]

const FREQUENCIA_SEMANAL_OPCOES = [
  { value: '', label: 'Selecione' },
  { value: '1', label: '1x por semana' },
  { value: '2', label: '2x por semana' },
  { value: '3', label: '3x por semana' },
  { value: '4', label: '4x por semana' },
  { value: '5', label: '5x por semana' },
  { value: '6', label: '6x por semana' },
  { value: '7', label: '7x por semana' },
]

const DIAS_SEMANA = [
  { value: 'seg', label: 'Segunda' },
  { value: 'ter', label: 'Terça' },
  { value: 'qua', label: 'Quarta' },
  { value: 'qui', label: 'Quinta' },
  { value: 'sex', label: 'Sexta' },
  { value: 'sab', label: 'Sábado' },
  { value: 'dom', label: 'Domingo' },
] as const

const HORARIOS = [
  { value: 'manha', label: 'Manhã (7h-12h)' },
  { value: 'tarde', label: 'Tarde (12h-18h)' },
  { value: 'noite', label: 'Noite (18h-22h)' },
] as const

async function buscarCep(cep: string): Promise<{ logradouro: string; bairro: string; localidade: string; uf: string } | null> {
  const limpo = cep.replace(/\D/g, '')
  if (limpo.length !== 8) return null
  try {
    const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`)
    const data = await res.json()
    if (data.erro) return null
    return {
      logradouro: data.logradouro || '',
      bairro: data.bairro || '',
      localidade: data.localidade || '',
      uf: data.uf || '',
    }
  } catch {
    return null
  }
}

const VALOR_HORA_PARTICULAR = 60
const VALOR_HORA_GRUPO = 45
const SEMANAS_POR_MES = 4
/** Códigos de cupom: valor é multiplicador do valor hora (ex: 0.9 = 10% off). */
const CUPONS: Record<string, number> = {
  PROMO10: 0.9,
  DESC20: 0.8,
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function getEscolaFromParams(searchParams: ReturnType<typeof useSearchParams>): { escola: 'SEIDMANN' | 'YOUBECOME' | 'HIGHWAY' | 'OUTRO'; nomeOutro?: string } {
  const escola = searchParams.get('escola')?.toUpperCase()
  if (escola === 'YOUBECOME' || escola === 'HIGHWAY') {
    return { escola }
  }
  if (escola === 'OUTRO') {
    const nomeOutro = searchParams.get('nome')?.trim()
    return { escola: 'OUTRO', nomeOutro: nomeOutro || undefined }
  }
  return { escola: 'SEIDMANN' }
}

function MatriculaPageContent() {
  const searchParams = useSearchParams()
  const isAutoComplete = searchParams.get('auto') === '1'
  const { escola: escolaParam, nomeOutro } = getEscolaFromParams(searchParams)
  const isModoParceiro = escolaParam !== 'SEIDMANN'
  
  const [formData, setFormData] = useState({
    nome: '',
    dataNascimento: '',
    cpf: '',
    nomeResponsavel: '',
    cpfResponsavel: '',
    emailResponsavel: '',
    whatsapp: '',
    email: '',
    idioma: '',
    nivel: '',
    objetivo: '',
    melhoresDiasSemana: [] as string[],
    melhoresHorarios: [] as string[],
    tipoAula: '' as '' | 'PARTICULAR' | 'GRUPO',
    nomeGrupo: '',
    tempoAulaMinutos: '',
    frequenciaSemanal: '',
    metodoPagamento: '',
    cep: '',
    rua: '',
  bairro: '',
    numero: '',
    complemento: '',
    cidade: '',
    estado: '',
    codigoCupom: '',
    aceiteTermos: false,
    aceiteFerias: false,
    diaPagamento: '',
  })

  const [errors, setErrors] = useState<FormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [paymentInfo, setPaymentInfo] = useState<{
    boletoUrl: string | null
    boletoDigitableLine: string | null
    pixEmv: string | null
    pixQrCodeUrl: string | null
  } | null>(null)
  const [copiedPix, setCopiedPix] = useState(false)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [couponValidado, setCouponValidado] = useState<{ valorPorHoraAula: number } | null>(null)
  const [cepLoading, setCepLoading] = useState(false)

  useEffect(() => {
    const code = formData.codigoCupom.trim().toUpperCase()
    if (!code) {
      setCouponValidado(null)
      return
    }
    const ctrl = new AbortController()
    fetch(`/api/coupons/validate?code=${encodeURIComponent(code)}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((json) => {
        if (json.ok && json.data?.valorPorHoraAula != null) {
          setCouponValidado({ valorPorHoraAula: json.data.valorPorHoraAula })
        } else {
          setCouponValidado(null)
        }
      })
      .catch(() => setCouponValidado(null))
    return () => ctrl.abort()
  }, [formData.codigoCupom])

  /** Valor da mensalidade: particular R$ 60/h, grupo R$ 36,50/h. Cupom do banco ou legado altera o valor hora. */
  const { valorMensalidade, valorHoraAplicado } = useMemo(() => {
    const tempoMin = formData.tempoAulaMinutos ? Number(formData.tempoAulaMinutos) : 0
    const freq = formData.frequenciaSemanal ? Number(formData.frequenciaSemanal) : 0
    let valorHora: number
    if (couponValidado) {
      valorHora = couponValidado.valorPorHoraAula
    } else {
      const multiplicador = formData.codigoCupom.trim()
        ? (CUPONS[formData.codigoCupom.trim().toUpperCase()] ?? 1)
        : 1
      const valorHoraBase = formData.tipoAula === 'GRUPO' ? VALOR_HORA_GRUPO : VALOR_HORA_PARTICULAR
      valorHora = valorHoraBase * multiplicador
    }
    const tempoHoras = tempoMin / 60
    const mensal = tempoMin && freq ? valorHora * tempoHoras * freq * SEMANAS_POR_MES : 0
    return { valorMensalidade: Math.round(mensal * 100) / 100, valorHoraAplicado: valorHora }
  }, [formData.tempoAulaMinutos, formData.frequenciaSemanal, formData.codigoCupom, formData.tipoAula, couponValidado])

  /** Valida apenas os campos da etapa 1 (nome, contato, idioma, nível; CPF; responsável se menor). */
  const validateStep1 = (): boolean => {
    const newErrors: FormErrors = {}
    if (!formData.nome.trim()) newErrors.nome = 'Nome completo é obrigatório'
    if (!formData.whatsapp.trim()) newErrors.whatsapp = 'WhatsApp é obrigatório'
    if (!formData.email.trim()) newErrors.email = 'Email é obrigatório'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Email inválido'
    if (!formData.idioma) newErrors.idioma = 'Idioma é obrigatório'
    if (!formData.nivel) newErrors.nivel = 'Nível é obrigatório'
    const menor = isMenorDeIdade(formData.dataNascimento)
    if (menor) {
      if (!formData.nomeResponsavel.trim()) newErrors.nomeResponsavel = 'Nome do responsável é obrigatório para menores de 18 anos'
      if (!formData.cpfResponsavel.trim()) newErrors.cpfResponsavel = 'CPF do responsável é obrigatório para menores de 18 anos'
      else if (!isValidCPF(formData.cpfResponsavel)) newErrors.cpfResponsavel = 'CPF do responsável inválido'
      if (!formData.emailResponsavel.trim()) newErrors.emailResponsavel = 'Email do responsável é obrigatório para menores de 18 anos'
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.emailResponsavel)) newErrors.emailResponsavel = 'Email do responsável inválido'
    } else {
      if (!formData.cpf.trim()) newErrors.cpf = 'CPF é obrigatório'
      else if (!isValidCPF(formData.cpf)) newErrors.cpf = 'CPF inválido'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  /** Valida apenas a etapa 2 (disponibilidade, tempo de aula, frequência). */
  const validateStep2 = (): boolean => {
    const newErrors: FormErrors = {}
    if (!formData.melhoresDiasSemana.length) newErrors.melhoresDiasSemana = 'Selecione ao menos um dia da semana'
    if (!formData.melhoresHorarios.length) newErrors.melhoresHorarios = 'Selecione ao menos um horário'
    if (!formData.tempoAulaMinutos) newErrors.tempoAulaMinutos = 'Tempo de aula é obrigatório'
    if (!formData.frequenciaSemanal) newErrors.frequenciaSemanal = 'Frequência semanal é obrigatória'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  /** Valida etapa 3 (metodoPagamento, endereço). */
  const validateStep3 = (): boolean => {
    const newErrors: FormErrors = {}
    if (!formData.metodoPagamento) newErrors.metodoPagamento = 'Método de pagamento é obrigatório'
    const cepOk = formData.cep?.replace(/\D/g, '').length === 8
    if (!cepOk) newErrors.cep = 'CEP é obrigatório e deve ter 8 dígitos'
    if (!formData.rua?.trim()) newErrors.rua = 'Rua é obrigatória'
    if (!formData.bairro?.trim()) newErrors.bairro = 'Bairro é obrigatório'
    if (!formData.numero?.trim()) newErrors.numero = 'Número é obrigatório'
    if (!formData.cidade?.trim()) newErrors.cidade = 'Cidade é obrigatória'
    if (!formData.estado?.trim()) newErrors.estado = 'Estado é obrigatório'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    if (!formData.nome.trim()) {
      newErrors.nome = 'Nome completo é obrigatório'
    }

    if (!formData.whatsapp.trim()) {
      newErrors.whatsapp = 'WhatsApp é obrigatório'
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email é obrigatório'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email inválido'
    }

    if (!formData.idioma) {
      newErrors.idioma = 'Idioma é obrigatório'
    }

    if (!formData.nivel) {
      newErrors.nivel = 'Nível é obrigatório'
    }

    if (!formData.melhoresDiasSemana?.length) {
      newErrors.melhoresDiasSemana = 'Selecione ao menos um dia da semana'
    }
    if (!formData.melhoresHorarios?.length) {
      newErrors.melhoresHorarios = 'Selecione ao menos um horário'
    }
    if (!formData.tempoAulaMinutos) {
      newErrors.tempoAulaMinutos = 'Tempo de aula é obrigatório'
    }
    if (!formData.frequenciaSemanal) {
      newErrors.frequenciaSemanal = 'Frequência semanal é obrigatória'
    }

    const menor = isMenorDeIdade(formData.dataNascimento)
    if (menor) {
      if (!formData.nomeResponsavel.trim()) newErrors.nomeResponsavel = 'Nome do responsável é obrigatório para menores de 18 anos'
      if (!formData.cpfResponsavel.trim()) newErrors.cpfResponsavel = 'CPF do responsável é obrigatório para menores de 18 anos'
      else if (!isValidCPF(formData.cpfResponsavel)) newErrors.cpfResponsavel = 'CPF do responsável inválido'
      if (!formData.emailResponsavel.trim()) newErrors.emailResponsavel = 'Email do responsável é obrigatório para menores de 18 anos'
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.emailResponsavel)) newErrors.emailResponsavel = 'Email do responsável inválido'
    } else {
      if (!formData.cpf.trim()) newErrors.cpf = 'CPF é obrigatório'
      else if (!isValidCPF(formData.cpf)) newErrors.cpf = 'CPF inválido'
    }

    if (!formData.metodoPagamento) newErrors.metodoPagamento = 'Método de pagamento é obrigatório'
    const cepOk = formData.cep?.replace(/\D/g, '').length === 8
    if (!cepOk) newErrors.cep = 'CEP é obrigatório e deve ter 8 dígitos'
    if (!formData.rua?.trim()) newErrors.rua = 'Rua é obrigatória'
    if (!formData.numero?.trim()) newErrors.numero = 'Número é obrigatório'
    if (!formData.cidade?.trim()) newErrors.cidade = 'Cidade é obrigatória'
    if (!formData.estado?.trim()) newErrors.estado = 'Estado é obrigatório'

    if (!formData.aceiteTermos) {
      newErrors.aceiteTermos = 'É necessário aceitar os termos e condições'
    }
    if (!formData.aceiteFerias) {
      newErrors.aceiteFerias = 'É necessário aceitar as regras de férias e feriados'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setShowSuccess(false)
    setSubmitError(null)

    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)

    try {
      // Fazer POST para API
      // O idioma já vem como "ENGLISH" ou "SPANISH" do select
      const response = await fetch('/api/matricula', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nome: formData.nome,
          email: formData.email,
          whatsapp: formData.whatsapp,
          idioma: formData.idioma,
          nivel: formData.nivel,
          objetivo: formData.objetivo || null,
          melhoresDiasSemana: formData.melhoresDiasSemana.join(', '),
          melhoresHorarios: formData.melhoresHorarios.join(', '),
          disponibilidade: `Dias: ${formData.melhoresDiasSemana.join(', ')}. Horários: ${formData.melhoresHorarios.join(', ')}`,
          metodoPagamento: formData.metodoPagamento || null,
          cep: formData.cep?.replace(/\D/g, '').slice(0, 8) || null,
          rua: formData.rua?.trim() || null,
          bairro: formData.bairro?.trim() || null,
          cidade: formData.cidade?.trim() || null,
          estado: formData.estado?.trim().slice(0, 2) || null,
          numero: formData.numero?.trim() || null,
          complemento: formData.complemento?.trim() || null,
          dataNascimento: formData.dataNascimento || undefined,
          cpf: formData.cpf ? formData.cpf.replace(/\D/g, '') : undefined,
          nomeResponsavel: isMenorDeIdade(formData.dataNascimento) ? formData.nomeResponsavel.trim() || undefined : undefined,
          cpfResponsavel: isMenorDeIdade(formData.dataNascimento) ? formData.cpfResponsavel.replace(/\D/g, '') : undefined,
          emailResponsavel: isMenorDeIdade(formData.dataNascimento) ? formData.emailResponsavel.trim() || undefined : undefined,
          tipoAula: formData.tipoAula || undefined,
          nomeGrupo: formData.tipoAula === 'GRUPO' ? formData.nomeGrupo : undefined,
          escolaMatricula: escolaParam,
          escolaMatriculaOutro: escolaParam === 'OUTRO' && nomeOutro ? nomeOutro : undefined,
          tempoAulaMinutos: formData.tempoAulaMinutos ? Number(formData.tempoAulaMinutos) : undefined,
          frequenciaSemanal: formData.frequenciaSemanal ? Number(formData.frequenciaSemanal) : undefined,
          valorMensalidade: valorMensalidade > 0 ? valorMensalidade : undefined,
          diaPagamento: formData.diaPagamento ? Number(formData.diaPagamento) : undefined,
          codigoCupom: formData.codigoCupom?.trim() || undefined,
        }),
      })

      const json: ApiResponse<MatriculaResponse['data']> = await response.json()

      if (!response.ok || !json.ok) {
        const msg = (json as { message?: string }).message
        const errorMessage = response.status === 400 
          ? msg || 'Erro ao criar matrícula'
          : response.status === 503
          ? msg || 'Banco de dados não está preparado. Verifique as configurações.'
          : response.status === 500
          ? 'Erro interno. Tente novamente em instantes.'
          : msg || 'Erro ao criar matrícula'
        throw new Error(errorMessage)
      }

      // Sucesso - salvar dados de pagamento e mostrar tela
      setShowSuccess(true)
      setIsSubmitting(false)

      const payment = json.ok ? (json.data as { payment?: MatriculaPayment }).payment : undefined
      if (payment) {
        setPaymentInfo({
          boletoUrl: payment.boletoUrl ?? null,
          boletoDigitableLine: payment.boletoDigitableLine ?? null,
          pixEmv: payment.pixEmv ?? null,
          pixQrCodeUrl: payment.pixQrCodeUrl ?? null,
        })
      }
    } catch (error) {
      console.error('Erro ao criar matrícula:', error)
      setSubmitError(error instanceof Error ? error.message : 'Erro ao criar matrícula. Tente novamente.')
      setIsSubmitting(false)
    }
  }

  const formatCpfInput = (v: string): string => {
    const d = v.replace(/\D/g, '').slice(0, 11)
    if (d.length <= 3) return d
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked

    let finalValue: string | boolean = type === 'checkbox' ? checked : value
    if (type !== 'checkbox' && (name === 'cpf' || name === 'cpfResponsavel')) {
      finalValue = formatCpfInput(String(value))
    }

    setFormData((prev) => ({
      ...prev,
      [name]: finalValue,
    }))

    // Limpar erro do campo quando o usuário começar a digitar
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({
        ...prev,
        [name]: undefined,
      }))
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-white pt-24 pb-20">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto">
          {/* Banner de autocomplete (quando auto=1) */}
          {isAutoComplete && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-blue-800 font-semibold mb-2">
                Seu cadastro foi criado com sucesso!
              </p>
              <p className="text-blue-700 text-sm">
                Agora complete sua matrícula informando idioma, nível e disponibilidade para começarmos suas aulas.
              </p>
            </div>
          )}

          {/* Mensagem de erro */}
          {submitError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
              {submitError}
            </div>
          )}

          {/* Tela de sucesso com dados de pagamento */}
          {showSuccess ? (
            <Card className="p-8 md:p-12">
              <div className="max-w-lg mx-auto space-y-6">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                    <FileCheck className="w-8 h-8 text-green-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-brand-text">Matrícula realizada!</h2>
                  <p className="text-gray-600 mt-2">
                    Sua matrícula foi registrada com sucesso. Realize o pagamento abaixo para confirmar.
                  </p>
                </div>

                {paymentInfo && (paymentInfo.pixEmv || paymentInfo.boletoUrl) ? (
                  <div className="space-y-6">
                    {/* PIX */}
                    {paymentInfo.pixEmv && (
                      <div className="rounded-xl border border-green-200 bg-green-50 p-5">
                        <h3 className="text-lg font-semibold text-green-800 mb-4 flex items-center gap-2">
                          💳 Pagar com PIX
                        </h3>

                        {paymentInfo.pixQrCodeUrl && (
                          <div className="flex justify-center mb-4">
                            <img
                              src={paymentInfo.pixQrCodeUrl}
                              alt="QR Code PIX"
                              className="w-[250px] h-[250px] rounded-lg border border-gray-200"
                            />
                          </div>
                        )}

                        <div className="space-y-2">
                          <label className="block text-sm font-semibold text-green-700">PIX Copia e Cola:</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              readOnly
                              value={paymentInfo.pixEmv}
                              className="input w-full text-xs bg-white"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(paymentInfo.pixEmv!)
                                setCopiedPix(true)
                                setTimeout(() => setCopiedPix(false), 3000)
                              }}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition whitespace-nowrap"
                            >
                              {copiedPix ? '✓ Copiado!' : 'Copiar'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Boleto */}
                    {paymentInfo.boletoUrl && (
                      <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
                        <h3 className="text-lg font-semibold text-blue-800 mb-3 flex items-center gap-2">
                          📄 Pagar com Boleto
                        </h3>
                        {paymentInfo.boletoDigitableLine && (
                          <p className="text-xs text-blue-700 font-mono mb-3 break-all bg-white rounded p-2 border border-blue-100">
                            {paymentInfo.boletoDigitableLine}
                          </p>
                        )}
                        <a
                          href={paymentInfo.boletoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition"
                        >
                          Visualizar Boleto
                        </a>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
                    <p className="text-sm text-amber-800">
                      Os dados de pagamento serão enviados para seu email. Em caso de dúvidas, entre em contato pelo WhatsApp.
                    </p>
                  </div>
                )}

                <div className="text-center pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-500 mb-4">
                    Um email com os detalhes da matrícula e pagamento foi enviado para você.
                  </p>
                  <Button href="/" variant="primary" size="lg">
                    Voltar para a Home
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
          /* Card do Formulário com abas */
          <Card className="p-6 md:p-8 overflow-hidden">
            {/* Título: modo Seidmann ou neutro (parceiros) */}
            <div className="text-center mb-8 pb-6 border-b border-orange-100">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold bg-gradient-to-r from-brand-orange to-brand-yellow bg-clip-text text-transparent">
                {isModoParceiro
                  ? escolaParam === 'OUTRO' && nomeOutro
                    ? `Matrícula – ${nomeOutro}`
                    : escolaParam === 'YOUBECOME'
                      ? 'Matrícula – Youbecome'
                      : escolaParam === 'HIGHWAY'
                        ? 'Matrícula – Highway'
                        : 'Formulário de Matrícula'
                  : 'Welcome To Seidmann Institute'}
              </h1>
              <p className="text-gray-500 text-sm sm:text-base mt-2">
                {isModoParceiro
                  ? 'Preencha as 3 etapas para concluir sua matrícula. É rápido e fácil.'
                  : 'Preencha as 3 etapas para concluir sua matrícula. É rápido e fácil.'}
              </p>
            </div>

            {/* Mini abas + barra de progresso */}
            <div className="mb-8">
              <div className="flex justify-between items-center mb-2">
                {STEPS.map((s) => {
                  const Icon = s.icon
                  const active = step === s.id
                  const done = step > s.id
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setStep(s.id as 1 | 2 | 3)}
                      className={`flex flex-col items-center gap-1 flex-1 ${done ? 'text-brand-orange' : active ? 'text-brand-orange font-semibold' : 'text-gray-400'}`}
                    >
                      <span className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${active || done ? 'border-brand-orange bg-orange-50' : 'border-gray-300'}`}>
                        <Icon className="w-5 h-5" />
                      </span>
                      <span className="text-xs hidden sm:inline">{s.label}</span>
                    </button>
                  )
                })}
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-brand-orange to-brand-yellow transition-all duration-300 rounded-full"
                  style={{ width: `${(step / 3) * 100}%` }}
                />
              </div>
              <p className="text-center text-sm text-gray-500 mt-2">Etapa {step} de 3</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
              {/* ========== ABA 1: Dados pessoais + Contato + Idioma ========== */}
              {step === 1 && (
              <>
              <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-5">
                <p className="text-sm font-semibold text-gray-700 mb-1">Dados pessoais</p>
                <div className="w-8 h-0.5 bg-brand-orange rounded mb-4" aria-hidden="true" />
                <div className="space-y-4">
                <div>
                  <label htmlFor="nome" className="block text-sm font-semibold text-gray-700 mb-2">
                    Nome completo <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="nome"
                    name="nome"
                    value={formData.nome}
                    onChange={handleChange}
                    placeholder="Digite seu nome completo"
                    className={`input w-full ${errors.nome ? 'border-red-500 focus:ring-red-500' : ''}`}
                    aria-invalid={errors.nome ? 'true' : 'false'}
                    aria-describedby={errors.nome ? 'nome-error' : undefined}
                  />
                  {errors.nome && (
                    <p id="nome-error" className="mt-1 text-sm text-red-600">{errors.nome}</p>
                  )}
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="dataNascimento" className="block text-sm font-semibold text-gray-700 mb-2">
                      Data de nascimento <span className="text-gray-500 text-xs">(opcional)</span>
                    </label>
                    <input
                      type="date"
                      id="dataNascimento"
                      name="dataNascimento"
                      value={formData.dataNascimento}
                      onChange={handleChange}
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label htmlFor="cpf" className="block text-sm font-semibold text-gray-700 mb-2">
                      CPF {!isMenorDeIdade(formData.dataNascimento) ? <span className="text-red-500">*</span> : <span className="text-gray-500 text-xs">(opcional para menores)</span>}
                    </label>
                    <input
                      type="text"
                      id="cpf"
                      name="cpf"
                      value={formData.cpf}
                      onChange={handleChange}
                      placeholder="000.000.000-00"
                      className={`input w-full ${errors.cpf ? 'border-red-500 focus:ring-red-500' : ''}`}
                      maxLength={14}
                      aria-invalid={errors.cpf ? 'true' : 'false'}
                    />
                    {errors.cpf && (
                      <p className="mt-1 text-sm text-red-600">{errors.cpf}</p>
                    )}
                  </div>
                </div>

                {/* Dados do responsável (obrigatório para menores de 18 anos) */}
                {isMenorDeIdade(formData.dataNascimento) && (
                  <div className="mt-6 pt-4 border-t border-orange-200">
                    <p className="text-sm font-semibold text-gray-800 mb-1">
                      Dados do responsável <span className="text-red-500">*</span>
                    </p>
                    <p className="text-xs text-gray-600 mb-4">
                      Para menores de 18 anos, informe nome, CPF e e-mail do responsável. Estes dados serão usados para cobrança e documentação financeira.
                    </p>
                    <div className="space-y-4">
                      <div>
                        <label htmlFor="nomeResponsavel" className="block text-sm font-semibold text-gray-700 mb-2">
                          Nome completo do responsável <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          id="nomeResponsavel"
                          name="nomeResponsavel"
                          value={formData.nomeResponsavel}
                          onChange={handleChange}
                          placeholder="Nome do responsável"
                          className={`input w-full ${errors.nomeResponsavel ? 'border-red-500 focus:ring-red-500' : ''}`}
                        />
                        {errors.nomeResponsavel && (
                          <p className="mt-1 text-sm text-red-600">{errors.nomeResponsavel}</p>
                        )}
                      </div>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="cpfResponsavel" className="block text-sm font-semibold text-gray-700 mb-2">
                            CPF do responsável <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            id="cpfResponsavel"
                            name="cpfResponsavel"
                            value={formData.cpfResponsavel}
                            onChange={handleChange}
                            placeholder="000.000.000-00"
                            className={`input w-full ${errors.cpfResponsavel ? 'border-red-500 focus:ring-red-500' : ''}`}
                          aria-invalid={errors.cpfResponsavel ? 'true' : 'false'}
                            maxLength={14}
                          />
                          {errors.cpfResponsavel && (
                            <p className="mt-1 text-sm text-red-600">{errors.cpfResponsavel}</p>
                          )}
                        </div>
                        <div>
                          <label htmlFor="emailResponsavel" className="block text-sm font-semibold text-gray-700 mb-2">
                            E-mail do responsável <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="email"
                            id="emailResponsavel"
                            name="emailResponsavel"
                            value={formData.emailResponsavel}
                            onChange={handleChange}
                            placeholder="responsavel@email.com"
                            className={`input w-full ${errors.emailResponsavel ? 'border-red-500 focus:ring-red-500' : ''}`}
                          />
                          {errors.emailResponsavel && (
                            <p className="mt-1 text-sm text-red-600">{errors.emailResponsavel}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                </div>
              </div>

              {/* Seção: Contato */}
              <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-5">
                <p className="text-sm font-semibold text-gray-700 mb-1">Contato</p>
                <div className="w-8 h-0.5 bg-brand-orange rounded mb-4" aria-hidden="true" />
                <div className="grid md:grid-cols-2 gap-6">
                {/* WhatsApp */}
                <div>
                  <label htmlFor="whatsapp" className="block text-sm font-semibold text-gray-700 mb-2">
                    WhatsApp <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    id="whatsapp"
                    name="whatsapp"
                    value={formData.whatsapp}
                    onChange={handleChange}
                    placeholder="(19) 99999-9999"
                    className={`input ${errors.whatsapp ? 'border-red-500 focus:ring-red-500' : ''}`}
                    aria-invalid={errors.whatsapp ? 'true' : 'false'}
                    aria-describedby={errors.whatsapp ? 'whatsapp-error' : undefined}
                  />
                  {errors.whatsapp && (
                    <p id="whatsapp-error" className="mt-1 text-sm text-red-600">
                      {errors.whatsapp}
                    </p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="seu@email.com"
                    className={`input ${errors.email ? 'border-red-500 focus:ring-red-500' : ''}`}
                    aria-invalid={errors.email ? 'true' : 'false'}
                    aria-describedby={errors.email ? 'email-error' : undefined}
                  />
                  {errors.email && (
                    <p id="email-error" className="mt-1 text-sm text-red-600">
                      {errors.email}
                    </p>
                  )}
                </div>
              </div>
              </div>

              {/* Seção: Idioma e nível */}
              <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-5">
                <p className="text-sm font-semibold text-gray-700 mb-1">Idioma e nível</p>
                <div className="w-8 h-0.5 bg-brand-orange rounded mb-4" aria-hidden="true" />
                <div className="grid md:grid-cols-2 gap-6">
                {/* Idioma */}
                <div>
                  <label htmlFor="idioma" className="block text-sm font-semibold text-gray-700 mb-2">
                    Idioma <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="idioma"
                    name="idioma"
                    value={formData.idioma}
                    onChange={handleChange}
                    className={`input ${errors.idioma ? 'border-red-500 focus:ring-red-500' : ''}`}
                    aria-invalid={errors.idioma ? 'true' : 'false'}
                    aria-describedby={errors.idioma ? 'idioma-error' : undefined}
                  >
                    <option value="">Selecione um idioma</option>
                    <option value="ENGLISH">Inglês</option>
                    <option value="SPANISH">Espanhol</option>
                  </select>
                  {errors.idioma && (
                    <p id="idioma-error" className="mt-1 text-sm text-red-600">
                      {errors.idioma}
                    </p>
                  )}
                </div>

                {/* Nível */}
                <div>
                  <label htmlFor="nivel" className="block text-sm font-semibold text-gray-700 mb-2">
                    Nível <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="nivel"
                    name="nivel"
                    value={formData.nivel}
                    onChange={handleChange}
                    className={`input ${errors.nivel ? 'border-red-500 focus:ring-red-500' : ''}`}
                    aria-invalid={errors.nivel ? 'true' : 'false'}
                    aria-describedby={errors.nivel ? 'nivel-error' : undefined}
                  >
                    <option value="">Selecione seu nível</option>
                    <option value="Iniciante">Iniciante</option>
                    <option value="Básico">Básico</option>
                    <option value="Intermediário">Intermediário</option>
                    <option value="Avançado">Avançado</option>
                  </select>
                  {errors.nivel && (
                    <p id="nivel-error" className="mt-1 text-sm text-red-600">
                      {errors.nivel}
                    </p>
                  )}
                </div>
              </div>
              </div>
              </>
              )}

              {/* ========== ABA 2: Preferências + Objetivo e disponibilidade ========== */}
              {step === 2 && (
              <>
              <p className="text-sm text-gray-600 mb-4">
                Este formulário é para matrícula na <strong>Seidmann Institute</strong>. Todos os cadastros serão da Seidmann.
              </p>
              <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-5">
                <p className="text-sm font-semibold text-gray-700 mb-1">Preferências de aula</p>
                <div className="w-8 h-0.5 bg-brand-orange rounded mb-4" aria-hidden="true" />
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="tipoAula" className="block text-sm font-semibold text-gray-700 mb-2">
                      Tipo de aula
                    </label>
                    <select
                      id="tipoAula"
                      name="tipoAula"
                      value={formData.tipoAula}
                      onChange={handleChange}
                      className="input w-full"
                    >
                      <option value="">Selecione</option>
                      <option value="PARTICULAR">Particular</option>
                      <option value="GRUPO">Grupo / Turma</option>
                    </select>
                  </div>
                  {formData.tipoAula === 'GRUPO' && (
                    <div>
                      <label htmlFor="nomeGrupo" className="block text-sm font-semibold text-gray-700 mb-2">
                        Nome do grupo ou turma
                      </label>
                      <input
                        type="text"
                        id="nomeGrupo"
                        name="nomeGrupo"
                        value={formData.nomeGrupo}
                        onChange={handleChange}
                        placeholder="Ex: Turma Kids, Grupo Intermediário"
                        className="input w-full"
                      />
                    </div>
                  )}
                  <div>
                    <label htmlFor="tempoAulaMinutos" className="block text-sm font-semibold text-gray-700 mb-2">
                      Tempo de aula <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="tempoAulaMinutos"
                      name="tempoAulaMinutos"
                      value={formData.tempoAulaMinutos}
                      onChange={handleChange}
                      className={`input w-full ${errors.tempoAulaMinutos ? 'border-red-500 focus:ring-red-500' : ''}`}
                    >
                      {TEMPO_AULA_OPCOES.map((opt) => (
                        <option key={opt.value || 'empty'} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    {errors.tempoAulaMinutos && (
                      <p className="mt-1 text-sm text-red-600">{errors.tempoAulaMinutos}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="frequenciaSemanal" className="block text-sm font-semibold text-gray-700 mb-2">
                      Frequência semanal <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="frequenciaSemanal"
                      name="frequenciaSemanal"
                      value={formData.frequenciaSemanal}
                      onChange={handleChange}
                      className={`input w-full ${errors.frequenciaSemanal ? 'border-red-500 focus:ring-red-500' : ''}`}
                    >
                      {FREQUENCIA_SEMANAL_OPCOES.map((opt) => (
                        <option key={opt.value || 'empty'} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    {errors.frequenciaSemanal && (
                      <p className="mt-1 text-sm text-red-600">{errors.frequenciaSemanal}                    </p>
                  )}
                </div>
              </div>
              </div>

              {/* Objetivo e disponibilidade */}
              <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-5">
                <p className="text-sm font-semibold text-gray-700 mb-1">Objetivo e disponibilidade</p>
                <div className="w-8 h-0.5 bg-brand-orange rounded mb-4" aria-hidden="true" />
              <div className="space-y-4">
              <div>
                <label htmlFor="objetivo" className="block text-sm font-semibold text-gray-700 mb-2">
                  Objetivo <span className="text-gray-500 text-xs">(opcional)</span>
                </label>
                <textarea
                  id="objetivo"
                  name="objetivo"
                  value={formData.objetivo}
                  onChange={handleChange}
                  placeholder="Ex: trabalho, viagem, conversação, prova..."
                  rows={3}
                  className="input resize-none"
                />
              </div>

              {/* Disponibilidade - Dias da semana */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Melhores dias da semana <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-500 mb-2">Selecione os dias em que você tem disponibilidade</p>
                <div className="flex flex-wrap gap-3">
                  {DIAS_SEMANA.map((d) => (
                    <label key={d.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.melhoresDiasSemana.includes(d.value)}
                        onChange={() => {
                          const next = formData.melhoresDiasSemana.includes(d.value)
                            ? formData.melhoresDiasSemana.filter((x) => x !== d.value)
                            : [...formData.melhoresDiasSemana, d.value]
                          setFormData({ ...formData, melhoresDiasSemana: next })
                          if (errors.melhoresDiasSemana) setErrors({ ...errors, melhoresDiasSemana: undefined })
                        }}
                        className="rounded border-gray-300 text-brand-orange focus:ring-brand-orange"
                      />
                      <span className="text-sm">{d.label}</span>
                    </label>
                  ))}
                </div>
                {errors.melhoresDiasSemana && (
                  <p className="mt-1 text-sm text-red-600">{errors.melhoresDiasSemana}</p>
                )}
              </div>

              {/* Disponibilidade - Horários (até 2) */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Melhores horários <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-500 mb-2">Selecione até 2 horários de preferência</p>
                <div className="flex flex-wrap gap-3">
                  {HORARIOS.map((h) => (
                    <label key={h.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.melhoresHorarios.includes(h.value)}
                        onChange={() => {
                          const next = formData.melhoresHorarios.includes(h.value)
                            ? formData.melhoresHorarios.filter((x) => x !== h.value)
                            : formData.melhoresHorarios.length < 2
                              ? [...formData.melhoresHorarios, h.value]
                              : formData.melhoresHorarios
                          setFormData({ ...formData, melhoresHorarios: next })
                          if (errors.melhoresHorarios) setErrors({ ...errors, melhoresHorarios: undefined })
                        }}
                        className="rounded border-gray-300 text-brand-orange focus:ring-brand-orange"
                      />
                      <span className="text-sm">{h.label}</span>
                    </label>
                  ))}
                </div>
                {errors.melhoresHorarios && (
                  <p className="mt-1 text-sm text-red-600">{errors.melhoresHorarios}</p>
                )}
              </div>
              </div>
              </div>
              </>
              )}

              {/* ========== ABA 3: Termos, pagamento e envio ========== */}
              {step === 3 && (
              <>
              <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-5">
                <p className="text-sm font-semibold text-gray-700 mb-1">Método de pagamento e endereço</p>
                <div className="w-8 h-0.5 bg-brand-orange rounded mb-4" aria-hidden="true" />
                <div className="space-y-4 mb-6">
                  <div>
                    <label htmlFor="metodoPagamento" className="block text-sm font-semibold text-gray-700 mb-2">
                      Método de pagamento <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="metodoPagamento"
                      name="metodoPagamento"
                      value={formData.metodoPagamento}
                      onChange={handleChange}
                      className={`input w-full ${errors.metodoPagamento ? 'border-red-500 focus:ring-red-500' : ''}`}
                    >
                      <option value="">Selecione</option>
                      <option value="PIX">PIX</option>
                      <option value="BOLETO">Boleto</option>
                    </select>
                    {errors.metodoPagamento && <p className="mt-1 text-sm text-red-600">{errors.metodoPagamento}</p>}
                  </div>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <label htmlFor="cep" className="block text-sm font-semibold text-gray-700 mb-2">
                        CEP <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id="cep"
                        name="cep"
                        value={formData.cep}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, '').slice(0, 8)
                          const formatted = v.length > 5 ? `${v.slice(0,5)}-${v.slice(5)}` : v
                          setFormData({ ...formData, cep: formatted })
                          if (errors.cep) setErrors({ ...errors, cep: undefined })
                        }}
                        onBlur={async () => {
                          const limpo = formData.cep.replace(/\D/g, '')
                          if (limpo.length !== 8) return
                          setCepLoading(true)
                          try {
                            const end = await buscarCep(formData.cep)
                            if (end) {
                              setFormData((prev) => ({
                                ...prev,
                                rua: end.logradouro || prev.rua,
                                bairro: end.bairro || prev.bairro,
                                cidade: end.localidade || prev.cidade,
                                estado: end.uf || prev.estado,
                              }))
                            }
                          } finally {
                            setCepLoading(false)
                          }
                        }}
                        placeholder="00000-000"
                        className={`input w-full ${errors.cep ? 'border-red-500 focus:ring-red-500' : ''}`}
                        maxLength={9}
                      />
                      {cepLoading && <p className="text-xs text-gray-500 mt-1">Buscando endereço...</p>}
                      {errors.cep && <p className="mt-1 text-sm text-red-600">{errors.cep}</p>}
                    </div>
                    <div>
                      <label htmlFor="rua" className="block text-sm font-semibold text-gray-700 mb-2">
                        Rua <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id="rua"
                        name="rua"
                        value={formData.rua}
                        onChange={handleChange}
                        placeholder="Rua, Avenida..."
                        className={`input w-full ${errors.rua ? 'border-red-500 focus:ring-red-500' : ''}`}
                      />
                      {errors.rua && <p className="mt-1 text-sm text-red-600">{errors.rua}</p>}
                    </div>
                    <div>
                      <label htmlFor="bairro" className="block text-sm font-semibold text-gray-700 mb-2">
                        Bairro <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id="bairro"
                        name="bairro"
                        value={formData.bairro}
                        onChange={handleChange}
                        placeholder="Bairro"
                        className={`input w-full ${errors.bairro ? 'border-red-500 focus:ring-red-500' : ''}`}
                      />
                      {errors.bairro && <p className="mt-1 text-sm text-red-600">{errors.bairro}</p>}
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="numero" className="block text-sm font-semibold text-gray-700 mb-2">
                        Número <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id="numero"
                        name="numero"
                        value={formData.numero}
                        onChange={handleChange}
                        placeholder="123"
                        className={`input w-full ${errors.numero ? 'border-red-500 focus:ring-red-500' : ''}`}
                      />
                      {errors.numero && <p className="mt-1 text-sm text-red-600">{errors.numero}</p>}
                    </div>
                    <div>
                      <label htmlFor="complemento" className="block text-sm font-semibold text-gray-700 mb-2">
                        Complemento <span className="text-gray-500 text-xs">(opcional)</span>
                      </label>
                      <input
                        type="text"
                        id="complemento"
                        name="complemento"
                        value={formData.complemento}
                        onChange={handleChange}
                        placeholder="Apto, bloco..."
                        className="input w-full"
                      />
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="cidade" className="block text-sm font-semibold text-gray-700 mb-2">
                        Cidade <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id="cidade"
                        name="cidade"
                        value={formData.cidade}
                        onChange={handleChange}
                        placeholder="Cidade"
                        className={`input w-full ${errors.cidade ? 'border-red-500 focus:ring-red-500' : ''}`}
                      />
                      {errors.cidade && <p className="mt-1 text-sm text-red-600">{errors.cidade}</p>}
                    </div>
                    <div>
                      <label htmlFor="estado" className="block text-sm font-semibold text-gray-700 mb-2">
                        Estado (UF) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id="estado"
                        name="estado"
                        value={formData.estado}
                        onChange={(e) => setFormData({ ...formData, estado: e.target.value.toUpperCase().slice(0, 2) })}
                        placeholder="SP"
                        className={`input w-full max-w-[80px] ${errors.estado ? 'border-red-500 focus:ring-red-500' : ''}`}
                        maxLength={2}
                      />
                      {errors.estado && <p className="mt-1 text-sm text-red-600">{errors.estado}</p>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-5">
                <p className="text-sm font-semibold text-gray-700 mb-1">Termos e Condições Seidmann Institute</p>
                <div className="w-8 h-0.5 bg-brand-orange rounded mb-4" aria-hidden="true" />
                <div className="space-y-5">
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-sm text-gray-700 space-y-3">
                  <p><strong>Pagamento:</strong> Todos os pagamentos devem ser realizados na data acordada. Se o vencimento cair em fim de semana ou feriado, o pagamento deve ser feito no próximo dia útil.</p>
                  <p><strong>Atraso:</strong> Se o aluno não avisar a escola sobre eventual atraso no pagamento, perderá o direito a descontos e será cobrado o valor integral da mensalidade.</p>
                </div>

                <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-5">
                  <p className="text-sm font-semibold text-gray-700 mb-1">Valor da mensalidade</p>
                  <div className="w-8 h-0.5 bg-brand-orange rounded mb-4" aria-hidden="true" />
                  <div className="flex flex-wrap items-center gap-6">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-brand-orange">
                        {formData.tempoAulaMinutos && formData.frequenciaSemanal
                          ? formatMoney(valorMensalidade)
                          : '—'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-[160px] max-w-[200px]">
                      <label htmlFor="codigoCupom" className="sr-only">Código cupom</label>
                      <input
                        type="text"
                        id="codigoCupom"
                        name="codigoCupom"
                        value={formData.codigoCupom}
                        onChange={handleChange}
                        placeholder="Cupom (opcional)"
                        className="input w-full text-sm uppercase placeholder:normal-case placeholder:text-gray-400"
                      />
                    </div>
                  </div>
                  {formData.tempoAulaMinutos && formData.frequenciaSemanal && (
                    <p className="text-xs text-gray-500 mt-3 pt-3 border-t border-orange-100">
                      Base: {formData.tempoAulaMinutos} min × {formData.frequenciaSemanal}x/semana
                      {(formData.tipoAula === 'GRUPO' ? valorHoraAplicado !== VALOR_HORA_GRUPO : valorHoraAplicado !== VALOR_HORA_PARTICULAR) && (
                        <> • Valor hora com cupom: {formatMoney(valorHoraAplicado)}</>
                      )}
                    </p>
                  )}
                </div>

                <div className="pt-1">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      name="aceiteTermos"
                      checked={formData.aceiteTermos}
                      onChange={handleChange}
                      className="mt-1 w-4 h-4 text-brand-orange border-gray-300 rounded focus:ring-brand-orange focus:ring-2"
                      aria-invalid={errors.aceiteTermos ? 'true' : 'false'}
                    />
                    <span className="text-sm text-gray-700">Entendo e concordo. <span className="text-red-500">*</span></span>
                  </label>
                  {errors.aceiteTermos && (
                    <p className="mt-1 text-sm text-red-600 ml-7">{errors.aceiteTermos}</p>
                  )}
                </div>
                </div>
              </div>

              {/* Cancelamento e trocas */}
              <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-5">
                <p className="text-sm font-semibold text-gray-700 mb-1">Cancelamento do curso e trocas de horários</p>
                <div className="w-8 h-0.5 bg-brand-orange rounded mb-4" aria-hidden="true" />
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700 space-y-2 mt-4">
                  <p>Para alterações de horário, entre em contato com a equipe de gestão. Remarcações devem ser feitas em até 1 (um) mês; após esse período a aula será considerada perdida. Cancelamentos de longa duração devem ser avisados com pelo menos 1 mês de antecedência. O cancelamento do curso deve ser comunicado com pelo menos uma semana de antecedência em relação à data de pagamento mensal. Cancelamento fora desse prazo sujeita-se à cobrança equivalente a uma semana de aulas.</p>
                </div>
              </div>

              {/* Férias / Feriados */}
              <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-5">
                <p className="text-sm font-semibold text-gray-700 mb-1">Férias / Feriados</p>
                <div className="w-8 h-0.5 bg-brand-orange rounded mb-4" aria-hidden="true" />
                <div className="space-y-4">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700">
                  <p>Férias: A escola não faz ajustes nos valores para os meses de 5 semanas, mas para ajustar o banco de horas a escola tem duas férias no ano (última semana de julho e última semana de dezembro e primeira de janeiro), totalizando 3 semanas e dois dias de férias por ano. Qualquer dúvida, favor comunicar-se com o professor responsável. A escola não trabalha nos feriados nacionais; as únicas aulas que podem ser remanejadas são as de 1 vez por semana.</p>
                </div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    name="aceiteFerias"
                    checked={formData.aceiteFerias}
                    onChange={handleChange}
                    className="mt-1 w-4 h-4 text-brand-orange border-gray-300 rounded focus:ring-brand-orange focus:ring-2"
                    aria-invalid={errors.aceiteFerias ? 'true' : 'false'}
                  />
                  <span className="text-sm text-gray-700">Entendo e concordo sobre as férias e os feriados. <span className="text-red-500">*</span></span>
                </label>
                {errors.aceiteFerias && (
                  <p className="mt-1 text-sm text-red-600 ml-7">{errors.aceiteFerias}</p>
                )}
                </div>
              </div>

              {/* Dia de pagamento */}
              <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-5">
                <p className="text-sm font-semibold text-gray-700 mb-1">Dia de pagamento</p>
                <div className="w-8 h-0.5 bg-brand-orange rounded mb-4" aria-hidden="true" />
                <p className="text-sm text-gray-600 mb-4">
                  Escolha o dia do mês para vencimento da mensalidade (do dia 1 ao 25). Deve ser acordado com o professor; em caso de dúvida entre em contato.
                </p>
                <div>
                  <label htmlFor="diaPagamento" className="block text-sm font-semibold text-gray-700 mb-2">
                    Dia do mês (1 a 25):
                  </label>
                  <select
                    id="diaPagamento"
                    name="diaPagamento"
                    value={formData.diaPagamento}
                    onChange={handleChange}
                    className="input w-full max-w-[140px]"
                  >
                    <option value="">Selecione</option>
                    {Array.from({ length: 25 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>
              </>
              )}

              {/* Mensagem de confirmação e agendamento (step 3) */}
              {step === 3 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm text-amber-900">
                    <strong>Sua matrícula só será confirmada após o pagamento.</strong> No sistema, só poderemos agendar a aula apos confirmação do pagamento.
                  </p>
                </div>
              )}

              {/* Navegação entre abas */}
              <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-gray-200">
                {step > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="flex-1"
                    onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
                  >
                    Voltar
                  </Button>
                ) : (
                  <Button href="/" variant="outline" size="lg" className="flex-1">
                    Voltar para a Home
                  </Button>
                )}
                {step < 3 ? (
                  <Button
                    type="button"
                    variant="primary"
                    size="lg"
                    className="flex-1"
                    onClick={() => {
                      if (step === 1 && validateStep1()) setStep(2)
                      else if (step === 2 && validateStep2()) setStep(3)
                    }}
                  >
                    Próximo
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    className="flex-1"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Processando...' : 'Pagar'}
                  </Button>
                )}
              </div>
            </form>
          </Card>
          )}
        </div>
      </div>
    </main>
  )
}

export default function MatriculaPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-gradient-to-b from-orange-50 to-white pt-24 pb-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <div className="text-center">
              <p className="text-gray-600">Carregando...</p>
            </div>
          </div>
        </div>
      </main>
    }>
      <MatriculaPageContent />
    </Suspense>
  )
}
