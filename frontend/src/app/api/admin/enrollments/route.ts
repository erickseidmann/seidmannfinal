/**
 * API Route: GET /api/admin/enrollments
 * 
 * Lista enrollments com filtros por status e busca.
 * Requer autenticação admin via header Authorization: Bearer <ADMIN_TOKEN>
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import bcrypt from 'bcryptjs'

const SENHA_PADRAO_ALUNO = '123456'

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function getSaturdayEnd(monday: Date): Date {
  const sat = new Date(monday)
  sat.setDate(sat.getDate() + 5)
  sat.setHours(23, 59, 59, 999)
  return sat
}

export async function GET(request: NextRequest) {
  try {
    // Verificar autenticação admin (sessão + role)
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        {
          ok: false,
          message: auth.message || 'Não autorizado',
        },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const statusParam = searchParams.get('status') // Pode ser null (todos)
    const searchParam = searchParams.get('search')?.trim() || ''
    const weekStartParam = searchParams.get('weekStart') // Opcional: segunda-feira ISO para professor da semana

    // Construir filtro de status
    const statusFilter: any = statusParam
      ? { status: statusParam }
      : {} // Se não especificado, busca todos

    // Construir filtro de busca (nome, email, whatsapp)
    // MySQL não suporta mode: 'insensitive', mas aceita contains (case-sensitive)
    // Para case-insensitive, usar lower() no banco ou normalizar no código
    const searchFilter: any = searchParam
      ? {
          OR: [
            { nome: { contains: searchParam } },
            { email: { contains: searchParam } },
            { whatsapp: { contains: searchParam } },
          ],
        }
      : {}

    // Combinar filtros
    const whereClause: any = {
      ...statusFilter,
      ...searchFilter,
    }

    // Buscar enrollments
    const enrollments = await prisma.enrollment.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            nome: true,
            email: true,
            whatsapp: true,
          },
        },
        paymentInfo: true,
        alerts: {
          select: { id: true, message: true, level: true },
          orderBy: { criadoEm: 'desc' },
        },
        _count: {
          select: { alerts: true },
        },
      },
      orderBy: {
        criadoEm: 'desc',
      },
    })

    // Professor da semana: se weekStart informado, buscar aulas da semana (seg–sáb) e mapear enrollmentId -> nome do professor
    let teacherNameByEnrollment: Record<string, string> = {}
    if (weekStartParam && prisma.lesson) {
      try {
        const monday = getMonday(new Date(weekStartParam))
        const saturdayEnd = getSaturdayEnd(monday)
        const lessons = await prisma.lesson.findMany({
          where: {
            startAt: { gte: monday, lte: saturdayEnd },
          },
          select: {
            enrollmentId: true,
            startAt: true,
            teacher: { select: { nome: true } },
          },
          orderBy: { startAt: 'asc' },
        })
        for (const l of lessons) {
          const teacherName = (l as { teacher?: { nome: string } }).teacher?.nome
          if (!teacherNameByEnrollment[l.enrollmentId] && teacherName) {
            teacherNameByEnrollment[l.enrollmentId] = teacherName
          }
        }
        // Replicar professor para todos os integrantes do mesmo grupo (quem tem aula na semana repassa o professor para o grupo)
        const groupByNomeGrupo: Record<string, string[]> = {}
        for (const e of enrollments) {
          const tipoAula = (e as any).tipoAula
          const nomeGrupo = (e as any).nomeGrupo?.trim()
          if (tipoAula === 'GRUPO' && nomeGrupo) {
            if (!groupByNomeGrupo[nomeGrupo]) groupByNomeGrupo[nomeGrupo] = []
            groupByNomeGrupo[nomeGrupo].push(e.id)
          }
        }
        for (const ids of Object.values(groupByNomeGrupo)) {
          const teacherName = ids.map((id) => teacherNameByEnrollment[id]).find(Boolean)
          if (teacherName) {
            for (const id of ids) {
              teacherNameByEnrollment[id] = teacherName
            }
          }
        }
      } catch (_) {
        // ignora erro de semana inválida
      }
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          enrollments: enrollments.map((e) => ({
            id: e.id,
            nome: e.nome,
            email: e.email,
            whatsapp: e.whatsapp,
            idioma: e.idioma,
            nivel: e.nivel,
            objetivo: e.objetivo,
            disponibilidade: e.disponibilidade,
            status: e.status,
            trackingCode: e.trackingCode,
            contractAcceptedAt: e.contractAcceptedAt?.toISOString(),
            contractVersion: e.contractVersion,
            criadoEm: e.criadoEm.toISOString(),
            atualizadoEm: e.atualizadoEm.toISOString(),
            user: e.user,
            dataNascimento: (e as any).dataNascimento?.toISOString?.() ?? null,
            nomeResponsavel: (e as any).nomeResponsavel ?? null,
            cpf: (e as any).cpf ?? null,
            cpfResponsavel: (e as any).cpfResponsavel ?? null,
            curso: (e as any).curso ?? null,
            frequenciaSemanal: (e as any).frequenciaSemanal ?? null,
            tempoAulaMinutos: (e as any).tempoAulaMinutos ?? null,
            tipoAula: (e as any).tipoAula ?? null,
            nomeGrupo: (e as any).nomeGrupo ?? null,
            teacherNameForWeek: teacherNameByEnrollment[e.id] ?? null,
            cep: (e as any).cep ?? null,
            rua: (e as any).rua ?? null,
            cidade: (e as any).cidade ?? null,
            estado: (e as any).estado ?? null,
            numero: (e as any).numero ?? null,
            complemento: (e as any).complemento ?? null,
            moraNoExterior: (e as any).moraNoExterior ?? false,
            enderecoExterior: (e as any).enderecoExterior ?? null,
            valorMensalidade: (e as any).valorMensalidade != null ? String((e as any).valorMensalidade) : null,
            metodoPagamento: (e as any).metodoPagamento ?? null,
            diaPagamento: (e as any).diaPagamento ?? null,
            melhoresHorarios: (e as any).melhoresHorarios ?? null,
            melhoresDiasSemana: (e as any).melhoresDiasSemana ?? null,
            nomeVendedor: (e as any).nomeVendedor ?? null,
            nomeEmpresaOuIndicador: (e as any).nomeEmpresaOuIndicador ?? null,
            observacoes: (e as any).observacoes ?? null,
            alertsCount: (e as any)._count?.alerts ?? 0,
            alerts: Array.isArray((e as any).alerts) ? (e as any).alerts.map((a: { id: string; message: string; level: string | null }) => ({ id: a.id, message: a.message, level: a.level })) : [],
            paymentInfo: e.paymentInfo ? {
              id: e.paymentInfo.id,
              plan: e.paymentInfo.plan,
              valorMensal: e.paymentInfo.valorMensal?.toString(),
              monthlyValue: e.paymentInfo.monthlyValue?.toString(),
              metodo: e.paymentInfo.metodo,
              dueDay: e.paymentInfo.dueDay,
              paymentStatus: e.paymentInfo.paymentStatus,
              reminderEnabled: e.paymentInfo.reminderEnabled,
              paidAt: e.paymentInfo.paidAt?.toISOString(),
              transactionRef: e.paymentInfo.transactionRef,
            } : null,
          })),
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[api/admin/enrollments] Erro ao listar enrollments:', error)
    return NextResponse.json(
      {
        ok: false,
        message: 'Erro ao listar enrollments'
      },
      { status: 500 }
    )
  }
}

function generateTrackingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'MAT-'
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
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
      dataNascimento,
      nomeResponsavel,
      cpf,
      cpfResponsavel,
      curso,
      frequenciaSemanal,
      tempoAulaMinutos,
      tipoAula,
      nomeGrupo,
      cep,
      rua,
      cidade,
      estado,
      numero,
      complemento,
      moraNoExterior,
      enderecoExterior,
      valorMensalidade,
      metodoPagamento,
      diaPagamento,
      melhoresHorarios,
      melhoresDiasSemana,
      nomeVendedor,
      nomeEmpresaOuIndicador,
      observacoes,
      status,
    } = body

    if (!nome || !email || !whatsapp) {
      return NextResponse.json(
        { ok: false, message: 'Nome, email e WhatsApp são obrigatórios' },
        { status: 400 }
      )
    }

    let trackingCode = generateTrackingCode()
    let attempts = 0
    while (attempts < 10) {
      const existing = await prisma.enrollment.findUnique({ where: { trackingCode } })
      if (!existing) break
      trackingCode = generateTrackingCode()
      attempts++
    }

    const enrollment = await prisma.enrollment.create({
      data: {
        nome: String(nome).trim(),
        email: String(email).trim().toLowerCase(),
        whatsapp: String(whatsapp).trim(),
        status: status || 'LEAD',
        trackingCode,
        dataNascimento: dataNascimento ? new Date(dataNascimento) : null,
        nomeResponsavel: nomeResponsavel?.trim() || null,
        cpf: cpf?.trim()?.replace(/\D/g, '').slice(0, 14) || null,
        cpfResponsavel: cpfResponsavel?.trim()?.replace(/\D/g, '').slice(0, 14) || null,
        curso: curso || null,
        frequenciaSemanal:
          frequenciaSemanal != null && frequenciaSemanal !== ''
            ? Math.min(7, Math.max(1, Number(frequenciaSemanal)))
            : null,
        tempoAulaMinutos:
          tempoAulaMinutos != null && tempoAulaMinutos !== ''
            ? [30, 40, 60, 120].includes(Number(tempoAulaMinutos))
              ? Number(tempoAulaMinutos)
              : null
            : null,
        tipoAula: tipoAula === 'PARTICULAR' || tipoAula === 'GRUPO' ? tipoAula : null,
        nomeGrupo: nomeGrupo?.trim() || null,
        cep: cep?.trim()?.replace(/\D/g, '').slice(0, 9) || null,
        rua: rua?.trim() || null,
        cidade: cidade?.trim() || null,
        estado: estado?.trim()?.slice(0, 2) || null,
        numero: numero?.trim() || null,
        complemento: complemento?.trim() || null,
        moraNoExterior: Boolean(moraNoExterior),
        enderecoExterior: enderecoExterior?.trim() || null,
        valorMensalidade:
          valorMensalidade != null && valorMensalidade !== ''
            ? Number(String(valorMensalidade).replace(',', '.'))
            : null,
        metodoPagamento: metodoPagamento?.trim() || null,
        diaPagamento:
          diaPagamento != null && diaPagamento !== ''
            ? Math.min(31, Math.max(1, Number(diaPagamento)))
            : null,
        melhoresHorarios: melhoresHorarios?.trim() || null,
        melhoresDiasSemana: melhoresDiasSemana?.trim() || null,
        nomeVendedor: nomeVendedor?.trim() || null,
        nomeEmpresaOuIndicador: nomeEmpresaOuIndicador?.trim() || null,
        observacoes: observacoes?.trim() || null,
      },
    })

    // Criar ou vincular User para login do aluno (senha padrão 123456, obrigar alteração no 1º login)
    const normalizedEmail = enrollment.email.trim().toLowerCase()
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, role: true },
    })
    if (existingUser && existingUser.role === 'STUDENT') {
      await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { userId: existingUser.id },
      })
    } else if (!existingUser) {
      const passwordHash = await bcrypt.hash(SENHA_PADRAO_ALUNO, 10)
      const user = await prisma.user.create({
        data: {
          nome: enrollment.nome,
          email: normalizedEmail,
          whatsapp: enrollment.whatsapp,
          senha: passwordHash,
          role: 'STUDENT',
          status: 'ACTIVE',
          mustChangePassword: true,
        },
      })
      await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { userId: user.id },
      })
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          enrollment: {
            id: enrollment.id,
            nome: enrollment.nome,
            email: enrollment.email,
            whatsapp: enrollment.whatsapp,
            status: enrollment.status,
            trackingCode: enrollment.trackingCode,
            criadoEm: enrollment.criadoEm.toISOString(),
          },
        },
        message: 'Aluno adicionado com sucesso',
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[api/admin/enrollments] Erro ao criar aluno:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao adicionar aluno' },
      { status: 500 }
    )
  }
}
