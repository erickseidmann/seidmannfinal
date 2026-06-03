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
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/admin/Modal'

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
  semCobrancaAberta: boolean
  enrollmentId: string | null
  enrollmentNome: string | null
  createdAt: string
}

interface AlunoBusca {
  id: string
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
}

export default function RecebimentosConciliacao({ onToast, onVinculado }: Props) {
  const [expanded, setExpanded] = useState(true)
  const [filtroIdentificador, setFiltroIdentificador] = useState('')
  const [filtroProvider, setFiltroProvider] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<RecebimentoItem[]>([])
  const [total, setTotal] = useState(0)

  const [vincularId, setVincularId] = useState<string | null>(null)
  const [buscaAluno, setBuscaAluno] = useState('')
  const [alunosBusca, setAlunosBusca] = useState<AlunoBusca[]>([])
  const [buscaLoading, setBuscaLoading] = useState(false)
  const [selectedAlunoId, setSelectedAlunoId] = useState<string | null>(null)
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
      const json = await res.json()
      if (json.ok) {
        setItems(json.data.items ?? [])
        setTotal(json.data.total ?? 0)
      } else {
        onToast(json.message ?? 'Erro ao carregar recebimentos', 'error')
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

  const openVincular = (id: string) => {
    setVincularId(id)
    setBuscaAluno('')
    setAlunosBusca([])
    setSelectedAlunoId(null)
  }

  const closeVincular = () => {
    setVincularId(null)
    setBuscaAluno('')
    setSelectedAlunoId(null)
  }

  const handleVincular = async () => {
    if (!vincularId || !selectedAlunoId) return
    setActionLoading(true)
    try {
      const res = await fetch(
        `/api/admin/financeiro/recebimentos/${vincularId}/vincular`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enrollmentId: selectedAlunoId }),
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
    if (!confirm('Ignorar este recebimento? Não será possível reabrir na v1.')) return
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

  const recebimentoAtual = items.find((i) => i.id === vincularId)

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center gap-2 px-5 py-4 text-left text-base font-semibold text-gray-800 hover:bg-gray-50"
        >
          <Hash className="w-5 h-5 text-brand-orange shrink-0" />
          <span>Recebimentos a conciliar</span>
          {total > 0 && (
            <span className="ml-1 rounded-full bg-gradient-to-r from-[#FF5200] to-[#FFAA00] px-2 py-0.5 text-xs font-bold text-white">
              {total}
            </span>
          )}
          {expanded ? (
            <ChevronDown className="w-5 h-5 ml-auto" />
          ) : (
            <ChevronRight className="w-5 h-5 ml-auto" />
          )}
        </button>

        {expanded && (
          <div className="px-5 pb-5 pt-0 border-t border-gray-200">
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
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-brand-orange" />
              </div>
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
                    className="rounded-lg border border-gray-100 bg-gray-50/80 p-4 flex flex-col sm:flex-row sm:items-start gap-3"
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
                      {r.status === 'VINCULADO' && r.enrollmentNome && (
                        <p className="text-sm text-green-700 font-medium">
                          Aluno: {r.enrollmentNome}
                        </p>
                      )}
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
                          Valor diferente da mensalidade — vincule manualmente
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
        title="Vincular pagamento ao aluno"
      >
        {recebimentoAtual && (
          <p className="text-sm text-gray-600 mb-4">
            {formatMoneyCents(recebimentoAtual.valor)} —{' '}
            {PROVIDER_LABELS[recebimentoAtual.provider] ?? recebimentoAtual.provider}
          </p>
        )}
        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
          Buscar aluno (nome, e-mail ou CPF)
        </label>
        <input
          type="text"
          value={buscaAluno}
          onChange={(e) => {
            setBuscaAluno(e.target.value)
            setSelectedAlunoId(null)
          }}
          className="input w-full mb-3"
          placeholder="Digite ao menos 2 caracteres..."
          autoFocus
        />
        {buscaLoading && (
          <Loader2 className="w-5 h-5 animate-spin text-brand-orange mx-auto mb-2" />
        )}
        <ul className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y">
          {alunosBusca.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className={`w-full text-left px-3 py-2 text-sm hover:bg-orange-50 ${
                  selectedAlunoId === a.id ? 'bg-orange-100 font-semibold' : ''
                }`}
                onClick={() => setSelectedAlunoId(a.id)}
              >
                <span className="block text-gray-900">{a.nome}</span>
                <span className="text-xs text-gray-500">
                  {a.email}
                  {a.cpf ? ` · CPF ${a.cpf}` : ''}
                  {a.valorMensalidade != null
                    ? ` · ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(a.valorMensalidade)}`
                    : ''}
                </span>
              </button>
            </li>
          ))}
          {buscaAluno.length >= 2 && !buscaLoading && alunosBusca.length === 0 && (
            <li className="px-3 py-4 text-sm text-gray-500 text-center">
              Nenhum aluno encontrado
            </li>
          )}
        </ul>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={closeVincular} disabled={actionLoading}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleVincular}
            disabled={!selectedAlunoId || actionLoading}
          >
            {actionLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Confirmar vínculo'
            )}
          </Button>
        </div>
      </Modal>
    </>
  )
}
