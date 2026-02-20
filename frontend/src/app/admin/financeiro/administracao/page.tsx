/**
 * Financeiro – Administração
 * Usuários do ADM (valor/função por mês) e despesas administrativas (avulsas ou recorrentes).
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import AdminLayout from '@/components/admin/AdminLayout'
import Table, { Column } from '@/components/admin/Table'
import Modal from '@/components/admin/Modal'
import Button from '@/components/ui/Button'
import Toast from '@/components/admin/Toast'
import { Users, Wallet, Receipt, Plus, Trash2, CheckCircle, Pencil, Bell, Calendar, ChevronDown, ChevronRight, FileDown } from 'lucide-react'

const MESES_LABELS: Record<number, string> = {
  1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 6: 'Junho',
  7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro',
}
const MESES_ABREV: Record<number, string> = {
  1: 'Jan', 2: 'Fev', 3: 'Mar', 4: 'Abr', 5: 'Mai', 6: 'Jun',
  7: 'Jul', 8: 'Ago', 9: 'Set', 10: 'Out', 11: 'Nov', 12: 'Dez',
}
const ANOS_DISPONIVEIS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i)

interface AdminUserRow {
  id: string
  nome: string
  email: string
  funcao: string | null
  emailPessoal: string | null
  valor: number | null
  paymentStatus: string | null
  valorPendente: number | null
  valorPendenteRequestedAt: string | null
  valorRepetido: number | null
}

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

export default function FinanceiroAdministracaoPage() {
  const anoAtual = new Date().getFullYear()
  const mesAtual = new Date().getMonth() + 1
  const [selectedAno, setSelectedAno] = useState<number>(anoAtual)
  const [selectedMes, setSelectedMes] = useState<number>(mesAtual)

  const [adminUsers, setAdminUsers] = useState<AdminUserRow[]>([])
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [currentUserIsSuperAdmin, setCurrentUserIsSuperAdmin] = useState(false)

  // Modal Alterar valor (usuário ADM)
  const [editValorUser, setEditValorUser] = useState<AdminUserRow | null>(null)
  const [modalValor, setModalValor] = useState('')
  const [applyToAllMonths, setApplyToAllMonths] = useState(false)
  const [savingValor, setSavingValor] = useState(false)
  // Modal Enviar notificação de pagamento (e-mail + anexo)
  const [notifyUser, setNotifyUser] = useState<AdminUserRow | null>(null)
  const [notifyMessage, setNotifyMessage] = useState('')
  const [notifyFile, setNotifyFile] = useState<File | null>(null)
  const [sendingNotify, setSendingNotify] = useState(false)

  // Modal Adicionar despesa
  const [modalDespesa, setModalDespesa] = useState(false)
  const [despesaNome, setDespesaNome] = useState('')
  const [despesaDescricao, setDespesaDescricao] = useState('')
  const [despesaValor, setDespesaValor] = useState('')
  const [despesaRepeteMensal, setDespesaRepeteMensal] = useState(false)
  const [despesaMeses, setDespesaMeses] = useState('1')
  const [savingDespesa, setSavingDespesa] = useState(false)

  const [showPeriodo, setShowPeriodo] = useState(true)
  const [itemsPerPageAdmin, setItemsPerPageAdmin] = useState(10)
  const [itemsPerPageExpenses, setItemsPerPageExpenses] = useState(10)
  const [itemsPerPageFixed, setItemsPerPageFixed] = useState(10)
  const [coraGastos, setCoraGastos] = useState<number>(0)
  const [coraLoading, setCoraLoading] = useState(false)

  const fetchData = useCallback(async (ano: number, mes: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/financeiro/administracao?year=${ano}&month=${mes}`)
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setAdminUsers([])
        setExpenses([])
        return
      }
      setAdminUsers(json.data?.adminUsers ?? [])
      setExpenses(json.data?.expenses ?? [])
      setCurrentUserIsSuperAdmin(!!json.data?.currentUserIsSuperAdmin)
    } catch {
      setAdminUsers([])
      setExpenses([])
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchCoraUsage = useCallback(async (ano: number, mes: number) => {
    setCoraLoading(true)
    try {
      const res = await fetch(`/api/admin/financeiro/cora-usage?year=${ano}&month=${mes}`)
      const json = await res.json()
      if (res.ok && json.ok && json.data?.totalCents != null) {
        setCoraGastos(json.data.totalCents / 100)
      } else {
        setCoraGastos(0)
      }
    } catch {
      setCoraGastos(0)
    } finally {
      setCoraLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(selectedAno, selectedMes)
    fetchCoraUsage(selectedAno, selectedMes)
  }, [selectedAno, selectedMes, fetchData, fetchCoraUsage])

  const fixedExpenses = expenses.filter((e) => e.isFixed === true)
  const otherExpenses = expenses.filter((e) => e.isFixed !== true)
  const totalDespesasFixas = fixedExpenses.reduce((s, e) => s + e.valor, 0)
  const displayedAdminUsers = adminUsers.slice(0, itemsPerPageAdmin)
  const displayedFixedExpenses = fixedExpenses.slice(0, itemsPerPageFixed)
  const displayedOtherExpenses = otherExpenses.slice(0, itemsPerPageExpenses)

  const valorExibido = (u: AdminUserRow) => u.valor ?? u.valorRepetido ?? 0
  const totalAdminValor = adminUsers.reduce((s, u) => s + valorExibido(u), 0)
  const totalDespesas = expenses.reduce((s, e) => s + e.valor, 0)
  const totalGeral = totalAdminValor + totalDespesas
  const totalPagoAdmin = adminUsers
    .filter((u) => u.paymentStatus === 'PAGO')
    .reduce((s, u) => s + valorExibido(u), 0)
  const totalPagoDespesas = expenses
    .filter((e) => e.paymentStatus === 'PAGO')
    .reduce((s, e) => s + e.valor, 0)

  const updateUserValor = async (userId: string, valor: number | null) => {
    try {
      const res = await fetch(`/api/admin/financeiro/administracao/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: selectedAno,
          month: selectedMes,
          valor: valor ?? null,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao registrar proposta.', type: 'error' })
        return
      }
      setToast({ message: json.message || 'Proposta registrada. Aguardando aprovação do admin.', type: 'success' })
      await fetchData(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao registrar proposta.', type: 'error' })
    }
  }

  const approveUserValor = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/financeiro/administracao/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: selectedAno,
          month: selectedMes,
          approveValorPendente: true,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao aprovar.', type: 'error' })
        return
      }
      setToast({ message: json.message || 'Valor aprovado.', type: 'success' })
      await fetchData(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao aprovar.', type: 'error' })
    }
  }

  const updateUserPaymentStatus = async (userId: string, paymentStatus: 'PAGO' | 'EM_ABERTO') => {
    try {
      const res = await fetch(`/api/admin/financeiro/administracao/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: selectedAno,
          month: selectedMes,
          paymentStatus,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) return
      await fetchData(selectedAno, selectedMes)
    } catch {
      // silencioso
    }
  }

  const openEditValorModal = (row: AdminUserRow) => {
    setEditValorUser(row)
    const valorAtual = row.valor ?? row.valorRepetido
    setModalValor(row.valorPendente != null ? String(row.valorPendente) : (valorAtual != null ? String(valorAtual) : ''))
    setApplyToAllMonths(false)
  }

  const saveValorModal = async () => {
    if (!editValorUser) return
    const v = modalValor.replace(',', '.')
    const num = v === '' ? null : Number(v)
    if (v !== '' && num != null && (Number.isNaN(num) || num < 0)) {
      setToast({ message: 'Valor inválido.', type: 'error' })
      return
    }
    setSavingValor(true)
    setToast(null)
    try {
      const res = await fetch(`/api/admin/financeiro/administracao/users/${editValorUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: selectedAno,
          month: selectedMes,
          valor: num,
          ...(applyToAllMonths ? { applyToAllMonthsInYear: true } : {}),
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao atualizar valor.', type: 'error' })
        return
      }
      setToast({ message: json.message || 'Proposta registrada. Aguardando aprovação do admin.', type: 'success' })
      await fetchData(selectedAno, selectedMes)
      setEditValorUser(null)
    } catch {
      setToast({ message: 'Erro ao atualizar valor.', type: 'error' })
    } finally {
      setSavingValor(false)
    }
  }

  const openNotifyModal = (row: AdminUserRow) => {
    const mesNome = MESES_LABELS[selectedMes] ?? String(selectedMes)
    const valorAtual = row.valor ?? row.valorRepetido
    const valorStr =
      valorAtual != null ? Number(valorAtual).toFixed(2).replace('.', ',') : '--'
    const defaultMessage = `Olá,

Informamos que o pagamento referente à prestação de serviços de ${mesNome} de ${selectedAno} foi confirmado.
O valor é de R$ ${valorStr}.

Em caso de dúvidas, entre em contato com a gestão financeira.

Atenciosamente,
Equipe Seidmann Institute`
    setNotifyUser(row)
    setNotifyMessage(defaultMessage)
    setNotifyFile(null)
  }

  const submitNotifyPayment = async () => {
    if (!notifyUser) return
    setSendingNotify(true)
    setToast(null)
    try {
      const formData = new FormData()
      formData.set('year', String(selectedAno))
      formData.set('month', String(selectedMes))
      formData.set('message', notifyMessage)
      if (notifyFile) formData.set('attachment', notifyFile)
      const res = await fetch(`/api/admin/financeiro/administracao/users/${notifyUser.id}/notify-payment`, {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao enviar notificação.', type: 'error' })
        return
      }
      setToast({ message: json.message || 'Notificação enviada.', type: 'success' })
      await fetchData(selectedAno, selectedMes)
      setNotifyUser(null)
    } catch {
      setToast({ message: 'Erro ao enviar notificação.', type: 'error' })
    } finally {
      setSendingNotify(false)
    }
  }

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

  const adminColumns: Column<AdminUserRow>[] = [
    { key: 'nome', label: 'Nome', render: (row) => row.nome },
    { key: 'funcao', label: 'Função', render: (row) => row.funcao ?? '—' },
    {
      key: 'valor',
      label: 'Valor (R$)',
      render: (row) => (
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-1">
            <span className="font-medium text-gray-900">
              {(row.valor ?? row.valorRepetido) != null
                ? formatMoney(row.valor ?? row.valorRepetido ?? 0)
                : '—'}
            </span>
            {(row.valor ?? null) === null && row.valorRepetido != null && (
              <span className="text-xs text-gray-500">(repetido)</span>
            )}
            <button
              type="button"
              onClick={() => openEditValorModal(row)}
              className="p-1.5 rounded text-gray-400 hover:text-orange-600 hover:bg-orange-50"
              title="Propor alteração de valor (aguardará aprovação do admin)"
              aria-label="Propor alteração"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </span>
          {row.valorPendente != null && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">
                Aguardando aprovação do admin
              </span>
              <span className="text-gray-600">Proposta: {formatMoney(row.valorPendente)}</span>
              {currentUserIsSuperAdmin && (
                <button
                  type="button"
                  onClick={() => approveUserValor(row.id)}
                  className="inline-flex items-center gap-1 rounded bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700"
                  title="Aprovar valor"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Aprovar
                </button>
              )}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'paymentStatus',
      label: 'Pagamento',
      render: (row) => (
        <select
          value={row.paymentStatus ?? 'EM_ABERTO'}
          onChange={(e) =>
            updateUserPaymentStatus(row.id, e.target.value === 'PAGO' ? 'PAGO' : 'EM_ABERTO')
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
          onClick={() => openNotifyModal(row)}
          className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm text-green-700 hover:bg-green-50"
          title="Abrir preview e enviar e-mail de notificação de pagamento"
        >
          <Bell className="w-4 h-4" />
          Notificar pagamento
        </button>
      ),
    },
  ]

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

  const exportCsv = (rows: { [k: string]: unknown }[], headers: string[], getRow: (r: typeof rows[0]) => string[]) => {
    const csv = '\uFEFF' + [headers.join(';'), ...rows.map((r) => getRow(r).map((v) => (String(v).includes(';') ? `"${String(v).replace(/"/g, '""')}"` : v)).join(';'))].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `financeiro-administracao-${selectedAno}-${String(selectedMes).padStart(2, '0')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Financeiro – Administração</h1>
          <p className="text-gray-600 mt-1 text-sm md:text-base">
            Custos e despesas de administração (usuários do ADM, despesas fixas e outras despesas).
          </p>
        </div>

        {/* Seção: Período (ano e mês) - Recolhível - mesmo estilo alunos */}
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
                  <Button variant="primary" size="sm" onClick={() => { fetchData(selectedAno, selectedMes); fetchCoraUsage(selectedAno, selectedMes); }}>
                    Atualizar lista
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Resumo do mês (cubos) - mesmo estilo alunos */}
        <section>
          <h2 className="text-base font-semibold text-gray-800 mb-3">Resumo do mês</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4 shadow-sm">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Total ADM</p>
              <p className="mt-1 text-xl font-bold text-amber-900">{loading ? '—' : formatMoney(totalAdminValor)}</p>
            </div>
            <div className="rounded-xl border-2 border-sky-200 bg-sky-50 p-4 shadow-sm">
              <p className="text-xs font-semibold text-sky-800 uppercase tracking-wide">Total despesas</p>
              <p className="mt-1 text-xl font-bold text-sky-900">{loading ? '—' : formatMoney(totalDespesas)}</p>
            </div>
            <div className="rounded-xl border-2 border-violet-200 bg-violet-50 p-4 shadow-sm">
              <p className="text-xs font-semibold text-violet-800 uppercase tracking-wide">Total geral</p>
              <p className="mt-1 text-xl font-bold text-violet-900">{loading ? '—' : formatMoney(totalGeral)}</p>
            </div>
            <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4 shadow-sm">
              <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">Já pago</p>
              <p className="mt-1 text-xl font-bold text-emerald-900">{loading ? '—' : formatMoney(totalPagoAdmin + totalPagoDespesas)}</p>
            </div>
            <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50 p-4 shadow-sm">
              <p className="text-xs font-semibold text-indigo-800 uppercase tracking-wide">Gastos Cora</p>
              <p className="mt-1 text-xl font-bold text-indigo-900">{coraLoading ? '—' : formatMoney(coraGastos)}</p>
              <p className="text-xs text-indigo-600 mt-0.5">Estimativa automática</p>
            </div>
          </div>
        </section>

        {/* Usuários do ADM */}
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold text-gray-800 mr-2">Usuários do ADM</h2>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Itens por página</label>
              <select value={itemsPerPageAdmin} onChange={(e) => setItemsPerPageAdmin(Number(e.target.value))} className="input min-w-[72px] text-sm py-1.5">
                <option value={3}>3</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={100}>100</option>
              </select>
            </div>
            <Button variant="outline" size="sm" onClick={() => exportCsv(adminUsers as any[], ['Nome', 'Função', 'Valor', 'Pagamento'], (r: any) => [r.nome, r.funcao ?? '', formatMoney(valorExibido(r as AdminUserRow)), r.paymentStatus === 'PAGO' ? 'Pago' : 'Em aberto'])}>
              <FileDown className="w-4 h-4 mr-2" />
              Exportar Excel
            </Button>
          </div>
          <div className="px-5 py-3 text-sm text-gray-600 border-b border-gray-100">
            Defina o valor mensal de cada usuário administrativo (exceto o super admin). O status de pagamento pode ser alterado aqui.
          </div>
          <Table<AdminUserRow>
            columns={adminColumns}
            data={displayedAdminUsers}
            loading={loading}
            emptyMessage="Nenhum usuário administrativo (exceto super admin)."
          />
          {adminUsers.length > itemsPerPageAdmin && (
            <div className="px-5 py-2 text-sm text-gray-500 border-t border-gray-100">
              Mostrando {displayedAdminUsers.length} de {adminUsers.length} usuários
            </div>
          )}
        </section>

        {/* Despesas fixas */}
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
              <Button variant="outline" size="sm" onClick={() => exportCsv(fixedExpenses as any[], ['Nome', 'Descrição', 'Valor', 'Pagamento'], (r: any) => [r.name, r.description ?? '', formatMoney(r.valor), r.paymentStatus === 'PAGO' ? 'Pago' : 'Em aberto'])}>
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

        {/* Outras despesas */}
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
              <Button variant="outline" size="sm" onClick={() => exportCsv(otherExpenses as any[], ['Nome', 'Descrição', 'Valor', 'Pagamento'], (r: any) => [r.name, r.description ?? '', formatMoney(r.valor), r.paymentStatus === 'PAGO' ? 'Pago' : 'Em aberto'])}>
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

      <Modal
        isOpen={!!editValorUser}
        onClose={() => setEditValorUser(null)}
        title={editValorUser ? `Alterar valor – ${editValorUser.nome}` : 'Alterar valor'}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditValorUser(null)}>
              Cancelar
            </Button>
            <Button onClick={saveValorModal} disabled={savingValor}>
              {savingValor ? 'Salvando...' : 'Salvar'}
            </Button>
          </>
        }
      >
        {editValorUser && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Referência: {MESES_LABELS[selectedMes]} de {selectedAno}. Opcionalmente aplique o mesmo valor a todos os meses do ano.
            </p>
            <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              A alteração será registrada como proposta e só terá efeito após aprovação do admin.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$)</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={modalValor}
                onChange={(e) => {
                  const v = e.target.value.replace(',', '.')
                  if (v === '' || /^\d*\.?\d*$/.test(v)) setModalValor(e.target.value)
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="apply-all-months"
                checked={applyToAllMonths}
                onChange={(e) => setApplyToAllMonths(e.target.checked)}
                className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              />
              <label htmlFor="apply-all-months" className="text-sm font-medium text-gray-700">
                Aplicar este valor a todos os meses do ano ({selectedAno})
              </label>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!notifyUser}
        onClose={() => setNotifyUser(null)}
        title={notifyUser ? `Enviar notificação de pagamento – ${notifyUser.nome}` : 'Enviar notificação'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNotifyUser(null)}>
              Cancelar
            </Button>
            <Button onClick={submitNotifyPayment} disabled={sendingNotify}>
              {sendingNotify ? 'Enviando...' : 'Enviar notificação'}
            </Button>
          </>
        }
      >
        {notifyUser && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Revise o e-mail abaixo antes de enviar. Você pode editar a mensagem e anexar um arquivo. Ao clicar em &quot;Enviar notificação&quot;, o pagamento será marcado como pago e a notificação in-app também será registrada.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Para (e-mail)</label>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
                {(notifyUser.emailPessoal?.trim() || notifyUser.email)}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {notifyUser.emailPessoal ? 'Notificação enviada ao email pessoal.' : 'Email pessoal não cadastrado; será enviado ao email de acesso.'}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assunto</label>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
                Pagamento confirmado – {MESES_LABELS[selectedMes]} de {selectedAno}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem</label>
              <textarea
                rows={8}
                value={notifyMessage}
                onChange={(e) => setNotifyMessage(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                placeholder="Texto do e-mail..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Anexo (opcional)</label>
              <input
                type="file"
                accept="*/*"
                onChange={(e) => setNotifyFile(e.target.files?.[0] ?? null)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-orange-50 file:px-3 file:py-1 file:text-orange-700 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
              {notifyFile && (
                <p className="text-xs text-gray-500 mt-1">
                  Arquivo selecionado: {notifyFile.name} ({(notifyFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </AdminLayout>
  )
}
