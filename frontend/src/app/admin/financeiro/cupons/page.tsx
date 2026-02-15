/**
 * Financeiro – Cupons
 * Criação e gestão de cupons de desconto (valor por hora-aula, validade).
 * Exibe quantas pessoas se inscreveram usando cada cupom; ao clicar, mostra nomes e permite baixar lista por mês ou período.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import AdminLayout from '@/components/admin/AdminLayout'
import Modal from '@/components/admin/Modal'
import Button from '@/components/ui/Button'
import Toast from '@/components/admin/Toast'
import { Tag, Plus, Loader2, Infinity as InfinityIcon, Users, FileDown } from 'lucide-react'

const MESES_LABELS: Record<number, string> = {
  1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 6: 'Junho',
  7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro',
}
const ANOS_DISPONIVEIS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i)

interface Coupon {
  id: string
  nome: string
  codigo: string | null
  valorPorHoraAula: number
  validade: string | null
  ativo: boolean
  criadoEm: string
  inscricoesCount: number
}

interface EnrollmentItem {
  id: string
  nome: string
  email: string
  criadoEm: string
}

function formatMoney(n: number): string {
  return `R$ ${Number(n).toFixed(2).replace('.', ',')}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function downloadCsv(items: EnrollmentItem[], couponNome: string, label: string) {
  const header = 'Nome;Email;Data inscrição\n'
  const rows = items
    .map((e) => `"${(e.nome || '').replace(/"/g, '""')}";"${(e.email || '').replace(/"/g, '""')}";${new Date(e.criadoEm).toLocaleDateString('pt-BR')}`)
    .join('\n')
  const bom = '\uFEFF'
  const blob = new Blob([bom + header + rows], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `inscricoes-cupom-${(couponNome || 'cupom').replace(/\s+/g, '-')}-${label}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function FinanceiroCuponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Modal inscrições por cupom
  const [listModal, setListModal] = useState<{ coupon: Coupon } | null>(null)
  const [enrollments, setEnrollments] = useState<EnrollmentItem[]>([])
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(false)
  const [filterTipo, setFilterTipo] = useState<'todos' | 'mes' | 'periodo'>('todos')
  const [filterMes, setFilterMes] = useState(new Date().getMonth() + 1)
  const [filterAno, setFilterAno] = useState(new Date().getFullYear())
  const [filterStart, setFilterStart] = useState('')
  const [filterEnd, setFilterEnd] = useState('')

  // Modal criar cupom
  const [modalOpen, setModalOpen] = useState(false)
  const [nome, setNome] = useState('')
  const [codigo, setCodigo] = useState('')
  const [valorPorHoraAula, setValorPorHoraAula] = useState('')
  const [permanente, setPermanente] = useState(true)
  const [validade, setValidade] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchEnrollments = useCallback(async (couponId: string) => {
    setEnrollmentsLoading(true)
    try {
      let url = `/api/admin/coupons/${couponId}/enrollments`
      if (filterTipo === 'mes') {
        url += `?month=${filterMes}&year=${filterAno}`
      } else if (filterTipo === 'periodo' && filterStart && filterEnd) {
        url += `?start=${filterStart}&end=${filterEnd}`
      }
      const res = await fetch(url, { credentials: 'include' })
      const json = await res.json()
      if (res.ok && json.ok) {
        setEnrollments(json.data ?? [])
      } else {
        setEnrollments([])
      }
    } catch {
      setEnrollments([])
    } finally {
      setEnrollmentsLoading(false)
    }
  }, [filterTipo, filterMes, filterAno, filterStart, filterEnd])

  const openListModal = (coupon: Coupon) => {
    setListModal({ coupon })
    setFilterTipo('todos')
    setFilterMes(new Date().getMonth() + 1)
    setFilterAno(new Date().getFullYear())
    setFilterStart('')
    setFilterEnd('')
  }

  useEffect(() => {
    if (listModal) {
      fetchEnrollments(listModal.coupon.id)
    }
  }, [listModal, fetchEnrollments])

  const handleDownloadList = () => {
    if (!listModal || enrollments.length === 0) return
    let label = 'todos'
    if (filterTipo === 'mes') label = `${filterMes}-${filterAno}`
    else if (filterTipo === 'periodo' && filterStart && filterEnd)
      label = `${filterStart}-${filterEnd}`
    downloadCsv(enrollments, listModal.coupon.nome, label)
  }

  const fetchCoupons = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/coupons', { credentials: 'include' })
      const json = await res.json()
      if (res.ok && json.ok) {
        setCoupons(json.data ?? [])
      } else {
        setToast({ message: json.message || 'Erro ao carregar cupons', type: 'error' })
        setCoupons([])
      }
    } catch {
      setToast({ message: 'Erro ao carregar cupons', type: 'error' })
      setCoupons([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCoupons()
  }, [fetchCoupons])

  const openModal = () => {
    setNome('')
    setCodigo('')
    setValorPorHoraAula('')
    setPermanente(true)
    setValidade('')
    setToast(null)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const nomeTrim = nome.trim()
    if (!nomeTrim) {
      setToast({ message: 'Nome do cupom é obrigatório', type: 'error' })
      return
    }
    const valorStr = valorPorHoraAula.replace(',', '.')
    const valor = parseFloat(valorStr)
    if (Number.isNaN(valor) || valor < 0) {
      setToast({ message: 'Valor por hora-aula deve ser um número maior ou igual a zero', type: 'error' })
      return
    }
    if (!permanente && !validade) {
      setToast({ message: 'Informe a data de validade ou marque como cupom permanente', type: 'error' })
      return
    }

    setSaving(true)
    setToast(null)
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          nome: nomeTrim,
          codigo: codigo.trim() || undefined,
          valorPorHoraAula: valor,
          permanente,
          validade: permanente ? null : validade,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao criar cupom', type: 'error' })
        return
      }
      setToast({ message: 'Cupom criado com sucesso', type: 'success' })
      await fetchCoupons()
      closeModal()
    } catch {
      setToast({ message: 'Erro ao criar cupom', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const hoje = new Date().toISOString().slice(0, 10)

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Financeiro – Cupons</h1>
            <p className="text-gray-600 mt-1">
              Crie cupons com valor por hora-aula e validade para aplicar em matrículas.
            </p>
          </div>
          <Button onClick={openModal} className="shrink-0">
            <Plus className="w-5 h-5 mr-2" />
            Criar cupom
          </Button>
        </div>

        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
          </div>
        ) : coupons.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 p-12 text-center">
            <Tag className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 font-medium">Nenhum cupom cadastrado</p>
            <p className="text-sm text-gray-500 mt-1">Clique em &quot;Criar cupom&quot; para adicionar o primeiro.</p>
            <Button onClick={openModal} className="mt-4">
              <Plus className="w-5 h-5 mr-2" />
              Criar cupom
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {coupons.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4 shadow-sm hover:bg-emerald-100 transition-colors"
              >
                <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">
                  {c.nome}
                </p>
                {c.codigo && (
                  <p className="text-xs text-emerald-600 mt-0.5 font-mono">{c.codigo}</p>
                )}
                <p className="mt-2 text-xl font-bold text-emerald-900">
                  {formatMoney(c.valorPorHoraAula)} / hora-aula
                </p>
                <p className="text-xs text-gray-600 mt-1 flex items-center gap-1">
                  {c.validade ? (
                    <>Válido até {formatDate(c.validade)}</>
                  ) : (
                    <>
                      <InfinityIcon className="w-3.5 h-3.5" />
                      Permanente
                    </>
                  )}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Criado em {formatDate(c.criadoEm)}
                </p>
                <button
                  type="button"
                  onClick={() => openListModal(c)}
                  className="mt-3 flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-900 hover:underline"
                >
                  <Users className="w-4 h-4" />
                  <span>
                    {String(Number(c.inscricoesCount ?? 0))} inscri{Number(c.inscricoesCount ?? 0) === 1 ? 'ção' : 'ções'}
                    {Number(c.inscricoesCount ?? 0) > 0 ? ' (clique para ver)' : ''}
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title="Criar cupom"
        size="md"
        footer={
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={closeModal} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void handleSubmit({ preventDefault: () => {} } as React.FormEvent)} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Criar cupom'
              )}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Nome do cupom <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Desconto Black Friday"
              className="input w-full"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Código (opcional)
            </label>
            <input
              type="text"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              placeholder="Ex: BLACK20"
              className="input w-full font-mono uppercase"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Valor por hora-aula (R$) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={valorPorHoraAula}
              onChange={(e) => setValorPorHoraAula(e.target.value.replace(/[^0-9,.]/g, ''))}
              placeholder="Ex: 45,00"
              className="input w-full"
              required
            />
            <p className="text-xs text-gray-500 mt-0.5">
              Valor que o aluno pagará por hora-aula ao usar este cupom
            </p>
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={permanente}
                onChange={(e) => {
                  setPermanente(e.target.checked)
                  if (e.target.checked) setValidade('')
                }}
                className="rounded border-gray-300 text-brand-orange"
              />
              <span className="text-sm font-medium text-gray-700">Cupom permanente</span>
            </label>
          </div>

          {!permanente && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Data de validade <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={validade}
                onChange={(e) => setValidade(e.target.value)}
                min={hoje}
                className="input w-full"
              />
            </div>
          )}
        </form>
      </Modal>

      {/* Modal lista de inscrições */}
      <Modal
        isOpen={!!listModal}
        onClose={() => setListModal(null)}
        title={listModal ? `Inscrições – ${listModal.coupon.nome}` : ''}
        size="lg"
        footer={
          listModal && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadList}
                  disabled={enrollments.length === 0}
                >
                  <FileDown className="w-4 h-4 mr-2" />
                  Baixar CSV
                </Button>
              </div>
              <Button variant="outline" onClick={() => setListModal(null)}>
                Fechar
              </Button>
            </div>
          )
        }
      >
        {listModal && (
          <div className="space-y-4">
            {/* Filtros */}
            <div className="flex flex-wrap items-end gap-4 p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Filtrar:</label>
                <select
                  value={filterTipo}
                  onChange={(e) => setFilterTipo(e.target.value as 'todos' | 'mes' | 'periodo')}
                  className="input py-2 text-sm"
                >
                  <option value="todos">Todos</option>
                  <option value="mes">Por mês</option>
                  <option value="periodo">Por período</option>
                </select>
              </div>
              {filterTipo === 'mes' && (
                <div className="flex items-end gap-2">
                  <select
                    value={filterMes}
                    onChange={(e) => setFilterMes(Number(e.target.value))}
                    className="input py-2 text-sm w-32"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                      <option key={String(m)} value={m}>{MESES_LABELS[m]}</option>
                    ))}
                  </select>
                  <select
                    value={filterAno}
                    onChange={(e) => setFilterAno(Number(e.target.value))}
                    className="input py-2 text-sm w-24"
                  >
                    {ANOS_DISPONIVEIS.map((ano) => (
                      <option key={String(ano)} value={ano}>{String(ano)}</option>
                    ))}
                  </select>
                </div>
              )}
              {filterTipo === 'periodo' && (
                <div className="flex items-end gap-2">
                  <input
                    type="date"
                    value={filterStart}
                    onChange={(e) => setFilterStart(e.target.value)}
                    className="input py-2 text-sm"
                    placeholder="Início"
                  />
                  <input
                    type="date"
                    value={filterEnd}
                    onChange={(e) => setFilterEnd(e.target.value)}
                    className="input py-2 text-sm"
                    placeholder="Fim"
                  />
                </div>
              )}
              <Button size="sm" onClick={() => fetchEnrollments(listModal.coupon.id)}>
                Aplicar
              </Button>
            </div>

            {/* Lista */}
            {enrollmentsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
              </div>
            ) : enrollments.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                Nenhuma inscrição encontrada para os filtros selecionados.
              </p>
            ) : (
              <div className="max-h-80 overflow-y-auto border border-gray-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2 font-semibold text-gray-700">Nome</th>
                      <th className="text-left px-4 py-2 font-semibold text-gray-700">Email</th>
                      <th className="text-left px-4 py-2 font-semibold text-gray-700">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollments.map((e) => (
                      <tr key={e.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-2">{e.nome}</td>
                        <td className="px-4 py-2 text-gray-600">{e.email}</td>
                        <td className="px-4 py-2 text-gray-500">{formatDate(e.criadoEm)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
    </AdminLayout>
  )
}
