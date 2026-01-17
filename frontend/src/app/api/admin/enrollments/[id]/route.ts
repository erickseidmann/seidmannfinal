/**
 * API Route: PATCH /api/admin/enrollments/[id]
 * 
 * Ações admin sobre enrollments:
 * - approve: Marca Enrollment como REGISTERED e User.status como ACTIVE
 * - complete: Marca Enrollment como COMPLETED
 * 
 * Requer autenticação admin via sessão (cookie httpOnly)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verificar autenticação admin
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
    const { action } = body

    // Validações
    if (!action || typeof action !== 'string') {
      return NextResponse.json(
        {
          ok: false,
          message: 'Ação é obrigatória. Use "approve" ou "complete"',
        },
        { status: 400 }
      )
    }

    if (action !== 'approve' && action !== 'complete') {
      return NextResponse.json(
        {
          ok: false,
          message: 'Ação inválida. Use "approve" ou "complete"',
        },
        { status: 400 }
      )
    }

    // Verificar se enrollment existe
    const enrollment = await prisma.enrollment.findUnique({
      where: { id },
      include: {
        user: true,
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

    let updatedEnrollment

    if (action === 'approve') {
      // Aprovar: Enrollment.status = REGISTERED, User.status = ACTIVE (se existir user)
      const updateData: any = {
        status: 'REGISTERED',
      }

      updatedEnrollment = await prisma.enrollment.update({
        where: { id },
        data: updateData,
      })

      // Se tiver user vinculado, atualizar status para ACTIVE
      if (enrollment.userId && enrollment.user) {
        await prisma.user.update({
          where: { id: enrollment.userId },
          data: {
            status: 'ACTIVE',
          },
        })
      }

      console.log(`[api/admin/enrollments/${id}] Enrollment aprovado: ${enrollment.status} -> REGISTERED, User.status -> ACTIVE`)
    } else if (action === 'complete') {
      // Completar: Enrollment.status = COMPLETED
      updatedEnrollment = await prisma.enrollment.update({
        where: { id },
        data: {
          status: 'COMPLETED',
        },
      })

      console.log(`[api/admin/enrollments/${id}] Enrollment concluído: ${enrollment.status} -> COMPLETED`)
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
          message: action === 'approve' 
            ? 'Enrollment aprovado e acesso liberado'
            : 'Enrollment marcado como concluído',
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[api/admin/enrollments/[id]] Erro ao processar ação:', error)
    return NextResponse.json(
      {
        ok: false,
        message: 'Erro ao processar ação no enrollment',
      },
      { status: 500 }
    )
  }
}
