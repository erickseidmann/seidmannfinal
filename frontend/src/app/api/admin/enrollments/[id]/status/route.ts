/**
 * API Route: PATCH /api/admin/enrollments/[id]/status
 * 
 * Atualiza o status de um Enrollment.
 * Requer autenticação admin via header Authorization: Bearer <ADMIN_TOKEN>
 */

import { NextRequest, NextResponse } from 'next/server'
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
    const { status } = body

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

    // Atualizar status do Enrollment
    const updatedEnrollment = await prisma.enrollment.update({
      where: { id },
      data: {
        status: status as any,
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
