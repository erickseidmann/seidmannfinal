/**
 * Financeiro – Saídas
 * Despesas fixas e outras despesas (avulsas).
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import AdminLayout from '@/components/admin/AdminLayout'
import Table, { Column } from '@/components/admin/Table'
import Modal from '@/components/admin/Modal'
import Button from '@/components/ui/Button'
import Toast from '@/components/admin/Toast'
import { Plus, Trash2, Calendar, ChevronDown, ChevronRight, FileDown } from 'lucide-react'

const MESES_LABELS: Record<number, string> = {
  1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 6: 'Junho',
  7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro',
}
const MESES_ABREV: Record<number, string> = {
  1: 'Jan', 2: 'Fev', 3: 'Mar', 4: 'Abr', 5: 'Mai', 6: 'Jun',
  7: 'Jul', 8: 'Ago', 9: 'Set', 10: 'Out', 11: 'Nov', 12: 'Dez',
}
const ANOS_DISPONIVEIS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i)

interface ExpenseRow {
  id: string
  name: string
  description: string | null
  valor: number
  year: number
  month: number
  paymentStatus: string | null
  isFixed?: boolean
}

function formatMoney(n: number): string {
  return `R$ ${Number(n).toFixed(2).replace('.', ',')}`
}

export default function FinanceiroSaidasPage() {
  const anoAtual = new Date().getFullYear()
  const mesAtual = new Date().getMonth() + 1
  const [selectedAno, setSelectedAno] = useState<number>(anoAtual)
  const [selectedMes, setSelectedMes] = useState<number>(mesAtual)

  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const [modalDespesa, setModalDespesa] = useState(false)
  const [despesaNome, setDespesaNome] = useState('')
  const [despesaDescricao, setDespesaDescricao] = useState('')
  const [despesaValor, setDespesaValor] = useState('')
  const [despesaRepeteMensal, setDespesaRepeteMensal] = useState(false)
  const [despesaMeses, setDespesaMeses] = useState('1')
  const [savingDespesa, setSavingDespesa] = useState(false)

  const [showPeriodo, setShowPeriodo] = useState(true)
  const [itemsPerPageExpenses, setItemsPerPageExpenses] = useState(10)
  const [itemsPerPageFixed, setItemsPerPageFixed] = useState(10)

  const fetchData = useCallback(async (ano: number, mes: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/financeiro/administracao?year=${ano}&month=${mes}`)
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setExpenses([])
        return
      }
      setExpenses(json.data?.expenses ?? [])
    } catch {
      setExpenses([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(selectedAno, selectedMes)
  }, [selectedAno, selectedMes, fetchData])

  const fixedExpenses = expenses.filter((e) => e.isFixed === true)
  const otherExpenses = expenses.filter((e) => e.isFixed !== true)
  const totalDespesas = expenses.reduce((s, e) => s + e.valor, 0)
  const totalPagoDespesas = expenses
    .filter((e) => e.paymentStatus === 'PAGO')
    .reduce((s, e) => s + e.valor, 0)
  const displayedFixedExpenses = fixedExpenses.slice(0, itemsPerPageFixed)
  const displayedOtherExpenses = otherExpenses.slice(0, itemsPerPageExpenses)

  const openModalDespesa = (asFixed = false) => {
    setDespesaNome('')
    setDespesaDescricao('')
    setDespesaValor('')
    setDespesaRepeteMensal(asFixed)
    setDespesaMeses(asFixed ? '12' : '1')
    setModalDespesa(true)
  }

  const submitDespesa = async () => {
    const nome = despesaNome.trim()
    if (!nome) {
      setToast({ message: 'Nome da despesa é obrigatório.', type: 'error' })
      return
    }
    const valorNum = Number(despesaValor.replace(',', '.'))
    if (Number.isNaN(valorNum) || valorNum < 0) {
      setToast({ message: 'Valor inválido.', type: 'error' })
      return
    }
    const meses = despesaRepeteMensal ? Math.min(120, Math.max(1, parseInt(despesaMeses, 10) || 1)) : 1
    setSavingDespesa(true)
    setToast(null)
    try {
      const res = await fetch('/api/admin/financeiro/administracao/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nome,
          description: despesaDescricao.trim() || undefined,
          valor: valorNum,
          repeatMonthly: despesaRepeteMensal,
          repeatMonths: meses,
          startYear: selectedAno,
          startMonth: selectedMes,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao criar despesa.', type: 'error' })
        return
      }
      setToast({ message: json.message || 'Despesa(s) criada(s).', type: 'success' })
      await fetchData(selectedAno, selectedMes)
      setModalDespesa(false)
    } catch {
      setToast({ message: 'Erro ao criar despesa.', type: 'error' })
    } finally {
      setSavingDespesa(false)
    }
  }

  const updateExpensePaymentStatus = async (expenseId: string, paymentStatus: 'PAGO' | 'EM_ABERTO') => {
    try {
      const res = await fetch(`/api/admin/financeiro/administracao/expenses/${expenseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentStatus }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) return
      await fetchData(selectedAno, selectedMes)
    } catch {
      // silencioso
    }
  }

  const deleteExpense = async (expenseId: string) => {
    if (!confirm('Remover esta despesa?')) return
    try {
      const res = await fetch(`/api/admin/financeiro/administracao/expenses/${expenseId}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao remover.', type: 'error' })
        return
      }
      setToast({ message: 'Despesa removida.', type: 'success' })
      await fetchData(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao remover.', type: 'error' })
    }
  }

  const expenseColumns: Column<ExpenseRow>[] = [
    { key: 'name', label: 'Nome', render: (row) => row.name },
    { key: 'description', label: 'Descrição', render: (row) => row.description ?? '—' },
    { key: 'valor', label: 'Valor', render: (row) => formatMoney(row.valor) },
    {
      key: 'paymentStatus',
      label: 'Pagamento',
      render: (row) => (
        <select
          value={row.paymentStatus ?? 'EM_ABERTO'}
          onChange={(e) =>
            updateExpensePaymentStatus(row.id, e.target.value === 'PAGO' ? 'PAGO' : 'EM_ABERTO')
          }
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
          onClick={() => deleteExpense(row.id)}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50"
          title="Remover despesa"
        >
          <Trash2 className="w-4 h-4" />
          Remover
        </button>
      ),
    },
  ]

  const exportCsv = (rows: ExpenseRow[], headers: string[], getRow: (r: ExpenseRow) => string[]) => {
    const csv = '\uFEFF' + [headers.join(';'), ...rows.map((r) => getRow(r).map((v) => (String(v).includes(';') ? `"${String(v).replace(/"/g, '""')}"` : v)).join(';'))].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `financeiro-saidas-${selectedAno}-${String(selectedMes).padStart(2, '0')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Financeiro – Saídas</h1>
          <p className="text-gray-600 mt-1 text-sm md:text-base">
            Despesas fixas e outras despesas (avulsas). Controle por mês/ano.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setShowPeriodo((v) => !v)}
            className="w-full flex items-center gap-2 px-5 py-4 text-left text-base font-semibold text-gray-800 hover:bg-gray-50"
          >
            <Calendar className="w-5 h-5 text-brand-orange shrink-0" />
            <span className="flex-1">Controle – {MESES_LABELS[selectedMes]} de {selectedAno}</span>
            {showPeriodo ? <ChevronDown className="w-5 h-5 shrink-0" /> : <ChevronRight className="w-5 h-5 shrink-0" />}
          </button>
          {showPeriodo && (
            <div className="px-5 pb-5 pt-0 space-y-4 border-t border-gray-200">
              <div className="flex flex-wrap gap-4 pt-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Ano</p>
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
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Mês</p>
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
                <div className="flex items-end">
                  <Button variant="primary" size="sm" onClick={() => fetchData(selectedAno, selectedMes)}>
                    Atualizar lista
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <section>
          <h2 className="text-base font-semibold text-gray-800 mb-3">Resumo do mês</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border-2 border-sky-200 bg-sky-50 p-4 shadow-sm">
              <p className="text-xs font-semibold text-sky-800 uppercase tracking-wide">Total despesas</p>
              <p className="mt-1 text-xl font-bold text-sky-900">{loading ? '—' : formatMoney(totalDespesas)}</p>
            </div>
            <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4 shadow-sm">
              <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">Já pago</p>
              <p className="mt-1 text-xl font-bold text-emerald-900">{loading ? '—' : formatMoney(totalPagoDespesas)}</p>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-800">Despesas fixas</h2>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Itens por página</label>
              <select value={itemsPerPageFixed} onChange={(e) => setItemsPerPageFixed(Number(e.target.value))} className="input min-w-[72px] text-sm py-1.5">
                <option value={3}>3</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={100}>100</option>
              </select>
              <Button variant="outline" size="sm" onClick={() => exportCsv(fixedExpenses, ['Nome', 'Descrição', 'Valor', 'Pagamento'], (r) => [r.name, r.description ?? '', formatMoney(r.valor), r.paymentStatus === 'PAGO' ? 'Pago' : 'Em aberto'])}>
                <FileDown className="w-4 h-4 mr-2" />
                Exportar
              </Button>
              <Button variant="primary" size="sm" onClick={() => openModalDespesa(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Adicionar despesa
              </Button>
            </div>
          </div>
          <div className="px-5 py-3 text-sm text-gray-600 border-b border-gray-100">
            Despesas recorrentes (internet, aluguel etc.). Marque &quot;Repete mensalmente&quot; ao adicionar para cadastrar como fixa.
          </div>
          <Table<ExpenseRow>
            columns={expenseColumns}
            data={displayedFixedExpenses}
            loading={loading}
            emptyMessage="Nenhuma despesa fixa neste mês."
          />
          {fixedExpenses.length > itemsPerPageFixed && (
            <div className="px-5 py-2 text-sm text-gray-500 border-t border-gray-100">
              Mostrando {displayedFixedExpenses.length} de {fixedExpenses.length} despesas fixas
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Outras despesas</h2>
              <p className="text-sm text-gray-600 mt-0.5">Despesas avulsas para este mês/ano.</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Itens por página</label>
              <select value={itemsPerPageExpenses} onChange={(e) => setItemsPerPageExpenses(Number(e.target.value))} className="input min-w-[72px] text-sm py-1.5">
                <option value={3}>3</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={100}>100</option>
              </select>
              <Button variant="outline" size="sm" onClick={() => exportCsv(otherExpenses, ['Nome', 'Descrição', 'Valor', 'Pagamento'], (r) => [r.name, r.description ?? '', formatMoney(r.valor), r.paymentStatus === 'PAGO' ? 'Pago' : 'Em aberto'])}>
                <FileDown className="w-4 h-4 mr-2" />
                Exportar
              </Button>
              <Button variant="primary" size="sm" onClick={() => openModalDespesa(false)}>
                <Plus className="w-4 h-4 mr-2" />
                Adicionar despesa
              </Button>
            </div>
          </div>
          <Table<ExpenseRow>
            columns={expenseColumns}
            data={displayedOtherExpenses}
            loading={loading}
            emptyMessage="Nenhuma despesa avulsa neste mês."
          />
          {otherExpenses.length > itemsPerPageExpenses && (
            <div className="px-5 py-2 text-sm text-gray-500 border-t border-gray-100">
              Mostrando {displayedOtherExpenses.length} de {otherExpenses.length} despesas
            </div>
          )}
        </section>

        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </div>

      <Modal
        isOpen={modalDespesa}
        onClose={() => setModalDespesa(false)}
        title="Adicionar despesa"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalDespesa(false)}>
              Cancelar
            </Button>
            <Button onClick={submitDespesa} disabled={savingDespesa}>
              {savingDespesa ? 'Salvando...' : 'Adicionar'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            A despesa será registrada a partir de {MESES_LABELS[selectedMes]} de {selectedAno}.
            {despesaRepeteMensal && ' Se repetir mensalmente, serão criadas várias entradas (uma por mês).'}
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome da despesa *</label>
            <input
              type="text"
              placeholder="Ex.: Aluguel, Internet, Material"
              value={despesaNome}
              onChange={(e) => setDespesaNome(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição (opcional)</label>
            <textarea
              rows={2}
              placeholder="Detalhes da despesa"
              value={despesaDescricao}
              onChange={(e) => setDespesaDescricao(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$) *</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={despesaValor}
              onChange={(e) => {
                const v = e.target.value.replace(',', '.')
                if (v === '' || /^\d*\.?\d*$/.test(v)) setDespesaValor(e.target.value)
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="repete-mensal"
              checked={despesaRepeteMensal}
              onChange={(e) => setDespesaRepeteMensal(e.target.checked)}
              className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
            />
            <label htmlFor="repete-mensal" className="text-sm font-medium text-gray-700">
              Repete mensalmente
            </label>
          </div>
          {despesaRepeteMensal && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade de meses que se repete</label>
              <input
                type="number"
                min={1}
                max={120}
                value={despesaMeses}
                onChange={(e) => setDespesaMeses(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
              <p className="text-xs text-gray-500 mt-0.5">Serão criadas várias despesas (uma por mês), até o número informado.</p>
            </div>
          )}
        </div>
      </Modal>
    </AdminLayout>
  )
}
