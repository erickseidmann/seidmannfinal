/**
 * Financeiro – Saídas
 * Despesas fixas e outras despesas (avulsas).
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import AdminLayout from '@/components/admin/AdminLayout'
import Table, { Column } from '@/components/admin/Table'
import Modal from '@/components/admin/Modal'
import Button from '@/components/ui/Button'
import Toast from '@/components/admin/Toast'
import { Plus, Trash2, Calendar, ChevronDown, ChevronRight, FileDown, Upload, Download } from 'lucide-react'

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
  paidAt?: string | null
  receiptUrl?: string | null
  fixedSeriesId?: string | null
}

interface BankExtratoItem {
  id: string
  originalFilename: string
  fileUrl: string
  criadoEm: string
  sizeBytes: number | null
}

function formatMoney(n: number): string {
  return `R$ ${Number(n).toFixed(2).replace('.', ',')}`
}

function formatDateIso(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
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
  const [modalIsFixedExpense, setModalIsFixedExpense] = useState(false)

  const [modalMarkPaid, setModalMarkPaid] = useState<ExpenseRow | null>(null)
  const [markPaidData, setMarkPaidData] = useState('')
  const [markPaidFile, setMarkPaidFile] = useState<File | null>(null)
  const [markPaidSaving, setMarkPaidSaving] = useState(false)

  const [showPeriodo, setShowPeriodo] = useState(true)
  const [itemsPerPageExpenses, setItemsPerPageExpenses] = useState(10)
  const [itemsPerPageFixed, setItemsPerPageFixed] = useState(10)

  const [extratos, setExtratos] = useState<BankExtratoItem[]>([])
  const [extratosLoading, setExtratosLoading] = useState(false)
  const [extratoUploading, setExtratoUploading] = useState(false)
  const [extratoDownloading, setExtratoDownloading] = useState(false)
  const extratoInputRef = useRef<HTMLInputElement | null>(null)

  const fetchExtratos = useCallback(async (ano: number, mes: number) => {
    setExtratosLoading(true)
    try {
      const res = await fetch(
        `/api/admin/financeiro/administracao/bank-extratos?year=${ano}&month=${mes}`,
        { credentials: 'include' }
      )
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setExtratos([])
        return
      }
      setExtratos(json.data?.items ?? [])
    } catch {
      setExtratos([])
    } finally {
      setExtratosLoading(false)
    }
  }, [])

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

  useEffect(() => {
    fetchExtratos(selectedAno, selectedMes)
  }, [selectedAno, selectedMes, fetchExtratos])

  useEffect(() => {
    if (modalMarkPaid) {
      const t = new Date()
      setMarkPaidData(
        `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
      )
      setMarkPaidFile(null)
    }
  }, [modalMarkPaid])

  const fixedExpenses = expenses.filter((e) => e.isFixed === true)
  const otherExpenses = expenses.filter((e) => e.isFixed !== true)
  const totalDespesas = expenses.reduce((s, e) => s + e.valor, 0)
  const totalPagoDespesas = expenses
    .filter((e) => e.paymentStatus === 'PAGO')
    .reduce((s, e) => s + e.valor, 0)
  const displayedFixedExpenses = fixedExpenses.slice(0, itemsPerPageFixed)
  const displayedOtherExpenses = otherExpenses.slice(0, itemsPerPageExpenses)

  const openModalDespesa = (asFixed = false) => {
    setModalIsFixedExpense(asFixed)
    setDespesaNome('')
    setDespesaDescricao('')
    setDespesaValor('')
    setDespesaRepeteMensal(asFixed)
    setDespesaMeses(asFixed ? '1' : '1')
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
          recurringFixed: modalIsFixedExpense,
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

  const setExpenseEmAberto = async (expenseId: string) => {
    try {
      const res = await fetch(`/api/admin/financeiro/administracao/expenses/${expenseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentStatus: 'EM_ABERTO' }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao atualizar.', type: 'error' })
        return
      }
      await fetchData(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao atualizar.', type: 'error' })
    }
  }

  const submitMarcarPago = async () => {
    if (!modalMarkPaid) return
    if (!markPaidData.trim()) {
      setToast({ message: 'Informe a data do pagamento.', type: 'error' })
      return
    }
    if (!markPaidFile) {
      setToast({ message: 'Anexe o comprovante (PDF ou imagem).', type: 'error' })
      return
    }
    setMarkPaidSaving(true)
    setToast(null)
    try {
      const fd = new FormData()
      fd.append('file', markPaidFile)
      const up = await fetch('/api/admin/financeiro/administracao/expenses/upload-receipt', {
        method: 'POST',
        body: fd,
        credentials: 'include',
      })
      const upJson = await up.json()
      if (!up.ok || !upJson.ok || !upJson.data?.url) {
        setToast({ message: upJson.message || 'Falha ao enviar comprovante.', type: 'error' })
        return
      }
      const res = await fetch(`/api/admin/financeiro/administracao/expenses/${modalMarkPaid.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentStatus: 'PAGO',
          paidAt: markPaidData,
          receiptUrl: upJson.data.url as string,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao registrar pagamento.', type: 'error' })
        return
      }
      setToast({ message: 'Pagamento registrado.', type: 'success' })
      setModalMarkPaid(null)
      setMarkPaidFile(null)
      setMarkPaidData('')
      await fetchData(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao registrar pagamento.', type: 'error' })
    } finally {
      setMarkPaidSaving(false)
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
      render: (row) => {
        if (row.paymentStatus === 'PAGO' && row.paidAt) {
          return (
            <div className="flex flex-col gap-1 text-sm max-w-[220px]">
              <span className="text-green-800 font-medium">Pago em {formatDateIso(row.paidAt)}</span>
              {row.receiptUrl ? (
                <a
                  href={row.receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-orange hover:underline"
                >
                  Ver comprovante
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => void setExpenseEmAberto(row.id)}
                className="text-left text-xs text-gray-600 hover:text-gray-900 underline"
              >
                Voltar para em aberto
              </button>
            </div>
          )
        }
        return (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-amber-800">Em aberto</span>
            <Button variant="primary" size="sm" onClick={() => setModalMarkPaid(row)}>
              Marcar pago
            </Button>
          </div>
        )
      },
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

  const handleExtratoFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setExtratoUploading(true)
    setToast(null)
    try {
      const fd = new FormData()
      fd.append('year', String(selectedAno))
      fd.append('month', String(selectedMes))
      fd.append('file', file)
      const res = await fetch('/api/admin/financeiro/administracao/bank-extratos', {
        method: 'POST',
        body: fd,
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao importar extrato.', type: 'error' })
        return
      }
      const created = typeof json.data?.expensesCreated === 'number' ? json.data.expensesCreated : 0
      const note = typeof json.data?.parseNote === 'string' ? json.data.parseNote : ''
      let msg =
        created > 0
          ? `Extrato salvo. ${created} despesa(s) lançada(s) em Outras despesas (${MESES_LABELS[selectedMes]}/${selectedAno}).`
          : note || 'Extrato salvo.'
      if (created > 0 && json.data?.parseFormat && json.data.parseFormat !== 'none') {
        msg += ` (${json.data.parseFormat.toUpperCase()})`
      }
      setToast({ message: msg, type: 'success' })
      await fetchExtratos(selectedAno, selectedMes)
      await fetchData(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao importar extrato.', type: 'error' })
    } finally {
      setExtratoUploading(false)
    }
  }

  const downloadExtratosMes = async () => {
    if (extratos.length === 0) {
      setToast({ message: 'Nenhum extrato para este mês.', type: 'error' })
      return
    }
    setExtratoDownloading(true)
    setToast(null)
    try {
      const res = await fetch(
        `/api/admin/financeiro/administracao/bank-extratos/download?year=${selectedAno}&month=${selectedMes}`,
        { credentials: 'include' }
      )
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string }
        setToast({ message: j.message || 'Erro ao baixar extratos.', type: 'error' })
        return
      }
      const blob = await res.blob()
      const disp = res.headers.get('Content-Disposition')
      let filename = `extratos-banco_${selectedAno}-${String(selectedMes).padStart(2, '0')}.zip`
      const m = disp?.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i)
      const raw = m?.[1] || m?.[2]
      if (raw) {
        try {
          filename = decodeURIComponent(raw.trim())
        } catch {
          filename = raw
        }
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setToast({ message: 'Erro ao baixar extratos.', type: 'error' })
    } finally {
      setExtratoDownloading(false)
    }
  }

  const removeExtrato = async (id: string) => {
    if (!confirm('Remover este extrato deste mês?')) return
    try {
      const res = await fetch(`/api/admin/financeiro/administracao/bank-extratos/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao remover.', type: 'error' })
        return
      }
      setToast({ message: 'Extrato removido.', type: 'success' })
      await fetchExtratos(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao remover extrato.', type: 'error' })
    }
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

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">Extratos bancários</p>
              <p className="text-xs text-gray-500 mt-1">
                <strong>OFX, QFX ou CSV</strong> do banco geram lançamentos em Outras despesas no mês selecionado. PDF e imagem
                apenas anexam o arquivo. O download reúne todos os arquivos do{' '}
                <strong>
                  {MESES_LABELS[selectedMes]} de {selectedAno}
                </strong>{' '}
                (ZIP se houver mais de um).
              </p>
              <p className="text-sm text-gray-700 mt-2">
                {extratosLoading
                  ? 'Carregando lista…'
                  : extratos.length === 0
                    ? 'Nenhum extrato neste mês.'
                    : `${extratos.length} arquivo(s) neste mês.`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <input
                ref={extratoInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.ofx,.qfx,.csv,.txt,image/png,image/jpeg,image/webp"
                onChange={handleExtratoFileSelected}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={extratos.length === 0 || extratoDownloading || extratosLoading}
                onClick={() => void downloadExtratosMes()}
              >
                <Download className="w-4 h-4 mr-2" />
                {extratoDownloading ? 'Baixando…' : 'Download extratos do mês'}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={extratoUploading}
                onClick={() => extratoInputRef.current?.click()}
              >
                <Upload className="w-4 h-4 mr-2" />
                {extratoUploading ? 'Importando…' : 'Importar extrato'}
              </Button>
            </div>
          </div>
          {!extratosLoading && extratos.length > 0 ? (
            <ul className="mt-4 pt-4 border-t border-gray-100 space-y-2">
              {extratos.map((ex) => (
                <li
                  key={ex.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-800"
                >
                  <a
                    href={ex.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-orange hover:underline font-medium truncate min-w-0"
                  >
                    {ex.originalFilename}
                  </a>
                  <button
                    type="button"
                    onClick={() => void removeExtrato(ex.id)}
                    className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
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
            <div className="flex flex-wrap items-center justify-end gap-2">
              <label className="text-xs text-gray-500">Itens por página</label>
              <select value={itemsPerPageFixed} onChange={(e) => setItemsPerPageFixed(Number(e.target.value))} className="input min-w-[72px] text-sm py-1.5">
                <option value={3}>3</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={100}>100</option>
              </select>
              <Button variant="outline" size="sm" onClick={() => exportCsv(fixedExpenses, ['Nome', 'Descrição', 'Valor', 'Pagamento', 'Data pagamento'], (r) => [r.name, r.description ?? '', formatMoney(r.valor), r.paymentStatus === 'PAGO' ? 'Pago' : 'Em aberto', r.paidAt ? formatDateIso(r.paidAt) : ''])}>
                <FileDown className="w-4 h-4 mr-2" />
                Exportar
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={extratoUploading}
                title="Anexar extrato bancário ao mês selecionado (competência)"
                onClick={() => extratoInputRef.current?.click()}
              >
                <Upload className="w-4 h-4 mr-2" />
                {extratoUploading ? 'Importando…' : 'Importar extrato'}
              </Button>
              <Button variant="primary" size="sm" onClick={() => openModalDespesa(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Adicionar despesa
              </Button>
            </div>
          </div>
          <div className="px-5 py-3 text-sm text-gray-600 border-b border-gray-100">
            Despesas que se repetem <strong>todo mês</strong> (internet, aluguel etc.). Ao adicionar, a linha é criada no mês atual e
            replicada automaticamente nos demais meses ao selecionar o período. Para marcar como pago é obrigatório informar a data e
            anexar o comprovante.
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
            <div className="flex flex-wrap items-center justify-end gap-2">
              <label className="text-xs text-gray-500">Itens por página</label>
              <select value={itemsPerPageExpenses} onChange={(e) => setItemsPerPageExpenses(Number(e.target.value))} className="input min-w-[72px] text-sm py-1.5">
                <option value={3}>3</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={100}>100</option>
              </select>
              <Button variant="outline" size="sm" onClick={() => exportCsv(otherExpenses, ['Nome', 'Descrição', 'Valor', 'Pagamento', 'Data pagamento'], (r) => [r.name, r.description ?? '', formatMoney(r.valor), r.paymentStatus === 'PAGO' ? 'Pago' : 'Em aberto', r.paidAt ? formatDateIso(r.paidAt) : ''])}>
                <FileDown className="w-4 h-4 mr-2" />
                Exportar
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={extratoUploading}
                title="Anexar extrato bancário ao mês selecionado (competência)"
                onClick={() => extratoInputRef.current?.click()}
              >
                <Upload className="w-4 h-4 mr-2" />
                {extratoUploading ? 'Importando…' : 'Importar extrato'}
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
        isOpen={!!modalMarkPaid}
        onClose={() => {
          setModalMarkPaid(null)
          setMarkPaidFile(null)
        }}
        title="Marcar despesa como paga"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalMarkPaid(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void submitMarcarPago()} disabled={markPaidSaving}>
              {markPaidSaving ? 'Salvando...' : 'Confirmar pagamento'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            <strong>{modalMarkPaid?.name}</strong> — {modalMarkPaid ? `${formatMoney(modalMarkPaid.valor)}` : ''}
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data em que foi pago *</label>
            <input
              type="date"
              value={markPaidData}
              onChange={(e) => setMarkPaidData(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Comprovante (PDF ou imagem) *</label>
            <input
              type="file"
              accept=".pdf,image/png,image/jpeg,image/webp"
              onChange={(e) => setMarkPaidFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-600"
            />
            {markPaidFile ? (
              <p className="text-xs text-gray-500 mt-1">Arquivo: {markPaidFile.name}</p>
            ) : null}
          </div>
        </div>
      </Modal>

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
            {modalIsFixedExpense ? (
              <>
                A despesa fixa começa em <strong>{MESES_LABELS[selectedMes]} de {selectedAno}</strong> e será gerada
                automaticamente em <strong>todos os meses</strong> ao navegar no calendário (mesmo valor e nome; copiados do último
                registro da série).
              </>
            ) : (
              <>
                A despesa será registrada a partir de {MESES_LABELS[selectedMes]} de {selectedAno}.
                {despesaRepeteMensal && ' Se repetir por vários meses, serão criadas várias entradas (uma por mês), avulsas.'}
              </>
            )}
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
          {!modalIsFixedExpense && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="repete-mensal"
                checked={despesaRepeteMensal}
                onChange={(e) => setDespesaRepeteMensal(e.target.checked)}
                className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              />
              <label htmlFor="repete-mensal" className="text-sm font-medium text-gray-700">
                Repetir em vários meses (parcelas avulsas)
              </label>
            </div>
          )}
          {modalIsFixedExpense && (
            <p className="text-sm text-sky-800 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2">
              Despesa fixa: repetição mensal automática (não é necessário informar quantidade de meses).
            </p>
          )}
          {despesaRepeteMensal && !modalIsFixedExpense && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade de meses</label>
              <input
                type="number"
                min={1}
                max={120}
                value={despesaMeses}
                onChange={(e) => setDespesaMeses(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
              <p className="text-xs text-gray-500 mt-0.5">Uma entrada por mês, apenas para despesas avulsas.</p>
            </div>
          )}
        </div>
      </Modal>
    </AdminLayout>
  )
}
