'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Clock, ChevronDown, ChevronRight } from 'lucide-react'
import { formatTimeInTZ } from '@/lib/datetime'
import {
  TEACHER_LESSON_RECORD_DEADLINE_DAYS,
  formatTeacherRecordDeadlineLabel,
  isTeacherLessonRecordGrandfathered,
} from '@/lib/teacher-lesson-record-deadline'

export interface TeacherRecordDeadlineLesson {
  id: string
  startAt: string
  enrollment?: {
    nome?: string
    tipoAula?: string | null
    nomeGrupo?: string | null
    groupMemberNames?: string[]
  }
}

function getStudentLabel(l: TeacherRecordDeadlineLesson): string {
  const enr = l.enrollment
  if (enr?.tipoAula === 'GRUPO' && enr?.nomeGrupo?.trim()) {
    const groupName = enr.nomeGrupo.trim()
    const members = enr.groupMemberNames?.length ? enr.groupMemberNames.join(', ') : ''
    return members ? `${groupName} — ${members}` : groupName
  }
  return enr?.nome ?? '—'
}

function formatLessonDate(startAt: string, locale: string): string {
  return new Date(startAt).toLocaleDateString(locale, {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

interface TeacherRecordDeadlineAlertProps {
  registerablePending: TeacherRecordDeadlineLesson[]
  expiredPending: TeacherRecordDeadlineLesson[]
  dateLocale: string
  title: string
  intro: string
  backlogNote: string
  newRuleNote: string
  registerableTitle: string
  expiredTitle: string
  expiredNote: string
  deadlineUntil: string
  registerLinkLabel: string
  onLessonClick?: (lesson: TeacherRecordDeadlineLesson) => void
  showRegisterLink?: boolean
}

export default function TeacherRecordDeadlineAlert({
  registerablePending,
  expiredPending,
  dateLocale,
  title,
  intro,
  backlogNote,
  newRuleNote,
  registerableTitle,
  expiredTitle,
  expiredNote,
  deadlineUntil,
  registerLinkLabel,
  onLessonClick,
  showRegisterLink = true,
}: TeacherRecordDeadlineAlertProps) {
  const [open, setOpen] = useState(false)
  const backlog = registerablePending.filter((l) => isTeacherLessonRecordGrandfathered(l.startAt))

  if (registerablePending.length === 0 && expiredPending.length === 0) return null

  const summaryParts: string[] = []
  if (registerablePending.length > 0) {
    summaryParts.push(`${registerablePending.length} aguardando registro`)
  }
  if (expiredPending.length > 0) {
    summaryParts.push(`${expiredPending.length} com prazo expirado`)
  }
  const summary = summaryParts.join(' · ')

  return (
    <div
      role="alert"
      className="rounded-2xl border-2 border-amber-500 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 shadow-lg shadow-amber-200/60 overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-4 p-5 sm:p-6 text-left hover:bg-amber-100/40 transition-colors"
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-md">
          <AlertTriangle className="h-7 w-7" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-amber-950">{title}</h2>
              {!open && summary ? (
                <p className="mt-1 text-sm text-amber-950/80">{summary}</p>
              ) : null}
            </div>
            <ChevronDown
              className={`h-5 w-5 shrink-0 text-amber-800 mt-1 transition-transform duration-200 ${
                open ? 'rotate-180' : ''
              }`}
              aria-hidden
            />
          </div>
        </div>
      </button>

      {open ? (
        <div className="px-5 sm:px-6 pb-5 sm:pb-6 pt-0 border-t border-amber-300/50">
          <div className="flex flex-col sm:flex-row gap-4 sm:pl-16">
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <p className="text-sm sm:text-base text-amber-950/90 leading-relaxed">{intro}</p>
                {backlog.length > 0 && (
                  <p className="mt-2 text-sm sm:text-base text-amber-950/90 leading-relaxed">{backlogNote}</p>
                )}
                <p className="mt-2 text-sm sm:text-base font-semibold text-amber-950 leading-relaxed">
                  {newRuleNote}
                </p>
              </div>

          {registerablePending.length > 0 && (
            <div className="rounded-xl border border-amber-300/80 bg-white/80 p-4">
              <p className="text-sm font-bold text-amber-900 mb-3">
                {registerableTitle} ({registerablePending.length})
              </p>
              <ul className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {registerablePending.map((lesson) => {
                  const isBacklog = isTeacherLessonRecordGrandfathered(lesson.startAt)
                  const content = (
                    <>
                      <span className="font-semibold text-gray-900 tabular-nums shrink-0">
                        {formatLessonDate(lesson.startAt, dateLocale)} ·{' '}
                        {formatTimeInTZ(lesson.startAt, dateLocale)}
                      </span>
                      <span className="text-gray-700 truncate min-w-0">{getStudentLabel(lesson)}</span>
                      {!isBacklog && (
                        <span className="text-xs font-medium text-amber-800 shrink-0">
                          {deadlineUntil.replace('{date}', formatTeacherRecordDeadlineLabel(lesson.startAt, dateLocale))}
                        </span>
                      )}
                    </>
                  )
                  if (onLessonClick) {
                    return (
                      <li key={lesson.id}>
                        <button
                          type="button"
                          onClick={() => onLessonClick(lesson)}
                          className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-left text-sm hover:bg-amber-100 transition-colors"
                        >
                          {content}
                          <ChevronRight className="w-4 h-4 text-amber-700 ml-auto shrink-0" />
                        </button>
                      </li>
                    )
                  }
                  return (
                    <li
                      key={lesson.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-sm"
                    >
                      {content}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {expiredPending.length > 0 && (
            <div className="rounded-xl border border-red-300 bg-red-50/90 p-4">
              <p className="text-sm font-bold text-red-900 mb-1">
                {expiredTitle} ({expiredPending.length})
              </p>
              <p className="text-xs text-red-800 mb-2">{expiredNote}</p>
              <ul className="space-y-1.5 max-h-32 overflow-y-auto text-sm text-red-900/90">
                {expiredPending.map((lesson) => (
                  <li key={lesson.id} className="flex flex-wrap gap-x-2">
                    <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      {formatLessonDate(lesson.startAt, dateLocale)} {formatTimeInTZ(lesson.startAt, dateLocale)} —{' '}
                      {getStudentLabel(lesson)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {showRegisterLink && registerablePending.length > 0 && (
            <Link
              href="/dashboard-professores/registrar-aulas"
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 transition-colors shadow-sm"
            >
              {registerLinkLabel}
              <ChevronRight className="w-4 h-4" />
            </Link>
          )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export { TEACHER_LESSON_RECORD_DEADLINE_DAYS }
