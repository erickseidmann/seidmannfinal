/**
 * Dashboard Professores – Financeiro
 * Valor por hora, período e resumo do mês (somente leitura; admin define tudo).
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Wallet, Calendar, Clock, DollarSign, CheckCircle, AlertCircle, ThumbsUp, Loader2, FileText, Printer } from 'lucide-react'
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
  statusPagamento: 'PAGO' | 'EM_ABERTO'
  teacherConfirmedAt: string | null
  proofSentAt: string | null
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

  const handleEnviarComprovante = async (e?: React.FormEvent) => {
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
      const res = await fetch('/api/professor/financeiro/enviar-comprovante', {
        method: 'POST',
        credentials: 'include',
        body: form,
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao enviar comprovante', type: 'error' })
        return
      }
      setToast({ message: json.data?.message || 'Comprovante enviado. Agora você pode confirmar o valor.', type: 'success' })
      setComprovanteModalOpen(false)
      setComprovanteFile(null)
      setComprovanteMensagem('')
      await fetchData(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao enviar comprovante', type: 'error' })
    } finally {
      setSendingComprovante(false)
    }
  }

  const handleConfirmarValor = async () => {
    setConfirming(true)
    setToast(null)
    try {
      const res = await fetch('/api/professor/financeiro/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ year: selectedAno, month: selectedMes }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao confirmar', type: 'error' })
        return
      }
      setToast({ message: json.message || 'Valor confirmado. O admin verá "pagamento pronto para fazer".', type: 'success' })
      await fetchData(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao confirmar valor', type: 'error' })
    } finally {
      setConfirming(false)
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
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${data.statusPagamento === 'PAGO' ? 'bg-green-100' : 'bg-amber-100'}`}>
                  {data.statusPagamento === 'PAGO' ? (
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  ) : (
                    <AlertCircle className="w-6 h-6 text-amber-600" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Status do pagamento</p>
                  <p className="text-lg font-bold text-gray-900">
                    {data.statusPagamento === 'PAGO' ? 'Pago' : 'Em aberto'}
                  </p>
                </div>
              </div>
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

          {/* Enviar nota fiscal ou recibo – obrigatório antes de confirmar valor */}
          <div className="mb-6 p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Nota fiscal ou recibo</h3>
            {data.proofSentAt ? (
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle className="w-5 h-5 shrink-0" />
                <span className="text-sm font-medium">
                  Comprovante enviado em {new Date(data.proofSentAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} para financeiro@seidmanninstitute.com
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-gray-600">
                  Envie a nota fiscal ou recibo referente a {MESES_LABELS[selectedMes]} de {selectedAno}. O e-mail será enviado para financeiro@seidmanninstitute.com. Só depois você poderá confirmar o valor a receber.
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setComprovanteModalOpen(true)
                    setComprovanteFile(null)
                    setComprovanteMensagem(`Segue em anexo a nota fiscal/recibo referente a ${MESES_LABELS[selectedMes]} de ${selectedAno}, referente à prestação de serviços para a Seidmann Institute.`)
                  }}
                  className="flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  Enviar nota fiscal ou recibo
                </Button>
              </div>
            )}
          </div>

          <div className="mb-6 p-4 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
            {data.teacherConfirmedAt ? (
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">
                  Valor confirmado em {new Date(data.teacherConfirmedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                </span>
              </div>
            ) : (
              <p className="text-sm text-gray-600">
                {data.proofSentAt
                  ? 'Confirme o valor a receber para que o admin veja "pagamento pronto para fazer".'
                  : 'Envie primeiro a nota fiscal ou recibo acima para poder confirmar o valor a receber.'}
              </p>
            )}
            {!data.teacherConfirmedAt && (
              <Button
                variant="primary"
                onClick={handleConfirmarValor}
                disabled={confirming || !data.proofSentAt}
                title={!data.proofSentAt ? 'Envie a nota fiscal ou recibo antes' : undefined}
              >
                {confirming ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Confirmando...
                  </>
                ) : (
                  <>
                    <ThumbsUp className="w-4 h-4 mr-2" />
                    Confirmar valor a receber
                  </>
                )}
              </Button>
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
            setComprovanteFile(null)
            setComprovanteMensagem('')
          }
        }}
        title="Enviar nota fiscal ou recibo"
        size="md"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setComprovanteModalOpen(false)
                setComprovanteFile(null)
                setComprovanteMensagem('')
              }}
              disabled={sendingComprovante}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={sendingComprovante || !comprovanteFile}
              onClick={() => {
                if (comprovanteFile?.size) handleEnviarComprovante()
              }}
            >
              {sendingComprovante ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                'Enviar'
              )}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            O e-mail será enviado para <strong>financeiro@seidmanninstitute.com</strong> com seu nome, o período e o modelo abaixo. Anexe o comprovante (PDF ou imagem).
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
            <label htmlFor="comprovante-mensagem" className="block text-sm font-semibold text-gray-700 mb-1">Mensagem do e-mail (modelo)</label>
            <textarea
              id="comprovante-mensagem"
              name="mensagem"
              value={comprovanteMensagem}
              onChange={(e) => setComprovanteMensagem(e.target.value)}
              className="input w-full min-h-[100px]"
              placeholder="Segue em anexo a nota fiscal/recibo referente ao mês de ... referente à prestação de serviços para a Seidmann Institute."
              rows={4}
              aria-label="Mensagem do e-mail"
            />
            <p className="text-xs text-gray-500 mt-1">Esta mensagem será enviada no corpo do e-mail. Você pode editar o texto acima.</p>
          </div>
        </div>
      </Modal>
    </div>
  )
}
