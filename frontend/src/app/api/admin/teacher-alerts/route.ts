/**
 * API Route: GET /api/admin/teacher-alerts
 * POST /api/admin/teacher-alerts
 * 
 * Lista e cria alertas para professores
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
    const teacherId = searchParams.get('teacherId')

    // Verificar se o model existe no Prisma Client
    if (!prisma.teacherAlert) {
      console.error('[api/admin/teacher-alerts] Model TeacherAlert não encontrado no Prisma Client. Execute: npx prisma generate')
      return NextResponse.json(
        { ok: false, message: 'Modelo TeacherAlert não disponível. Execute: npx prisma generate' },
        { status: 503 }
      )
    }

    const where: any = {}
    if (teacherId) {
      where.teacherId = teacherId
    }

    const alerts = await prisma.teacherAlert.findMany({
      where,
      include: {
        teacher: {
          select: {
            id: true,
            nome: true,
            email: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            nome: true,
            email: true,
          },
        },
      },
      orderBy: {
        criadoEm: 'desc',
      },
    })

    return NextResponse.json({
      ok: true,
      data: {
        alerts: alerts.map((a) => ({
          id: a.id,
          teacherId: a.teacherId,
          teacher: a.teacher,
          message: a.message,
          level: a.level,
          isActive: a.isActive,
          criadoEm: a.criadoEm.toISOString(),
          atualizadoEm: a.atualizadoEm.toISOString(),
          createdBy: a.createdBy ? { id: a.createdBy.id, nome: a.createdBy.nome, email: a.createdBy.email } : null,
        })),
      },
    })
  } catch (error) {
    console.error('[api/admin/teacher-alerts] Erro ao listar alertas:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar alertas' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const body = await request.json()
    const { teacherId, message, level } = body

    // Validações
    if (!teacherId || !message) {
      return NextResponse.json(
        { ok: false, message: 'teacherId e message são obrigatórios' },
        { status: 400 }
      )
    }

    // Verificar se os models existem no Prisma Client
    if (!prisma.teacher || !prisma.teacherAlert) {
      console.error('[api/admin/teacher-alerts] Models Teacher/TeacherAlert não encontrados no Prisma Client. Execute: npx prisma generate')
      return NextResponse.json(
        { ok: false, message: 'Modelos não disponíveis. Execute: npx prisma generate' },
        { status: 503 }
      )
    }

    // Verificar se professor existe
    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
    })

    if (!teacher) {
      return NextResponse.json(
        { ok: false, message: 'Professor não encontrado' },
        { status: 404 }
      )
    }

    const createdById = auth.session?.sub ?? null

    const alert = await prisma.teacherAlert.create({
      data: {
        teacherId,
        message: message.trim(),
        level: level || 'INFO',
        isActive: true,
        createdById,
      },
      include: {
        teacher: {
          select: {
            id: true,
            nome: true,
            email: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            nome: true,
            email: true,
          },
        },
      },
    })

    return NextResponse.json({
      ok: true,
      data: {
        alert: {
          id: alert.id,
          teacherId: alert.teacherId,
          teacher: alert.teacher,
          message: alert.message,
          level: alert.level,
          isActive: alert.isActive,
          criadoEm: alert.criadoEm.toISOString(),
          createdBy: alert.createdBy ? { id: alert.createdBy.id, nome: alert.createdBy.nome, email: alert.createdBy.email } : null,
        },
        message: 'Alerta criado com sucesso',
      },
    }, { status: 201 })
  } catch (error) {
    console.error('[api/admin/teacher-alerts] Erro ao criar alerta:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao criar alerta' },
      { status: 500 }
    )
  }
}
