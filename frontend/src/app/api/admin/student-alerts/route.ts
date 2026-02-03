/**
 * API Route: GET /api/admin/student-alerts
 * POST /api/admin/student-alerts
 *
 * Lista e cria alertas para alunos (matrículas)
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
    const enrollmentId = searchParams.get('enrollmentId')

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 15)

    const where: { enrollmentId?: string; criadoEm?: { gte: Date } } = { criadoEm: { gte: cutoff } }
    if (enrollmentId) where.enrollmentId = enrollmentId

    const alerts = await prisma.studentAlert.findMany({
      where,
      include: {
        enrollment: {
          select: {
            id: true,
            nome: true,
            email: true,
            whatsapp: true,
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
      orderBy: { criadoEm: 'desc' },
    })

    return NextResponse.json({
      ok: true,
      data: {
        alerts: alerts.map((a) => ({
          id: a.id,
          enrollmentId: a.enrollmentId,
          enrollment: a.enrollment,
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
    console.error('[api/admin/student-alerts] Erro ao listar alertas:', error)
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
    const { enrollmentId, message, level } = body

    if (!enrollmentId || !message) {
      return NextResponse.json(
        { ok: false, message: 'enrollmentId e message são obrigatórios' },
        { status: 400 }
      )
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
    })

    if (!enrollment) {
      return NextResponse.json(
        { ok: false, message: 'Aluno/matrícula não encontrado' },
        { status: 404 }
      )
    }

    const createdById = auth.session?.sub ?? null

    const alert = await prisma.studentAlert.create({
      data: {
        enrollmentId,
        message: String(message).trim(),
        level: level || 'INFO',
        isActive: true,
        createdById,
      },
      include: {
        enrollment: {
          select: {
            id: true,
            nome: true,
            email: true,
            whatsapp: true,
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

    return NextResponse.json(
      {
        ok: true,
        data: {
          alert: {
            id: alert.id,
            enrollmentId: alert.enrollmentId,
            enrollment: alert.enrollment,
            message: alert.message,
            level: alert.level,
            isActive: alert.isActive,
            criadoEm: alert.criadoEm.toISOString(),
            createdBy: alert.createdBy ? { id: alert.createdBy.id, nome: alert.createdBy.nome, email: alert.createdBy.email } : null,
          },
        },
        message: 'Alerta criado com sucesso',
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[api/admin/student-alerts] Erro ao criar alerta:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao criar alerta' },
      { status: 500 }
    )
  }
}
