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
    const limitParam = searchParams.get('limit')
    const limit = limitParam ? Math.max(1, Math.min(1000, parseInt(limitParam, 10) || 100)) : undefined

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

    // Verificar e atualizar automaticamente alunos pausados cuja data de ativação chegou
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    await prisma.enrollment.updateMany({
      where: {
        status: 'PAUSED',
        activationDate: { lte: hoje },
      },
      data: {
        status: 'ACTIVE',
        pausedAt: null,
        activationDate: null,
      },
    })

    // Buscar enrollments
    const enrollments = await prisma.enrollment.findMany({
      where: whereClause,
      ...(limit ? { take: limit } : {}),
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

    // Agenda (dias/horários) e todos os professores por matrícula: aulas a partir de hoje nas próximas 12 semanas
    const enrollmentIds = enrollments.map((e) => e.id)
    const agendaByEnrollment: Record<string, string> = {}
    const teacherNamesByEnrollment: Record<string, string> = {}
    const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
    if (prisma.lesson && enrollmentIds.length > 0) {
      try {
        const startFrom = new Date()
        startFrom.setHours(0, 0, 0, 0)
        const endAt = new Date(startFrom)
        endAt.setDate(endAt.getDate() + 7 * 12)
        const lessons = await prisma.lesson.findMany({
          where: {
            enrollmentId: { in: enrollmentIds },
            startAt: { gte: startFrom, lte: endAt },
            status: { not: 'CANCELLED' },
          },
          select: {
            enrollmentId: true,
            startAt: true,
            teacher: { select: { nome: true } },
          },
          orderBy: { startAt: 'asc' },
          take: 2000,
        })
        const agendaSlotsByEnrollment: Record<string, Set<string>> = {}
        const teachersSetByEnrollment: Record<string, Set<string>> = {}
        for (const l of lessons) {
          const eid = l.enrollmentId
          const d = new Date(l.startAt)
          const dayName = DAY_NAMES[d.getDay()]
          const slot = `${dayName} ${d.getHours().toString().padStart(2, '0')}h${d.getMinutes() ? d.getMinutes().toString().padStart(2, '0') : ''}`
          if (!agendaSlotsByEnrollment[eid]) agendaSlotsByEnrollment[eid] = new Set()
          agendaSlotsByEnrollment[eid].add(slot)
          const teacherName = (l as { teacher?: { nome: string } }).teacher?.nome
          if (teacherName) {
            if (!teachersSetByEnrollment[eid]) teachersSetByEnrollment[eid] = new Set()
            teachersSetByEnrollment[eid].add(teacherName)
          }
        }
        for (const eid of enrollmentIds) {
          const slots = agendaSlotsByEnrollment[eid]
          if (slots && slots.size > 0) {
            const sorted = [...slots].sort((a, b) => {
              const dayA = DAY_NAMES.indexOf(a.split(' ')[0])
              const dayB = DAY_NAMES.indexOf(b.split(' ')[0])
              if (dayA !== dayB) return dayA - dayB
              return a.localeCompare(b)
            })
            agendaByEnrollment[eid] = sorted.join(', ')
          }
          const names = teachersSetByEnrollment[eid]
          if (names && names.size > 0) {
            teacherNamesByEnrollment[eid] = [...names].sort().join(', ')
          }
        }
        // Replicar agenda e professores para integrantes do mesmo grupo (grupo compartilha a mesma agenda)
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
          const agendaVal = ids.map((id) => agendaByEnrollment[id]).find(Boolean)
          const teachersVal = ids.map((id) => teacherNamesByEnrollment[id]).find(Boolean)
          if (agendaVal || teachersVal) {
            for (const id of ids) {
              if (agendaVal) agendaByEnrollment[id] = agendaVal
              if (teachersVal) teacherNamesByEnrollment[id] = teachersVal
            }
          }
        }
      } catch (_) {
        // ignora erro
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
            teacherNameForWeek: teacherNamesByEnrollment[e.id] ?? null,
            agenda: agendaByEnrollment[e.id] ?? null,
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
            escolaMatricula: (e as any).escolaMatricula ?? null,
            escolaMatriculaOutro: (e as any).escolaMatriculaOutro ?? null,
            observacoes: (e as any).observacoes ?? null,
            activationDate: (e as any).activationDate?.toISOString?.() ?? null,
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
      escolaMatricula,
      escolaMatriculaOutro,
      observacoes,
      status,
      couponId,
    } = body

    if (!nome || !email || !whatsapp) {
      return NextResponse.json(
        { ok: false, message: 'Nome, email e WhatsApp são obrigatórios' },
        { status: 400 }
      )
    }

    const normalizedEmail = String(email).trim().toLowerCase()
    const outroAluno = await prisma.enrollment.findFirst({
      where: { email: normalizedEmail },
      select: { id: true },
    })
    if (outroAluno) {
      return NextResponse.json(
        { ok: false, message: 'Este e-mail já está vinculado a outro aluno. Um e-mail só pode estar conectado a um aluno.' },
        { status: 400 }
      )
    }
    const usuarioComEmail = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, role: true },
    })
    if (usuarioComEmail && usuarioComEmail.role !== 'STUDENT') {
      return NextResponse.json(
        { ok: false, message: 'Este e-mail já está em uso por outro usuário (admin ou professor).' },
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
        email: normalizedEmail,
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
        escolaMatricula:
          escolaMatricula === 'SEIDMANN' || escolaMatricula === 'YOUBECOME' || escolaMatricula === 'HIGHWAY' || escolaMatricula === 'OUTRO'
            ? escolaMatricula
            : null,
        escolaMatriculaOutro: escolaMatricula === 'OUTRO' ? (escolaMatriculaOutro?.trim() || null) : null,
        observacoes: observacoes?.trim() || null,
        pendenteAdicionarAulas: false,
        couponId: couponId && typeof couponId === 'string' ? couponId : null,
      },
    })

    // Criar ou vincular User para login do aluno (senha padrão 123456, obrigar alteração no 1º login)
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
