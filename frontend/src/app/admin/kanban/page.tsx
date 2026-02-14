/**
 * Kanban Admin – 3 colunas: Para fazer, Fazendo, Feito
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import AdminLayout from '@/components/admin/AdminLayout'
import Modal from '@/components/admin/Modal'
import Button from '@/components/ui/Button'
import Toast from '@/components/admin/Toast'
import { Plus, GripVertical, Trash2, Loader2 } from 'lucide-react'

type ColumnId = 'TODO' | 'DOING' | 'DONE'
type PrioridadeId = 'EMERGENCIA' | 'PODE_ESPERAR' | 'FIQUE_ATENTO'

interface KanbanUser {
  id: string
  nome: string
}

interface KanbanCard {
  id: string
  title: string
  setor: string | null
  assignedToId: string | null
  assignedTo: { id: string; nome: string } | null
  column: string
  orderIndex: number
  prioridade: string | null
  criadoEm: string
}

const COLUMN_LABELS: Record<ColumnId, string> = {
  TODO: 'Para fazer',
  DOING: 'Fazendo',
  DONE: 'Feito',
}

const PRIORIDADE_OPCOES: { value: PrioridadeId; label: string }[] = [
  { value: 'EMERGENCIA', label: 'Emergência' },
  { value: 'FIQUE_ATENTO', label: 'Fique atento' },
  { value: 'PODE_ESPERAR', label: 'Pode esperar' },
]

function getPrioridadeCardClass(prioridade: string | null): string {
  switch (prioridade) {
    case 'EMERGENCIA':
      return 'border-l-4 border-l-red-500 bg-red-50/80'
    case 'FIQUE_ATENTO':
      return 'border-l-4 border-l-amber-500 bg-amber-50/80'
    case 'PODE_ESPERAR':
      return 'border-l-4 border-l-green-500 bg-green-50/80'
    default:
      return 'border-l-4 border-l-transparent'
  }
}

export default function AdminKanbanPage() {
  const [cards, setCards] = useState<KanbanCard[]>([])
  const [users, setUsers] = useState<KanbanUser[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addForm, setAddForm] = useState({ title: '', setor: '', assignedToId: '', column: 'TODO' as ColumnId, prioridade: '' as PrioridadeId | '' })
  const [addSaving, setAddSaving] = useState(false)
  const [editingCard, setEditingCard] = useState<KanbanCard | null>(null)
  const [editForm, setEditForm] = useState({ title: '', setor: '', assignedToId: '', column: 'TODO' as ColumnId, prioridade: '' as PrioridadeId | '' })
  const [editSaving, setEditSaving] = useState(false)
  const [filterAssignedToMe, setFilterAssignedToMe] = useState(false)
  const [filterSetor, setFilterSetor] = useState<string>('')
  const [filterColumn, setFilterColumn] = useState<ColumnId | ''>('')

  const fetchCards = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/kanban', { credentials: 'include' })
      const json = await res.json()
      if (res.ok && json.ok && Array.isArray(json.data)) setCards(json.data)
      else setCards([])
    } catch {
      setCards([])
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/kanban/users', { credentials: 'include' })
      const json = await res.json()
      if (res.ok && json.ok && Array.isArray(json.data)) setUsers(json.data)
      else setUsers([])
    } catch {
      setUsers([])
    }
  }, [])

  useEffect(() => {
    fetchCards()
    fetchUsers()
    // Buscar ID do usuário atual
    fetch('/api/admin/me', { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data?.id) {
          setCurrentUserId(json.data.id)
        }
      })
      .catch(() => {})
  }, [fetchCards, fetchUsers])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addForm.title.trim() || addSaving) return
    setAddSaving(true)
    try {
      const res = await fetch('/api/admin/kanban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: addForm.title.trim(),
          setor: addForm.setor.trim() || null,
          assignedToId: addForm.assignedToId || null,
          column: addForm.column,
          prioridade: addForm.prioridade || null,
        }),
      })
      const json = await res.json()
      if (res.ok && json.ok) {
        setCards((prev) => [...prev, json.data])
        setAddForm({ title: '', setor: '', assignedToId: '', column: 'TODO', prioridade: '' })
        setAddModalOpen(false)
        setToast({ message: 'Bloco adicionado.', type: 'success' })
      } else {
        setToast({ message: json.message || 'Erro ao adicionar', type: 'error' })
      }
    } catch {
      setToast({ message: 'Erro ao adicionar', type: 'error' })
    } finally {
      setAddSaving(false)
    }
  }

  const moveCard = async (cardId: string, newColumn: ColumnId) => {
    try {
      const res = await fetch(`/api/admin/kanban/${cardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ column: newColumn }),
      })
      const json = await res.json()
      if (res.ok && json.ok) {
        setCards((prev) => prev.map((c) => (c.id === cardId ? json.data : c)))
        setEditingCard(null)
        setToast({ message: 'Movido.', type: 'success' })
      } else {
        setToast({ message: json.message || 'Erro ao mover', type: 'error' })
      }
    } catch {
      setToast({ message: 'Erro ao mover', type: 'error' })
    }
  }

  const updateCard = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingCard || !editForm.title.trim() || editSaving) return
    setEditSaving(true)
    try {
      const res = await fetch(`/api/admin/kanban/${editingCard.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: editForm.title.trim(),
          setor: editForm.setor.trim() || null,
          assignedToId: editForm.assignedToId || null,
          column: editForm.column,
          prioridade: editForm.prioridade || null,
        }),
      })
      const json = await res.json()
      if (res.ok && json.ok) {
        setCards((prev) => prev.map((c) => (c.id === editingCard.id ? json.data : c)))
        setEditingCard(null)
        setToast({ message: 'Atualizado.', type: 'success' })
      } else {
        setToast({ message: json.message || 'Erro ao salvar', type: 'error' })
      }
    } catch {
      setToast({ message: 'Erro ao salvar', type: 'error' })
    } finally {
      setEditSaving(false)
    }
  }

  const deleteCard = async (cardId: string) => {
    try {
      const res = await fetch(`/api/admin/kanban/${cardId}`, { method: 'DELETE', credentials: 'include' })
      const json = await res.json()
      if (res.ok && json.ok) {
        setCards((prev) => prev.filter((c) => c.id !== cardId))
        setEditingCard(null)
        setToast({ message: 'Bloco excluído.', type: 'success' })
      } else {
        setToast({ message: json.message || 'Erro ao excluir', type: 'error' })
      }
    } catch {
      setToast({ message: 'Erro ao excluir', type: 'error' })
    }
  }

  const openEdit = (card: KanbanCard) => {
    setEditingCard(card)
    setEditForm({
      title: card.title,
      setor: card.setor || '',
      assignedToId: card.assignedToId || '',
      column: card.column as ColumnId,
      prioridade: (card.prioridade as PrioridadeId) || '',
    })
  }

  const columns: ColumnId[] = ['TODO', 'DOING', 'DONE']

  // Filtrar cards baseado nos filtros ativos
  const filteredCards = cards.filter((card) => {
    if (filterAssignedToMe && currentUserId && card.assignedToId !== currentUserId) {
      return false
    }
    if (filterSetor && card.setor !== filterSetor) {
      return false
    }
    if (filterColumn && card.column !== filterColumn) {
      return false
    }
    return true
  })

  // Obter setores únicos para o filtro
  const setores = Array.from(new Set(cards.map((c) => c.setor).filter((s): s is string => !!s))).sort()

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Kanban</h1>
            <p className="text-sm text-gray-600 mt-1">Para fazer, Fazendo, Feito. Atribua setor e responsável.</p>
          </div>
          <Button
            variant="primary"
            size="md"
            className="flex items-center gap-2 w-full sm:w-auto justify-center"
            onClick={() => {
              setAddForm({ title: '', setor: '', assignedToId: '', column: 'TODO', prioridade: '' })
              setAddModalOpen(true)
            }}
          >
            <Plus className="w-4 h-4" />
            Adicionar bloco
          </Button>
        </div>

        {/* Filtros */}
        <div className="mb-6 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="filter-assigned-to-me"
                checked={filterAssignedToMe}
                onChange={(e) => setFilterAssignedToMe(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-brand-orange focus:ring-brand-orange"
              />
              <label htmlFor="filter-assigned-to-me" className="text-sm font-medium text-gray-700 cursor-pointer">
                Exibir blocos direcionados para mim
              </label>
            </div>
            <div className="flex-1 sm:max-w-xs">
              <select
                value={filterSetor}
                onChange={(e) => setFilterSetor(e.target.value)}
                className="input w-full text-sm"
              >
                <option value="">Todos os setores</option>
                {setores.map((setor) => (
                  <option key={setor} value={setor}>{setor}</option>
                ))}
              </select>
            </div>
            <div className="sm:max-w-xs">
              <select
                value={filterColumn}
                onChange={(e) => setFilterColumn(e.target.value as ColumnId | '')}
                className="input w-full text-sm"
              >
                <option value="">Todas as colunas</option>
                {columns.map((col) => (
                  <option key={col} value={col}>{COLUMN_LABELS[col]}</option>
                ))}
              </select>
            </div>
            {(filterAssignedToMe || filterSetor || filterColumn) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFilterAssignedToMe(false)
                  setFilterSetor('')
                  setFilterColumn('')
                }}
                className="shrink-0"
              >
                Limpar filtros
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {columns.map((colId) => {
            const colCards = filteredCards.filter((c) => c.column === colId)
            return (
              <div
                key={colId}
                className="bg-gray-100 rounded-xl p-4 min-h-[400px] flex flex-col"
              >
                <h2 className="text-lg font-semibold text-gray-800 mb-3">
                  {COLUMN_LABELS[colId]}
                  <span className="ml-2 text-sm font-normal text-gray-500">({colCards.length})</span>
                </h2>
                <div className="flex-1 space-y-2 overflow-y-auto">
                  {colCards.map((card) => (
                    <div
                      key={card.id}
                      className={`rounded-lg border border-gray-200 p-3 shadow-sm hover:shadow-md transition-shadow ${getPrioridadeCardClass(card.prioridade)}`}
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900">{card.title}</p>
                          {card.setor && (
                            <p className="text-xs text-gray-500 mt-0.5">Setor: {card.setor}</p>
                          )}
                          {card.assignedTo && (
                            <p className="text-xs text-brand-orange mt-0.5">Quem fará: {card.assignedTo.nome}</p>
                          )}
                          <div className="flex flex-wrap gap-1 mt-2">
                            {columns.filter((c) => c !== card.column).map((targetCol) => (
                              <button
                                key={targetCol}
                                type="button"
                                onClick={() => moveCard(card.id, targetCol)}
                                className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
                              >
                                → {COLUMN_LABELS[targetCol]}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => openEdit(card)}
                              className="text-xs px-2 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-800"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm('Excluir este bloco?')) deleteCard(card.id)
                              }}
                              className="text-xs px-2 py-1 rounded bg-red-100 hover:bg-red-200 text-red-800"
                            >
                              Excluir
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <Modal
          isOpen={addModalOpen}
          onClose={() => setAddModalOpen(false)}
          title="Adicionar bloco"
          size="md"
          footer={
            <>
              <Button variant="outline" onClick={() => setAddModalOpen(false)}>Cancelar</Button>
              <Button variant="primary" onClick={handleAdd} disabled={!addForm.title.trim() || addSaving}>
                {addSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Adicionar
              </Button>
            </>
          }
        >
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Título *</label>
              <input
                type="text"
                value={addForm.title}
                onChange={(e) => setAddForm((f) => ({ ...f, title: e.target.value }))}
                className="input w-full"
                placeholder="Descrição da tarefa"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Setor</label>
              <input
                type="text"
                value={addForm.setor}
                onChange={(e) => setAddForm((f) => ({ ...f, setor: e.target.value }))}
                className="input w-full"
                placeholder="Ex.: Financeiro, Pedagógico"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Quem fará</label>
              <select
                value={addForm.assignedToId}
                onChange={(e) => setAddForm((f) => ({ ...f, assignedToId: e.target.value }))}
                className="input w-full"
              >
                <option value="">— Não atribuído</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Prioridade</label>
              <select
                value={addForm.prioridade}
                onChange={(e) => setAddForm((f) => ({ ...f, prioridade: e.target.value as PrioridadeId | '' }))}
                className="input w-full"
              >
                <option value="">— Nenhuma</option>
                {PRIORIDADE_OPCOES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Coluna</label>
              <select
                value={addForm.column}
                onChange={(e) => setAddForm((f) => ({ ...f, column: e.target.value as ColumnId }))}
                className="input w-full"
              >
                {columns.map((c) => (
                  <option key={c} value={c}>{COLUMN_LABELS[c]}</option>
                ))}
              </select>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={!!editingCard}
          onClose={() => setEditingCard(null)}
          title="Editar bloco"
          size="md"
          footer={
            <>
              <Button variant="outline" onClick={() => setEditingCard(null)}>Cancelar</Button>
              <Button variant="primary" onClick={updateCard} disabled={!editForm.title.trim() || editSaving}>
                {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Salvar
              </Button>
            </>
          }
        >
          {editingCard && (
            <form onSubmit={updateCard} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Título *</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                  className="input w-full"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Setor</label>
                <input
                  type="text"
                  value={editForm.setor}
                  onChange={(e) => setEditForm((f) => ({ ...f, setor: e.target.value }))}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Quem fará</label>
                <select
                  value={editForm.assignedToId}
                  onChange={(e) => setEditForm((f) => ({ ...f, assignedToId: e.target.value }))}
                  className="input w-full"
                >
                  <option value="">— Não atribuído</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Prioridade</label>
                <select
                  value={editForm.prioridade}
                  onChange={(e) => setEditForm((f) => ({ ...f, prioridade: e.target.value as PrioridadeId | '' }))}
                  className="input w-full"
                >
                  <option value="">— Nenhuma</option>
                  {PRIORIDADE_OPCOES.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Coluna</label>
                <select
                  value={editForm.column}
                  onChange={(e) => setEditForm((f) => ({ ...f, column: e.target.value as ColumnId }))}
                  className="input w-full"
                >
                  {columns.map((c) => (
                    <option key={c} value={c}>{COLUMN_LABELS[c]}</option>
                  ))}
                </select>
              </div>
            </form>
          )}
        </Modal>

        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </div>
    </AdminLayout>
  )
}
