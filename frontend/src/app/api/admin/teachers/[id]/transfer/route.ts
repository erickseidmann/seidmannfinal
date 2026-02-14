/**
 * POST /api/admin/teachers/[id]/transfer
 * Transfere todas as aulas do professor origem para o professor destino.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

function formatarDataHoraSimples(d: Date): string {
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function adicionarObservacaoTransferencia(notesAtuais: string | null, nomeAdmin: string, nomeProfessorOrigem: string, nomeProfessorDestino: string, dataHora: Date): string {
  const novaObs = `Aula transferida do professor ${nomeProfessorOrigem} para o professor ${nomeProfessorDestino} pelo ${nomeAdmin} às ${formatarDataHoraSimples(dataHora)}`
  if (notesAtuais && notesAtuais.trim()) {
    return `${notesAtuais}\n${novaObs}`
  }
  return novaObs
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    // Buscar nome do admin logado
    let nomeAdmin = 'admin'
    if (auth.session?.sub) {
      try {
        const adminUser = await prisma.user.findUnique({
          where: { id: auth.session.sub },
          select: { nome: true },
        })
        if (adminUser?.nome) {
          nomeAdmin = adminUser.nome
        }
      } catch (err) {
        console.error('[api/admin/teachers/[id]/transfer POST] Erro ao buscar nome do admin:', err)
      }
    }

    const { id: sourceTeacherId } = await params
    const body = await request.json()
    const { targetTeacherId, startDate: startDateParam } = body

    if (!targetTeacherId || typeof targetTeacherId !== 'string') {
      return NextResponse.json(
        { ok: false, message: 'targetTeacherId é obrigatório' },
        { status: 400 }
      )
    }

    // Data de início para filtrar aulas (padrão: hoje)
    let startDate = new Date()
    startDate.setHours(0, 0, 0, 0)
    if (startDateParam && typeof startDateParam === 'string') {
      const parsedDate = new Date(startDateParam)
      if (!Number.isNaN(parsedDate.getTime())) {
        parsedDate.setHours(0, 0, 0, 0)
        startDate = parsedDate
      }
    }

    // Verificar se professores existem
    const sourceTeacher = await prisma.teacher.findUnique({
      where: { id: sourceTeacherId },
      select: { id: true, nome: true },
    })

    const targetTeacher = await prisma.teacher.findUnique({
      where: { id: targetTeacherId },
      select: { id: true, nome: true },
    })

    if (!sourceTeacher) {
      return NextResponse.json(
        { ok: false, message: 'Professor origem não encontrado' },
        { status: 404 }
      )
    }

    if (!targetTeacher) {
      return NextResponse.json(
        { ok: false, message: 'Professor destino não encontrado' },
        { status: 404 }
      )
    }

    if (sourceTeacherId === targetTeacherId) {
      return NextResponse.json(
        { ok: false, message: 'Não é possível transferir para o mesmo professor' },
        { status: 400 }
      )
    }

    // Buscar TODAS as aulas do professor origem (incluindo canceladas, reposições, confirmadas, etc.) a partir da data selecionada
    const lessons = await prisma.lesson.findMany({
      where: {
        teacherId: sourceTeacherId,
        startAt: { gte: startDate },
      },
      select: {
        id: true,
        notes: true,
        startAt: true,
        durationMinutes: true,
        status: true,
      },
      orderBy: { startAt: 'asc' },
    })

    if (lessons.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'Nenhuma aula para transferir',
        data: { transferred: 0 },
      })
    }

    // Verificar se o professor destino tem disponibilidade para todas as aulas
    const targetSlots = await prisma.teacherAvailabilitySlot.findMany({
      where: { teacherId: targetTeacherId },
      select: { dayOfWeek: true, startMinutes: true, endMinutes: true },
    })

    // Verificar conflitos com aulas existentes do professor destino (apenas a partir da data de início)
    const existingLessons = await prisma.lesson.findMany({
      where: {
        teacherId: targetTeacherId,
        status: { not: 'CANCELLED' },
        startAt: { gte: startDate },
      },
      select: {
        startAt: true,
        durationMinutes: true,
      },
    })

    // Verificar cada aula antes de transferir
    // Apenas aulas não canceladas precisam verificar disponibilidade e conflitos
    for (const lesson of lessons) {
      // Pular verificação para aulas canceladas (elas não ocupam horário)
      if (lesson.status === 'CANCELLED') {
        continue
      }

      const start = new Date(lesson.startAt)
      const dayOfWeek = start.getDay()
      const startMinutes = start.getHours() * 60 + start.getMinutes()
      const endMinutes = startMinutes + (lesson.durationMinutes || 60)

      // Se o professor destino tem slots cadastrados, verificar se o horário está disponível
      if (targetSlots.length > 0) {
        const slotCovers = targetSlots.some(
          (slot) =>
            slot.dayOfWeek === dayOfWeek &&
            startMinutes >= slot.startMinutes &&
            endMinutes <= slot.endMinutes
        )
        if (!slotCovers) {
          return NextResponse.json(
            { ok: false, message: `O professor destino não tem disponibilidade para todas as aulas. Aula do dia ${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][dayOfWeek]} às ${Math.floor(startMinutes / 60).toString().padStart(2, '0')}:${(startMinutes % 60).toString().padStart(2, '0')} não está disponível.` },
            { status: 400 }
          )
        }
      }

      // Verificar conflitos com aulas existentes
      const hasConflict = existingLessons.some((l) => {
        const lessonStart = new Date(l.startAt)
        const lessonEnd = new Date(lessonStart.getTime() + (l.durationMinutes || 60) * 60 * 1000)
        const lessonDayOfWeek = lessonStart.getDay()
        if (lessonDayOfWeek !== dayOfWeek) return false
        const lessonStartMinutes = lessonStart.getHours() * 60 + lessonStart.getMinutes()
        const lessonEndMinutes = lessonStartMinutes + (l.durationMinutes || 60)
        return startMinutes < lessonEndMinutes && endMinutes > lessonStartMinutes
      })

      if (hasConflict) {
        return NextResponse.json(
          { ok: false, message: `O professor destino já tem uma aula no mesmo horário. Aula do dia ${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][dayOfWeek]} às ${Math.floor(startMinutes / 60).toString().padStart(2, '0')}:${(startMinutes % 60).toString().padStart(2, '0')} conflita com uma aula existente.` },
          { status: 400 }
        )
      }
    }

    // Transferir todas as aulas
    const agora = new Date()
    let transferred = 0

    for (const lesson of lessons) {
      const notesAtuais = lesson.notes
      const novaObservacao = adicionarObservacaoTransferencia(
        notesAtuais,
        nomeAdmin,
        sourceTeacher.nome,
        targetTeacher.nome,
        agora
      )

      await prisma.lesson.update({
        where: { id: lesson.id },
        data: {
          teacherId: targetTeacherId,
          notes: novaObservacao,
        },
      })

      transferred++
    }

    return NextResponse.json({
      ok: true,
      message: `${transferred} aula(s) transferida(s) com sucesso`,
      data: { transferred },
    })
  } catch (error) {
    console.error('[api/admin/teachers/[id]/transfer POST]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao transferir aulas' },
      { status: 500 }
    )
  }
}
