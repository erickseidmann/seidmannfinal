/**
 * Dashboard Aluno – Financeiro (mensalidade, status de pagamento e PIX por mês).
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Wallet, Calendar, DollarSign, CheckCircle, AlertCircle, Copy, ExternalLink, FileText, Download } from 'lucide-react'
import Button from '@/components/ui/Button'

const MESES_LABELS: Record<number, string> = {
  1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 6: 'Junho',
  7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro',
}
const ANOS_DISPONIVEIS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i)

interface FinanceiroData {
  valorMensal: number | null
  statusMes: string | null
  notaFiscalEmitida: boolean | null
  diaPagamento: number | null
  dataUltimoPagamento: string | null
  metodoPagamento: string | null
  year: number
  month: number
  enrollmentId: string
}

type PixDataState =
  | { state: 'loading' }
  | { state: 'paid'; paidAt: string | null }
  | { state: 'unpaid'; valor: number; vencimento: string | null; pixQrCode: string | null; pixCopiaECola: string | null; boletoUrl: string | null; boletoLinhaDigitavel: string | null }
  | { state: 'no_charge'; message: string }
  | { state: 'error' }
  | null

function formatMoney(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDateLong(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function statusLabel(status: string | null): string {
  if (!status) return '—'
  const map: Record<string, string> = {
    PAGO: 'Pago',
    PENDING: 'Pendente',
    ATRASADO: 'Atrasado',
    EM_ABERTO: 'Em aberto',
  }
  return map[status] || status
}

function getQrCodeSrc(pixQrCode: string): string {
  if (pixQrCode.startsWith('data:')) return pixQrCode
  if (pixQrCode.startsWith('http://') || pixQrCode.startsWith('https://')) return pixQrCode
  return `data:image/png;base64,${pixQrCode}`
}

export default function FinanceiroAlunoPage() {
  const anoAtual = new Date().getFullYear()
  const mesAtual = new Date().getMonth() + 1
  const [selectedAno, setSelectedAno] = useState<number>(anoAtual)
  const [selectedMes, setSelectedMes] = useState<number>(mesAtual)

  const [data, setData] = useState<FinanceiroData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [pixData, setPixData] = useState<PixDataState>(null)
  const [pixCopied, setPixCopied] = useState(false)
  const [linhaCopied, setLinhaCopied] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Notas Fiscais
  const [nfseYear, setNfseYear] = useState<number>(anoAtual)
  const [nfseNotas, setNfseNotas] = useState<Array<{
    numero: string | null
    mes: number
    ano: number
    valor: number
    pdfUrl: string | null
    status: string
    codigoVerificacao: string | null
    dataEmissao: string
  }>>([])
  const [nfseLoading, setNfseLoading] = useState(false)
  const [nfseEnabled, setNfseEnabled] = useState(true)

  const fetchData = useCallback(async (ano: number, mes: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/student/financeiro?year=${ano}&month=${mes}`, { credentials: 'include' })
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

  const fetchPix = useCallback(async (ano: number, mes: number, silent = false): Promise<void> => {
    if (!silent) setPixData({ state: 'loading' })
    try {
      const res = await fetch(`/api/student/financeiro/pix?year=${ano}&month=${mes}`, { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPixData({ state: 'error' })
        return
      }
      if (json.ok && json.paid) {
        setPixData({ state: 'paid', paidAt: json.paidAt ?? null })
        return
      }
      if (json.ok && json.paid === false) {
        setPixData({
          state: 'unpaid',
          valor: json.valor ?? 0,
          vencimento: json.vencimento ?? null,
          pixQrCode: json.pixQrCode ?? null,
          pixCopiaECola: json.pixCopiaECola ?? null,
          boletoUrl: json.boletoUrl ?? null,
          boletoLinhaDigitavel: json.boletoLinhaDigitavel ?? null,
        })
        return
      }
      if (json.ok === false) {
        setPixData({ state: 'no_charge', message: json.message || 'Nenhuma cobrança disponível para este mês. Entre em contato com a secretaria.' })
        return
      }
      setPixData({ state: 'error' })
    } catch {
      setPixData({ state: 'error' })
    }
  }, [])

  useEffect(() => {
    fetchData(selectedAno, selectedMes)
  }, [selectedAno, selectedMes, fetchData])

  useEffect(() => {
    fetchPix(selectedAno, selectedMes)
  }, [selectedAno, selectedMes, fetchPix])

  /** Polling: a cada 30s quando aguardando pagamento. */
  useEffect(() => {
    if (pixData?.state !== 'unpaid') return
    pollRef.current = setInterval(() => {
      fetchPix(selectedAno, selectedMes, true)
    }, 30_000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [pixData?.state, selectedAno, selectedMes, fetchPix])

  const handleCopyPix = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setPixCopied(true)
      setTimeout(() => setPixCopied(false), 2000)
    })
  }, [])

  const handleCopyLinha = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setLinhaCopied(true)
      setTimeout(() => setLinhaCopied(false), 2000)
    })
  }, [])

  const fetchNfse = useCallback(async (year: number) => {
    setNfseLoading(true)
    try {
      const res = await fetch(`/api/student/nfse?year=${year}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        if (json.enabled === false) {
          setNfseEnabled(false)
          setNfseNotas([])
          return
        }
        setNfseNotas([])
        return
      }
      setNfseEnabled(true)
      setNfseNotas(json.notas || [])
    } catch {
      setNfseNotas([])
    } finally {
      setNfseLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNfse(nfseYear)
  }, [nfseYear, fetchNfse])

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Financeiro</h1>
      <p className="text-gray-600 mb-6">
        Valor da mensalidade, status de pagamento e pagamento via PIX ou boleto.
      </p>

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
                  <p className="text-sm font-medium text-gray-500">Valor da mensalidade</p>
                  <p className="text-xl font-bold text-gray-900">
                    {data.valorMensal != null ? formatMoney(data.valorMensal) : '—'}
                  </p>
                </div>
              </div>
            </div>
            <div className="p-5 bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${data.statusMes === 'PAGO' ? 'bg-green-100' : 'bg-amber-100'}`}>
                  {data.statusMes === 'PAGO' ? (
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  ) : (
                    <AlertCircle className="w-6 h-6 text-amber-600" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Status do mês</p>
                  <p className="text-lg font-bold text-gray-900">
                    {statusLabel(data.statusMes)}
                  </p>
                </div>
              </div>
            </div>
            <div className="p-5 bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gray-100">
                  <Calendar className="w-6 h-6 text-gray-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Dia de pagamento</p>
                  <p className="text-xl font-bold text-gray-900">
                    {data.diaPagamento != null ? `${data.diaPagamento}º` : '—'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-lg font-semibold text-gray-800">
                {MESES_LABELS[data.month]} de {data.year}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">Resumo financeiro do mês selecionado</p>
            </div>
            <div className="p-6 space-y-4">
              {data.metodoPagamento && (
                <p className="text-sm">
                  <span className="font-medium text-gray-700">Método de pagamento:</span>{' '}
                  <span className="text-gray-800">{data.metodoPagamento}</span>
                </p>
              )}
              {data.dataUltimoPagamento && (
                <p className="text-sm">
                  <span className="font-medium text-gray-700">Último pagamento registrado:</span>{' '}
                  <span className="text-gray-800">
                    {new Date(data.dataUltimoPagamento).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                </p>
              )}
              {data.notaFiscalEmitida === true && (
                <p className="text-sm text-green-700 font-medium">Nota fiscal emitida para este mês.</p>
              )}
            </div>
          </div>

          {/* Seção de pagamento PIX/Boleto */}
          {pixData?.state === 'loading' && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center gap-3 text-gray-500">
                <div className="animate-pulse w-8 h-8 rounded-full bg-gray-200" />
                <span>Carregando opções de pagamento...</span>
              </div>
            </div>
          )}

          {pixData?.state === 'paid' && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-6 shadow-sm transition-opacity duration-300">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-green-100">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-green-900">Pagamento confirmado! ✓</h3>
                  {pixData.paidAt && (
                    <p className="text-sm text-green-800 mt-0.5">
                      Pago em {formatDateLong(pixData.paidAt)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {pixData?.state === 'unpaid' && pixData && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-lg font-semibold text-gray-800">
                  Mensalidade {MESES_LABELS[data.month]} {data.year}
                </h2>
                <div className="flex flex-wrap gap-4 mt-2 text-sm">
                  <span><strong>Valor:</strong> {formatMoney(pixData.valor)}</span>
                  {pixData.vencimento && <span><strong>Vencimento:</strong> {formatDate(pixData.vencimento)}</span>}
                  <span>
                    <strong>Status:</strong>{' '}
                    <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">Aguardando pagamento</span>
                  </span>
                </div>
              </div>
              <div className="p-6">
                <div className="flex flex-col lg:flex-row gap-8 items-start">
                  {pixData.pixQrCode && (
                    <div className="flex flex-col items-center lg:items-start">
                      <div className="w-[200px] h-[200px] min-w-[200px] min-h-[200px] flex items-center justify-center bg-white border border-gray-200 rounded-lg p-2">
                        <img
                          src={getQrCodeSrc(pixData.pixQrCode)}
                          alt="QR Code PIX"
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                      <p className="mt-3 text-sm font-medium text-gray-700">Pague com PIX</p>
                      <p className="text-xs text-gray-500">Escaneie o QR Code ou copie o código abaixo</p>
                    </div>
                  )}
                  <div className="flex-1 w-full min-w-0 space-y-4">
                    {pixData.pixCopiaECola && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Código PIX copia e cola</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            readOnly
                            value={pixData.pixCopiaECola}
                            className="input flex-1 min-w-0 text-sm font-mono"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyPix(pixData.pixCopiaECola!)}
                            className="shrink-0"
                          >
                            {pixCopied ? (
                              <>Copiado!</>
                            ) : (
                              <>
                                <Copy className="w-4 h-4 mr-2" />
                                Copiar
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    )}

                    {(pixData.boletoUrl || pixData.boletoLinhaDigitavel) && (
                      <>
                        {(pixData.pixQrCode || pixData.pixCopiaECola) && (
                          <div className="border-t border-gray-200 pt-4 mt-4">
                            <p className="text-sm text-gray-500 mb-2">— ou —</p>
                          </div>
                        )}
                        {pixData.boletoUrl && (
                          <a
                            href={pixData.boletoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 text-sm font-medium"
                          >
                            <ExternalLink className="w-4 h-4" />
                            Baixar Boleto
                          </a>
                        )}
                        {pixData.boletoLinhaDigitavel && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Linha digitável do boleto</label>
                            <p className="text-xs text-gray-600 font-mono break-all mb-2">{pixData.boletoLinhaDigitavel}</p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCopyLinha(pixData.boletoLinhaDigitavel!)}
                            >
                              {linhaCopied ? (
                                <>Copiado!</>
                              ) : (
                                <>
                                  <Copy className="w-4 h-4 mr-2" />
                                  Copiar linha
                                </>
                              )}
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {pixData?.state === 'no_charge' && data.statusMes !== 'PAGO' && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
              <p className="text-gray-600">
                Nenhuma cobrança disponível para este mês. Entre em contato com a secretaria.
              </p>
            </div>
          )}
        </>
      )}

      {!loading && !data && !error && (
        <div className="max-w-md p-8 bg-gray-50 border border-gray-200 rounded-xl text-center">
          <Wallet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Nenhum dado financeiro disponível para o período.</p>
        </div>
      )}

      {/* Seção de Notas Fiscais */}
      {nfseEnabled && (
        <div className="mt-8 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-gray-600" />
                <h2 className="text-lg font-semibold text-gray-800">Minhas Notas Fiscais</h2>
              </div>
              <label className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Ano:</span>
                <select
                  value={nfseYear}
                  onChange={(e) => setNfseYear(Number(e.target.value))}
                  className="input w-auto min-w-[100px] text-sm"
                >
                  {ANOS_DISPONIVEIS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {nfseLoading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-pulse w-8 h-8 rounded-full bg-gray-200 mb-2" />
              <p className="text-gray-500 text-sm">Carregando notas fiscais...</p>
            </div>
          ) : nfseNotas.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">Nenhuma nota fiscal emitida para este período.</p>
            </div>
          ) : (
            <>
              {/* Desktop: Tabela */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Mês</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Valor</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Nº Nota</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Download</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {nfseNotas.map((nota) => (
                      <tr key={`${nota.ano}-${nota.mes}`} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {MESES_LABELS[nota.mes]?.slice(0, 3)}/{nota.ano.toString().slice(-2)}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">{formatMoney(nota.valor)}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{nota.numero ? `#${nota.numero}` : '—'}</td>
                        <td className="px-6 py-4">
                          {nota.pdfUrl ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(nota.pdfUrl!, '_blank')}
                              className="text-xs"
                            >
                              <FileText className="w-3.5 h-3.5 mr-1.5" />
                              PDF
                            </Button>
                          ) : (
                            <span className="text-xs text-gray-500">Pendente</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile: Cards */}
              <div className="md:hidden divide-y divide-gray-200">
                {nfseNotas.map((nota) => (
                  <div key={`${nota.ano}-${nota.mes}`} className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium text-gray-900">
                          {MESES_LABELS[nota.mes]} de {nota.ano}
                        </p>
                        <p className="text-sm text-gray-600 mt-0.5">{formatMoney(nota.valor)}</p>
                      </div>
                      {nota.numero && (
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                          #{nota.numero}
                        </span>
                      )}
                    </div>
                    <div className="mt-3">
                      {nota.pdfUrl ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(nota.pdfUrl!, '_blank')}
                          className="w-full"
                        >
                          <FileText className="w-4 h-4 mr-2" />
                          Baixar PDF
                        </Button>
                      ) : (
                        <span className="text-xs text-gray-500">Pendente</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-6 py-4 bg-blue-50 border-t border-gray-200">
                <p className="text-xs text-blue-700 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>Notas fiscais são geradas automaticamente após confirmação do pagamento.</span>
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
