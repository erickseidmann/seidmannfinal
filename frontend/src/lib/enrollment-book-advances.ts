import { parseBookNumberFromName } from '@/lib/student-book-level'

export type BookAdvanceRow = {
  id: string
  enrollmentId: string
  studentName: string
  teacherName: string
  previousBook: string
  newBook: string
  advancedAt: string
}

type RawLessonRecord = {
  id: string
  book: string | null
  lesson: {
    startAt: Date
    enrollmentId: string
    enrollment: { nome: string }
    teacher: { nome: string; nomePreferido: string | null }
  }
}

export function computeBookAdvancesFromRecords(records: RawLessonRecord[]): BookAdvanceRow[] {
  const byEnrollment = new Map<string, RawLessonRecord[]>()

  for (const r of records) {
    const book = r.book?.trim()
    if (!book) continue
    const eid = r.lesson.enrollmentId
    const list = byEnrollment.get(eid)
    if (list) list.push(r)
    else byEnrollment.set(eid, [r])
  }

  const advances: BookAdvanceRow[] = []

  for (const [enrollmentId, recs] of byEnrollment) {
    const sorted = [...recs].sort(
      (a, b) => a.lesson.startAt.getTime() - b.lesson.startAt.getTime()
    )

    let prevBook: string | null = null
    let prevNum: number | null = null

    for (const r of sorted) {
      const book = r.book!.trim()
      const num = parseBookNumberFromName(book)

      if (prevBook != null && prevNum != null && num != null && num > prevNum) {
        const teacher = r.lesson.teacher
        advances.push({
          id: r.id,
          enrollmentId,
          studentName: r.lesson.enrollment.nome,
          teacherName: teacher.nomePreferido?.trim() || teacher.nome,
          previousBook: prevBook,
          newBook: book,
          advancedAt: r.lesson.startAt.toISOString(),
        })
      }

      if (num != null) {
        prevBook = book
        prevNum = num
      }
    }
  }

  advances.sort((a, b) => new Date(b.advancedAt).getTime() - new Date(a.advancedAt).getTime())
  return advances
}
