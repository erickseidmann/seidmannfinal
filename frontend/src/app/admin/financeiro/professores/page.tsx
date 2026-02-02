/**
 * Financeiro – Professores
 * Mesmas regras de mês/ano do financeiro dos alunos: seleção de ano e mês; status e valores por mês (TeacherPaymentMonth).
 */

'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import AdminLayout from '@/components/admin/AdminLayout'
import StatCard from '@/components/admin/StatCard'
import Table, { Column } from '@/components/admin/Table'
import Modal from '@/components/admin/Modal'
import Button from '@/components/ui/Button'
import Toast from '@/components/admin/Toast'
import { Calendar, Wallet, CheckCircle, Users, Copy, ThumbsUp } from 'lucide-react'

const MESES_LABELS: Record<number, string> = {
  1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 6: 'Junho',
  7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro',
}
const MESES_ABREV: Record<number, string> = {
  1: 'Jan', 2: 'Fev', 3: 'Mar', 4: 'Abr', 5: 'Mai', 6: 'Jun',
  7: 'Jul', 8: 'Ago', 9: 'Set', 10: 'Out', 11: 'Nov', 12: 'Dez',
}
const ANOS_DISPONIVEIS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i)

interface ProfessorFinanceiro {
  id: string
  nome: string
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
  metodoPagamento: string | null
  infosPagamento: string | null
  statusPagamento: 'PAGO' | 'EM_ABERTO'
  pagamentoProntoParaFazer: boolean
}

function formatDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR')
}

function formatMoney(n: number): string {
  return `R$ ${Number(n).toFixed(2).replace('.', ',')}`
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

export default function FinanceiroProfessoresPage() {
  const anoAtual = new Date().getFullYear()
  const mesAtual = new Date().getMonth() + 1
  const [selectedAno, setSelectedAno] = useState<number>(anoAtual)
  const [selectedMes, setSelectedMes] = useState<number>(mesAtual)

  const [professores, setProfessores] = useState<ProfessorFinanceiro[]>([])
  const [loading, setLoading] = useState(true)
  const [editPeriodo, setEditPeriodo] = useState<ProfessorFinanceiro | null>(null)
  const [periodoInicio, setPeriodoInicio] = useState('')
  const [periodoTermino, setPeriodoTermino] = useState('')
  const [valorPorPeriodo, setValorPorPeriodo] = useState('')
  const [valorExtra, setValorExtra] = useState('')
  const [metodoPagamento, setMetodoPagamento] = useState('')
  const [infosPagamento, setInfosPagamento] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const fetchData = useCallback(async (ano: number, mes: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/financeiro/professores?year=${ano}&month=${mes}`)
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setProfessores([])
        return
      }
      setProfessores(json.data?.professores ?? [])
    } catch {
      setProfessores([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(selectedAno, selectedMes)
  }, [selectedAno, selectedMes, fetchData])

  const cubos = useMemo(() => {
    const totalAPagar = professores.reduce((s, p) => s + p.valorAPagar, 0)
    const valoresPagos = professores
      .filter((p) => p.statusPagamento === 'PAGO')
      .reduce((s, p) => s + p.valorAPagar, 0)
    const totalProfessoresAtivos = professores.length
    return {
      totalAPagar: Math.round(totalAPagar * 100) / 100,
      valoresPagos: Math.round(valoresPagos * 100) / 100,
      totalProfessoresAtivos,
    }
  }, [professores])

  const openEditPeriodo = (row: ProfessorFinanceiro) => {
    setEditPeriodo(row)
    setPeriodoInicio(row.dataInicio)
    setPeriodoTermino(row.dataTermino)
    setValorPorPeriodo(row.valorPorPeriodo ? String(row.valorPorPeriodo) : '')
    setValorExtra(row.valorExtra ? String(row.valorExtra) : '')
    setMetodoPagamento(row.metodoPagamento ?? '')
    setInfosPagamento(row.infosPagamento ?? '')
  }

  const handleCopy = useCallback(() => {
    setToast({ message: 'Copiado!', type: 'success' })
    setTimeout(() => setToast(null), 2000)
  }, [])

  const closeEditPeriodo = () => {
    setEditPeriodo(null)
    setToast(null)
  }

  const updatePagamento = async (teacherId: string, pago: boolean) => {
    try {
      const res = await fetch(`/api/admin/financeiro/professores/${teacherId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: selectedAno,
          month: selectedMes,
          paymentStatus: pago ? 'PAGO' : 'EM_ABERTO',
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) return
      await fetchData(selectedAno, selectedMes)
    } catch {
      // silencioso
    }
  }

  const savePeriodo = async () => {
    if (!editPeriodo) return
    if (!periodoInicio || !periodoTermino) {
      setToast({ message: 'Preencha data de início e data de término.', type: 'error' })
      return
    }
    if (new Date(periodoInicio) > new Date(periodoTermino)) {
      setToast({ message: 'Data de início deve ser anterior à data de término.', type: 'error' })
      return
    }
    setSaving(true)
    setToast(null)
    try {
      const res = await fetch(`/api/admin/financeiro/professores/${editPeriodo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: selectedAno,
          month: selectedMes,
          periodoInicio,
          periodoTermino,
          valorPorPeriodo: valorPorPeriodo ? Number(valorPorPeriodo) : null,
          valorExtra: valorExtra ? Number(valorExtra) : null,
          metodoPagamento: metodoPagamento.trim() || null,
          infosPagamento: infosPagamento.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao salvar.', type: 'error' })
        return
      }
      setToast({ message: 'Dados atualizados (período, valores e infos salvas no professor).', type: 'success' })
      await fetchData(selectedAno, selectedMes)
      setTimeout(() => {
        closeEditPeriodo()
      }, 800)
    } catch {
      setToast({ message: 'Erro ao salvar.', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const columns: Column<ProfessorFinanceiro>[] = [
    {
      key: 'nome',
      label: 'Professor',
      render: (row) => <CellWithCopy value={row.nome} onCopy={handleCopy} />,
    },
    {
      key: 'valorPorHora',
      label: 'Valor/hora',
      render: (row) => (
        <CellWithCopy value={formatMoney(row.valorPorHora)} onCopy={handleCopy} />
      ),
    },
    {
      key: 'dataInicio',
      label: 'Data início',
      render: (row) => (
        <CellWithCopy value={formatDate(row.dataInicio)} onCopy={handleCopy} />
      ),
    },
    {
      key: 'dataTermino',
      label: 'Data término',
      render: (row) => (
        <CellWithCopy value={formatDate(row.dataTermino)} onCopy={handleCopy} />
      ),
    },
    {
      key: 'totalHorasEstimadas',
      label: 'Horas estimadas',
      render: (row) => (
        <CellWithCopy value={row.totalHorasEstimadas.toFixed(2)} onCopy={handleCopy} />
      ),
    },
    {
      key: 'totalHorasRegistradas',
      label: 'Horas registradas',
      render: (row) => (
        <CellWithCopy value={row.totalHorasRegistradas.toFixed(2)} onCopy={handleCopy} />
      ),
    },
    {
      key: 'valorPorHoras',
      label: 'Valor a receber por horas',
      render: (row) => (
        <CellWithCopy value={formatMoney(row.valorPorHoras)} onCopy={handleCopy} />
      ),
    },
    {
      key: 'totalRegistrosEsperados',
      label: 'Registros esperados',
      render: (row) => (
        <CellWithCopy value={String(row.totalRegistrosEsperados)} onCopy={handleCopy} />
      ),
    },
    {
      key: 'valorPorPeriodo',
      label: 'Valor por período',
      render: (row) => (
        <CellWithCopy value={formatMoney(row.valorPorPeriodo)} onCopy={handleCopy} />
      ),
    },
    {
      key: 'valorExtra',
      label: 'Valores extras',
      render: (row) => (
        <CellWithCopy value={formatMoney(row.valorExtra)} onCopy={handleCopy} />
      ),
    },
    {
      key: 'valorAPagar',
      label: 'Valor a pagar',
      render: (row) => (
        <CellWithCopy value={formatMoney(row.valorAPagar)} onCopy={handleCopy} />
      ),
    },
    {
      key: 'pagamentoProntoParaFazer',
      label: '',
      render: (row) =>
        row.pagamentoProntoParaFazer ? (
          <span
            className="inline-flex items-center gap-1 text-green-700"
            title="Pagamento pronto para fazer (professor confirmou o valor)"
          >
            <ThumbsUp className="w-5 h-5" />
            <span className="text-xs font-medium hidden sm:inline">Pronto p/ pagar</span>
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        ),
    },
    {
      key: 'metodoPagamento',
      label: 'Método de pagamento',
      render: (row) => (
        <CellWithCopy value={row.metodoPagamento ?? ''} onCopy={handleCopy} />
      ),
    },
    {
      key: 'infosPagamento',
      label: 'Infos de pagamento',
      render: (row) => (
        <CellWithCopy value={row.infosPagamento ?? ''} onCopy={handleCopy} truncate />
      ),
    },
    {
      key: 'statusPagamento',
      label: 'Pagamento',
      render: (row) => (
        <select
          value={row.statusPagamento}
          onChange={(e) => updatePagamento(row.id, e.target.value === 'PAGO')}
          className="rounded border border-gray-300 px-2 py-1 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
        >
          <option value="EM_ABERTO">Em aberto</option>
          <option value="PAGO">Pago</option>
        </select>
      ),
    },
    {
      key: 'acoes',
      label: '',
      render: (row) => (
        <button
          type="button"
          onClick={() => openEditPeriodo(row)}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm text-orange-600 hover:bg-orange-50"
          title="Editar valores do mês"
        >
          <Calendar className="w-4 h-4" />
          Editar mês
        </button>
      ),
    },
  ]

  return (
    <AdminLayout>
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Financeiro – Professores</h1>
        <p className="text-gray-600 mt-1">
          Gestão financeira relacionada aos professores (pagamento de aulas, etc.). Selecione ano e mês; status e valores são independentes por mês (como no financeiro dos alunos).
        </p>

        {/* Seletor ano e mês (igual ao financeiro alunos) */}
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
                      ? 'bg-orange-600 text-white shadow-sm'
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
                      ? 'bg-orange-600 text-white shadow-sm'
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <StatCard
            title="Total a pagar (estimado)"
            value={loading ? '—' : formatMoney(cubos.totalAPagar)}
            icon={<Wallet className="w-6 h-6" />}
            color="orange"
          />
          <StatCard
            title="Valores pagos"
            value={loading ? '—' : formatMoney(cubos.valoresPagos)}
            icon={<CheckCircle className="w-6 h-6" />}
            color="green"
          />
          <StatCard
            title="Total de professores ativos"
            value={loading ? '—' : cubos.totalProfessoresAtivos}
            icon={<Users className="w-6 h-6" />}
            color="blue"
          />
        </div>

        <div className="mt-6 flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchData(selectedAno, selectedMes)}
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            Atualizar lista
          </button>
        </div>

        <div className="mt-6">
          <Table<ProfessorFinanceiro>
            columns={columns}
            data={professores}
            loading={loading}
            emptyMessage="Nenhum professor ativo."
          />
        </div>

        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </div>

      <Modal
        isOpen={!!editPeriodo}
        onClose={closeEditPeriodo}
        title={editPeriodo ? `Editar período e valores – ${editPeriodo.nome}` : 'Editar'}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={closeEditPeriodo}>
              Cancelar
            </Button>
            <Button onClick={savePeriodo} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </>
        }
      >
        {editPeriodo && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Referência: {MESES_LABELS[selectedMes]} de {selectedAno}. Período personalizado (ex.: 15/01 a 15/02).
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data início</label>
              <input
                type="date"
                value={periodoInicio}
                onChange={(e) => setPeriodoInicio(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data término</label>
              <input
                type="date"
                value={periodoTermino}
                onChange={(e) => setPeriodoTermino(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor por período (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={valorPorPeriodo}
                onChange={(e) => setValorPorPeriodo(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valores extras (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={valorExtra}
                onChange={(e) => setValorExtra(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Método de pagamento</label>
              <input
                type="text"
                placeholder="PIX, Cartão, etc."
                value={metodoPagamento}
                onChange={(e) => setMetodoPagamento(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
              <p className="text-xs text-gray-500 mt-0.5">Salvo no cadastro do professor.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Infos de pagamento</label>
              <textarea
                rows={2}
                placeholder="Chave PIX, conta, etc."
                value={infosPagamento}
                onChange={(e) => setInfosPagamento(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
              <p className="text-xs text-gray-500 mt-0.5">Salvo no cadastro do professor.</p>
            </div>
          </div>
        )}
      </Modal>
    </AdminLayout>
  )
}
