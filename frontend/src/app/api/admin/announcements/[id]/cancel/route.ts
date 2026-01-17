/**
 * API Route: POST /api/admin/announcements/[id]/cancel
 * 
 * Cancela anúncio
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

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

    // Verificar se o model existe no Prisma Client
    if (!prisma.announcement) {
      console.error('[api/admin/announcements/[id]/cancel] Model Announcement não encontrado no Prisma Client. Execute: npx prisma generate')
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
        { ok: false, message: 'Anúncio já enviado não pode ser cancelado' },
        { status: 400 }
      )
    }

    const updated = await prisma.announcement.update({
      where: { id },
      data: {
        status: 'CANCELED',
      },
    })

    return NextResponse.json({
      ok: true,
      data: {
        announcement: {
          id: updated.id,
          status: updated.status,
        },
        message: 'Anúncio cancelado com sucesso',
      },
    })
  } catch (error) {
    console.error('[api/admin/announcements/[id]/cancel] Erro ao cancelar anúncio:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao cancelar anúncio' },
      { status: 500 }
    )
  }
}
