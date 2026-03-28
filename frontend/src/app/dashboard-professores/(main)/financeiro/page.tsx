/**
 * Dashboard Professores – Financeiro
 * Valor por hora, período e resumo do mês (somente leitura; admin define tudo).
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Wallet, Calendar, Clock, DollarSign, CheckCircle, AlertCircle, ThumbsUp, Loader2, FileText, Printer, FileCheck, RotateCcw } from 'lucide-react'
import Button from '@/components/ui/Button'
import Toast from '@/components/admin/Toast'
import Modal from '@/components/admin/Modal'

const MESES_LABELS: Record<number, string> = {
  1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 6: 'Junho',
  7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro',
}
const ANOS_DISPONIVEIS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i)

interface RegistroDetalhado {
  startAt: string
  alunoNome: string
  tempoAulaMinutos: number
  presence: string
  valorRecebido: number
}

interface FinanceiroData {
  professorNome?: string
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
  registrosDetalhados?: RegistroDetalhado[]
  metodoPagamento: string | null
  infosPagamento: string | null
  statusPagamento: 'PAGO' | 'EM_ABERTO' | 'NF_OK_AGUARDANDO' | 'AGUARDANDO_REENVIO'
  pagamentoProntoParaFazer?: boolean
  paymentMarkedPaidAt?: string | null
  valorPago?: number | null
  teacherConfirmedAt: string | null
  proofSentAt: string | null
  proofFileUrl?: string | null
  year: number | null
  month: number | null
}

function formatDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR')
}

function formatMoney(n: number): string {
  return `R$ ${Number(n).toFixed(2).replace('.', ',')}`
}

function presenceLabel(presence: string): string {
  if (presence === 'NAO_COMPARECEU') return 'Não compareceu'
  if (presence === 'ATRASADO') return 'Atrasado'
  return 'Presente'
}

function openPrintExtrato(data: FinanceiroData) {
  const registros = data.registrosDetalhados ?? []
  const linhas = registros
    .map((reg) => {
      const d = new Date(reg.startAt)
      const dataHora = d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
      const valor = `R$ ${Number(reg.valorRecebido).toFixed(2).replace('.', ',')}`
      return `<tr><td>${reg.alunoNome}</td><td>${dataHora}</td><td>${reg.tempoAulaMinutos} min</td><td>${presenceLabel(reg.presence)}</td><td>${valor}</td></tr>`
    })
    .join('')

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Extrato de aulas de prestação de serviços</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 24px; color: #111; max-width: 720px; margin: 0 auto; }
    h1 { font-size: 1.25rem; margin-bottom: 4px; }
    .periodo { font-size: 0.875rem; color: #555; margin-bottom: 16px; }
    .subtitulo { font-size: 1rem; font-weight: 600; margin: 16px 0 4px; }
    .aviso { font-size: 0.75rem; color: #666; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    .valor { text-align: right; font-weight: 600; }
    .total { margin-top: 16px; font-weight: 700; font-size: 1rem; }
  </style>
</head>
<body>
  <h1>Extrato de aulas de prestação de serviços</h1>
  ${data.professorNome ? `<p class="periodo">Professor: ${data.professorNome}</p>` : ''}
  <p class="periodo">Período: ${formatDate(data.dataInicio)} a ${formatDate(data.dataTermino)}</p>
  <p class="subtitulo">Aulas registradas e valor por aula</p>
  <p class="aviso">Em caso de não comparecimento do aluno, o professor recebe o valor completo da aula.</p>
  ${registros.length > 0 ? `
  <table>
    <thead><tr><th>Aluno</th><th>Data e hora</th><th>Duração</th><th>Presença</th><th>Valor</th></tr></thead>
    <tbody>${linhas}</tbody>
  </table>
  <p class="total">Total das aulas registradas: R$ ${Number(data.valorPorHoras).toFixed(2).replace('.', ',')}</p>
  ` : '<p>Nenhuma aula registrada no período.</p>'}
</body>
</html>`
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => {
    win.print()
    win.onafterprint = () => win.close()
  }, 250)
}

function statusPagamentoProfessorDisplay(data: FinanceiroData) {
  if (data.statusPagamento === 'PAGO') {
    return {
      label: 'Pago',
      boxClass: 'bg-green-100',
      Icon: CheckCircle,
      iconClass: 'text-green-600',
    }
  }
  if (data.statusPagamento === 'AGUARDANDO_REENVIO') {
    return {
      label: 'Aguardando reenvio do comprovante',
      boxClass: 'bg-orange-100',
      Icon: RotateCcw,
      iconClass: 'text-orange-700',
    }
  }
  if (data.statusPagamento === 'NF_OK_AGUARDANDO') {
    return {
      label: 'NF conferida — aguardando pagamento',
      boxClass: 'bg-sky-100',
      Icon: FileCheck,
      iconClass: 'text-sky-700',
    }
  }
  if (data.pagamentoProntoParaFazer) {
    return {
      label: 'Pronto para pagamento',
      boxClass: 'bg-green-100',
      Icon: CheckCircle,
      iconClass: 'text-green-700',
    }
  }
  return {
    label: 'Em aberto',
    boxClass: 'bg-amber-100',
    Icon: AlertCircle,
    iconClass: 'text-amber-600',
  }
}

export default function FinanceiroPage() {
  const anoAtual = new Date().getFullYear()
  const mesAtual = new Date().getMonth() + 1
  const [selectedAno, setSelectedAno] = useState<number>(anoAtual)
  const [selectedMes, setSelectedMes] = useState<number>(mesAtual)

  const [data, setData] = useState<FinanceiroData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [comprovanteModalOpen, setComprovanteModalOpen] = useState(false)
  const [confirmacaoStep, setConfirmacaoStep] = useState<1 | 2>(1)
  const [comprovanteMode, setComprovanteMode] = useState<'confirmar' | 'reenviar'>('confirmar')
  const [valorConfirmadoDigitado, setValorConfirmadoDigitado] = useState('')
  const [comprovanteFile, setComprovanteFile] = useState<File | null>(null)
  const [comprovanteMensagem, setComprovanteMensagem] = useState('')
  const [sendingComprovante, setSendingComprovante] = useState(false)

  const fetchData = useCallback(async (ano: number, mes: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/professor/financeiro?year=${ano}&month=${mes}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setData(null)
        setError(json.message || 'Erro ao carregar')
        return
      }
      setData(json.data ?? null)
    } catch {
      setData(null)
      setError('Erro ao carregar dados financeiros')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(selectedAno, selectedMes)
  }, [selectedAno, selectedMes, fetchData])

  const parseMoedaDigitada = (raw: string): number | null => {
    const normalized = raw.replace(/\s/g, '').replace('R$', '').replace(/\./g, '').replace(',', '.')
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : null
  }

  const abrirFluxoConfirmacao = () => {
    setComprovanteModalOpen(true)
    setComprovanteMode('confirmar')
    setConfirmacaoStep(1)
    setValorConfirmadoDigitado('')
    setComprovanteFile(null)
    setComprovanteMensagem(`Segue em anexo a nota fiscal/recibo referente a ${MESES_LABELS[selectedMes]} de ${selectedAno}, referente à prestação de serviços para a Seidmann Institute.`)
  }

  const abrirFluxoReenvio = () => {
    setComprovanteModalOpen(true)
    setComprovanteMode('reenviar')
    setConfirmacaoStep(2)
    setComprovanteFile(null)
    setComprovanteMensagem(`Reenvio do comprovante referente a ${MESES_LABELS[selectedMes]} de ${selectedAno}.`)
  }

  const handleEnviarComprovanteEConfirmar = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!data) return

    const valorDigitado = parseMoedaDigitada(valorConfirmadoDigitado)
    if (valorDigitado == null) {
      setToast({ message: 'Digite o valor a receber para confirmar.', type: 'error' })
      setConfirmacaoStep(1)
      return
    }
    if (Math.abs(valorDigitado - Number(data.valorAPagar)) > 0.009) {
      setToast({ message: `O valor digitado deve ser exatamente ${formatMoney(data.valorAPagar)}.`, type: 'error' })
      setConfirmacaoStep(1)
      return
    }

    if (!comprovanteFile || comprovanteFile.size === 0) {
      setToast({ message: 'Selecione o arquivo (nota fiscal ou recibo).', type: 'error' })
      setConfirmacaoStep(2)
      return
    }

    setSendingComprovante(true)
    setToast(null)
    try {
      const form = new FormData()
      form.append('year', String(selectedAno))
      form.append('month', String(selectedMes))
      form.append('file', comprovanteFile)
      if (comprovanteMensagem.trim()) form.append('mensagem', comprovanteMensagem.trim())
      const resSend = await fetch('/api/professor/financeiro/enviar-comprovante', {
        method: 'POST',
        credentials: 'include',
        body: form,
      })
      const jsonSend = await resSend.json()
      if (!resSend.ok || !jsonSend.ok) {
        setToast({ message: jsonSend.message || 'Erro ao anexar comprovante', type: 'error' })
        return
      }

      const resConfirm = await fetch('/api/professor/financeiro/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ year: selectedAno, month: selectedMes }),
      })
      const jsonConfirm = await resConfirm.json()
      if (!resConfirm.ok || !jsonConfirm.ok) {
        setToast({ message: jsonConfirm.message || 'Comprovante anexado, mas houve erro ao confirmar o valor.', type: 'error' })
        return
      }
      setToast({ message: 'Valor confirmado e comprovante anexado no sistema com sucesso.', type: 'success' })
      setComprovanteModalOpen(false)
      setConfirmacaoStep(1)
      setValorConfirmadoDigitado('')
      setComprovanteFile(null)
      setComprovanteMensagem('')
      await fetchData(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao concluir confirmação com anexo', type: 'error' })
    } finally {
      setSendingComprovante(false)
    }
  }

  const handleReenviarComprovante = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!comprovanteFile || comprovanteFile.size === 0) {
      setToast({ message: 'Selecione o arquivo (nota fiscal ou recibo).', type: 'error' })
      return
    }
    setSendingComprovante(true)
    setToast(null)
    try {
      const form = new FormData()
      form.append('year', String(selectedAno))
      form.append('month', String(selectedMes))
      form.append('file', comprovanteFile)
      if (comprovanteMensagem.trim()) form.append('mensagem', comprovanteMensagem.trim())

      const resSend = await fetch('/api/professor/financeiro/enviar-comprovante', {
        method: 'POST',
        credentials: 'include',
        body: form,
      })
      const jsonSend = await resSend.json()
      if (!resSend.ok || !jsonSend.ok) {
        setToast({ message: jsonSend.message || 'Erro ao reenviar comprovante', type: 'error' })
        return
      }
      setToast({ message: 'Comprovante reenviado e anexado no sistema com sucesso.', type: 'success' })
      setComprovanteModalOpen(false)
      setComprovanteMode('confirmar')
      setConfirmacaoStep(1)
      setComprovanteFile(null)
      setComprovanteMensagem('')
      await fetchData(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao reenviar comprovante', type: 'error' })
    } finally {
      setSendingComprovante(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Financeiro</h1>
      <p className="text-gray-600 mb-6">Informações financeiras e pagamentos (somente consulta). Período e valores são definidos pelo admin.</p>

      <div className="flex flex-wrap items-center gap-4 mb-6">
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Ano</span>
          <select
            value={selectedAno}
            onChange={(e) => setSelectedAno(Number(e.target.value))}
            className="input w-auto min-w-[100px]"
          >
            {ANOS_DISPONIVEIS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Mês</span>
          <select
            value={selectedMes}
            onChange={(e) => setSelectedMes(Number(e.target.value))}
            className="input w-auto min-w-[140px]"
          >
            {Object.entries(MESES_LABELS).map(([num, label]) => (
              <option key={num} value={num}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm">
          {error}
        </div>
      )}

      {loading && (
        <div className="mb-6 text-gray-500">Carregando...</div>
      )}

      {!loading && data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            <div className="p-5 bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-brand-orange/10">
                  <DollarSign className="w-6 h-6 text-brand-orange" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Valor a receber</p>
                  <p className="text-xl font-bold text-gray-900">{formatMoney(data.valorAPagar)}</p>
                </div>
              </div>
            </div>
            <div className="p-5 bg-white rounded-xl border border-gray-200 shadow-sm">
              {(() => {
                const st = statusPagamentoProfessorDisplay(data)
                const Icon = st.Icon
                return (
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${st.boxClass}`}>
                      <Icon className={`w-6 h-6 ${st.iconClass}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Status do pagamento</p>
                      <p className="text-lg font-bold text-gray-900">{st.label}</p>
                    </div>
                  </div>
                )
              })()}
            </div>
            <div className="p-5 bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gray-100">
                  <Wallet className="w-6 h-6 text-gray-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Valor por hora</p>
                  <p className="text-xl font-bold text-gray-900">{formatMoney(data.valorPorHora)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Fluxo principal: confirmar valor e anexar NF/recibo */}
          <div className="mb-6 p-4 bg-white rounded-xl border border-gray-200 shadow-sm space-y-3">
            {data.teacherConfirmedAt ? (
              <>
                {data.statusPagamento === 'AGUARDANDO_REENVIO' && (
                  <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-950">
                    <p className="font-medium">Houve um problema com a nota fiscal ou o recibo</p>
                    <p className="text-orange-900/90 mt-1 text-xs">
                      Envie um novo arquivo (PDF, JPG ou PNG) usando o botão abaixo.
                    </p>
                  </div>
                )}
                {data.statusPagamento === 'NF_OK_AGUARDANDO' && (
                  <p className="text-xs text-sky-800">
                    A administração conferiu sua nota fiscal. O pagamento será feito em breve; você será avisado
                    quando estiver pago.
                  </p>
                )}
                {data.statusPagamento === 'PAGO' ? (
                  <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-green-900">
                    <div className="flex items-start gap-2">
                      <CheckCircle className="w-5 h-5 shrink-0 text-green-700 mt-0.5" />
                      <div className="text-sm space-y-1.5 min-w-0">
                        <p className="font-semibold leading-snug">
                          Valor pago:{' '}
                          {formatMoney(data.valorPago ?? data.valorAPagar)}
                          {data.paymentMarkedPaidAt
                            ? ` no dia ${new Date(data.paymentMarkedPaidAt).toLocaleDateString('pt-BR', {
                                day: '2-digit',
                                month: 'long',
                                year: 'numeric',
                              })}.`
                            : '.'}
                        </p>
                        {!data.paymentMarkedPaidAt ? (
                          <p className="text-xs text-green-900/75">
                            A data exata do registro neste sistema não está disponível para este período.
                          </p>
                        ) : null}
                        {data.proofFileUrl ? (
                          <a
                            href={data.proofFileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-block text-xs font-semibold text-green-800 underline hover:text-green-950"
                          >
                            Ver documento anexado
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-green-700">
                      <CheckCircle className="w-5 h-5 shrink-0" />
                      <span className="font-medium flex flex-wrap items-center gap-x-2 gap-y-1">
                        Valor confirmado em{' '}
                        {new Date(data.teacherConfirmedAt).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric',
                        })}
                        {data.proofSentAt
                          ? ` e comprovante anexado em ${new Date(data.proofSentAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                          : ''}
                        {data.proofFileUrl ? (
                          <>
                            <a
                              href={data.proofFileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="underline font-semibold"
                            >
                              Ver documento anexado
                            </a>
                            <button
                              type="button"
                              onClick={abrirFluxoReenvio}
                              className="underline font-semibold text-green-700 hover:text-green-800"
                            >
                              Reenviar
                            </button>
                          </>
                        ) : null}
                      </span>
                    </div>
                    {!data.proofFileUrl ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                    <p className="font-medium">Anexe a nota fiscal ou o recibo deste período</p>
                    <p className="text-amber-900/90 mt-1 text-xs">
                      Se a administração pediu um novo envio, selecione o arquivo correto abaixo.
                    </p>
                    <Button variant="primary" className="mt-3 w-full md:w-auto" onClick={abrirFluxoReenvio}>
                      Anexar nota fiscal ou recibo
                    </Button>
                  </div>
                ) : null}
                  </>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  Primeiro, confirme seu valor a receber. Em seguida, o sistema pedirá o anexo da nota fiscal ou recibo.
                </p>
                <Button
                  variant="primary"
                  onClick={abrirFluxoConfirmacao}
                  className="w-full md:w-auto min-h-[56px] text-base md:text-lg font-semibold"
                >
                  Confirmar valor e anexar NF/recibo
                </Button>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-lg font-semibold text-gray-800">Período e valores</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Dados do período selecionado (definidos pelo admin). O valor a receber é calculado somente pelas{' '}
                <strong>horas registradas</strong>, nunca pela estimativa.
              </p>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-gray-700">
                  <Calendar className="w-5 h-5 text-gray-400" />
                  <span className="font-medium">Período:</span>
                  <span>{formatDate(data.dataInicio)} a {formatDate(data.dataTermino)}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-700">
                  <Clock className="w-5 h-5 text-gray-400" />
                  <span className="font-medium">Horas registradas:</span>
                  <span>{data.totalHorasRegistradas} h</span>
                </div>
                <div className="text-sm text-gray-500">
                  Registros de aula esperados no período: {data.totalRegistrosEsperados}
                </div>
                {data.registrosDetalhados && data.registrosDetalhados.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">Aulas registradas e valor por aula</p>
                    <p className="text-xs text-gray-500 mb-2">
                      Em caso de não comparecimento do aluno, o professor recebe o valor completo da aula.
                    </p>
                    <ul className="space-y-2 max-h-[8.5rem] overflow-y-auto pr-1 overscroll-contain">
                      {data.registrosDetalhados.map((reg, idx) => {
                        const d = new Date(reg.startAt)
                        const dataHora = d.toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                        return (
                          <li
                            key={idx}
                            className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-gray-50 border border-gray-100 text-sm"
                          >
                            <div>
                              <span className="font-medium text-gray-800">{reg.alunoNome}</span>
                              <span className="text-gray-500 ml-2">{dataHora}</span>
                              <span className="text-gray-500 ml-2">
                                ({reg.tempoAulaMinutos} min – {presenceLabel(reg.presence)})
                              </span>
                            </div>
                            <span className="font-semibold text-gray-900 shrink-0">{formatMoney(reg.valorRecebido)}</span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
                {data.registrosDetalhados && data.registrosDetalhados.length === 0 && data.totalHorasRegistradas === 0 && (
                  <p className="text-sm text-gray-500 mt-2">Nenhuma aula registrada no período.</p>
                )}
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500">Valor por horas (registradas × valor/hora)</p>
                  <p className="text-lg font-semibold text-gray-900">{formatMoney(data.valorPorHoras)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Valor por período</p>
                  <p className="text-lg font-semibold text-gray-900">{formatMoney(data.valorPorPeriodo)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Valores extras</p>
                  <p className="text-lg font-semibold text-gray-900">{formatMoney(data.valorExtra)}</p>
                </div>
                <div className="pt-2 border-t border-gray-200">
                  <p className="text-sm text-gray-500">Valor total a receber</p>
                  <p className="text-xl font-bold text-brand-orange">{formatMoney(data.valorAPagar)}</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => openPrintExtrato(data)}
                className="flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Imprimir meu extrato de aulas de prestação de serviços
              </Button>
            </div>
            {(data.metodoPagamento || data.infosPagamento) && (
              <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 space-y-2">
                {data.metodoPagamento && (
                  <p className="text-sm">
                    <span className="font-medium text-gray-700">Método de pagamento:</span>{' '}
                    <span className="text-gray-800">{data.metodoPagamento}</span>
                  </p>
                )}
                {data.infosPagamento && (
                  <p className="text-sm">
                    <span className="font-medium text-gray-700">Infos de pagamento:</span>{' '}
                    <span className="text-gray-800">{data.infosPagamento}</span>
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {!loading && !data && !error && (
        <div className="max-w-md p-8 bg-gray-50 border border-gray-200 rounded-xl text-center">
          <Wallet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Nenhum dado financeiro disponível para o período.</p>
        </div>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      <Modal
        isOpen={comprovanteModalOpen}
        onClose={() => {
          if (!sendingComprovante) {
            setComprovanteModalOpen(false)
            setComprovanteMode('confirmar')
            setConfirmacaoStep(1)
            setValorConfirmadoDigitado('')
            setComprovanteFile(null)
            setComprovanteMensagem('')
          }
        }}
        title={
          comprovanteMode === 'reenviar'
            ? 'Reenviar nota fiscal ou recibo'
            : confirmacaoStep === 1
              ? 'Confirmar valor a receber'
              : 'Anexar nota fiscal ou recibo'
        }
        size="md"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setComprovanteModalOpen(false)
                setComprovanteMode('confirmar')
                setConfirmacaoStep(1)
                setValorConfirmadoDigitado('')
                setComprovanteFile(null)
                setComprovanteMensagem('')
              }}
              disabled={sendingComprovante}
            >
              Cancelar
            </Button>
            {comprovanteMode === 'confirmar' && confirmacaoStep === 1 ? (
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  if (!data) return
                  const valorDigitado = parseMoedaDigitada(valorConfirmadoDigitado)
                  if (valorDigitado == null || Math.abs(valorDigitado - Number(data.valorAPagar)) > 0.009) {
                    setToast({ message: `Digite exatamente o valor ${formatMoney(data.valorAPagar)} para continuar.`, type: 'error' })
                    return
                  }
                  setConfirmacaoStep(2)
                }}
              >
                Continuar para anexo
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                disabled={sendingComprovante || !comprovanteFile}
                onClick={() => {
                  if (!comprovanteFile?.size) return
                  if (comprovanteMode === 'reenviar') {
                    handleReenviarComprovante()
                    return
                  }
                  handleEnviarComprovanteEConfirmar()
                }}
              >
                {sendingComprovante ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {comprovanteMode === 'reenviar' ? 'Reenviando...' : 'Confirmando e anexando...'}
                  </>
                ) : (
                  comprovanteMode === 'reenviar' ? 'Reenviar comprovante' : 'Confirmar valor e anexar'
                )}
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          {confirmacaoStep === 1 ? (
            <>
              <p className="text-sm text-gray-600">
                Para confirmar, digite o valor exatamente como aparece abaixo.
              </p>
              <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                <p className="text-xs text-gray-500">Valor a receber neste período</p>
                <p className="text-2xl font-bold text-gray-900">{data ? formatMoney(data.valorAPagar) : '—'}</p>
              </div>
              <div>
                <label htmlFor="confirmar-valor-digitado" className="block text-sm font-semibold text-gray-700 mb-1">
                  Digite o valor para confirmar *
                </label>
                <input
                  id="confirmar-valor-digitado"
                  name="confirmar-valor-digitado"
                  type="text"
                  value={valorConfirmadoDigitado}
                  onChange={(e) => setValorConfirmadoDigitado(e.target.value)}
                  className="input w-full"
                  placeholder={data ? formatMoney(data.valorAPagar) : 'R$ 0,00'}
                  aria-required="true"
                />
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Agora anexe a nota fiscal ou recibo para concluir a confirmação.
              </p>
              <div>
                <label htmlFor="comprovante-professor" className="block text-sm font-semibold text-gray-700 mb-1">Professor</label>
                <input
                  id="comprovante-professor"
                  name="professor"
                  type="text"
                  value={data?.professorNome ?? ''}
                  readOnly
                  className="input w-full bg-gray-100"
                  aria-label="Nome do professor"
                />
              </div>
              <div>
                <label htmlFor="comprovante-anexo" className="block text-sm font-semibold text-gray-700 mb-1">Anexo (nota fiscal ou recibo) *</label>
                <input
                  id="comprovante-anexo"
                  name="anexo"
                  type="file"
                  accept=".pdf,image/jpeg,image/png,image/gif,image/webp"
                  onChange={(e) => setComprovanteFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-brand-orange file:text-white hover:file:bg-orange-600"
                  aria-required="true"
                  aria-label="Anexar nota fiscal ou recibo"
                />
                <p className="text-xs text-gray-500 mt-1">PDF ou imagem (JPG, PNG, GIF, WebP). Máximo 10 MB.</p>
              </div>
              <div>
                <label htmlFor="comprovante-mensagem" className="block text-sm font-semibold text-gray-700 mb-1">Observação (opcional)</label>
                <textarea
                  id="comprovante-mensagem"
                  name="mensagem"
                  value={comprovanteMensagem}
                  onChange={(e) => setComprovanteMensagem(e.target.value)}
                  className="input w-full min-h-[100px]"
                  placeholder="Ex.: referência do comprovante, observações para o financeiro, etc."
                  rows={4}
                  aria-label="Observação do comprovante"
                />
                <p className="text-xs text-gray-500 mt-1">A observação fica registrada junto ao anexo no sistema.</p>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}
