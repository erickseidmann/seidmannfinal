import type { LessonAttendanceSummary } from '@/lib/lesson-attendance-summary'
import { formatDateKeyPtBR } from '@/lib/datetime'

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m > 0) return `${m} min ${s.toString().padStart(2, '0')}s`
  return `${s}s`
}

export async function downloadLessonAttendancePdf(
  summaries: LessonAttendanceSummary[],
  lessonDateKey: string
): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const lessonDateLabel = formatDateKeyPtBR(lessonDateKey)
  const generatedAt = new Date().toLocaleString('pt-BR')

  doc.setFontSize(14)
  doc.text('Seidmann Institute — Presença em videochamada', 14, 16)
  doc.setFontSize(10)
  doc.text(`Aulas do dia ${lessonDateLabel}`, 14, 24)
  doc.text(`Gerado em ${generatedAt}`, 14, 30)
  doc.text(`Total: ${summaries.length} aula(s)`, 14, 36)

  const rows = summaries.map((s) => [
    formatDateTime(s.lessonStartAt),
    s.studentName,
    s.teacherName,
    s.teacherJoinedAt ? formatDateTime(s.teacherJoinedAt) : '—',
    s.studentJoinedAt ? formatDateTime(s.studentJoinedAt) : '—',
    `${s.durationMinutes} min`,
    s.teacherTimeSeconds > 0 ? formatDuration(s.teacherTimeSeconds) : '—',
    s.studentTimeSeconds > 0 ? formatDuration(s.studentTimeSeconds) : '—',
    s.teacherAbsent ? 'Ausência do professor' : s.callStatus === 'ACTIVE' ? 'Na chamada' : 'Encerrada',
    String(s.sessions.length),
  ])

  autoTable(doc, {
    startY: 42,
    head: [
      [
        'Aula',
        'Aluno',
        'Professor',
        'Prof. entrou',
        'Aluno entrou',
        'Agendado',
        'Tempo prof.',
        'Tempo aluno',
        'Status',
        'Sessões',
      ],
    ],
    body: rows,
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [234, 88, 12] },
  })

  let y = (doc as typeof doc & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 42

  for (const s of summaries) {
    if (s.sessions.length === 0) continue
    y += 10
    if (y > 180) {
      doc.addPage()
      y = 16
    }
    doc.setFontSize(9)
    doc.text(
      `Detalhes — ${formatDateTime(s.lessonStartAt)} — ${s.studentName} / ${s.teacherName}`,
      14,
      y
    )
    y += 4

    autoTable(doc, {
      startY: y,
      head: [['Quem', 'Entrada', 'Saída', 'Tempo', 'Status']],
      body: s.sessions.map((sess) => [
        `${sess.role === 'TEACHER' ? 'Professor' : 'Aluno'} — ${sess.participantName}`,
        formatDateTime(sess.joinedAt),
        sess.leftAt ? formatDateTime(sess.leftAt) : '—',
        formatDuration(sess.durationSeconds),
        sess.status === 'ACTIVE' ? 'Na chamada' : 'Encerrada',
      ]),
      styles: { fontSize: 7, cellPadding: 1.2 },
      headStyles: { fillColor: [100, 116, 139] },
    })
    y = (doc as typeof doc & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y
  }

  doc.save(`presenca-chamadas-${lessonDateKey}.pdf`)
}
