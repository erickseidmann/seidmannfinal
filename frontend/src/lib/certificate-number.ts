import { prisma } from '@/lib/prisma'

/** Gera número sequencial no formato SI-AAAA-0001 */
export async function allocateCertificateNumber(issueDate: Date): Promise<string> {
  const year = issueDate.getFullYear()
  const prefix = `SI-${year}-`

  const last = await prisma.onlineCertificate.findFirst({
    where: { certificateNo: { startsWith: prefix } },
    orderBy: { certificateNo: 'desc' },
    select: { certificateNo: true },
  })

  let next = 1
  if (last?.certificateNo) {
    const suffix = last.certificateNo.slice(prefix.length)
    const parsed = parseInt(suffix, 10)
    if (!Number.isNaN(parsed)) next = parsed + 1
  }

  return `${prefix}${String(next).padStart(4, '0')}`
}
