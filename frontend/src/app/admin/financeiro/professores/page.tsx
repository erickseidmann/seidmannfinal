/**
 * Financeiro – Professores
 * Lista professores ativos; cada um com seu próprio período de pagamento (data início/término).
 * Horas e valor a pagar são calculados no período específico de cada professor.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import AdminLayout from '@/components/admin/AdminLayout'
import Table, { Column } from '@/components/admin/Table'
import Modal from '@/components/admin/Modal'
import Button from '@/components/ui/Button'
import { Calendar } from 'lucide-react'

interface ProfessorFinanceiro {
  id: string
  nome: string
  valorPorHora: number
  dataInicio: string
  dataTermino: string
  totalHorasRegistradas: number
  totalRegistrosEsperados: number
  valorAPagar: number
}

function formatDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR')
}

function formatMoney(n: number): string {
  return `R$ ${Number(n).toFixed(2).replace('.', ',')}`
}

export default function FinanceiroProfessoresPage() {
  const [professores, setProfessores] = useState<ProfessorFinanceiro[]>([])
  const [loading, setLoading] = useState(true)
  const [editPeriodo, setEditPeriodo] = useState<ProfessorFinanceiro | null>(null)
  const [periodoInicio, setPeriodoInicio] = useState('')
  const [periodoTermino, setPeriodoTermino] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/financeiro/professores')
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
    fetchData()
  }, [fetchData])

  const openEditPeriodo = (row: ProfessorFinanceiro) => {
    setEditPeriodo(row)
    setPeriodoInicio(row.dataInicio)
    setPeriodoTermino(row.dataTermino)
  }

  const closeEditPeriodo = () => {
    setEditPeriodo(null)
    setToast(null)
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
      const res = await fetch(`/api/admin/teachers/${editPeriodo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodoPagamentoInicio: periodoInicio,
          periodoPagamentoTermino: periodoTermino,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao salvar período.', type: 'error' })
        return
      }
      setToast({ message: 'Período atualizado.', type: 'success' })
      await fetchData()
      setTimeout(() => {
        closeEditPeriodo()
      }, 800)
    } catch {
      setToast({ message: 'Erro ao salvar período.', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const columns: Column<ProfessorFinanceiro>[] = [
    { key: 'nome', label: 'Professor' },
    {
      key: 'valorPorHora',
      label: 'Valor/hora',
      render: (row) => formatMoney(row.valorPorHora),
    },
    {
      key: 'dataInicio',
      label: 'Data início',
      render: (row) => formatDate(row.dataInicio),
    },
    {
      key: 'dataTermino',
      label: 'Data término',
      render: (row) => formatDate(row.dataTermino),
    },
    {
      key: 'totalHorasRegistradas',
      label: 'Horas registradas',
      render: (row) => row.totalHorasRegistradas.toFixed(2),
    },
    {
      key: 'totalRegistrosEsperados',
      label: 'Registros esperados',
      render: (row) => String(row.totalRegistrosEsperados),
    },
    {
      key: 'valorAPagar',
      label: 'Valor a pagar',
      render: (row) => formatMoney(row.valorAPagar),
    },
    {
      key: 'acoes',
      label: '',
      render: (row) => (
        <button
          type="button"
          onClick={() => openEditPeriodo(row)}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm text-orange-600 hover:bg-orange-50"
          title="Editar período de pagamento"
        >
          <Calendar className="w-4 h-4" />
          Editar período
        </button>
      ),
    },
  ]

  return (
    <AdminLayout>
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Financeiro – Professores</h1>
        <p className="text-gray-600 mt-1">
          Gestão financeira relacionada aos professores (pagamento de aulas, etc.). Cada professor tem seu próprio período de início e término para o pagamento.
        </p>

        <div className="mt-6 flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchData()}
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
      </div>

      <Modal
        isOpen={!!editPeriodo}
        onClose={closeEditPeriodo}
        title={editPeriodo ? `Período de pagamento – ${editPeriodo.nome}` : 'Período'}
        size="sm"
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
            {toast && (
              <p className={`text-sm ${toast.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                {toast.message}
              </p>
            )}
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
          </div>
        )}
      </Modal>
    </AdminLayout>
  )
}
