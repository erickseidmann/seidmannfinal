import type { OnlineCertificate } from '@prisma/client'
import { CERTIFICATE_TYPE_LABELS, getCertificateValidationUrl } from '@/lib/certificate-constants'
import { formatCertificateDateShort, formatCpfDisplay } from '@/lib/certificate-format'

export function serializeCertificate(row: OnlineCertificate) {
  return {
    id: row.id,
    certificateNo: row.certificateNo,
    type: row.type,
    typeLabel: CERTIFICATE_TYPE_LABELS[row.type],
    studentName: row.studentName,
    studentCpf: formatCpfDisplay(row.studentCpf),
    courseTitle: row.courseTitle,
    courseBody: row.courseBody,
    periodStart: row.periodStart?.toISOString() ?? null,
    periodEnd: row.periodEnd?.toISOString() ?? null,
    totalHours: row.totalHours,
    issueDate: row.issueDate.toISOString().slice(0, 10),
    pdfPath: row.pdfPath,
    validationUrl: getCertificateValidationUrl(row.certificateNo),
    active: row.active,
    criadoEm: row.criadoEm.toISOString(),
  }
}

export function serializeCertificatePublic(row: OnlineCertificate) {
  return {
    certificateNo: row.certificateNo,
    type: row.type,
    typeLabel: CERTIFICATE_TYPE_LABELS[row.type],
    studentName: row.studentName,
    studentCpf: formatCpfDisplay(row.studentCpf),
    courseTitle: row.courseTitle,
    totalHours: row.totalHours,
    issueDate: row.issueDate.toISOString().slice(0, 10),
    issueDateFormatted: row.issueDate.toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Sao_Paulo',
    }),
    periodStart: row.periodStart
      ? formatCertificateDateShort(row.periodStart)
      : null,
    periodEnd: row.periodEnd ? formatCertificateDateShort(row.periodEnd) : null,
    pdfPath: row.pdfPath,
    validationUrl: getCertificateValidationUrl(row.certificateNo),
    active: row.active,
  }
}
