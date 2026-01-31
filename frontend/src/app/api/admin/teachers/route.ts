/**
 * API Route: GET /api/admin/teachers
 * POST /api/admin/teachers
 * 
 * CRUD de professores
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

    // Verificar se o model existe no Prisma Client
    if (!prisma.teacher) {
      console.error('[api/admin/teachers] Model Teacher não encontrado no Prisma Client. Execute: npx prisma generate')
      return NextResponse.json(
        { ok: false, message: 'Modelo Teacher não disponível. Execute: npx prisma generate' },
        { status: 503 }
      )
    }

    const teachers = await prisma.teacher.findMany({
      include: {
        user: {
          select: {
            id: true,
            nome: true,
            email: true,
          },
        },
        alerts: {
          select: { id: true, message: true, level: true },
          orderBy: { criadoEm: 'desc' },
        },
        _count: {
          select: {
            attendances: true,
            alerts: true,
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
        teachers: teachers.map((t) => ({
          id: t.id,
          nome: t.nome,
          nomePreferido: t.nomePreferido,
          email: t.email,
          whatsapp: t.whatsapp,
          cpf: t.cpf,
          cnpj: t.cnpj,
          valorPorHora: t.valorPorHora != null ? Number(t.valorPorHora) : null,
          metodoPagamento: t.metodoPagamento,
          infosPagamento: t.infosPagamento,
          nota: t.nota,
          status: t.status,
          userId: t.userId,
          user: t.user,
          attendancesCount: t._count.attendances,
          alertsCount: t._count.alerts,
          alerts: t.alerts.map((a) => ({ id: a.id, message: a.message, level: a.level })),
          criadoEm: t.criadoEm.toISOString(),
          atualizadoEm: t.atualizadoEm.toISOString(),
        })),
      },
    })
  } catch (error) {
    console.error('[api/admin/teachers] Erro ao listar professores:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar professores' },
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
    const {
      nome,
      email,
      whatsapp,
      status,
      nomePreferido,
      valorPorHora,
      metodoPagamento,
      infosPagamento,
      cpf,
      cnpj,
      nota,
    } = body

    if (!nome || !email) {
      return NextResponse.json(
        { ok: false, message: 'Nome e email são obrigatórios' },
        { status: 400 }
      )
    }

    const normalizedEmail = email.trim().toLowerCase()

    if (metodoPagamento && !['PIX', 'CARTAO', 'OUTRO'].includes(metodoPagamento)) {
      return NextResponse.json(
        { ok: false, message: 'Método de pagamento inválido' },
        { status: 400 }
      )
    }

    const existing = await prisma.teacher.findUnique({
      where: { email: normalizedEmail },
    })

    if (existing) {
      return NextResponse.json(
        { ok: false, message: 'Email já cadastrado' },
        { status: 409 }
      )
    }

    const teacher = await prisma.teacher.create({
      data: {
        nome: nome.trim(),
        nomePreferido: nomePreferido?.trim() || null,
        email: normalizedEmail,
        whatsapp: whatsapp?.trim() || null,
        cpf: cpf?.trim() || null,
        cnpj: cnpj?.trim() || null,
        valorPorHora: valorPorHora != null && valorPorHora !== '' ? Number(valorPorHora) : null,
        metodoPagamento: metodoPagamento || null,
        infosPagamento: infosPagamento?.trim() || null,
        nota: nota != null && nota !== '' ? Math.min(5, Math.max(1, Number(nota))) : null,
        status: status || 'ACTIVE',
      },
    })

    return NextResponse.json({
      ok: true,
      data: {
        teacher: {
          id: teacher.id,
          nome: teacher.nome,
          nomePreferido: teacher.nomePreferido,
          email: teacher.email,
          whatsapp: teacher.whatsapp,
          cpf: teacher.cpf,
          cnpj: teacher.cnpj,
          valorPorHora: teacher.valorPorHora != null ? Number(teacher.valorPorHora) : null,
          metodoPagamento: teacher.metodoPagamento,
          infosPagamento: teacher.infosPagamento,
          nota: teacher.nota,
          status: teacher.status,
          criadoEm: teacher.criadoEm.toISOString(),
        },
      },
    }, { status: 201 })
  } catch (error) {
    console.error('[api/admin/teachers] Erro ao criar professor:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao criar professor' },
      { status: 500 }
    )
  }
}
