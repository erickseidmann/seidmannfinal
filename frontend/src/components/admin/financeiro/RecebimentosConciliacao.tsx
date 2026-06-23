'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Hash,
  Link2,
  Loader2,
  Ban,
  AlertTriangle,
  Plus,
  Trash2,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/admin/Modal'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import SeidmannLoading from '@/components/ui/SeidmannLoading'
import {
  MIN_JUSTIFICATIVA_CONCILIACAO_LENGTH,
  requiresRecebimentoJustificativa,
} from '@/lib/payments/recebimento-justificativa'

export interface RecebimentoAllocation {
  id?: string
  enrollmentId: string
  enrollmentNome: string
  valorCentavos: number
}

export interface RecebimentoItem {
  id: string
  provider: string
  providerPaymentId: string
  valor: number
  dataPagamento: string
  metodo: string | null
  documentoPagador: string | null
  nomePagador: string | null
  txid: string | null
  endToEndId: string | null
  referencia: string | null
  status: string
  divergenciaValor: boolean
  justificativaConciliacao: string | null
  semCobrancaAberta: boolean
  mesAnteriorReferenciaPendente?: boolean
  enrollmentId: string | null
  enrollmentNome: string | null
  allocations?: RecebimentoAllocation[]
  createdAt: string
}

interface AlocacaoLinha {
  enrollmentId: string
  nome: string
  email: string
  valorReais: string
  valorMensalidade: number | null
}

function formatReaisInput(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return ''
  return value.toFixed(2).replace('.', ',')
}

function parseReaisToCentavos(s: string): number {
  const cleaned = s.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  if (Number.isNaN(n) || n <= 0) return 0
  return Math.round(n * 100)
}

interface AlunoBusca {
  id: string
  nome: string
  email: string
  cpf: string | null
  valorMensalidade: number | null
}

interface CandidatoDocumento {
  enrollmentId: string
  nome: string
  email: string
  cpf: string | null
  valorMensalidade: number | null
}

const PROVIDER_LABELS: Record<string, string> = {
  CORA: 'Cora',
  INFINITEPAY: 'InfinitePay',
  SANTANDER: 'Santander',
  LIXEL: 'Lixel',
}

function formatMoneyCents(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100)
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

function providerBadgeClass(provider: string): string {
  const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold'
  switch (provider) {
    case 'CORA':
      return `${base} bg-indigo-100 text-indigo-800`
    case 'INFINITEPAY':
      return `${base} bg-purple-100 text-purple-800`
    case 'SANTANDER':
      return `${base} bg-red-100 text-red-800`
    case 'LIXEL':
      return `${base} bg-teal-100 text-teal-800`
    default:
      return `${base} bg-gray-100 text-gray-700`
  }
}

function conciliacaoStatusBadge(r: RecebimentoItem): { label: string; className: string } {
  const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold'
  if (r.status === 'VINCULADO' && r.mesAnteriorReferenciaPendente) {
    return {
      label: 'Mês anterior pago',
      className: `${base} bg-red-100 text-red-800`,
    }
  }
  if (r.status === 'VINCULADO') {
    return { label: 'Conciliado', className: `${base} bg-green-100 text-green-800` }
  }
  if (r.status === 'IGNORADO') {
    return { label: 'Ignorado', className: `${base} bg-gray-100 text-gray-600` }
  }
  if (r.divergenciaValor) {
    return { label: 'Valor divergente', className: `${base} bg-yellow-100 text-yellow-800` }
  }
  return { label: 'Pendente', className: `${base} bg-orange-100 text-orange-800` }
}

const PAGE_SIZE = 20

interface Props {
  onToast: (message: string, type: 'success' | 'error') => void
  onVinculado?: () => void
  /** card = seção recolhível (legado); page = página dedicada, sempre expandida */
  variant?: 'card' | 'page'
}

export default function RecebimentosConciliacao({
  onToast,
  onVinculado,
  variant = 'card',
}: Props) {
  const { confirm, ConfirmDialog } = useConfirmDialog()
  const isPage = variant === 'page'
  const [expanded, setExpanded] = useState(true)
  const [filtroIdentificador, setFiltroIdentificador] = useState('')
  const [filtroProvider, setFiltroProvider] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<RecebimentoItem[]>([])
  const [total, setTotal] = useState(0)
  const [totalPendentes, setTotalPendentes] = useState(0)

  const [vincularId, setVincularId] = useState<string | null>(null)
  const [buscaAluno, setBuscaAluno] = useState('')
  const [alunosBusca, setAlunosBusca] = useState<AlunoBusca[]>([])
  const [candidatosDoc, setCandidatosDoc] = useState<CandidatoDocumento[]>([])
  const [candidatosLoading, setCandidatosLoading] = useState(false)
  const [alocacoes, setAlocacoes] = useState<AlocacaoLinha[]>([])
  const [justificativaConciliacao, setJustificativaConciliacao] = useState('')
  const [buscaLoading, setBuscaLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  const fetchRecebimentos = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      })
      if (filtroStatus) params.set('status', filtroStatus)
      if (filtroProvider) params.set('provider', filtroProvider)
      if (filtroIdentificador.trim()) params.set('q', filtroIdentificador.trim())

      const res = await fetch(`/api/admin/financeiro/recebimentos?${params}`, {
        credentials: 'include',
      })
      const countParams = new URLSearchParams({
        status: 'PENDENTE',
        page: '1',
        pageSize: '1',
      })
      if (filtroProvider) countParams.set('provider', filtroProvider)

      const [json, countRes] = await Promise.all([
        res.json(),
        fetch(`/api/admin/financeiro/recebimentos?${countParams}`, {
          credentials: 'include',
        }).then((r) => r.json()),
      ])
      if (json.ok) {
        setItems(json.data.items ?? [])
        setTotal(json.data.total ?? 0)
      } else {
        onToast(json.message ?? 'Erro ao carregar recebimentos', 'error')
      }
      if (countRes.ok) {
        setTotalPendentes(countRes.data.total ?? 0)
      }
    } catch {
      onToast('Erro ao carregar recebimentos', 'error')
    } finally {
      setLoading(false)
    }
  }, [filtroIdentificador, filtroProvider, filtroStatus, page, onToast])

  useEffect(() => {
    setPage(1)
  }, [filtroIdentificador, filtroProvider, filtroStatus])

  useEffect(() => {
    const t = setTimeout(() => {
      fetchRecebimentos()
    }, 300)
    return () => clearTimeout(t)
  }, [fetchRecebimentos])

  useEffect(() => {
    if (!vincularId) {
      setCandidatosDoc([])
      return
    }
    setCandidatosLoading(true)
    fetch(`/api/admin/financeiro/recebimentos/${vincularId}/candidatos`, {
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) {
          setCandidatosDoc(json.data.items ?? [])
        }
      })
      .finally(() => setCandidatosLoading(false))
  }, [vincularId])

  useEffect(() => {
    if (!vincularId || buscaAluno.trim().length < 2) {
      setAlunosBusca([])
      return
    }
    const t = setTimeout(async () => {
      setBuscaLoading(true)
      try {
        const res = await fetch(
          `/api/admin/financeiro/recebimentos/buscar-aluno?q=${encodeURIComponent(buscaAluno.trim())}`,
          { credentials: 'include' }
        )
        const json = await res.json()
        if (json.ok) setAlunosBusca(json.data.items ?? [])
      } finally {
        setBuscaLoading(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [buscaAluno, vincularId])

  const recebimentoAtual = items.find((i) => i.id === vincularId)

  const addAlunoToAlocacoes = (aluno: {
    enrollmentId: string
    nome: string
    email: string
    valorMensalidade: number | null
  }) => {
    if (alocacoes.some((a) => a.enrollmentId === aluno.enrollmentId)) return
    const defaultReais =
      aluno.valorMensalidade ??
      (recebimentoAtual ? recebimentoAtual.valor / 100 : 0)
    setAlocacoes((prev) => [
      ...prev,
      {
        enrollmentId: aluno.enrollmentId,
        nome: aluno.nome,
        email: aluno.email,
        valorReais: formatReaisInput(defaultReais),
        valorMensalidade: aluno.valorMensalidade,
      },
    ])
    setBuscaAluno('')
    setAlunosBusca([])
  }

  const removeAlocacao = (enrollmentId: string) => {
    setAlocacoes((prev) => prev.filter((a) => a.enrollmentId !== enrollmentId))
  }

  const updateValorAlocacao = (enrollmentId: string, valorReais: string) => {
    setAlocacoes((prev) =>
      prev.map((a) =>
        a.enrollmentId === enrollmentId ? { ...a, valorReais } : a
      )
    )
  }

  const somaAlocadaCentavos = alocacoes.reduce(
    (s, a) => s + parseReaisToCentavos(a.valorReais),
    0
  )

  const justificativaObrigatoria =
    recebimentoAtual != null &&
    alocacoes.length > 0 &&
    requiresRecebimentoJustificativa({
      divergenciaValor: recebimentoAtual.divergenciaValor,
      valorRecebimentoCentavos: recebimentoAtual.valor,
      alocacoes: alocacoes.map((a) => ({
        valorCentavos: parseReaisToCentavos(a.valorReais),
        valorMensalidadeCentavos:
          a.valorMensalidade != null ? Math.round(a.valorMensalidade * 100) : null,
      })),
    })

  const openVincular = (id: string) => {
    setVincularId(id)
    setBuscaAluno('')
    setAlunosBusca([])
    setAlocacoes([])
    setJustificativaConciliacao('')
  }

  const closeVincular = () => {
    setVincularId(null)
    setBuscaAluno('')
    setAlocacoes([])
    setJustificativaConciliacao('')
  }

  const handleVincular = async () => {
    if (!vincularId || alocacoes.length === 0) return
    const payload = alocacoes
      .map((a) => ({
        enrollmentId: a.enrollmentId,
        valorCentavos: parseReaisToCentavos(a.valorReais),
      }))
      .filter((a) => a.valorCentavos > 0)

    if (payload.length === 0) {
      onToast('Informe valores válidos para cada aluno', 'error')
      return
    }
    if (payload.reduce((s, a) => s + a.valorCentavos, 0) > (recebimentoAtual?.valor ?? 0)) {
      onToast('A soma alocada excede o valor do pagamento', 'error')
      return
    }

    if (
      justificativaObrigatoria &&
      justificativaConciliacao.trim().length < MIN_JUSTIFICATIVA_CONCILIACAO_LENGTH
    ) {
      onToast(
        `Informe uma justificativa com no mínimo ${MIN_JUSTIFICATIVA_CONCILIACAO_LENGTH} caracteres`,
        'error'
      )
      return
    }

    setActionLoading(true)
    try {
      const justificativaPayload =
        justificativaConciliacao.trim().length > 0
          ? { justificativaConciliacao: justificativaConciliacao.trim() }
          : {}

      const body =
        payload.length === 1 &&
        payload[0].valorCentavos === recebimentoAtual?.valor
          ? { enrollmentId: payload[0].enrollmentId, ...justificativaPayload }
          : { alocacoes: payload, ...justificativaPayload }

      const res = await fetch(
        `/api/admin/financeiro/recebimentos/${vincularId}/vincular`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      )
      const json = await res.json()
      if (json.ok) {
        onToast('Pagamento vinculado com sucesso', 'success')
        closeVincular()
        fetchRecebimentos()
        onVinculado?.()
      } else {
        onToast(json.message ?? 'Erro ao vincular', 'error')
      }
    } catch {
      onToast('Erro ao vincular', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleIgnorar = async (id: string) => {
    const ok = await confirm({
      title: 'Ignorar recebimento',
      message: 'Ignorar este recebimento? Não será possível reabrir na v1.',
      confirmLabel: 'Ignorar',
      variant: 'danger',
    })
    if (!ok) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/financeiro/recebimentos/${id}/ignorar`, {
        method: 'POST',
        credentials: 'include',
      })
      const json = await res.json()
      if (json.ok) {
        onToast('Recebimento ignorado', 'success')
        fetchRecebimentos()
      } else {
        onToast(json.message ?? 'Erro ao ignorar', 'error')
      }
    } catch {
      onToast('Erro ao ignorar', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const showContent = isPage || expanded

  return (
    <>
      <div
        className={
          isPage
            ? ''
            : 'rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden'
        }
      >
        {!isPage && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center gap-2 px-5 py-4 text-left text-base font-semibold text-gray-800 hover:bg-gray-50"
          >
            <Hash className="w-5 h-5 text-brand-orange shrink-0" />
            <span>Recebimentos a conciliar</span>
            {totalPendentes > 0 && (
              <span className="ml-1 rounded-full bg-gradient-to-r from-[#FF5200] to-[#FFAA00] px-2 py-0.5 text-xs font-bold text-white">
                {totalPendentes}
              </span>
            )}
            {expanded ? (
              <ChevronDown className="w-5 h-5 ml-auto" />
            ) : (
              <ChevronRight className="w-5 h-5 ml-auto" />
            )}
          </button>
        )}

        {showContent && (
          <div
            className={
              isPage
                ? 'rounded-xl border border-gray-200 bg-white shadow-sm px-5 pb-5 pt-5'
                : 'px-5 pb-5 pt-0 border-t border-gray-200'
            }
          >
            <div className="flex flex-col lg:flex-row lg:items-end gap-4 pt-4">
              <div className="flex-1 min-w-0">
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                  Buscar (txid, E2E, referência, documento, nome)
                </label>
                <input
                  type="text"
                  value={filtroIdentificador}
                  onChange={(e) => setFiltroIdentificador(e.target.value)}
                  placeholder="Filtrar recebimentos..."
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                  Status
                </label>
                <select
                  value={filtroStatus}
                  onChange={(e) => setFiltroStatus(e.target.value)}
                  className="input text-sm py-2 min-w-[140px]"
                >
                  <option value="">Todos</option>
                  <option value="PENDENTE">Pendente</option>
                  <option value="VINCULADO">Conciliado</option>
                  <option value="IGNORADO">Ignorado</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                  Provedor
                </label>
                <select
                  value={filtroProvider}
                  onChange={(e) => setFiltroProvider(e.target.value)}
                  className="input text-sm py-2 min-w-[140px]"
                >
                  <option value="">Todos</option>
                  {Object.entries(PROVIDER_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loading ? (
              <SeidmannLoading variant="section" className="py-8" />
            ) : items.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">
                Nenhum recebimento encontrado.
              </p>
            ) : (
              <>
              <ul className="mt-4 space-y-3">
                {items.map((r) => {
                  const statusBadge = conciliacaoStatusBadge(r)
                  return (
                  <li
                    key={r.id}
                    className={`rounded-lg border p-4 flex flex-col sm:flex-row sm:items-start gap-3 ${
                      r.mesAnteriorReferenciaPendente
                        ? 'border-red-200 bg-red-50/80'
                        : 'border-gray-100 bg-gray-50/80'
                    }`}
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={providerBadgeClass(r.provider)}>
                          {PROVIDER_LABELS[r.provider] ?? r.provider}
                        </span>
                        <span className={statusBadge.className}>
                          {statusBadge.label}
                        </span>
                        <span className="text-lg font-bold text-gray-900">
                          {formatMoneyCents(r.valor)}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatDate(r.dataPagamento)}
                        </span>
                      </div>
                      {r.status === 'VINCULADO' &&
                        (r.allocations && r.allocations.length > 0 ? (
                          <p
                            className={`text-sm font-medium ${
                              r.mesAnteriorReferenciaPendente
                                ? 'text-red-700'
                                : 'text-green-700'
                            }`}
                          >
                            {r.allocations.length === 1
                              ? `Aluno: ${r.allocations[0].enrollmentNome}`
                              : `Alunos: ${r.allocations.map((a) => `${a.enrollmentNome} (${formatMoneyCents(a.valorCentavos)})`).join(' · ')}`}
                          </p>
                        ) : r.enrollmentNome ? (
                          <p
                            className={`text-sm font-medium ${
                              r.mesAnteriorReferenciaPendente
                                ? 'text-red-700'
                                : 'text-green-700'
                            }`}
                          >
                            Aluno: {r.enrollmentNome}
                          </p>
                        ) : null)}
                      {(r.nomePagador || r.documentoPagador) && (
                        <p className="text-sm text-gray-700">
                          {r.nomePagador ?? '—'}
                          {r.documentoPagador && (
                            <span className="text-gray-500 ml-2">
                              ({r.documentoPagador})
                            </span>
                          )}
                        </p>
                      )}
                      {(r.txid || r.endToEndId || r.referencia || r.providerPaymentId) && (
                        <p className="text-xs text-gray-500 font-mono break-all">
                          {[r.txid, r.endToEndId, r.referencia, r.providerPaymentId]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}
                      {r.status === 'PENDENTE' && r.divergenciaValor && (
                        <p className="text-xs font-semibold text-yellow-700 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Valor diferente da mensalidade — vincule manualmente e informe a justificativa
                        </p>
                      )}
                      {r.status === 'VINCULADO' && r.justificativaConciliacao && (
                        <p className="text-xs text-slate-700 bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-2 mt-1">
                          <span className="font-semibold text-slate-800">Justificativa: </span>
                          {r.justificativaConciliacao}
                        </p>
                      )}
                      {r.mesAnteriorReferenciaPendente && (
                        <p className="text-xs font-semibold text-red-700 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Valor referente ao mês anterior — ainda aguardando pagamento deste mês
                        </p>
                      )}
                      {r.semCobrancaAberta && r.status === 'VINCULADO' && (
                        <p className="text-xs text-gray-500">
                          Vinculado sem cobrança em aberto
                        </p>
                      )}
                    </div>
                    {r.status === 'PENDENTE' && (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => openVincular(r.id)}
                        disabled={actionLoading}
                      >
                        <Link2 className="w-4 h-4 mr-1" />
                        Vincular
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleIgnorar(r.id)}
                        disabled={actionLoading}
                      >
                        <Ban className="w-4 h-4 mr-1" />
                        Ignorar
                      </Button>
                    </div>
                    )}
                  </li>
                  )
                })}
              </ul>
              {total > PAGE_SIZE && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                  <p className="text-sm text-gray-500">
                    {total} recebimento{total !== 1 ? 's' : ''} · página {page} de{' '}
                    {Math.ceil(total / PAGE_SIZE)}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1 || loading}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= Math.ceil(total / PAGE_SIZE) || loading}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              )}
              </>
            )}
          </div>
        )}
      </div>

      <Modal
        isOpen={!!vincularId}
        onClose={closeVincular}
        title="Vincular pagamento"
      >
        {recebimentoAtual && (
          <div className="text-sm text-gray-600 mb-4 space-y-1">
            <p>
              Total: {formatMoneyCents(recebimentoAtual.valor)} —{' '}
              {PROVIDER_LABELS[recebimentoAtual.provider] ?? recebimentoAtual.provider}
            </p>
            {alocacoes.length > 0 && (
              <p
                className={
                  somaAlocadaCentavos > recebimentoAtual.valor
                    ? 'text-red-600 font-semibold'
                    : somaAlocadaCentavos < recebimentoAtual.valor
                      ? 'text-amber-700'
                      : 'text-green-700'
                }
              >
                Alocado: {formatMoneyCents(somaAlocadaCentavos)}
                {somaAlocadaCentavos > recebimentoAtual.valor &&
                  ' — excede o total'}
                {somaAlocadaCentavos < recebimentoAtual.valor &&
                  ` — sobram ${formatMoneyCents(recebimentoAtual.valor - somaAlocadaCentavos)}`}
              </p>
            )}
          </div>
        )}

        {candidatosLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-brand-orange mb-3" />
        ) : candidatosDoc.length > 0 ? (
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
              Sugeridos pelo documento do pagador
            </p>
            <ul className="border border-orange-100 rounded-lg divide-y max-h-36 overflow-y-auto bg-orange-50/50">
              {candidatosDoc.map((c) => (
                <li key={c.enrollmentId}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-orange-100 flex items-center justify-between gap-2"
                    onClick={() =>
                      addAlunoToAlocacoes({
                        enrollmentId: c.enrollmentId,
                        nome: c.nome,
                        email: c.email,
                        valorMensalidade: c.valorMensalidade,
                      })
                    }
                    disabled={alocacoes.some((a) => a.enrollmentId === c.enrollmentId)}
                  >
                    <span>
                      <span className="block text-gray-900 font-medium">{c.nome}</span>
                      <span className="text-xs text-gray-500">{c.email}</span>
                    </span>
                    <Plus className="w-4 h-4 text-brand-orange shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {alocacoes.length > 0 && (
          <div className="mb-4 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase">
              Alunos selecionados
            </p>
            {alocacoes.map((a) => (
              <div
                key={a.enrollmentId}
                className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-lg border border-gray-200 bg-gray-50"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{a.nome}</p>
                  <p className="text-xs text-gray-500 truncate">{a.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 whitespace-nowrap">R$</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={a.valorReais}
                    onChange={(e) => updateValorAlocacao(a.enrollmentId, e.target.value)}
                    className="input w-28 text-sm py-1.5"
                  />
                  <button
                    type="button"
                    className="p-1.5 text-gray-400 hover:text-red-600"
                    onClick={() => removeAlocacao(a.enrollmentId)}
                    aria-label="Remover aluno"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
          Buscar aluno (nome, e-mail ou CPF)
        </label>
        <input
          type="text"
          value={buscaAluno}
          onChange={(e) => setBuscaAluno(e.target.value)}
          className="input w-full mb-3"
          placeholder="Digite ao menos 2 caracteres..."
        />
        {buscaLoading && (
          <Loader2 className="w-5 h-5 animate-spin text-brand-orange mx-auto mb-2" />
        )}
        <ul className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y mb-4">
          {alunosBusca.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 flex items-center justify-between gap-2"
                onClick={() =>
                  addAlunoToAlocacoes({
                    enrollmentId: a.id,
                    nome: a.nome,
                    email: a.email,
                    valorMensalidade: a.valorMensalidade,
                  })
                }
                disabled={alocacoes.some((x) => x.enrollmentId === a.id)}
              >
                <span>
                  <span className="block text-gray-900">{a.nome}</span>
                  <span className="text-xs text-gray-500">
                    {a.email}
                    {a.cpf ? ` · CPF ${a.cpf}` : ''}
                    {a.valorMensalidade != null
                      ? ` · ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(a.valorMensalidade)}`
                      : ''}
                  </span>
                </span>
                <Plus className="w-4 h-4 text-brand-orange shrink-0" />
              </button>
            </li>
          ))}
          {buscaAluno.length >= 2 && !buscaLoading && alunosBusca.length === 0 && (
            <li className="px-3 py-4 text-sm text-gray-500 text-center">
              Nenhum aluno encontrado
            </li>
          )}
        </ul>

        {(alocacoes.length > 0 || justificativaConciliacao.trim().length > 0) && (
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
              Justificativa da conciliação
              {justificativaObrigatoria ? (
                <span className="text-amber-700 normal-case font-medium"> (obrigatória)</span>
              ) : null}
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Explique a composição da entrada (ex.: mensalidade + material físico) ou o motivo da
              divergência de valor em relação à mensalidade.
            </p>
            <textarea
              value={justificativaConciliacao}
              onChange={(e) => setJustificativaConciliacao(e.target.value)}
              rows={3}
              className="input w-full text-sm resize-y min-h-[80px]"
              placeholder="Ex.: PIX referente ao material físico; mensalidade de jun/2026 já quitada via boleto."
            />
            {justificativaObrigatoria && (
              <p className="text-xs text-gray-500 mt-1">
                Mínimo {MIN_JUSTIFICATIVA_CONCILIACAO_LENGTH} caracteres (
                {justificativaConciliacao.trim().length}/{MIN_JUSTIFICATIVA_CONCILIACAO_LENGTH})
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={closeVincular} disabled={actionLoading}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleVincular}
            disabled={
              alocacoes.length === 0 ||
              actionLoading ||
              somaAlocadaCentavos > (recebimentoAtual?.valor ?? 0) ||
              (justificativaObrigatoria &&
                justificativaConciliacao.trim().length < MIN_JUSTIFICATIVA_CONCILIACAO_LENGTH)
            }
          >
            {actionLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Confirmar vínculo'
            )}
          </Button>
        </div>
      </Modal>
      <ConfirmDialog />
    </>
  )
}
