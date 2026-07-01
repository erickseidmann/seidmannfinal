/**
 * API Route: GET /api/admin/teachers
 * POST /api/admin/teachers
 * 
 * CRUD de professores
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { LESSON_STATUSES_SCHEDULED } from '@/lib/lesson-status'
import { validateMeetingLink } from '@/lib/meeting-link'
import bcrypt from 'bcryptjs'
import {
  mapIdiomasToBookLanguages,
  releaseBooksToTeacherForLanguages,
} from '@/lib/teacher-book-releases'
import { DEFAULT_TEACHER_PAYMENT_DUE_DAY } from '@/lib/finance/teacher-nf-window'
import { managementTeacherAlertWhere } from '@/lib/teacher-alert-kinds'
import { auditFieldsForCreate, resolveAdminActor, resolveAuditNames } from '@/lib/record-audit'
import { sanitizeTeacherNiveisEnsina, normalizeTeacherNiveisEnsina } from '@/lib/teacher-teaching-levels'
import { assignTeacherLinkSalaFromInactivePool } from '@/lib/teacher-link-sala-pool'

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
    const semLinkSalaParam = request.nextUrl.searchParams.get('semLinkSala')
    const limitParam = request.nextUrl.searchParams.get('limit')
    const limit = limitParam ? Math.max(1, Math.min(1000, parseInt(limitParam, 10) || 100)) : undefined
    
    const searchFilter = (() => {
      if (!searchParam) return {}
      const digits = searchParam.replace(/\D/g, '')
      const or: import('@prisma/client').Prisma.TeacherWhereInput[] = [
        { nome: { contains: searchParam } },
        { email: { contains: searchParam } },
        { whatsapp: { contains: searchParam } },
      ]
      if (digits.length >= 3) {
        or.push({ whatsapp: { contains: digits } })
      }
      return { OR: or }
    })()
    let notaFilter: { nota: number } | { nota: { in: number[] } } | {} = {}
    if (notaParam === '1') notaFilter = { nota: 1 }
    else if (notaParam === '2') notaFilter = { nota: 2 }
    else if (notaParam === '45') notaFilter = { nota: { in: [4, 5] } }
    
    const statusFilter =
      statusParam &&
      (statusParam === 'ACTIVE' ||
        statusParam === 'INACTIVE' ||
        statusParam === 'PENDING' ||
        statusParam === 'BLOCKED')
        ? { status: statusParam as 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'BLOCKED' }
        : { status: { not: 'INACTIVE' as const } }

    const semLinkSalaFilter =
      semLinkSalaParam === 'true' || semLinkSalaParam === '1'
        ? { OR: [{ linkSala: null }, { linkSala: '' }] }
        : {}

    const teachers = await prisma.teacher.findMany({
      where: { ...searchFilter, ...notaFilter, ...statusFilter, ...semLinkSalaFilter } as import('@prisma/client').Prisma.TeacherWhereInput,
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
          where: managementTeacherAlertWhere(),
          select: { id: true, message: true, level: true },
          orderBy: { criadoEm: 'desc' },
        },
        availabilitySlots: {
          select: { dayOfWeek: true, startMinutes: true, endMinutes: true },
        },
        _count: {
          select: {
            attendances: true,
            alerts: { where: managementTeacherAlertWhere() },
          },
        },
        createdBy: { select: { nome: true } },
        updatedBy: { select: { nome: true } },
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
        status: { in: [...LESSON_STATUSES_SCHEDULED] },
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
            inactiveAt: (t as { inactiveAt?: Date | null }).inactiveAt?.toISOString() ?? null,
            userId: t.userId,
            user: t.user,
            idiomasFala: Array.isArray(t.idiomasFala) ? t.idiomasFala : (t.idiomasFala ? [t.idiomasFala] : []),
            idiomasEnsina: Array.isArray(t.idiomasEnsina) ? t.idiomasEnsina : (t.idiomasEnsina ? [t.idiomasEnsina] : []),
            niveisEnsina: normalizeTeacherNiveisEnsina((t as { niveisEnsina?: unknown }).niveisEnsina),
            linkSala: t.linkSala ?? null,
            attendancesCount: t._count.attendances,
            alertsCount: t._count.alerts,
            alerts: t.alerts.map((a) => ({ id: a.id, message: a.message, level: a.level })),
            criadoEm: t.criadoEm.toISOString(),
            atualizadoEm: t.atualizadoEm.toISOString(),
            ...resolveAuditNames({
              createdByName: (t as { createdByName?: string | null }).createdByName,
              updatedByName: (t as { updatedByName?: string | null }).updatedByName,
              createdBy: (t as { createdBy?: { nome: string } | null }).createdBy,
              updatedBy: (t as { updatedBy?: { nome: string } | null }).updatedBy,
            }),
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
      niveisEnsina,
      linkSala,
      paymentDueDay,
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
    const arrNiveis = sanitizeTeacherNiveisEnsina(niveisEnsina)

    let dueDayToUse: number = DEFAULT_TEACHER_PAYMENT_DUE_DAY
    if (paymentDueDay !== undefined && paymentDueDay !== null && paymentDueDay !== '') {
      const n = Number(paymentDueDay)
      if (Number.isInteger(n) && n >= 1 && n <= 31) {
        dueDayToUse = n
      } else {
        return NextResponse.json(
          { ok: false, message: 'paymentDueDay deve ser um inteiro entre 1 e 31' },
          { status: 400 }
        )
      }
    }

    const adminActor = await resolveAdminActor(auth.session?.sub, auth.session?.email)

    const teacherStatus = status || 'ACTIVE'
    const manualLinkSala = typeof linkSala === 'string' && linkSala.trim() ? linkSala.trim() : null

    let teacher = await prisma.teacher.create({
      data: {
        ...auditFieldsForCreate(adminActor),
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
        status: teacherStatus,
        idiomasFala: arrFala.length > 0 ? arrFala : undefined,
        idiomasEnsina: arrEnsina.length > 0 ? arrEnsina : undefined,
        niveisEnsina: arrNiveis.length > 0 ? arrNiveis : undefined,
        linkSala: manualLinkSala,
        paymentDueDay: dueDayToUse,
      },
    })

    if (!manualLinkSala && teacherStatus !== 'INACTIVE') {
      await assignTeacherLinkSalaFromInactivePool(teacher.id)
      teacher = await prisma.teacher.findUniqueOrThrow({ where: { id: teacher.id } })
    }

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

      // Auto-libera livros do catálogo conforme os idiomas que o professor ensina (INGLES → ENGLISH, etc.)
      try {
        const langs = mapIdiomasToBookLanguages(arrEnsina)
        if (langs.length > 0) {
          await releaseBooksToTeacherForLanguages({
            teacherUserId: user.id,
            languages: langs,
            adminEmail: auth.session?.email || 'admin@seidmann',
          })
        }
      } catch (autoErr) {
        console.error('[api/admin/teachers POST] Falha ao auto-liberar livros ao novo professor:', autoErr)
      }
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
          paymentDueDay: teacher.paymentDueDay ?? null,
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
