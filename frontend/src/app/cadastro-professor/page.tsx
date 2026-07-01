/**
 * Página pública de cadastro de professor.
 *
 * Coleta os dados do professor candidato e cria um registro com status `PENDING`,
 * que aparece para o admin aprovar e liberar o acesso à plataforma.
 */

'use client'

import { useMemo, useState, FormEvent } from 'react'
import Button from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { isValidCPF, isValidCNPJ } from '@/lib/finance/validators'
import {
  CONTRATO_TITULO,
  CONTRATO_CONTRATANTE_TEXTO,
  CONTRATO_PROFESSOR_CLAUSULAS,
  CONTRATO_PDF_PATH,
} from '@/lib/contrato-professor'
import {
  GraduationCap,
  User,
  Languages,
  CalendarClock,
  CheckCircle2,
  Plus,
  Trash2,
  AlertCircle,
  FileText,
  Download,
} from 'lucide-react'

const IDIOMAS = [
  { value: 'PORTUGUES', label: 'Português' },
  { value: 'INGLES', label: 'Inglês' },
  { value: 'ESPANHOL', label: 'Espanhol' },
  { value: 'ITALIANO', label: 'Italiano' },
  { value: 'FRANCES', label: 'Francês' },
] as const

const DIAS_SEMANA = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terça' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sábado' },
] as const

const METODOS_PAGAMENTO = [
  { value: '', label: 'Selecione' },
  { value: 'PIX', label: 'PIX' },
  { value: 'CARTAO', label: 'Cartão' },
  { value: 'OUTRO', label: 'Outro' },
] as const

/**
 * Valor inicial fixo (em reais) pago por hora-aula a todo professor que entra na escola.
 * Reajustes são tratados internamente pela equipe — o cadastro público sempre começa em R$ 18,00.
 */
const VALOR_HORA_INICIAL = 18

interface SlotForm {
  id: string
  dayOfWeek: number | ''
  startHHMM: string
  endHHMM: string
}

function newSlot(): SlotForm {
  return {
    id: Math.random().toString(36).slice(2),
    dayOfWeek: '',
    startHHMM: '',
    endHHMM: '',
  }
}

function hhmmToMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

function maskCpfCnpj(value: string, kind: 'cpf' | 'cnpj'): string {
  const d = value.replace(/\D/g, '').slice(0, kind === 'cpf' ? 11 : 14)
  if (kind === 'cpf') {
    return d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return d
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

function maskWhatsapp(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

interface FormErrors {
  nome?: string
  nomePreferido?: string
  email?: string
  whatsapp?: string
  cpf?: string
  cnpj?: string
  documentos?: string
  idiomasFala?: string
  idiomasEnsina?: string
  metodoPagamento?: string
  infosPagamento?: string
  cienteDataPagamento?: string
  aceiteContrato?: string
  slots?: string
  general?: string
}

export default function CadastroProfessorPage() {
  const [form, setForm] = useState({
    nome: '',
    nomePreferido: '',
    email: '',
    whatsapp: '',
    documentoTipo: 'CPF' as 'CPF' | 'CNPJ',
    cpf: '',
    cnpj: '',
    idiomasFala: [] as string[],
    idiomasEnsina: [] as string[],
    metodoPagamento: '',
    infosPagamento: '',
    cienteDataPagamento: false,
    aceiteContrato: false,
    observacoes: '',
  })
  const [slots, setSlots] = useState<SlotForm[]>([newSlot()])
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function toggleArrayValue(key: 'idiomasFala' | 'idiomasEnsina', value: string) {
    setForm((prev) => {
      const cur = prev[key]
      return {
        ...prev,
        [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value],
      }
    })
  }

  function updateSlot(id: string, patch: Partial<SlotForm>) {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  function addSlot() {
    setSlots((prev) => [...prev, newSlot()])
  }

  function removeSlot(id: string) {
    setSlots((prev) => (prev.length === 1 ? prev : prev.filter((s) => s.id !== id)))
  }

  const idiomasEnsinaSemFalar = useMemo(
    () => form.idiomasEnsina.filter((i) => !form.idiomasFala.includes(i)),
    [form.idiomasEnsina, form.idiomasFala]
  )

  function validate(): FormErrors {
    const e: FormErrors = {}
    if (!form.nome.trim() || form.nome.trim().length < 2) {
      e.nome = 'Informe seu nome completo'
    }
    if (!form.nomePreferido.trim()) {
      e.nomePreferido = 'Informe como prefere ser chamado'
    }
    if (!form.email.trim()) {
      e.email = 'Informe seu e-mail'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      e.email = 'E-mail inválido'
    }
    const wDigits = form.whatsapp.replace(/\D/g, '')
    if (wDigits.length < 10 || wDigits.length > 11) {
      e.whatsapp = 'WhatsApp deve ter 10 ou 11 dígitos (com DDD)'
    }
    if (form.documentoTipo === 'CPF') {
      const cpfDigits = form.cpf.replace(/\D/g, '')
      if (cpfDigits.length !== 11) {
        e.cpf = 'CPF deve ter 11 dígitos'
      } else if (!isValidCPF(cpfDigits)) {
        e.cpf = 'CPF inválido'
      }
    } else {
      const cnpjDigits = form.cnpj.replace(/\D/g, '')
      if (cnpjDigits.length !== 14) {
        e.cnpj = 'CNPJ deve ter 14 dígitos'
      } else if (!isValidCNPJ(cnpjDigits)) {
        e.cnpj = 'CNPJ inválido'
      }
    }
    if (form.idiomasFala.length === 0) {
      e.idiomasFala = 'Marque pelo menos um idioma que você fala'
    }
    if (form.idiomasEnsina.length === 0) {
      e.idiomasEnsina = 'Marque pelo menos um idioma que você ensina'
    } else if (idiomasEnsinaSemFalar.length > 0) {
      e.idiomasEnsina = 'Você só pode ensinar idiomas que também marcou que fala'
    }
    if (!form.metodoPagamento) {
      e.metodoPagamento = 'Selecione o método de pagamento'
    }
    if (!form.infosPagamento.trim()) {
      e.infosPagamento = 'Informe os dados para pagamento (chave PIX, dados bancários, etc.)'
    }
    if (!form.cienteDataPagamento) {
      e.cienteDataPagamento =
        'É necessário confirmar que está ciente da data de pagamento (dia 25, ou próximo dia útil em caso de feriado/fim de semana)'
    }
    if (!form.aceiteContrato) {
      e.aceiteContrato =
        'É necessário confirmar que leu e concorda com o Contrato de Prestação de Serviços'
    }
    // Slots: cada um, se preenchido, deve estar consistente; precisa de ao menos 1 válido
    let validSlots = 0
    for (const s of slots) {
      const tudoVazio = s.dayOfWeek === '' && !s.startHHMM && !s.endHHMM
      if (tudoVazio) continue
      if (s.dayOfWeek === '' || !s.startHHMM || !s.endHHMM) {
        e.slots = 'Preencha o dia e os horários de cada disponibilidade ou remova a linha em branco'
        break
      }
      const start = hhmmToMinutes(s.startHHMM)
      const end = hhmmToMinutes(s.endHHMM)
      if (start == null || end == null || end <= start) {
        e.slots = 'Horários inválidos: o término deve ser depois do início'
        break
      }
      validSlots++
    }
    if (!e.slots && validSlots === 0) {
      e.slots = 'Informe ao menos um horário de disponibilidade'
    }
    return e
  }

  async function handleSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    setErrors({})
    const v = validate()
    if (Object.keys(v).length > 0) {
      setErrors(v)
      // Rolar pro topo do form para mostrar erros
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    const availabilitySlots = slots
      .filter((s) => s.dayOfWeek !== '' && s.startHHMM && s.endHHMM)
      .map((s) => ({
        dayOfWeek: Number(s.dayOfWeek),
        startMinutes: hhmmToMinutes(s.startHHMM) ?? 0,
        endMinutes: hhmmToMinutes(s.endHHMM) ?? 0,
      }))

    setSubmitting(true)
    try {
      const res = await fetch('/api/cadastro-professor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: form.nome.trim(),
          nomePreferido: form.nomePreferido.trim(),
          email: form.email.trim().toLowerCase(),
          whatsapp: form.whatsapp.replace(/\D/g, ''),
          cpf: form.documentoTipo === 'CPF' ? form.cpf.replace(/\D/g, '') : '',
          cnpj: form.documentoTipo === 'CNPJ' ? form.cnpj.replace(/\D/g, '') : '',
          idiomasFala: form.idiomasFala,
          idiomasEnsina: form.idiomasEnsina,
          valorPorHora: VALOR_HORA_INICIAL,
          metodoPagamento: form.metodoPagamento || null,
          infosPagamento: form.infosPagamento.trim() || null,
          cienteDataPagamento: form.cienteDataPagamento,
          aceiteContrato: form.aceiteContrato,
          observacoes: form.observacoes.trim() || null,
          availabilitySlots,
        }),
      })
      const contentType = res.headers.get('content-type') ?? ''
      const json = contentType.includes('application/json')
        ? await res.json().catch(() => null)
        : null
      if (!res.ok || !json?.ok) {
        setErrors({
          general:
            json?.message ||
            (res.status === 409
              ? 'Este e-mail já está cadastrado. Aguarde o contato da escola ou use outro e-mail.'
              : 'Não foi possível enviar o cadastro. Tente novamente.'),
        })
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
      setSuccess(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      console.error('[cadastro-professor]', err)
      setErrors({ general: 'Erro de conexão. Verifique sua internet e tente novamente.' })
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-orange-100 px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <Card className="text-center py-10 px-6">
            <div className="flex justify-center mb-4">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-12 h-12 text-green-600" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Cadastro recebido!</h1>
            <p className="text-gray-600 mb-4">
              Recebemos seus dados, <strong>{form.nome}</strong>. A equipe pedagógica da Seidmann
              Institute vai analisar sua candidatura e entrar em contato pelo WhatsApp ou e-mail
              cadastrado em breve.
            </p>
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 mb-4 text-left">
              <p className="text-sm text-gray-800">
                Enviamos para <strong>{form.email}</strong> um e-mail de confirmação contendo uma{' '}
                <strong>cópia integral do Contrato de Prestação de Serviços</strong> que você
                aceitou (PDF anexo). Se não encontrar na caixa de entrada nos próximos minutos,
                confira a pasta de spam.
              </p>
            </div>
            <p className="text-sm text-gray-500">
              Quando seu cadastro for aprovado, você receberá um e-mail com as instruções para
              acessar a plataforma.
            </p>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-orange-100">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-orange-500 text-white mb-3 shadow-lg">
            <GraduationCap className="w-7 h-7" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Cadastro de Professor</h1>
          <p className="text-gray-600 mt-2">
            Preencha os dados abaixo para se candidatar a dar aulas na Seidmann Institute. Os
            campos com <span className="text-red-500">*</span> são obrigatórios.
          </p>
        </div>

        {errors.general ? (
          <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800 flex gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{errors.general}</span>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Identificação */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <User className="w-5 h-5 text-orange-600" />
              <h2 className="text-lg font-semibold text-gray-900">Identificação</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Nome completo" required error={errors.nome}>
                <input
                  type="text"
                  className="input"
                  value={form.nome}
                  onChange={(e) => update('nome', e.target.value)}
                  placeholder="Maria da Silva"
                  autoComplete="name"
                  required
                />
              </Field>
              <Field label="Como prefere ser chamado" required error={errors.nomePreferido}>
                <input
                  type="text"
                  className="input"
                  value={form.nomePreferido}
                  onChange={(e) => update('nomePreferido', e.target.value)}
                  placeholder="Mari"
                  required
                />
              </Field>
              <Field label="E-mail" required error={errors.email}>
                <input
                  type="email"
                  className="input"
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                  placeholder="seuemail@exemplo.com"
                  autoComplete="email"
                  required
                />
              </Field>
              <Field label="WhatsApp" required error={errors.whatsapp}>
                <input
                  type="tel"
                  className="input"
                  value={form.whatsapp}
                  onChange={(e) => update('whatsapp', maskWhatsapp(e.target.value))}
                  placeholder="(11) 99999-9999"
                  inputMode="numeric"
                  required
                />
              </Field>
              <Field label="Tipo de documento" required>
                <select
                  className="input"
                  value={form.documentoTipo}
                  onChange={(e) => update('documentoTipo', e.target.value as 'CPF' | 'CNPJ')}
                >
                  <option value="CPF">CPF (Pessoa física)</option>
                  <option value="CNPJ">CNPJ (MEI / Pessoa jurídica)</option>
                </select>
              </Field>
              {form.documentoTipo === 'CPF' ? (
                <Field label="CPF" required error={errors.cpf}>
                  <input
                    type="text"
                    className="input"
                    value={form.cpf}
                    onChange={(e) => update('cpf', maskCpfCnpj(e.target.value, 'cpf'))}
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                    required
                  />
                </Field>
              ) : (
                <Field label="CNPJ" required error={errors.cnpj}>
                  <input
                    type="text"
                    className="input"
                    value={form.cnpj}
                    onChange={(e) => update('cnpj', maskCpfCnpj(e.target.value, 'cnpj'))}
                    placeholder="00.000.000/0000-00"
                    inputMode="numeric"
                    required
                  />
                </Field>
              )}
            </div>
          </Card>

          {/* Idiomas */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Languages className="w-5 h-5 text-orange-600" />
              <h2 className="text-lg font-semibold text-gray-900">Idiomas</h2>
            </div>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Idiomas que você fala <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {IDIOMAS.map((i) => {
                    const checked = form.idiomasFala.includes(i.value)
                    return (
                      <button
                        type="button"
                        key={i.value}
                        onClick={() => toggleArrayValue('idiomasFala', i.value)}
                        className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                          checked
                            ? 'border-orange-500 bg-orange-500 text-white'
                            : 'border-gray-300 bg-white text-gray-700 hover:border-orange-300'
                        }`}
                      >
                        {i.label}
                      </button>
                    )
                  })}
                </div>
                {errors.idiomasFala ? (
                  <p className="mt-2 text-sm text-red-600">{errors.idiomasFala}</p>
                ) : null}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Idiomas que você quer ensinar <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {IDIOMAS.map((i) => {
                    const checked = form.idiomasEnsina.includes(i.value)
                    const podeMarcar = form.idiomasFala.includes(i.value)
                    return (
                      <button
                        type="button"
                        key={i.value}
                        disabled={!podeMarcar}
                        onClick={() => toggleArrayValue('idiomasEnsina', i.value)}
                        className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                          checked
                            ? 'border-orange-500 bg-orange-500 text-white'
                            : podeMarcar
                              ? 'border-gray-300 bg-white text-gray-700 hover:border-orange-300'
                              : 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                        }`}
                        title={
                          podeMarcar
                            ? undefined
                            : 'Marque primeiro que você fala esse idioma na pergunta acima'
                        }
                      >
                        {i.label}
                      </button>
                    )
                  })}
                </div>
                {errors.idiomasEnsina ? (
                  <p className="mt-2 text-sm text-red-600">{errors.idiomasEnsina}</p>
                ) : (
                  <p className="mt-2 text-xs text-gray-500">
                    Você só pode ensinar idiomas que também marcou que fala.
                  </p>
                )}
              </div>
            </div>
          </Card>

          {/* Disponibilidade */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-5 h-5 text-orange-600" />
                <h2 className="text-lg font-semibold text-gray-900">Disponibilidade semanal</h2>
              </div>
              <button
                type="button"
                onClick={addSlot}
                className="inline-flex items-center gap-1 text-sm text-orange-600 hover:text-orange-700 font-medium"
              >
                <Plus className="w-4 h-4" /> Adicionar horário
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Indique os dias e horários em que você está disponível para dar aulas. Você pode
              cadastrar quantas faixas quiser.
            </p>
            <div className="space-y-3">
              {slots.map((slot, idx) => (
                <div
                  key={slot.id}
                  className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr_1fr_auto] gap-3 items-end p-3 rounded-lg bg-gray-50 border border-gray-200"
                >
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Dia da semana
                    </label>
                    <select
                      className="input"
                      value={slot.dayOfWeek === '' ? '' : String(slot.dayOfWeek)}
                      onChange={(e) =>
                        updateSlot(slot.id, {
                          dayOfWeek: e.target.value === '' ? '' : Number(e.target.value),
                        })
                      }
                    >
                      <option value="">Selecione</option>
                      {DIAS_SEMANA.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Início</label>
                    <input
                      type="time"
                      className="input"
                      value={slot.startHHMM}
                      onChange={(e) => updateSlot(slot.id, { startHHMM: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Término</label>
                    <input
                      type="time"
                      className="input"
                      value={slot.endHHMM}
                      onChange={(e) => updateSlot(slot.id, { endHHMM: e.target.value })}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSlot(slot.id)}
                    disabled={slots.length === 1}
                    className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    title={slots.length === 1 ? 'Pelo menos um horário é necessário' : 'Remover'}
                    aria-label={`Remover horário ${idx + 1}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            {errors.slots ? <p className="mt-2 text-sm text-red-600">{errors.slots}</p> : null}
          </Card>

          {/* Pagamento */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <GraduationCap className="w-5 h-5 text-orange-600" />
              <h2 className="text-lg font-semibold text-gray-900">Pagamento e sala virtual</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Valor por hora-aula (R$)">
                <input
                  type="text"
                  className="input bg-gray-100 font-semibold text-gray-900 cursor-not-allowed"
                  value="R$ 18,00"
                  readOnly
                  disabled
                  aria-label="Valor por hora-aula: R$ 18,00"
                />
              </Field>
              <Field label="Método de pagamento preferido" required error={errors.metodoPagamento}>
                <select
                  className="input"
                  value={form.metodoPagamento}
                  onChange={(e) => update('metodoPagamento', e.target.value)}
                  required
                >
                  {METODOS_PAGAMENTO.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="md:col-span-2">
                <Field
                  label="Infos para pagamento"
                  hint="(chave PIX, dados bancários, etc.)"
                  required
                  error={errors.infosPagamento}
                >
                  <textarea
                    className="input"
                    rows={3}
                    value={form.infosPagamento}
                    onChange={(e) => update('infosPagamento', e.target.value)}
                    placeholder="Ex.: PIX CPF 000.000.000-00 / Banco XYZ ag. 0000 cc. 0000-0"
                    required
                  />
                </Field>
              </div>
              <div className="md:col-span-2">
                <label className="flex items-start gap-3 p-4 rounded-xl border border-orange-200 bg-orange-50/60 cursor-pointer hover:bg-orange-50 transition-colors">
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                    checked={form.cienteDataPagamento}
                    onChange={(e) => update('cienteDataPagamento', e.target.checked)}
                  />
                  <span className="text-sm text-gray-800">
                    <strong>Estou ciente</strong> de que a data de pagamento de prestador de
                    serviços é sempre <strong>dia 25</strong>. Se o dia 25 cair em{' '}
                    <strong>feriado ou fim de semana</strong>, o pagamento será efetuado no{' '}
                    <strong>próximo dia útil</strong>.{' '}
                    <span className="text-red-500">*</span>
                  </span>
                </label>
                {errors.cienteDataPagamento ? (
                  <p className="mt-1 text-sm text-red-600">{errors.cienteDataPagamento}</p>
                ) : null}
              </div>
              <div className="md:col-span-2">
                <Field label="Observações / experiência" hint="(opcional)">
                  <textarea
                    className="input"
                    rows={4}
                    value={form.observacoes}
                    onChange={(e) => update('observacoes', e.target.value)}
                    placeholder="Conte um pouco sobre sua experiência, formação, metodologia, etc."
                  />
                </Field>
              </div>
            </div>
          </Card>

          {/* Contrato de Prestação de Serviços */}
          <Card className="p-6">
            <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-orange-600" />
                <h2 className="text-lg font-semibold text-gray-900">
                  Contrato de Prestação de Serviços
                </h2>
              </div>
              <a
                href={`/${CONTRATO_PDF_PATH}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-orange-600 hover:text-orange-700 font-medium"
              >
                <Download className="w-4 h-4" /> Baixar PDF
              </a>
            </div>
            <p className="text-sm text-gray-600 mb-3">
              Leia atentamente o contrato abaixo. Após o cadastro, você receberá uma cópia deste
              contrato no e-mail informado, em PDF.
            </p>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 max-h-80 overflow-y-auto text-sm leading-relaxed text-gray-800">
              <h3 className="text-base font-bold text-center text-gray-900 mb-3">
                {CONTRATO_TITULO}
              </h3>
              <p className="mb-2">
                <strong>CONTRATANTE:</strong> {CONTRATO_CONTRATANTE_TEXTO}
              </p>
              <p className="mb-2">
                <strong>PRESTADOR(A) DE SERVIÇOS:</strong>{' '}
                {form.nome.trim() || '________________________________________'}, CPF/CNPJ nº{' '}
                {(form.documentoTipo === 'CPF' ? form.cpf : form.cnpj) || '__________________'}.
              </p>
              <p className="mb-3">
                As partes celebram o presente contrato, que será regido pelas cláusulas e condições
                abaixo:
              </p>

              {CONTRATO_PROFESSOR_CLAUSULAS.map((c) => (
                <div key={c.titulo} className="mb-3">
                  <p className="font-semibold text-gray-900 mt-3 mb-1">{c.titulo}</p>
                  {c.itens.map((i, idx) => (
                    <p key={idx} className="ml-1 mb-1">
                      {i}
                    </p>
                  ))}
                </div>
              ))}

              <p className="mt-4">
                <strong>Local e Data:</strong> Campinas – SP,{' '}
                {new Date().toLocaleDateString('pt-BR')}
              </p>
              <p>
                <strong>CONTRATANTE:</strong> Seidmann Institute
              </p>
              <p>
                <strong>PRESTADOR(A):</strong>{' '}
                {form.nome.trim() || '________________________________________'}
              </p>
            </div>

            <label className="mt-4 flex items-start gap-3 p-4 rounded-xl border border-orange-200 bg-orange-50/60 cursor-pointer hover:bg-orange-50 transition-colors">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                checked={form.aceiteContrato}
                onChange={(e) => update('aceiteContrato', e.target.checked)}
              />
              <span className="text-sm text-gray-800">
                <strong>Li e concordo</strong> com os termos do{' '}
                <em>Contrato de Prestação de Serviços Educacionais – Professor Online</em> da
                Seidmann Institute, incluindo o valor inicial de hora-aula (R$ 18,00), as condições
                de pagamento e a natureza autônoma da prestação de serviços.{' '}
                <span className="text-red-500">*</span>
              </span>
            </label>
            {errors.aceiteContrato ? (
              <p className="mt-1 text-sm text-red-600">{errors.aceiteContrato}</p>
            ) : null}
          </Card>

          <div className="flex flex-col sm:flex-row sm:justify-end gap-3 pt-2">
            <Button type="submit" disabled={submitting} className="sm:min-w-[200px]">
              {submitting ? 'Enviando...' : 'Enviar cadastro'}
            </Button>
          </div>

          <p className="text-xs text-center text-gray-500 pt-2">
            Ao enviar, você concorda que entraremos em contato para validar seu cadastro e que seus
            dados serão usados exclusivamente para o processo seletivo da Seidmann Institute.
          </p>
        </form>
      </div>
    </div>
  )
}

interface FieldProps {
  label: string
  required?: boolean
  hint?: string
  error?: string
  children: React.ReactNode
}

function Field({ label, required, hint, error, children }: FieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
        {hint ? <span className="text-gray-400 font-normal ml-1">{hint}</span> : null}
      </label>
      {children}
      {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
    </div>
  )
}
