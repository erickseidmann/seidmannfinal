/**
 * API Route: POST /api/admin/announcements/[id]/send
 *
 * Envia anúncio: envia e-mail aos destinatários (professores e/ou alunos) conforme audiência.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { sendEmail } from '@/lib/email'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { id } = params

    if (!prisma.announcement) {
      return NextResponse.json(
        { ok: false, message: 'Modelo Announcement não disponível. Execute: npx prisma generate' },
        { status: 503 }
      )
    }

    const announcement = await prisma.announcement.findUnique({
      where: { id },
    })

    if (!announcement) {
      return NextResponse.json(
        { ok: false, message: 'Anúncio não encontrado' },
        { status: 404 }
      )
    }

    if (announcement.status === 'SENT') {
      return NextResponse.json(
        { ok: false, message: 'Anúncio já foi enviado' },
        { status: 400 }
      )
    }

    if (announcement.status === 'CANCELED') {
      return NextResponse.json(
        { ok: false, message: 'Anúncio cancelado não pode ser enviado' },
        { status: 400 }
      )
    }

    const subject = announcement.title
    const text = announcement.message

    if (announcement.channel === 'EMAIL') {
      const audience = announcement.audience
      const sendToTeachers = audience === 'TEACHERS' || audience === 'ALL' || audience === 'ACTIVE_ONLY'
      const sendToStudents = audience === 'STUDENTS' || audience === 'ALL' || audience === 'ACTIVE_ONLY'
      const activeOnly = audience === 'ACTIVE_ONLY'

      if (sendToTeachers) {
        const teacherWhere = activeOnly ? { status: 'ACTIVE' as const } : {}
        const teachers = await prisma.teacher.findMany({
          where: teacherWhere,
          select: { email: true, nome: true },
        })
        for (const t of teachers) {
          if (t.email?.trim()) {
            try {
              await sendEmail({
                to: t.email.trim(),
                subject,
                text: `Olá, ${t.nome}\n\n${text}`,
              })
            } catch (err) {
              console.error('[api/admin/announcements/send] Erro ao enviar e-mail para professor:', t.email, err)
            }
          }
        }
      }

      if (sendToStudents) {
        const enrollmentWhere = activeOnly ? { status: 'ACTIVE' as const } : {}
        const enrollments = await prisma.enrollment.findMany({
          where: enrollmentWhere,
          select: { email: true, nome: true },
        })
        const seen = new Set<string>()
        for (const e of enrollments) {
          const email = e.email?.trim()
          if (email && !seen.has(email.toLowerCase())) {
            seen.add(email.toLowerCase())
            try {
              await sendEmail({
                to: email,
                subject,
                text: `Olá, ${e.nome}\n\n${text}`,
              })
            } catch (err) {
              console.error('[api/admin/announcements/send] Erro ao enviar e-mail para aluno:', email, err)
            }
          }
        }
      }
    }

    const updated = await prisma.announcement.update({
      where: { id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
      },
    })

    return NextResponse.json({
      ok: true,
      data: {
        announcement: {
          id: updated.id,
          status: updated.status,
          sentAt: updated.sentAt?.toISOString(),
        },
        message: 'Anúncio enviado com sucesso',
      },
    })
  } catch (error) {
    console.error('[api/admin/announcements/[id]/send] Erro ao enviar anúncio:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao enviar anúncio' },
      { status: 500 }
    )
  }
}
