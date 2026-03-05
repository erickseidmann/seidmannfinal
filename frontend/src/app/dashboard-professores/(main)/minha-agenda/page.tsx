/**
 * Dashboard Professores – Controlar minha agenda
 * Professor define em quais horários está disponível para dar aula.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from '@/contexts/LanguageContext'
import Button from '@/components/ui/Button'
import Toast from '@/components/admin/Toast'
import ConfirmModal from '@/components/admin/ConfirmModal'
import { Loader2 } from 'lucide-react'

const AVAIL_HORAS = Array.from({ length: 35 }, (_, i) => 360 + i * 30) // 6h às 23h (intervalos de 30 min)
const AVAIL_DIAS = [
  { dayOfWeek: 1, label: 'Seg' },
  { dayOfWeek: 2, label: 'Ter' },
  { dayOfWeek: 3, label: 'Qua' },
  { dayOfWeek: 4, label: 'Qui' },
  { dayOfWeek: 5, label: 'Sex' },
  { dayOfWeek: 6, label: 'Sáb' },
  { dayOfWeek: 0, label: 'Dom' },
]

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

type Conflict = { aluno: string; enrollmentId: string; startAt: string; data: string; dia: string; horario: string }
type SlotSnapshot = { dayOfWeek: number; startMinutes: number; endMinutes: number }
type HistoryEntry = {
  id: string
  criadoEm: string
  changedByMe: boolean
  changedByName: string | null
  slotsSnapshot: SlotSnapshot[]
  studentsRedirected: boolean
  redirectedSummary: { aluno: string }[] | null
}

const DIAS_LABEL: Record<number, string> = { 0: 'Dom', 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb' }
function slotToKey(s: SlotSnapshot): string {
  return `${s.dayOfWeek}-${s.startMinutes}-${s.endMinutes}`
}
function slotToLabel(s: SlotSnapshot): string {
  return `${DIAS_LABEL[s.dayOfWeek] ?? '?'} ${minutesToTime(s.startMinutes)}-${minutesToTime(s.endMinutes)}`
}
function diffSlots(current: SlotSnapshot[], previous: SlotSnapshot[] | undefined): { added: SlotSnapshot[]; removed: SlotSnapshot[] } {
  const prevSet = new Set(previous?.map(slotToKey) ?? [])
  const currSet = new Set(current.map(slotToKey))
  const added = current.filter((s) => !prevSet.has(slotToKey(s)))
  const removed = (previous ?? []).filter((s) => !currSet.has(slotToKey(s)))
  return { added, removed }
}

export default function MinhaAgendaPage() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [availabilityChecked, setAvailabilityChecked] = useState<Set<string>>(new Set())
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [showRedirectConfirm, setShowRedirectConfirm] = useState(false)

  const fetchSlots = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/professor/availability', { credentials: 'include' })
      const text = await res.text()
      let json: { ok?: boolean; data?: { slots?: { dayOfWeek: number; startMinutes: number; endMinutes: number }[] } }
      try {
        json = text ? JSON.parse(text) : {}
      } catch {
        setToast({ message: 'Erro ao carregar horários.', type: 'error' })
        return
      }
      if (res.ok && json.ok && Array.isArray(json.data?.slots)) {
        const set = new Set<string>()
        for (const s of json.data.slots as { dayOfWeek: number; startMinutes: number; endMinutes: number }[]) {
          for (let m = s.startMinutes; m < s.endMinutes; m += 30) {
            set.add(`${s.dayOfWeek}-${m}`)
          }
        }
        setAvailabilityChecked(set)
      }
    } catch {
      setToast({ message: 'Erro ao carregar horários.', type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true)
    try {
      const res = await fetch('/api/professor/availability/history', { credentials: 'include' })
      const text = await res.text()
      let json: { ok?: boolean; data?: { history?: unknown[] } }
      try {
        json = text ? JSON.parse(text) : {}
      } catch {
        return
      }
      if (res.ok && json.ok && Array.isArray(json.data?.history)) {
        setHistory(
          (json.data.history as Record<string, unknown>[]).map((h) => ({
            id: String(h.id ?? ''),
            criadoEm: String(h.criadoEm ?? ''),
            changedByMe: h.changedByMe === true,
            changedByName: h.changedByName != null ? String(h.changedByName) : null,
            slotsSnapshot: Array.isArray(h.slotsSnapshot) ? (h.slotsSnapshot as SlotSnapshot[]) : [],
            studentsRedirected: h.studentsRedirected === true,
            redirectedSummary: Array.isArray(h.redirectedSummary) ? (h.redirectedSummary as { aluno: string }[]) : null,
          }))
        )
      }
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  useEffect(() => {
    fetchSlots()
  }, [fetchSlots])

  useEffect(() => {
    if (!loading) fetchHistory()
  }, [loading, fetchHistory])

  const toggleAvailabilityCell = (dayOfWeek: number, startMinutes: number) => {
    const key = `${dayOfWeek}-${startMinutes}`
    setAvailabilityChecked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    setConflicts(null)
  }

  const toggleAvailabilityForWeekdays = (startMinutes: number) => {
    const weekdays = [1, 2, 3, 4, 5]
    const keys = weekdays.map((d) => `${d}-${startMinutes}`)
    const allChecked = keys.every((k) => availabilityChecked.has(k))
    setAvailabilityChecked((prev) => {
      const next = new Set(prev)
      if (allChecked) keys.forEach((k) => next.delete(k))
      else keys.forEach((k) => next.add(k))
      return next
    })
    setConflicts(null)
  }

  const isWeekdayHourChecked = (startMinutes: number): boolean => {
    const weekdays = [1, 2, 3, 4, 5]
    return weekdays.every((d) => availabilityChecked.has(`${d}-${startMinutes}`))
  }

  const buildSlotsFromGrid = (): { dayOfWeek: number; startMinutes: number; endMinutes: number }[] => {
    const slots: { dayOfWeek: number; startMinutes: number; endMinutes: number }[] = []
    for (const { dayOfWeek } of AVAIL_DIAS) {
      const minutes = AVAIL_HORAS.filter((m) => availabilityChecked.has(`${dayOfWeek}-${m}`)).sort((a, b) => a - b)
      if (minutes.length === 0) continue
      let start = minutes[0]
      let end = start + 30
      for (let i = 1; i <= minutes.length; i++) {
        if (i < minutes.length && minutes[i] === end) {
          end += 30
        } else {
          slots.push({ dayOfWeek, startMinutes: start, endMinutes: end })
          if (i < minutes.length) {
            start = minutes[i]
            end = start + 30
          }
        }
      }
    }
    return slots
  }

  const handleSave = async (confirmRedirect = false) => {
    setSaving(true)
    setToast(null)
    setConflicts(null)
    try {
      const slots = buildSlotsFromGrid()
      const res = await fetch('/api/professor/availability', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ slots, confirmRedirect: confirmRedirect === true }),
      })
      const text = await res.text()
      let json: { ok?: boolean; message?: string; conflicts?: Conflict[] }
      try {
        json = text ? JSON.parse(text) : {}
      } catch {
        console.error('[minha-agenda] Resposta não é JSON. Status:', res.status, 'Body:', text?.slice(0, 200))
        setToast({ message: 'Erro no servidor. Tente novamente.', type: 'error' })
        return
      }
      if (!res.ok || !json.ok) {
        console.error('[minha-agenda] API retornou erro. Status:', res.status, 'Resposta:', json)
        if (Array.isArray(json.conflicts) && json.conflicts.length > 0) {
          setConflicts(json.conflicts)
          setShowRedirectConfirm(true)
          setSaving(false)
          return
        } else {
          setToast({ message: json.message || 'Erro ao salvar horários.', type: 'error' })
        }
        return
      }
      setToast({ message: 'Horários salvos com sucesso.', type: 'success' })
      fetchHistory()
    } catch (err) {
      console.error('[minha-agenda] Erro ao salvar:', err)
      setToast({ message: 'Erro ao salvar horários.', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('professor.nav.myAgenda')}</h1>
        <p className="text-gray-600 mt-1 text-sm">
          Marque os horários em que você está disponível para dar aula. Fora desses períodos você aparecerá como indisponível na agenda.
        </p>
      </div>

      {conflicts && conflicts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm font-semibold text-red-800 mb-2">
            Você já tem aulas agendadas fora dos horários marcados. Ajuste os horários abaixo ou peça à administração para alterar as aulas:
          </p>
          <ul className="space-y-2 text-sm text-red-700">
            {Object.values(
              conflicts.reduce<Record<string, { aluno: string; itens: Conflict[] }>>((acc, c) => {
                if (!acc[c.enrollmentId]) acc[c.enrollmentId] = { aluno: c.aluno, itens: [] }
                acc[c.enrollmentId].itens.push(c)
                return acc
              }, {})
            ).map((group) => (
              <li key={group.itens[0]?.enrollmentId}>
                <span className="font-semibold">{group.aluno}:</span>{' '}
                {group.itens.map((c) => `${c.dia} ${c.data} às ${c.horario}`).join('; ')}
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
          Carregando...
        </div>
      ) : (
        <>
          <div className="overflow-x-auto -mx-2">
            <div className="inline-block min-w-full">
              <table className="w-full border-collapse text-xs sm:text-sm min-w-[800px] border border-gray-200 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left py-2 px-2 font-semibold text-gray-700 w-12 sm:w-14 sticky left-0 bg-gray-50 z-10">Dia</th>
                    {AVAIL_HORAS.map((m) => (
                      <th key={m} className="py-2 px-0.5 sm:px-1 text-center font-semibold text-gray-600 w-8 sm:w-12">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-[10px] sm:text-xs">{minutesToTime(m)}</span>
                          <label className="inline-flex items-center justify-center cursor-pointer" title="Marcar/desmarcar Seg-Sex">
                            <input
                              type="checkbox"
                              checked={isWeekdayHourChecked(m)}
                              onChange={() => toggleAvailabilityForWeekdays(m)}
                              className="rounded border-gray-300 text-brand-orange focus:ring-brand-orange w-3 h-3 sm:w-3.5 sm:h-3.5"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </label>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {AVAIL_DIAS.map(({ dayOfWeek, label }) => (
                    <tr key={dayOfWeek} className="border-b border-gray-100 hover:bg-gray-50/50">
                      <td className="py-1.5 px-2 font-medium text-gray-800 sticky left-0 bg-white z-10">{label}</td>
                      {AVAIL_HORAS.map((startMinutes) => {
                        const key = `${dayOfWeek}-${startMinutes}`
                        const checked = availabilityChecked.has(key)
                        return (
                          <td key={key} className="py-1 px-0.5 sm:px-1 text-center">
                            <label className="inline-flex items-center justify-center w-8 h-7 sm:w-10 sm:h-8 cursor-pointer rounded border border-gray-200 hover:bg-gray-100">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleAvailabilityCell(dayOfWeek, startMinutes)}
                                className="rounded border-gray-300 text-brand-orange focus:ring-brand-orange w-3 h-3 sm:w-4 sm:h-4"
                              />
                            </label>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => handleSave()} disabled={saving} className="inline-flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Salvando...' : 'Salvar horários'}
            </Button>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Histórico de alterações</h2>
            {loadingHistory ? (
              <div className="flex items-center gap-2 text-gray-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando...
              </div>
            ) : history.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhuma alteração registrada ainda.</p>
            ) : (
              <ul className="space-y-4">
                {history.map((entry, index) => {
                  const date = new Date(entry.criadoEm)
                  const label = date.toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                  const by = entry.changedByMe ? 'por você' : entry.changedByName ? `por ${entry.changedByName}` : 'pela administração'
                  const previousSnapshot = history[index + 1]?.slotsSnapshot
                  const { added, removed } = diffSlots(entry.slotsSnapshot, previousSnapshot)
                  const hasAdded = added.length > 0
                  const hasRemoved = removed.length > 0
                  const hasRedirected = entry.studentsRedirected && entry.redirectedSummary && entry.redirectedSummary.length > 0
                  return (
                    <li key={entry.id} className="text-sm border border-gray-100 rounded-lg p-3 bg-gray-50/50">
                      <div className="flex flex-wrap items-center gap-2 text-gray-700">
                        <span className="font-medium text-gray-500">{label}</span>
                        <span className="text-gray-400">—</span>
                        <span className="text-gray-700">{by}</span>
                      </div>
                      {(hasAdded || hasRemoved || hasRedirected) && (
                        <div className="mt-2 pl-0 space-y-1 text-gray-600">
                          {hasAdded && (
                            <p className="text-xs">
                              <span className="font-medium text-green-700">Horários adicionados:</span>{' '}
                              {added.map(slotToLabel).join(', ')}
                            </p>
                          )}
                          {hasRemoved && (
                            <p className="text-xs">
                              <span className="font-medium text-red-700">Horários removidos:</span>{' '}
                              {removed.map(slotToLabel).join(', ')}
                            </p>
                          )}
                          {hasRedirected && (
                            <p className="text-xs">
                              <span className="font-medium text-amber-700">Alunos redirecionados:</span>{' '}
                              {entry.redirectedSummary!.map((r) => r.aluno).join(', ')}
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </>
      )}

      {showRedirectConfirm && (
        <ConfirmModal
          isOpen={showRedirectConfirm}
          onClose={() => setShowRedirectConfirm(false)}
          onConfirm={() => {
            setShowRedirectConfirm(false)
            void handleSave(true)
          }}
          title="Confirmar alteração"
          message="Os alunos dessas aulas serão redirecionados para outros professores. Tem certeza disso?"
          confirmLabel="OK"
          cancelLabel="Cancelar"
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}
