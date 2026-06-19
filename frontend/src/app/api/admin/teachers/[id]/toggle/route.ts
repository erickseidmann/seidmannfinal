/**
 * API Route: POST /api/admin/teachers/[id]/toggle
 *
 * Ativa/desativa professor (toggle status ACTIVE/INACTIVE).
 * Inativação grava inactiveAt (hoje BRT), revoga User.status e bloqueia acesso.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { applyTeacherStatusChange } from '@/lib/teacher-status-change'

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

    if (!prisma.teacher) {
      console.error('[api/admin/teachers/[id]/toggle] Model Teacher não encontrado no Prisma Client. Execute: npx prisma generate')
      return NextResponse.json(
        { ok: false, message: 'Modelo Teacher não disponível. Execute: npx prisma generate' },
        { status: 503 }
      )
    }

    const teacher = await prisma.teacher.findUnique({
      where: { id },
      select: { id: true, nome: true, status: true, userId: true },
    })

    if (!teacher) {
      return NextResponse.json(
        { ok: false, message: 'Professor não encontrado' },
        { status: 404 }
      )
    }

    let inactiveFrom: string | undefined
    try {
      const body = await request.json()
      if (body && typeof body.inactiveFrom === 'string') {
        inactiveFrom = body.inactiveFrom
      }
    } catch {
      // body opcional
    }

    const newStatus = teacher.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'

    if (teacher.status === 'PENDING' && newStatus === 'ACTIVE') {
      const slotsCount = await prisma.teacherAvailabilitySlot.count({
        where: { teacherId: id },
      })
      if (slotsCount === 0) {
        return NextResponse.json(
          {
            ok: false,
            message:
              'Defina pelo menos um horário disponível para o professor antes de ativá-lo.',
          },
          { status: 400 }
        )
      }
    }

    const result = await applyTeacherStatusChange(id, newStatus, {
      inactiveFrom: newStatus === 'INACTIVE' ? inactiveFrom : undefined,
      userId: teacher.userId,
    })

    return NextResponse.json({
      ok: true,
      data: {
        teacher: {
          id: teacher.id,
          nome: teacher.nome,
          status: result.status,
          inactiveAt: result.inactiveAt?.toISOString() ?? null,
        },
        message: `Professor ${newStatus === 'ACTIVE' ? 'ativado' : 'desativado'} com sucesso`,
      },
    })
  } catch (error) {
    console.error('[api/admin/teachers/[id]/toggle] Erro ao toggle professor:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao alterar status do professor' },
      { status: 500 }
    )
  }
}
