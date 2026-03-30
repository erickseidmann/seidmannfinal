/**
 * API Route: GET /api/admin/announcements
 * POST /api/admin/announcements
 * 
 * Lista e cria anúncios
 */

import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
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

    // Verificar se o model existe no Prisma Client
    if (!prisma.announcement) {
      console.error('[api/admin/announcements] Model Announcement não encontrado no Prisma Client. Execute: npx prisma generate')
      return NextResponse.json(
        { ok: false, message: 'Modelo Announcement não disponível. Execute: npx prisma generate' },
        { status: 503 }
      )
    }

    const announcements = await prisma.announcement.findMany({
      orderBy: {
        criadoEm: 'desc',
      },
      take: 100,
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
          createdByAdminEmail: a.createdByAdminEmail,
          sentAt: a.sentAt?.toISOString() || null,
          criadoEm: a.criadoEm.toISOString(),
          atualizadoEm: a.atualizadoEm.toISOString(),
        })),
      },
    })
  } catch (error) {
    console.error('[api/admin/announcements] Erro ao listar anúncios:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar anúncios' },
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
    const { title, message, channel, audience } = body

    // Validações
    if (!title || !message || !channel || !audience) {
      return NextResponse.json(
        { ok: false, message: 'Título, mensagem, canal e audiência são obrigatórios' },
        { status: 400 }
      )
    }

    if (!['EMAIL', 'SMS'].includes(channel)) {
      return NextResponse.json(
        { ok: false, message: 'Canal deve ser EMAIL ou SMS' },
        { status: 400 }
      )
    }

    // Verificar se o model existe no Prisma Client
    if (!prisma.announcement) {
      console.error('[api/admin/announcements] Model Announcement não encontrado no Prisma Client. Execute: npx prisma generate')
      return NextResponse.json(
        { ok: false, message: 'Modelo Announcement não disponível. Execute: npx prisma generate' },
        { status: 503 }
      )
    }

    const announcement = await prisma.$transaction(async (tx) => {
      const ann = await tx.announcement.create({
        data: {
          title: title.trim(),
          message: message.trim(),
          channel: channel,
          audience: String(audience).trim(),
          createdByAdminEmail: auth.session?.email || 'admin@seidmann.com',
          status: 'PENDING',
        },
      })

      // Notificar todos os professores: tem um novo anúncio (aparece no Início do professor)
      const teachers = await tx.teacher.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true },
      })
      if (teachers.length > 0) {
        await tx.teacherAlert.createMany({
          data: teachers.map((t) => ({
            teacherId: t.id,
            message: 'Tem um novo anúncio.',
            type: 'NEW_ANNOUNCEMENT',
            level: 'INFO',
            createdById: auth.session?.sub ?? null,
          })),
        })
      }
      return ann
    })

    return NextResponse.json({
      ok: true,
      data: {
        announcement: {
          id: announcement.id,
          title: announcement.title,
          message: announcement.message,
          channel: announcement.channel,
          audience: announcement.audience,
          status: announcement.status,
          criadoEm: announcement.criadoEm.toISOString(),
        },
        message: 'Anúncio criado com sucesso',
      },
    }, { status: 201 })
  } catch (error) {
    console.error('[api/admin/announcements] Erro ao criar anúncio:', error)
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2000') {
        return NextResponse.json(
          {
            ok: false,
            message:
              'Texto do anúncio ou título excede o limite do banco. Rode a migration mais recente (campo message como TEXT) ou encurte o texto.',
          },
          { status: 400 }
        )
      }
    }
    const msg =
      error instanceof Error && process.env.NODE_ENV === 'development'
        ? error.message
        : 'Erro ao criar anúncio'
    return NextResponse.json({ ok: false, message: msg }, { status: 500 })
  }
}
