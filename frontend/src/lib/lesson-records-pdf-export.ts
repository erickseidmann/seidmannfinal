export type LessonRecordExportRow = {
  id: string
  status: string
  presence: string
  lessonType: string
  book: string | null
  lastPage: string | null
  studentPresences?: {
    enrollmentId: string
    presence: string
    enrollment?: { nome: string }
  }[]
  lesson: {
    startAt: string
    enrollment: { nome: string; tipoAula?: string | null; nomeGrupo?: string | null }
    teacher: { nome: string }
  }
}

const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
  REPOSICAO: 'Reposição',
}

const PRESENCE_LABELS: Record<string, string> = {
  PRESENTE: 'Presente',
  NAO_COMPARECEU: 'Não compareceu',
  ATRASADO: 'Atrasado',
}

const LESSON_TYPE_LABELS: Record<string, string> = {
  NORMAL: 'Normal',
  CONVERSAÇÃO: 'Só conversação',
  REVISAO: 'Revisão',
  AVALIACAO: 'Avaliação',
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateKeyPtBR(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
}

export function getLessonRecordAlunoLabel(r: LessonRecordExportRow): string {
  const enr = r.lesson.enrollment
  if (enr?.tipoAula === 'GRUPO' && enr?.nomeGrupo?.trim()) {
    return enr.nomeGrupo.trim()
  }
  return enr.nome
}

export function getLessonRecordPresenceLabel(r: LessonRecordExportRow): string {
  const isGroup =
    r.lesson.enrollment?.tipoAula === 'GRUPO' && r.lesson.enrollment?.nomeGrupo?.trim()
  if (isGroup && r.studentPresences?.length) {
    return r.studentPresences
      .map(
        (s) =>
          `${s.enrollment?.nome ?? s.enrollmentId}: ${PRESENCE_LABELS[s.presence] ?? s.presence}`
      )
      .join('; ')
  }
  return PRESENCE_LABELS[r.presence] ?? r.presence
}

export async function downloadLessonRecordsPdf(
  records: LessonRecordExportRow[],
  options: {
    startDate: string
    endDate: string
    scopeLabel: string
  }
): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const generatedAt = new Date().toLocaleString('pt-BR')

  doc.setFontSize(14)
  doc.text('Seidmann Institute — Registros de aulas', 14, 16)
  doc.setFontSize(10)
  doc.text(
    `Período: ${formatDateKeyPtBR(options.startDate)} a ${formatDateKeyPtBR(options.endDate)}`,
    14,
    24
  )
  doc.text(`Filtro: ${options.scopeLabel}`, 14, 30)
  doc.text(`Gerado em ${generatedAt} — ${records.length} registro(s)`, 14, 36)

  const rows = records.map((r) => [
    formatDateTime(r.lesson.startAt),
    getLessonRecordAlunoLabel(r),
    r.lesson.teacher.nome,
    STATUS_LABELS[r.status] ?? r.status,
    getLessonRecordPresenceLabel(r),
    LESSON_TYPE_LABELS[r.lessonType] ?? r.lessonType,
    r.book ?? '—',
    r.lastPage ?? '—',
  ])

  autoTable(doc, {
    startY: 42,
    head: [
      ['Data / Hora', 'Aluno / Grupo', 'Professor', 'Status', 'Presença', 'Tipo', 'Livro', 'Página'],
    ],
    body: rows,
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [234, 88, 12] },
  })

  doc.save(`registros-aulas-${options.startDate}_${options.endDate}.pdf`)
}
