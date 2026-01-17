/**
 * API Route: POST /api/admin/teacher-alerts/[id]/toggle
 * 
 * Ativa/desativa alerta de professor
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
    if (!prisma.teacherAlert) {
      console.error('[api/admin/teacher-alerts/[id]/toggle] Model TeacherAlert não encontrado no Prisma Client. Execute: npx prisma generate')
      return NextResponse.json(
        { ok: false, message: 'Modelo TeacherAlert não disponível. Execute: npx prisma generate' },
        { status: 503 }
      )
    }

    const alert = await prisma.teacherAlert.findUnique({
      where: { id },
    })

    if (!alert) {
      return NextResponse.json(
        { ok: false, message: 'Alerta não encontrado' },
        { status: 404 }
      )
    }

    const updated = await prisma.teacherAlert.update({
      where: { id },
      data: {
        isActive: !alert.isActive,
      },
    })

    return NextResponse.json({
      ok: true,
      data: {
        alert: {
          id: updated.id,
          isActive: updated.isActive,
        },
        message: `Alerta ${updated.isActive ? 'ativado' : 'desativado'} com sucesso`,
      },
    })
  } catch (error) {
    console.error('[api/admin/teacher-alerts/[id]/toggle] Erro ao toggle alerta:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao alterar status do alerta' },
      { status: 500 }
    )
  }
}
