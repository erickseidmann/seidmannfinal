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
    const { status, activationDate } = body

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

    // Se status mudou para INACTIVE, cancelar todas as aulas futuras (PAUSED não cancela, apenas bloqueia ações)
    const oldStatus = enrollment.status
    if (status === 'INACTIVE' && oldStatus !== 'INACTIVE') {
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)
      await prisma.lesson.updateMany({
        where: {
          enrollmentId: id,
          startAt: { gte: hoje },
          status: { not: 'CANCELLED' },
        },
        data: { status: 'CANCELLED' },
      })
    }

    // Atualizar status do Enrollment; ao marcar INACTIVE grava inactiveAt; ao marcar PAUSED grava pausedAt; ao voltar para ACTIVE limpa ambos
    const updateData: { status: EnrollmentStatus; inactiveAt?: Date | null; pausedAt?: Date | null; activationDate?: Date | null } = { status: status as EnrollmentStatus }
    if (status === 'INACTIVE') {
      updateData.inactiveAt = new Date()
      updateData.pausedAt = null
      updateData.activationDate = null
    } else if (status === 'PAUSED') {
      updateData.pausedAt = new Date()
      updateData.inactiveAt = null
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
    }
    const updatedEnrollment = await prisma.enrollment.update({
      where: { id },
      data: updateData,
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
