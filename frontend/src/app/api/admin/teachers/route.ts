/**
 * API Route: GET /api/admin/teachers
 * POST /api/admin/teachers
 * 
 * CRUD de professores
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { validateMeetingLink } from '@/lib/meeting-link'
import bcrypt from 'bcryptjs'

const SENHA_PADRAO_PROFESSOR = '123456'

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

    const searchParam = request.nextUrl.searchParams.get('search')?.trim() || ''
    const notaParam = request.nextUrl.searchParams.get('nota') // '1' | '2' | '45'
    const statusParam = request.nextUrl.searchParams.get('status') // 'ACTIVE' | 'INACTIVE' | etc.
    const limitParam = request.nextUrl.searchParams.get('limit')
    const limit = limitParam ? Math.max(1, Math.min(1000, parseInt(limitParam, 10) || 100)) : undefined
    
    const searchFilter = searchParam
      ? { nome: { contains: searchParam } }
      : {}
    let notaFilter: { nota: number } | { nota: { in: number[] } } | {} = {}
    if (notaParam === '1') notaFilter = { nota: 1 }
    else if (notaParam === '2') notaFilter = { nota: 2 }
    else if (notaParam === '45') notaFilter = { nota: { in: [4, 5] } }
    
    const statusFilter = statusParam && (statusParam === 'ACTIVE' || statusParam === 'INACTIVE' || statusParam === 'PENDING' || statusParam === 'BLOCKED')
      ? { status: statusParam as 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'BLOCKED' }
      : {}

    const teachers = await prisma.teacher.findMany({
      where: { ...searchFilter, ...notaFilter, ...statusFilter } as import('@prisma/client').Prisma.TeacherWhereInput,
      ...(limit ? { take: limit } : {}),
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
        availabilitySlots: {
          select: { dayOfWeek: true, startMinutes: true, endMinutes: true },
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

    // Próximos 7 dias: disponível (slots) vs com aulas
    const now = new Date()
    const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const periodEnd = new Date(periodStart)
    periodEnd.setDate(periodEnd.getDate() + 7)
    periodEnd.setMilliseconds(-1)

    const teacherIds = teachers.map((t) => t.id)
    const lessonsInPeriod = await prisma.lesson.findMany({
      where: {
        teacherId: { in: teacherIds },
        startAt: { gte: periodStart, lte: periodEnd },
        status: { not: 'CANCELLED' },
      },
      select: { teacherId: true, durationMinutes: true },
    })
    const lessonMinutesByTeacher = new Map<string, number>()
    for (const l of lessonsInPeriod) {
      if (!l.teacherId) continue
      const cur = lessonMinutesByTeacher.get(l.teacherId) ?? 0
      lessonMinutesByTeacher.set(l.teacherId, cur + (l.durationMinutes ?? 60))
    }

    return NextResponse.json({
      ok: true,
      data: {
        teachers: teachers.map((t) => {
          const slots = (t as { availabilitySlots?: { dayOfWeek: number; startMinutes: number; endMinutes: number }[] }).availabilitySlots ?? []
          const disponivelMinutos = slots.reduce((acc, s) => acc + (s.endMinutes - s.startMinutes), 0)
          const comAulasMinutos = lessonMinutesByTeacher.get(t.id) ?? 0
          const percentual = disponivelMinutos > 0 ? Math.round((comAulasMinutos / disponivelMinutos) * 100) : null
          return {
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
            idiomasFala: Array.isArray(t.idiomasFala) ? t.idiomasFala : (t.idiomasFala ? [t.idiomasFala] : []),
            idiomasEnsina: Array.isArray(t.idiomasEnsina) ? t.idiomasEnsina : (t.idiomasEnsina ? [t.idiomasEnsina] : []),
            linkSala: t.linkSala ?? null,
            attendancesCount: t._count.attendances,
            alertsCount: t._count.alerts,
            alerts: t.alerts.map((a) => ({ id: a.id, message: a.message, level: a.level })),
            criadoEm: t.criadoEm.toISOString(),
            atualizadoEm: t.atualizadoEm.toISOString(),
            horariosPreenchido: {
              disponivelMinutos,
              comAulasMinutos,
              percentual,
            },
          }
        }),
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
      senha,
      idiomasFala,
      idiomasEnsina,
      linkSala,
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

    if (linkSala !== undefined) {
      const linkValidation = validateMeetingLink(linkSala)
      if (!linkValidation.valid) {
        return NextResponse.json(
          { ok: false, message: linkValidation.error },
          { status: 400 }
        )
      }
    }

    const IDIOMAS_VALIDOS = ['INGLES', 'ESPANHOL', 'PORTUGUES', 'ITALIANO', 'FRANCES']
    const arrFala = Array.isArray(idiomasFala) ? idiomasFala.filter((x: string) => IDIOMAS_VALIDOS.includes(String(x).toUpperCase())) : []
    const arrEnsina = Array.isArray(idiomasEnsina) ? idiomasEnsina.filter((x: string) => IDIOMAS_VALIDOS.includes(String(x).toUpperCase())) : []

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
        idiomasFala: arrFala.length > 0 ? arrFala : undefined,
        idiomasEnsina: arrEnsina.length > 0 ? arrEnsina : undefined,
        linkSala: typeof linkSala === 'string' && linkSala.trim() ? linkSala.trim() : null,
      },
    })

    // Criar login (User) para o professor: senha padrão 123456 (obriga troca no 1º acesso) ou senha informada
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (!existingUser) {
      const useDefaultPassword = !senha || String(senha).trim().length < 6
      const passwordToUse = useDefaultPassword ? SENHA_PADRAO_PROFESSOR : String(senha).trim()
      const passwordHash = await bcrypt.hash(passwordToUse, 10)
      const user = await prisma.user.create({
        data: {
          nome: teacher.nome,
          email: teacher.email,
          whatsapp: teacher.whatsapp || '00000000000',
          senha: passwordHash,
          role: 'TEACHER',
          status: 'ACTIVE',
          mustChangePassword: useDefaultPassword,
        },
      })
      await prisma.teacher.update({
        where: { id: teacher.id },
        data: { userId: user.id },
      })
    }

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
          linkSala: teacher.linkSala ?? null,
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
