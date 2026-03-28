/**
 * Dashboard Professores – Controlar minha agenda (disponibilidade semanal)
 */

'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from '@/contexts/LanguageContext'
import Button from '@/components/ui/Button'
import Toast from '@/components/admin/Toast'
import Modal from '@/components/admin/Modal'
import { Calendar, Check, Loader2, Minus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getDayOfWeekInTZ, getTimeInTZ } from '@/lib/datetime'

const AVAIL_HORAS = Array.from({ length: 35 }, (_, i) => 360 + i * 30)
const AVAIL_DIAS_ORDER = [1, 2, 3, 4, 5, 6, 0] as const

type SlotPayload = { dayOfWeek: number; startMinutes: number; endMinutes: number }

function formatMinutesAsHours(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  if (mins <= 0) return '0h'
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h${m.toString().padStart(2, '0')}`
}

function LegendSwatch({ variant }: { variant: 'available' | 'unavailable' | 'mixed' | 'lesson' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center w-7 h-7 rounded-md border shadow-sm shrink-0',
        variant === 'available' && 'bg-emerald-500 border-emerald-600 text-white',
        variant === 'unavailable' && 'bg-red-500 border-red-600 text-white',
        variant === 'mixed' && 'bg-amber-400 border-amber-500 text-amber-950',
        variant === 'lesson' && 'bg-blue-600 border-blue-700 text-white'
      )}
      aria-hidden
    >
      {variant === 'available' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
      {variant === 'unavailable' && <X className="w-3.5 h-3.5 stroke-[3]" />}
      {variant === 'mixed' && <Minus className="w-3.5 h-3.5 stroke-[3]" />}
      {variant === 'lesson' && <Calendar className="w-3.5 h-3.5 stroke-[2.5]" />}
    </span>
  )
}

/** Chaves "dayOfWeek-startMinutes" de 30 em 30 min cobertas por uma aula (horário de Brasília). */
function slotKeysForLesson(lesson: { startAt: string; durationMinutes?: number | null; status?: string }): string[] {
  if (lesson.status === 'CANCELLED') return []
  const { hour, minute } = getTimeInTZ(lesson.startAt)
  const startM = hour * 60 + minute
  const endM = startM + (lesson.durationMinutes ?? 60)
  const dow = getDayOfWeekInTZ(lesson.startAt)
  const keys: string[] = []
  for (const s of AVAIL_HORAS) {
    if (s < endM && s + 30 > startM) keys.push(`${dow}-${s}`)
  }
  return keys
}

export default function MinhaAgendaPage() {
  const { t } = useTranslation()
  const [availabilityChecked, setAvailabilityChecked] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const [lessonSlotKeys, setLessonSlotKeys] = useState<Set<string>>(new Set())
  const [conflictModal, setConflictModal] = useState<{
    conflicts: { aluno: string; data: string; dia: string; horario: string }[]
    pendingSlots: SlotPayload[]
  } | null>(null)
  const [savingConfirm, setSavingConfirm] = useState(false)
  const [weekSummary, setWeekSummary] = useState<{
    weekLabel: string
    usedMinutesWeek: number
  } | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(true)

  const minutesToTime = (minutes: number): string => {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
  }

  const slotsToCheckedSet = useCallback((slots: SlotPayload[]) => {
    const set = new Set<string>()
    for (const s of slots) {
      for (let m = s.startMinutes; m < s.endMinutes; m += 30) {
        set.add(`${s.dayOfWeek}-${m}`)
      }
    }
    return set
  }, [])

  const buildSlotsFromGrid = useCallback((): SlotPayload[] => {
    const merged = new Set(availabilityChecked)
    lessonSlotKeys.forEach((k) => merged.add(k))
    const slots: SlotPayload[] = []
    for (const dayOfWeek of AVAIL_DIAS_ORDER) {
      const minutes = AVAIL_HORAS.filter((m) => merged.has(`${dayOfWeek}-${m}`)).sort((a, b) => a - b)
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
  }, [availabilityChecked, lessonSlotKeys])

  const totalPatternMinutes = useMemo(() => {
    return buildSlotsFromGrid().reduce((acc, s) => acc + (s.endMinutes - s.startMinutes), 0)
  }, [buildSlotsFromGrid])

  const usedPercentOfPattern =
    totalPatternMinutes > 0 && weekSummary != null
      ? Math.min(100, Math.round((100 * weekSummary.usedMinutesWeek) / totalPatternMinutes))
      : null

  const fetchWeekSummary = useCallback(() => {
    setLoadingSummary(true)
    fetch('/api/professor/availability/week-summary', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && j.data) setWeekSummary(j.data)
        else setWeekSummary(null)
      })
      .catch(() => setWeekSummary(null))
      .finally(() => setLoadingSummary(false))
  }, [])

  const fetchLessonSlotKeys = useCallback(async () => {
    const start = new Date()
    const end = new Date()
    end.setFullYear(end.getFullYear() + 1)
    try {
      const r = await fetch(
        `/api/professor/lessons?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`,
        { credentials: 'include' }
      )
      const j = await r.json()
      const list = j.ok && Array.isArray(j.data?.lessons) ? j.data.lessons : []
      const next = new Set<string>()
      for (const lesson of list as { startAt: string; durationMinutes?: number | null; status?: string }[]) {
        for (const k of slotKeysForLesson(lesson)) next.add(k)
      }
      setLessonSlotKeys(next)
    } catch {
      setLessonSlotKeys(new Set())
    }
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/professor/availability', { credentials: 'include' }).then((r) => r.json()),
      fetchLessonSlotKeys(),
    ])
      .then(([j]) => {
        const slots: SlotPayload[] = j.ok && Array.isArray(j.data?.slots) ? j.data.slots : []
        setAvailabilityChecked(slotsToCheckedSet(slots))
      })
      .catch(() => setAvailabilityChecked(new Set()))
      .finally(() => setLoading(false))
  }, [slotsToCheckedSet, fetchLessonSlotKeys])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    fetchWeekSummary()
  }, [fetchWeekSummary])

  const toggleAvailabilityCell = (dayOfWeek: number, startMinutes: number) => {
    const key = `${dayOfWeek}-${startMinutes}`
    if (lessonSlotKeys.has(key)) {
      setToast({ message: t('professor.agenda.slotHasLesson'), type: 'info' })
      return
    }
    setAvailabilityChecked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAvailabilityForWeekdays = (startMinutes: number) => {
    const weekdays = [1, 2, 3, 4, 5]
    const keys = weekdays.map((dayOfWeek) => `${dayOfWeek}-${startMinutes}`).filter((k) => !lessonSlotKeys.has(k))
    if (keys.length === 0) return
    const allChecked = keys.every((key) => availabilityChecked.has(key))
    setAvailabilityChecked((prev) => {
      const next = new Set(prev)
      if (allChecked) keys.forEach((key) => next.delete(key))
      else keys.forEach((key) => next.add(key))
      return next
    })
  }

  const weekdayColumnVisualState = (startMinutes: number): 'all' | 'none' | 'mixed' => {
    const keys = [1, 2, 3, 4, 5].map((d) => `${d}-${startMinutes}`).filter((k) => !lessonSlotKeys.has(k))
    if (keys.length === 0) return 'mixed'
    const n = keys.filter((k) => availabilityChecked.has(k)).length
    if (n === keys.length) return 'all'
    if (n === 0) return 'none'
    return 'mixed'
  }

  const handleSave = async (confirmRedirect: boolean) => {
    const slots = buildSlotsFromGrid()
    setSaving(true)
    setToast(null)
    try {
      const res = await fetch('/api/professor/availability', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ slots, confirmRedirect }),
      })
      const json = await res.json()
      if (res.ok && json.ok) {
        if (json.data?.slots) setAvailabilityChecked(slotsToCheckedSet(json.data.slots))
        setToast({ message: t('professor.agenda.saved'), type: 'success' })
        setConflictModal(null)
        fetchWeekSummary()
        fetchLessonSlotKeys()
        return
      }
      if (!confirmRedirect && json.conflicts && Array.isArray(json.conflicts) && json.conflicts.length > 0) {
        setConflictModal({
          conflicts: json.conflicts.map((c: { aluno?: string; data?: string; dia?: string; horario?: string }) => ({
            aluno: c.aluno ?? '—',
            data: c.data ?? '',
            dia: c.dia ?? '',
            horario: c.horario ?? '',
          })),
          pendingSlots: slots,
        })
        return
      }
      setToast({ message: json.message || t('professor.agenda.error'), type: 'error' })
    } catch {
      setToast({ message: t('professor.agenda.error'), type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmRedirect = async () => {
    if (!conflictModal) return
    setSavingConfirm(true)
    setToast(null)
    try {
      const res = await fetch('/api/professor/availability', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ slots: conflictModal.pendingSlots, confirmRedirect: true }),
      })
      const json = await res.json()
      if (res.ok && json.ok) {
        if (json.data?.slots) setAvailabilityChecked(slotsToCheckedSet(json.data.slots))
        setToast({ message: t('professor.agenda.saved'), type: 'success' })
        setConflictModal(null)
        fetchWeekSummary()
        fetchLessonSlotKeys()
      } else {
        setToast({ message: json.message || t('professor.agenda.error'), type: 'error' })
      }
    } catch {
      setToast({ message: t('professor.agenda.error'), type: 'error' })
    } finally {
      setSavingConfirm(false)
    }
  }

  return (
    <div className="max-w-[1600px] space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('professor.nav.myAgenda')}</h1>
      </div>

      <section
        className="rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2 sm:px-4 sm:py-2.5"
        aria-labelledby="agenda-legend-heading"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 id="agenda-legend-heading" className="text-xs font-semibold text-gray-700">
            {t('professor.agenda.legendTitle')}
          </h2>
          <Button
            variant="primary"
            onClick={() => handleSave(false)}
            disabled={loading || saving || savingConfirm}
            className="inline-flex items-center gap-2 text-sm py-1.5 px-3 shrink-0"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? t('professor.agenda.saving') : t('professor.agenda.save')}
          </Button>
        </div>
        <ul className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-1">
          <li className="flex gap-2 items-center min-w-0">
            <LegendSwatch variant="available" />
            <span className="font-medium text-gray-900 text-xs">{t('professor.agenda.legendAvailable')}</span>
          </li>
          <li className="flex gap-2 items-center min-w-0">
            <LegendSwatch variant="unavailable" />
            <span className="font-medium text-gray-900 text-xs">{t('professor.agenda.legendUnavailable')}</span>
          </li>
          <li className="flex gap-2 items-center min-w-0">
            <LegendSwatch variant="mixed" />
            <span className="font-medium text-gray-900 text-xs">{t('professor.agenda.legendMixed')}</span>
          </li>
          <li className="flex gap-2 items-center min-w-0">
            <LegendSwatch variant="lesson" />
            <span className="font-medium text-gray-900 text-xs">{t('professor.agenda.legendLessonScheduled')}</span>
          </li>
        </ul>

        <div className="mt-2 pt-2 border-t border-gray-200/80 space-y-1">
          {loadingSummary ? (
            <p className="text-xs text-gray-500 flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              {t('professor.agenda.summaryLoading')}
            </p>
          ) : (
            <>
              <p className="text-xs text-gray-600">
                <span className="font-medium text-gray-700">{t('professor.agenda.summaryWeek')}:</span>{' '}
                {weekSummary?.weekLabel ?? '—'}
              </p>
              <p className="text-xs text-gray-800 leading-relaxed">
                <span className="font-medium text-gray-800">{t('professor.agenda.summaryAvailable')}:</span>{' '}
                <span className="tabular-nums">{formatMinutesAsHours(totalPatternMinutes)}</span>
                <span className="text-gray-400 mx-1.5">·</span>
                <span className="font-medium text-gray-800">{t('professor.agenda.summaryUsed')}:</span>{' '}
                <span className="tabular-nums">{formatMinutesAsHours(weekSummary?.usedMinutesWeek ?? 0)}</span>
                {usedPercentOfPattern != null && (
                  <span className="text-gray-600">
                    {` (${t('professor.agenda.summaryOfCapacity').replace('{pct}', String(usedPercentOfPattern))})`}
                  </span>
                )}
              </p>
            </>
          )}
        </div>
      </section>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
          {t('professor.agenda.loading')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="inline-block min-w-full">
            <table className="w-full border-collapse text-xs sm:text-sm min-w-[800px] sm:min-w-[1000px] lg:min-w-[1200px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80">
                  <th className="text-left py-2 px-1 sm:px-2 font-semibold text-gray-700 w-12 sm:w-14 sticky left-0 bg-gray-50/80 z-10">
                    {t('professor.agenda.colDay')}
                  </th>
                  {AVAIL_HORAS.map((m) => {
                    const wk = weekdayColumnVisualState(m)
                    const weekdayToggleKeys = [1, 2, 3, 4, 5]
                      .map((d) => `${d}-${m}`)
                      .filter((k) => !lessonSlotKeys.has(k))
                    return (
                      <th key={m} className="py-2 px-0.5 sm:px-1 text-center font-semibold text-gray-600 w-8 sm:w-12 relative">
                        <div className="flex flex-col items-center gap-0.5 sm:gap-1">
                          <span className="text-[10px] sm:text-xs">{minutesToTime(m)}</span>
                          <button
                            type="button"
                            title={t('professor.agenda.ariaWeekdayColumn')}
                            aria-label={t('professor.agenda.ariaWeekdayColumn')}
                            disabled={weekdayToggleKeys.length === 0}
                            onClick={() => toggleAvailabilityForWeekdays(m)}
                            className={cn(
                              'inline-flex items-center justify-center w-7 h-6 sm:w-8 sm:h-7 rounded border shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1',
                              wk === 'all' &&
                                'bg-emerald-500 border-emerald-600 text-white hover:bg-emerald-600 focus:ring-emerald-400',
                              wk === 'none' && 'bg-red-500 border-red-600 text-white hover:bg-red-600 focus:ring-red-400',
                              wk === 'mixed' &&
                                'bg-amber-400 border-amber-500 text-amber-950 hover:bg-amber-500 focus:ring-amber-400',
                              weekdayToggleKeys.length === 0 && 'opacity-40 cursor-not-allowed'
                            )}
                          >
                            {wk === 'all' && <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[3]" />}
                            {wk === 'none' && <X className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[3]" />}
                            {wk === 'mixed' && <Minus className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[3]" />}
                          </button>
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {AVAIL_DIAS_ORDER.map((dayOfWeek) => (
                  <tr key={dayOfWeek} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="py-1.5 px-1 sm:px-2 font-medium text-gray-800 sticky left-0 bg-white z-10">
                      {t(`professor.agenda.d${dayOfWeek}`)}
                    </td>
                    {AVAIL_HORAS.map((startMinutes) => {
                      const key = `${dayOfWeek}-${startMinutes}`
                      const hasLesson = lessonSlotKeys.has(key)
                      const available = availabilityChecked.has(key)
                      return (
                        <td key={key} className="py-1 px-0.5 sm:px-1 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              hasLesson
                                ? setToast({ message: t('professor.agenda.slotHasLesson'), type: 'info' })
                                : toggleAvailabilityCell(dayOfWeek, startMinutes)
                            }
                            aria-label={
                              hasLesson
                                ? t('professor.agenda.legendLessonScheduled')
                                : available
                                  ? t('professor.agenda.ariaAvailable')
                                  : t('professor.agenda.ariaUnavailable')
                            }
                            aria-pressed={hasLesson ? true : available}
                            className={cn(
                              'inline-flex items-center justify-center w-8 h-7 sm:w-10 sm:h-8 rounded border text-white shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1',
                              hasLesson &&
                                'bg-blue-600 border-blue-700 cursor-pointer hover:bg-blue-700 focus:ring-blue-400',
                              !hasLesson &&
                                available &&
                                'bg-emerald-500 border-emerald-600 hover:bg-emerald-600 focus:ring-emerald-400',
                              !hasLesson &&
                                !available &&
                                'bg-red-500 border-red-600 hover:bg-red-600 focus:ring-red-400'
                            )}
                          >
                            {hasLesson ? (
                              <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
                            ) : available ? (
                              <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" />
                            ) : (
                              <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" />
                            )}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        isOpen={!!conflictModal}
        onClose={() => !savingConfirm && setConflictModal(null)}
        title={t('professor.agenda.conflictTitle')}
        size="lg"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setConflictModal(null)} disabled={savingConfirm}>
              {t('professor.agenda.backEdit')}
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmRedirect}
              disabled={savingConfirm}
              className="!bg-red-600 hover:!bg-red-700"
            >
              {savingConfirm ? <Loader2 className="w-4 h-4 animate-spin" /> : t('professor.agenda.confirmSave')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700">{t('professor.agenda.conflictIntro')}</p>
          <p className="text-sm font-semibold text-gray-700">{t('professor.agenda.conflictList')}</p>
          <ul className="max-h-48 overflow-y-auto space-y-2 border border-gray-100 rounded-lg p-3 bg-gray-50/80">
            {conflictModal?.conflicts.map((c, i) => (
              <li key={i} className="text-sm text-gray-800">
                <span className="font-medium">{c.aluno}</span>
                {' — '}
                {c.dia} {c.data} {c.horario}
              </li>
            ))}
          </ul>
        </div>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
