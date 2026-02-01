/**
 * GET /api/professor/announcements
 * Lista anúncios destinados a professores (audience TEACHERS ou ALL).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireTeacher(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    if (!prisma.announcement) {
      return NextResponse.json(
        { ok: false, message: 'Anúncios não disponíveis' },
        { status: 503 }
      )
    }

    const announcements = await prisma.announcement.findMany({
      where: {
        audience: { in: ['TEACHERS', 'ALL'] },
      },
      orderBy: { criadoEm: 'desc' },
      take: 50,
    })

    return NextResponse.json({
      ok: true,
      data: {
        announcements: announcements.map((a) => ({
          id: a.id,
          title: a.title,
          message: a.message,
          channel: a.channel,
          audience: a.audience,
          status: a.status,
          sentAt: a.sentAt?.toISOString() ?? null,
          criadoEm: a.criadoEm.toISOString(),
        })),
      },
    })
  } catch (error) {
    console.error('[api/professor/announcements GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar anúncios' },
      { status: 500 }
    )
  }
}
