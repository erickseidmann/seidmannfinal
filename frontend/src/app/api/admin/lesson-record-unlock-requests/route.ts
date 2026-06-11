/**
 * GET /api/admin/lesson-record-unlock-requests
 * Lista solicitações de liberação de registro de aula.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const statusFilter = searchParams.get('status')

    const where =
      statusFilter && ['PENDING', 'APPROVED', 'DENIED'].includes(statusFilter)
        ? { status: statusFilter as 'PENDING' | 'APPROVED' | 'DENIED' }
        : {}

    const requests = await prisma.lessonRecordUnlockRequest.findMany({
      where,
      orderBy: [{ status: 'asc' }, { criadoEm: 'desc' }],
      include: {
        teacher: { select: { id: true, nome: true, email: true } },
        processedBy: { select: { id: true, nome: true, email: true } },
        lesson: {
          select: {
            id: true,
            startAt: true,
            status: true,
            durationMinutes: true,
            record: { select: { id: true } },
            enrollment: {
              select: { id: true, nome: true, tipoAula: true, nomeGrupo: true },
            },
          },
        },
      },
      take: 200,
    })

    const pendingCount = await prisma.lessonRecordUnlockRequest.count({
      where: { status: 'PENDING' },
    })

    return NextResponse.json({
      ok: true,
      data: {
        requests: requests.map((r) => ({
          id: r.id,
          status: r.status,
          message: r.message,
          adminNotes: r.adminNotes,
          criadoEm: r.criadoEm.toISOString(),
          processedAt: r.processedAt?.toISOString() ?? null,
          teacher: r.teacher,
          processedBy: r.processedBy,
          lesson: {
            ...r.lesson,
            startAt: r.lesson.startAt.toISOString(),
            hasRecord: Boolean(r.lesson.record),
          },
        })),
        pendingCount,
      },
    })
  } catch (error) {
    console.error('[api/admin/lesson-record-unlock-requests GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar liberações' },
      { status: 500 }
    )
  }
}
