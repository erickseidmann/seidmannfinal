'use client'

import {
  extractCancelledAtFromNotes,
  formatOriginalLessonBadgeDate,
  formatRescheduledBadgeDate,
} from '@/lib/lesson-reschedule'
import {
  formatInactiveDateLabel,
  isLessonInInactivationWarningWindow,
} from '@/lib/enrollment-inactivation-warning'
import { getLastUpdateInfo } from '@/lib/lesson-notes-info'
import { isLessonCancelledFamily } from '@/lib/lesson-status'

export type LessonCalendarBlockSize = 'compact' | 'month' | 'week' | 'day'

export interface LessonCalendarBlockLesson {
  id: string
  status: string
  startAt: string
  notes: string | null
  createdByName?: string | null
  enrollment?: { inactiveAt?: string | null }
}

interface LessonCalendarBlockProps {
  lesson: LessonCalendarBlockLesson
  rescheduledAt?: string
  originalLessonAt?: string
  label: React.ReactNode
  title?: string
  onClick: () => void
  size?: LessonCalendarBlockSize
  hasPendingRequest?: boolean
  hasRecord?: boolean
  showFooter?: boolean
  className?: string
}

function statusColorClass(
  status: string,
  hasPendingRequest?: boolean,
  hasRecord?: boolean,
  inactivationWarning?: boolean
): string {
  if (inactivationWarning) {
    return 'bg-violet-50 text-violet-900 border-violet-300 hover:bg-violet-100'
  }
  if (hasPendingRequest) {
    return 'bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-50'
  }
  if (status === 'CONFIRMED' && hasRecord) {
    return 'bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-50'
  }
  if (isLessonCancelledFamily(status)) {
    return 'bg-red-100 text-red-800 border-red-200 hover:bg-red-50'
  }
  if (status === 'CONFIRMED') {
    return 'bg-green-100 text-green-800 border-green-200 hover:bg-green-50'
  }
  return 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-50'
}

const SIZE_CFG: Record<
  LessonCalendarBlockSize,
  {
    btn: string
    contentPadSingle: string
    contentPadDouble: string
    contentPadNone: string
    admin: string
    badge: string
  }
> = {
  compact: {
    btn: 'w-full text-left text-xs px-1.5 py-0.5 rounded border break-words relative cursor-pointer hover:ring-2 hover:ring-brand-orange/50 touch-manipulation',
    contentPadSingle: 'pt-4 pb-3',
    contentPadDouble: 'pt-7 pb-3',
    contentPadNone: 'pb-3',
    admin: 'text-[8px]',
    badge: 'text-[7px] py-px',
  },
  month: {
    btn: 'block w-full text-left text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 rounded border break-words relative cursor-pointer hover:ring-2 hover:ring-brand-orange/50 touch-manipulation min-h-[32px]',
    contentPadSingle: 'pt-4 pb-3',
    contentPadDouble: 'pt-7 pb-3',
    contentPadNone: 'pb-3',
    admin: 'text-[8px]',
    badge: 'text-[7px] py-px',
  },
  week: {
    btn: 'text-[10px] text-left px-1 py-0.5 rounded border break-words relative w-full cursor-pointer hover:ring-2 hover:ring-brand-orange/50 touch-manipulation',
    contentPadSingle: 'pt-4 pb-3',
    contentPadDouble: 'pt-7 pb-3',
    contentPadNone: 'pb-3',
    admin: 'text-[8px]',
    badge: 'text-[7px] py-px',
  },
  day: {
    btn: 'text-sm text-left px-2 py-2 sm:py-1 rounded border w-full max-w-full break-words relative cursor-pointer hover:ring-2 hover:ring-brand-orange/50 touch-manipulation',
    contentPadSingle: 'pt-5 pb-4',
    contentPadDouble: 'pt-9 pb-4',
    contentPadNone: 'pb-4',
    admin: 'text-[10px]',
    badge: 'text-[9px] py-0.5',
  },
}

export default function LessonCalendarBlock({
  lesson,
  rescheduledAt,
  originalLessonAt,
  label,
  title,
  onClick,
  size = 'compact',
  hasPendingRequest,
  hasRecord,
  showFooter = true,
  className = '',
}: LessonCalendarBlockProps) {
  const isCancelled = isLessonCancelledFamily(lesson.status)
  const isReposicao = lesson.status === 'REPOSICAO'
  const isCancelledWithReposicao = isCancelled && Boolean(rescheduledAt)
  const cancelledAt = isCancelled && !isCancelledWithReposicao ? extractCancelledAtFromNotes(lesson.notes) : null

  const inactiveAt = lesson.enrollment?.inactiveAt ?? null
  const inactivationWarning =
    Boolean(inactiveAt) && isLessonInInactivationWarningWindow(lesson.startAt, inactiveAt)
  const inactiveDateLabel = inactiveAt ? formatInactiveDateLabel(inactiveAt) : null

  const showCancelledBadge = isCancelled
  const showReposicaoBadge = isReposicao && Boolean(originalLessonAt)
  const showInactiveBadge = inactivationWarning
  const showBadge = showCancelledBadge || showReposicaoBadge || showInactiveBadge
  const badgeHasSecondLine =
    isCancelledWithReposicao || Boolean(cancelledAt) || showReposicaoBadge || showInactiveBadge

  const cfg = SIZE_CFG[size]
  const contentPad = showBadge
    ? badgeHasSecondLine
      ? cfg.contentPadDouble
      : cfg.contentPadSingle
    : cfg.contentPadNone

  const cardColorClass = statusColorClass(
    lesson.status,
    hasPendingRequest,
    hasRecord,
    inactivationWarning
  )

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${cfg.btn} ${cardColorClass} ${className}`}
      title={title}
    >
      {showBadge &&
        (showCancelledBadge ? (
          isCancelledWithReposicao && rescheduledAt ? (
            <span
              className={`absolute inset-x-0 top-0 z-10 text-center ${cfg.badge} font-bold uppercase tracking-wider bg-amber-600 text-white rounded-t leading-tight px-0.5`}
            >
              <span className="block">Reagendada</span>
              <span className="block font-medium normal-case tracking-normal">
                para {formatRescheduledBadgeDate(rescheduledAt)}
              </span>
            </span>
          ) : (
            <span
              className={`absolute inset-x-0 top-0 z-10 text-center ${cfg.badge} font-bold uppercase tracking-wider bg-rose-600 text-white rounded-t leading-tight px-0.5`}
            >
              <span className="block">Cancelado</span>
              {cancelledAt && (
                <span className="block font-medium normal-case tracking-normal">em {cancelledAt}</span>
              )}
            </span>
          )
        ) : showReposicaoBadge && originalLessonAt ? (
          <span
            className={`absolute inset-x-0 top-0 z-10 text-center ${cfg.badge} font-bold uppercase tracking-wider bg-amber-600 text-white rounded-t leading-tight px-0.5`}
          >
            <span className="block normal-case font-semibold">Aula reagendada</span>
            <span className="block font-medium normal-case tracking-normal">
              referente ao dia {formatOriginalLessonBadgeDate(originalLessonAt)}
            </span>
          </span>
        ) : showInactiveBadge && inactiveDateLabel ? (
          <span
            className={`absolute inset-x-0 top-0 z-10 text-center ${cfg.badge} font-bold uppercase tracking-wider bg-violet-700 text-white rounded-t leading-tight px-0.5`}
          >
            <span className="block normal-case font-semibold">Aluno inativado</span>
            <span className="block font-medium normal-case tracking-normal">
              no dia {inactiveDateLabel}
            </span>
          </span>
        ) : null)}
      <div className={`line-clamp-2 ${contentPad}`}>{label}</div>
      {showFooter && (
        <div className={`absolute bottom-0.5 right-1 ${cfg.admin} text-gray-500 opacity-60 leading-tight`}>
          {getLastUpdateInfo(lesson.notes, lesson.createdByName ?? null)}
        </div>
      )}
    </button>
  )
}
