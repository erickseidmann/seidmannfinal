/**
 * To do list admin — por dia, compartilhado entre admins (substitui o antigo Kanban).
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import AdminLayout from '@/components/admin/AdminLayout'
import Modal from '@/components/admin/Modal'
import Button from '@/components/ui/Button'
import { ChevronLeft, ChevronRight, ListTodo, Plus, Trash2, Flame, Loader2 } from 'lucide-react'

type TodoCategory = 'GESTAO' | 'FINANCEIRO'
type TodoFilter = 'TODOS' | TodoCategory | 'EMERGENCIA' | 'EM_ANDAMENTO'

interface DashboardTodoApiItem {
  id: string
  text: string
  category: TodoCategory
  isUrgent: boolean
  dayKey: string
  status: string
  criadoEm: string
  createdByUserId: string
  createdByName: string
  resolutionNote: string | null
  progressUpdatedAt: string | null
  progressByUserId: string | null
  progressByName: string | null
  completedAt: string | null
  completedByUserId: string | null
  completedByName: string | null
}

function addDaysToDateKey(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + delta)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function formatDateKeyBR(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  if (!y || !m || !d) return ymd
  return `${d}/${m}/${y}`
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const day = d.getDate().toString().padStart(2, '0')
  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  const h = d.getHours().toString().padStart(2, '0')
  const min = d.getMinutes().toString().padStart(2, '0')
  return `${day}/${month} ${h}:${min}`
}

function normalizeTodo(row: DashboardTodoApiItem): DashboardTodoApiItem {
  const status =
    row.status === 'DONE' || row.status === 'IN_PROGRESS' || row.status === 'OPEN'
      ? row.status
      : 'OPEN'
  return {
    ...row,
    category: row.category === 'FINANCEIRO' ? 'FINANCEIRO' : 'GESTAO',
    status,
    isUrgent: Boolean(row.isUrgent),
    resolutionNote: row.resolutionNote ?? null,
    progressUpdatedAt: row.progressUpdatedAt ?? null,
    progressByUserId: row.progressByUserId ?? null,
    progressByName: row.progressByName ?? null,
  }
}

export default function AdminTodosPage() {
  const [todos, setTodos] = useState<DashboardTodoApiItem[]>([])
  const [todoDateKey, setTodoDateKey] = useState<string | null>(null)
  const [todoTodayKey, setTodoTodayKey] = useState<string | null>(null)
  const [todoLoading, setTodoLoading] = useState(false)
  const [todoError, setTodoError] = useState<string | null>(null)
  const [newTodoText, setNewTodoText] = useState('')
  const [newTodoCategory, setNewTodoCategory] = useState<TodoCategory>('GESTAO')
  const [todoActionId, setTodoActionId] = useState<string | null>(null)
  const [todoFilter, setTodoFilter] = useState<TodoFilter>('TODOS')

  const [completeModalItem, setCompleteModalItem] = useState<DashboardTodoApiItem | null>(null)
  const [resolutionDraft, setResolutionDraft] = useState('')
  const [completeSaving, setCompleteSaving] = useState(false)
  const [progressModalItem, setProgressModalItem] = useState<DashboardTodoApiItem | null>(null)
  const [progressDraft, setProgressDraft] = useState('')
  const [progressSaving, setProgressSaving] = useState(false)

  const fetchTodos = useCallback(async (dateKey: string | null) => {
    setTodoLoading(true)
    setTodoError(null)
    try {
      const url =
        dateKey != null
          ? `/api/admin/dashboard-todos?date=${encodeURIComponent(dateKey)}`
          : '/api/admin/dashboard-todos'
      const res = await fetch(url, { credentials: 'include' })
      const json = await res.json()
      if (!json.ok) {
        setTodoError(typeof json.message === 'string' ? json.message : 'Não foi possível carregar as tarefas')
        setTodos([])
        return
      }
      const data = json.data as {
        todayKey: string
        date: string
        todos: DashboardTodoApiItem[]
      }
      setTodoTodayKey(data.todayKey)
      setTodos(Array.isArray(data.todos) ? data.todos.map(normalizeTodo) : [])
      if (dateKey === null) {
        setTodoDateKey(data.date)
      }
    } catch {
      setTodoError('Erro de rede ao carregar tarefas')
      setTodos([])
    } finally {
      setTodoLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchTodos(todoDateKey)
  }, [todoDateKey, fetchTodos])

  const addTodo = useCallback(async () => {
    const t = newTodoText.trim()
    if (!t || todoDateKey == null) return
    setTodoActionId('__create__')
    try {
      const res = await fetch(`/api/admin/dashboard-todos?date=${encodeURIComponent(todoDateKey)}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t, category: newTodoCategory }),
      })
      const json = await res.json()
      if (!json.ok) {
        setTodoError(typeof json.message === 'string' ? json.message : 'Não foi possível criar a tarefa')
        return
      }
      setNewTodoText('')
      await fetchTodos(todoDateKey)
    } catch {
      setTodoError('Erro de rede ao criar tarefa')
    } finally {
      setTodoActionId(null)
    }
  }, [newTodoText, newTodoCategory, todoDateKey, fetchTodos])

  const reopenTodo = useCallback(
    async (item: DashboardTodoApiItem) => {
      setTodoActionId(item.id)
      try {
        const res = await fetch(`/api/admin/dashboard-todos/${encodeURIComponent(item.id)}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ done: false }),
        })
        const json = await res.json()
        if (!json.ok) {
          setTodoError(typeof json.message === 'string' ? json.message : 'Não foi possível atualizar')
          return
        }
        if (todoDateKey != null) await fetchTodos(todoDateKey)
      } catch {
        setTodoError('Erro de rede ao atualizar tarefa')
      } finally {
        setTodoActionId(null)
      }
    },
    [todoDateKey, fetchTodos]
  )

  const submitComplete = useCallback(async () => {
    if (!completeModalItem || todoDateKey == null) return
    const note = resolutionDraft.trim()
    if (!note) {
      setTodoError('Descreva o que foi feito para concluir.')
      return
    }
    setCompleteSaving(true)
    setTodoError(null)
    try {
      const res = await fetch(`/api/admin/dashboard-todos/${encodeURIComponent(completeModalItem.id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: true, resolutionNote: note }),
      })
      const json = await res.json()
      if (!json.ok) {
        setTodoError(typeof json.message === 'string' ? json.message : 'Não foi possível concluir')
        return
      }
      setCompleteModalItem(null)
      setResolutionDraft('')
      await fetchTodos(todoDateKey)
    } catch {
      setTodoError('Erro de rede ao concluir tarefa')
    } finally {
      setCompleteSaving(false)
    }
  }, [completeModalItem, resolutionDraft, todoDateKey, fetchTodos])

  const toggleUrgent = useCallback(
    async (item: DashboardTodoApiItem) => {
      if (item.status === 'DONE') return
      setTodoActionId(item.id)
      try {
        const res = await fetch(`/api/admin/dashboard-todos/${encodeURIComponent(item.id)}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urgent: !item.isUrgent }),
        })
        const json = await res.json()
        if (!json.ok) {
          setTodoError(typeof json.message === 'string' ? json.message : 'Não foi possível atualizar urgência')
          return
        }
        if (todoDateKey != null) await fetchTodos(todoDateKey)
      } catch {
        setTodoError('Erro de rede ao marcar urgência')
      } finally {
        setTodoActionId(null)
      }
    },
    [todoDateKey, fetchTodos]
  )

  const removeTodo = useCallback(
    async (id: string) => {
      setTodoActionId(id)
      try {
        const res = await fetch(`/api/admin/dashboard-todos/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          credentials: 'include',
        })
        const json = await res.json()
        if (!json.ok) {
          setTodoError(typeof json.message === 'string' ? json.message : 'Não foi possível remover')
          return
        }
        if (todoDateKey != null) await fetchTodos(todoDateKey)
      } catch {
        setTodoError('Erro de rede ao remover tarefa')
      } finally {
        setTodoActionId(null)
      }
    },
    [todoDateKey, fetchTodos]
  )

  const closeCompleteModal = () => {
    if (completeSaving) return
    setCompleteModalItem(null)
    setResolutionDraft('')
  }

  const submitProgress = useCallback(async () => {
    if (!progressModalItem || todoDateKey == null) return
    const note = progressDraft.trim()
    if (!note) {
      setTodoError('Descreva o andamento da tarefa.')
      return
    }
    setProgressSaving(true)
    setTodoError(null)
    try {
      const res = await fetch(`/api/admin/dashboard-todos/${encodeURIComponent(progressModalItem.id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inProgress: true, progressNote: note }),
      })
      const json = await res.json()
      if (!json.ok) {
        setTodoError(typeof json.message === 'string' ? json.message : 'Não foi possível atualizar andamento')
        return
      }
      setProgressModalItem(null)
      setProgressDraft('')
      await fetchTodos(todoDateKey)
    } catch {
      setTodoError('Erro de rede ao atualizar andamento')
    } finally {
      setProgressSaving(false)
    }
  }, [progressModalItem, progressDraft, todoDateKey, fetchTodos])

  const closeProgressModal = () => {
    if (progressSaving) return
    setProgressModalItem(null)
    setProgressDraft('')
  }

  const visibleTodos = todos.filter((item) => {
    if (todoFilter === 'TODOS') return true
    if (todoFilter === 'EMERGENCIA') return item.isUrgent
    if (todoFilter === 'EM_ANDAMENTO') return item.status === 'IN_PROGRESS'
    return item.category === todoFilter
  })

  // Ordenação para exibir primeiro o que está em aberto.
  // Mantém a ordem original dentro de cada grupo (por ser return 0 nos empates).
  const visibleTodosSorted = [...visibleTodos].sort((a, b) => {
    const aDone = a.status === 'DONE'
    const bDone = b.status === 'DONE'
    if (aDone !== bDone) return aDone ? 1 : -1

    const aUrgentOpen = a.isUrgent && !aDone
    const bUrgentOpen = b.isUrgent && !bDone
    if (aUrgentOpen !== bUrgentOpen) return aUrgentOpen ? -1 : 1

    return 0
  })

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Modal
          isOpen={!!completeModalItem}
          onClose={closeCompleteModal}
          title="Concluir tarefa"
          size="md"
          footer={
            <>
              <Button variant="outline" onClick={closeCompleteModal} disabled={completeSaving}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={() => void submitComplete()} disabled={completeSaving}>
                {completeSaving ? 'Salvando…' : 'Marcar como concluída'}
              </Button>
            </>
          }
        >
          {completeModalItem && (
            <>
              <p className="text-sm text-gray-700 mb-2">
                <span className="font-medium">Tarefa:</span> {completeModalItem.text}
              </p>
              <label htmlFor="resolution-note" className="block text-sm font-medium text-gray-800 mb-1">
                O que você fez para resolver? <span className="text-red-600">*</span>
              </label>
              <textarea
                id="resolution-note"
                value={resolutionDraft}
                onChange={(e) => setResolutionDraft(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Descreva a solução ou o que foi feito…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/40 focus:border-brand-orange"
                disabled={completeSaving}
              />
              <p className="text-xs text-gray-500 mt-1">{resolutionDraft.length}/2000</p>
            </>
          )}
        </Modal>
        <Modal
          isOpen={!!progressModalItem}
          onClose={closeProgressModal}
          title="Atualizar andamento"
          size="md"
          footer={
            <>
              <Button variant="outline" onClick={closeProgressModal} disabled={progressSaving}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={() => void submitProgress()} disabled={progressSaving}>
                {progressSaving ? 'Salvando…' : 'Salvar em andamento'}
              </Button>
            </>
          }
        >
          {progressModalItem && (
            <>
              <p className="text-sm text-gray-700 mb-2">
                <span className="font-medium">Tarefa:</span> {progressModalItem.text}
              </p>
              <label htmlFor="progress-note" className="block text-sm font-medium text-gray-800 mb-1">
                O que está sendo feito? <span className="text-red-600">*</span>
              </label>
              <textarea
                id="progress-note"
                value={progressDraft}
                onChange={(e) => setProgressDraft(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Ex.: aguardando retorno do financeiro, já enviei e-mail e cobrei no WhatsApp…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/40 focus:border-brand-orange"
                disabled={progressSaving}
              />
              <p className="text-xs text-gray-500 mt-1">{progressDraft.length}/2000</p>
            </>
          )}
        </Modal>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 md:p-8 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
            <div className="flex items-start gap-3 min-w-0">
              <div className="rounded-lg bg-orange-50 p-2 text-brand-orange shrink-0">
                <ListTodo className="w-6 h-6" aria-hidden />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-semibold text-slate-800">To do list</h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={!todoDateKey || todoLoading}
                onClick={() => todoDateKey && setTodoDateKey(addDaysToDateKey(todoDateKey, -1))}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
                aria-label="Dia anterior"
              >
                <ChevronLeft className="w-5 h-5" aria-hidden />
              </button>
              <div className="flex items-center gap-2 px-2 min-w-[7.5rem] justify-center">
                <span className="text-sm font-medium text-slate-800 tabular-nums">
                  {todoDateKey ? formatDateKeyBR(todoDateKey) : '…'}
                </span>
                {todoTodayKey && todoDateKey === todoTodayKey && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-orange bg-orange-50 px-1.5 py-0.5 rounded">
                    Hoje
                  </span>
                )}
              </div>
              <button
                type="button"
                disabled={!todoDateKey || todoLoading}
                onClick={() => todoDateKey && setTodoDateKey(addDaysToDateKey(todoDateKey, 1))}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
                aria-label="Próximo dia"
              >
                <ChevronRight className="w-5 h-5" aria-hidden />
              </button>
              {todoTodayKey && todoDateKey && todoDateKey !== todoTodayKey && (
                <button
                  type="button"
                  disabled={todoLoading}
                  onClick={() => setTodoDateKey(todoTodayKey)}
                  className="text-xs font-medium text-brand-orange hover:underline disabled:opacity-40"
                >
                  Ir para hoje
                </button>
              )}
            </div>
          </div>
          {todoError && (
            <p className="text-sm text-red-600 mb-3" role="alert">
              {todoError}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch mb-4">
            <input
              type="text"
              value={newTodoText}
              onChange={(e) => setNewTodoText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void addTodo()}
              placeholder="Adicionar tarefa…"
              disabled={todoDateKey == null || todoLoading || todoActionId === '__create__'}
              className="flex-1 min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/40 focus:border-brand-orange disabled:bg-slate-50 disabled:text-slate-400"
              maxLength={500}
              aria-label="Nova tarefa"
            />
            <select
              value={newTodoCategory}
              onChange={(e) => setNewTodoCategory(e.target.value as TodoCategory)}
              disabled={todoDateKey == null || todoLoading || todoActionId === '__create__'}
              className="w-full sm:w-[11rem] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/40 focus:border-brand-orange disabled:bg-slate-50 disabled:text-slate-400"
              aria-label="Área: Gestão ou Financeiro"
            >
              <option value="GESTAO">Gestão</option>
              <option value="FINANCEIRO">Financeiro</option>
            </select>
            <button
              type="button"
              onClick={() => void addTodo()}
              disabled={todoDateKey == null || todoLoading || todoActionId === '__create__'}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-orange text-white px-4 py-2 text-sm font-medium hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 shrink-0 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" aria-hidden />
              Adicionar
            </button>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
            <label className="text-sm font-medium text-slate-700 shrink-0">Filtrar:</label>
            <select
              value={todoFilter}
              onChange={(e) => setTodoFilter(e.target.value as TodoFilter)}
              disabled={todoDateKey == null || todoLoading || todoActionId === '__create__'}
              className="w-full sm:w-[12rem] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/40 focus:border-brand-orange disabled:bg-slate-50 disabled:text-slate-400"
              aria-label="Filtro To do list"
            >
              <option value="TODOS">Todos</option>
              <option value="GESTAO">Gestão</option>
              <option value="FINANCEIRO">Financeiro</option>
              <option value="EM_ANDAMENTO">Em andamento</option>
              <option value="EMERGENCIA">Emergência (fogo)</option>
            </select>
          </div>
          {todoLoading && todos.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
              Carregando tarefas…
            </p>
          ) : todos.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
              Nenhuma tarefa neste dia. Use o campo acima para criar lembretes.
            </p>
          ) : visibleTodos.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
              Nenhuma tarefa no filtro selecionado.
            </p>
          ) : (
            <ul className="space-y-2" aria-label="Lista de tarefas">
              {visibleTodosSorted.map((item) => {
                const isDone = item.status === 'DONE'
                const isInProgress = item.status === 'IN_PROGRESS'
                const isFin = item.category === 'FINANCEIRO'
                const urgentOpen = item.isUrgent && !isDone
                return (
                  <li
                    key={item.id}
                    className={`flex items-start gap-3 rounded-xl px-3 py-2.5 group border ${
                      urgentOpen
                        ? 'border-2 border-red-400 bg-red-50 animate-todo-urgent'
                        : 'border-slate-100 bg-slate-50/60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isDone}
                      disabled={todoActionId === item.id}
                      onChange={() => {
                        if (isDone) void reopenTodo(item)
                        else {
                          setResolutionDraft('')
                          setCompleteModalItem(item)
                        }
                      }}
                      className="rounded border-slate-300 text-brand-orange focus:ring-brand-orange h-4 w-4 shrink-0 mt-0.5"
                      aria-label={
                        isDone ? `Marcar como pendente: ${item.text}` : `Abrir conclusão: ${item.text}`
                      }
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-0.5">
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${
                            isFin ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-900'
                          }`}
                        >
                          {isFin ? 'Financeiro' : 'Gestão'}
                        </span>
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${
                            isDone
                              ? 'bg-slate-200 text-slate-700'
                              : isInProgress
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-orange-100 text-orange-800'
                          }`}
                        >
                          {isDone ? 'Concluída' : isInProgress ? 'Em andamento' : 'Pendente'}
                        </span>
                      </div>
                      <span
                        className={`text-sm text-slate-800 break-words block ${isDone ? 'line-through text-slate-400' : ''}`}
                      >
                        {item.text}
                      </span>
                      <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                        Criado por <span className="font-medium text-slate-600">{item.createdByName}</span>
                        {isDone && item.completedByName && item.completedAt && (
                          <>
                            {' · '}
                            Concluído por <span className="font-medium text-slate-600">{item.completedByName}</span>
                            {' · '}
                            {formatDateTime(item.completedAt)}
                          </>
                        )}
                      </p>
                      {!isDone && isInProgress && item.resolutionNote && (
                        <p className="text-xs text-amber-900 mt-2 pl-2 border-l-2 border-amber-400 bg-amber-50 rounded-r py-1.5 pr-2">
                          <span className="font-semibold">Andamento: </span>
                          {item.resolutionNote}
                          {(item.progressByName || item.progressUpdatedAt) && (
                            <span className="block mt-1 text-[11px] text-amber-800/90">
                              {item.progressByName ? `Por ${item.progressByName}` : 'Atualizado'}
                              {item.progressUpdatedAt ? ` · ${formatDateTime(item.progressUpdatedAt)}` : ''}
                            </span>
                          )}
                        </p>
                      )}
                      {isDone && item.resolutionNote && (
                        <p className="text-xs text-slate-700 mt-2 pl-2 border-l-2 border-brand-orange/60 bg-white/60 rounded-r py-1.5 pr-2">
                          <span className="font-semibold text-slate-800">Solução: </span>
                          {item.resolutionNote}
                        </p>
                      )}
                    </div>
                    <div className="flex items-start gap-0.5 shrink-0">
                      {!isDone && (
                        <button
                          type="button"
                          disabled={todoActionId === item.id}
                          onClick={() => {
                            setProgressDraft(item.resolutionNote ?? '')
                            setProgressModalItem(item)
                          }}
                          className={`p-1.5 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-40 ${
                            isInProgress
                              ? 'text-amber-700 bg-amber-100 hover:bg-amber-200'
                              : 'text-slate-400 hover:text-amber-700 hover:bg-amber-50'
                          }`}
                          title={isInProgress ? 'Atualizar andamento' : 'Marcar como em andamento'}
                          aria-label={isInProgress ? 'Atualizar andamento' : 'Marcar como em andamento'}
                        >
                          <Loader2 className={`w-4 h-4 ${isInProgress ? 'animate-spin' : ''}`} aria-hidden />
                        </button>
                      )}
                      {!isDone && (
                        <button
                          type="button"
                          disabled={todoActionId === item.id}
                          onClick={() => void toggleUrgent(item)}
                          className={`p-1.5 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:opacity-40 ${
                            item.isUrgent
                              ? 'text-orange-600 bg-orange-100 hover:bg-orange-200'
                              : 'text-slate-400 hover:text-orange-600 hover:bg-orange-50'
                          }`}
                          title={item.isUrgent ? 'Remover urgência' : 'Marcar como urgente (topo + destaque)'}
                          aria-label={item.isUrgent ? 'Remover urgência' : 'Marcar como urgente'}
                          aria-pressed={item.isUrgent}
                        >
                          <Flame className="w-4 h-4" aria-hidden />
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={todoActionId === item.id}
                        onClick={() => void removeTodo(item.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 opacity-70 group-hover:opacity-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-40"
                        aria-label={`Remover: ${item.text}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
