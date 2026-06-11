/**
 * API Route: PATCH /api/admin/enrollments/[id]/status
 * 
 * Atualiza o status de um Enrollment.
 * Requer autenticação admin via header Authorization: Bearer <ADMIN_TOKEN>
 */

import { NextRequest, NextResponse } from 'next/server'
import type { EnrollmentStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import type { InactiveReason } from '@prisma/client'
import { validateInactiveReasonPayload } from '@/lib/inactive-reason'
import {
  formatDateKeyPtBR,
  inactiveFromParamToBrazilDateKey,
  startOfCalendarDayBrazilDateKey,
  toDateKeyInTZ,
} from '@/lib/datetime'
import { mensagemAlunoInativoProfessor, sendEmail } from '@/lib/email'
import { auditFieldsForUpdate, resolveAdminActor } from '@/lib/record-audit'

const VALID_STATUSES = ['LEAD', 'REGISTERED', 'CONTRACT_ACCEPTED', 'PAYMENT_PENDING', 'ACTIVE', 'INACTIVE', 'PAUSED', 'BLOCKED', 'COMPLETED']

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verificar autenticação admin (sessão + role)
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        {
          ok: false,
          message: auth.message || 'Não autorizado',
        },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { id } = params
    const body = await request.json()
    const { status, activationDate, inactiveFrom, inactiveReason, inactiveReasonOther } = body

    // Validações
    if (!status || typeof status !== 'string') {
      return NextResponse.json(
        {
          ok: false,
          message: 'Status é obrigatório',
        },
        { status: 400 }
      )
    }

    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        {
          ok: false,
          message: `Status inválido. Use: ${VALID_STATUSES.join(', ')}`,
        },
        { status: 400 }
      )
    }

    // Verificar se enrollment existe
    const enrollment = await prisma.enrollment.findUnique({
      where: { id },
      include: {
        paymentInfo: true,
      },
    })

    if (!enrollment) {
      return NextResponse.json(
        {
          ok: false,
          message: 'Enrollment não encontrado',
        },
        { status: 404 }
      )
    }

    const oldStatus = enrollment.status
    const adminUserId = auth.session?.sub

    let validatedInactive: {
      inactiveReason: InactiveReason
      inactiveReasonOther: string | null
    } | null = null

    let inactiveNotify: {
      teacherIds: string[]
      nomeAluno: string
      nomeGrupo: string | null
      dataPt: string
    } | null = null

    if (status === 'INACTIVE' && oldStatus !== 'INACTIVE') {
      const v = validateInactiveReasonPayload(inactiveReason, inactiveReasonOther)
      if (!v.ok) {
        return NextResponse.json({ ok: false, message: v.message }, { status: 400 })
      }
      validatedInactive = {
        inactiveReason: v.inactiveReason as InactiveReason,
        inactiveReasonOther: v.inactiveReasonOther,
      }

      const inactiveBrazilDateKey = inactiveFromParamToBrazilDateKey(inactiveFrom)
      let lessonCutoff = startOfCalendarDayBrazilDateKey(inactiveBrazilDateKey)
      if (!lessonCutoff) {
        const fallbackKey = toDateKeyInTZ(new Date())
        lessonCutoff = startOfCalendarDayBrazilDateKey(fallbackKey)!
      }
      const dataPt = formatDateKeyPtBR(inactiveBrazilDateKey)

      const lessonsForCut = await prisma.lesson.findMany({
        where: { enrollmentId: id, startAt: { gte: lessonCutoff } },
        select: { teacherId: true },
      })
      const teacherIds = [
        ...new Set(
          lessonsForCut.map((l) => l.teacherId).filter((tid): tid is string => Boolean(tid))
        ),
      ]

      await prisma.lesson.deleteMany({
        where: { enrollmentId: id, startAt: { gte: lessonCutoff } },
      })

      if (teacherIds.length > 0) {
        const nomeGrupo =
          enrollment.tipoAula === 'GRUPO' && enrollment.nomeGrupo?.trim()
            ? enrollment.nomeGrupo.trim()
            : null
        inactiveNotify = {
          teacherIds,
          nomeAluno: enrollment.nome,
          nomeGrupo,
          dataPt,
        }
      }
    }

    // Atualizar status do Enrollment; ao marcar INACTIVE grava inactiveAt; ao marcar PAUSED grava pausedAt; ao voltar para ACTIVE limpa ambos
    const updateData: {
      status: EnrollmentStatus
      inactiveAt?: Date | null
      pausedAt?: Date | null
      activationDate?: Date | null
      inactiveByUserId?: string | null
      inactiveReason?: InactiveReason | null
      inactiveReasonOther?: string | null
    } = { status: status as EnrollmentStatus }
    if (status === 'INACTIVE') {
      const inactiveDateKey = inactiveFromParamToBrazilDateKey(inactiveFrom)
      let inactiveAtComputed = startOfCalendarDayBrazilDateKey(inactiveDateKey)
      if (!inactiveAtComputed) {
        inactiveAtComputed = startOfCalendarDayBrazilDateKey(toDateKeyInTZ(new Date()))!
      }
      updateData.inactiveAt = inactiveAtComputed
      updateData.pausedAt = null
      updateData.activationDate = null
      if (oldStatus !== 'INACTIVE') {
        updateData.inactiveByUserId = adminUserId ?? null
        if (validatedInactive) {
          updateData.inactiveReason = validatedInactive.inactiveReason
          updateData.inactiveReasonOther = validatedInactive.inactiveReasonOther
        }
      }
    } else if (status === 'PAUSED') {
      updateData.pausedAt = new Date()
      updateData.inactiveAt = null
      updateData.inactiveByUserId = null
      updateData.inactiveReason = null
      updateData.inactiveReasonOther = null
      // activationDate é obrigatório para PAUSED
      if (!activationDate) {
        return NextResponse.json(
          { ok: false, message: 'Data de ativação é obrigatória para alunos pausados' },
          { status: 400 }
        )
      }
      updateData.activationDate = new Date(activationDate)
    } else {
      updateData.inactiveAt = null
      updateData.pausedAt = null
      updateData.activationDate = null
      updateData.inactiveByUserId = null
      updateData.inactiveReason = null
      updateData.inactiveReasonOther = null
    }
    const adminActor = await resolveAdminActor(auth.session?.sub, auth.session?.email)
    const updatedEnrollment = await prisma.enrollment.update({
      where: { id },
      data: {
        ...updateData,
        ...auditFieldsForUpdate(adminActor),
      },
      include: {
        user: {
          select: {
            id: true,
            nome: true,
            email: true,
            whatsapp: true,
          },
        },
        paymentInfo: true,
      },
    })

    if (enrollment.userId) {
      if (status === 'ACTIVE') {
        await prisma.user.update({
          where: { id: enrollment.userId },
          data: { status: 'ACTIVE' },
        })
      } else if (status === 'INACTIVE') {
        await prisma.user.update({
          where: { id: enrollment.userId },
          data: { status: 'INACTIVE' },
        })
      }
    }

    // Se status for ACTIVE e tiver PaymentInfo com status PENDING, atualizar para CONFIRMED
    if (status === 'ACTIVE' && updatedEnrollment.paymentInfo && updatedEnrollment.paymentInfo.paymentStatus === 'PENDING') {
      await prisma.paymentInfo.update({
        where: { id: updatedEnrollment.paymentInfo.id },
        data: {
          paymentStatus: 'CONFIRMED',
          paidAt: new Date(),
        },
      })
    }

    console.log(`[api/admin/enrollments/${id}/status] Status atualizado: ${enrollment.status} -> ${status}`)

    if (inactiveNotify && prisma.teacherAlert) {
      const { teacherIds, nomeAluno, nomeGrupo, dataPt } = inactiveNotify
      const grupoFrag = nomeGrupo ? ` (${nomeGrupo})` : ''
      const message = `O aluno ${nomeAluno}${grupoFrag} foi marcado como inativo. As aulas no calendário a partir de ${dataPt} foram removidas; não haverá novas aulas com este aluno a partir dessa data.`

      await prisma.teacherAlert.createMany({
        data: teacherIds.map((teacherId) => ({
          teacherId,
          enrollmentId: id,
          message,
          type: 'STUDENT_INACTIVE',
          level: 'INFO',
          createdById: adminUserId ?? null,
        })),
      })

      const teachers = await prisma.teacher.findMany({
        where: { id: { in: teacherIds } },
        select: {
          id: true,
          user: { select: { email: true, nome: true } },
        },
      })

      for (const t of teachers) {
        const email = t.user?.email?.trim()
        if (!email) continue
        const nomeProfessor = t.user?.nome?.trim() || 'Professor(a)'
        const { subject, text } = mensagemAlunoInativoProfessor({
          nomeProfessor,
          nomeAluno,
          nomeGrupo,
          dataInativacaoPt: dataPt,
        })
        void sendEmail({ to: email, subject, text }).catch((err) =>
          console.error(`[api/admin/enrollments/${id}/status] e-mail inativação professor ${t.id}:`, err)
        )
      }
    }

    // Retornar enrollment atualizado
    return NextResponse.json(
      {
        ok: true,
        data: {
          enrollment: {
            id: updatedEnrollment.id,
            nome: updatedEnrollment.nome,
            email: updatedEnrollment.email,
            whatsapp: updatedEnrollment.whatsapp,
            status: updatedEnrollment.status,
            trackingCode: updatedEnrollment.trackingCode,
            criadoEm: updatedEnrollment.criadoEm.toISOString(),
            atualizadoEm: updatedEnrollment.atualizadoEm.toISOString(),
          },
          message: `Status atualizado para ${status} com sucesso`,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[api/admin/enrollments/[id]/status] Erro ao atualizar status:', error)
    return NextResponse.json(
      {
        ok: false,
        message: 'Erro ao atualizar status do enrollment',
      },
      { status: 500 }
    )
  }
}
