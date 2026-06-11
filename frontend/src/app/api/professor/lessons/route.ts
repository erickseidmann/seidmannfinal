/**
 * API Route: GET /api/professor/lessons
 * Lista aulas do professor logado no período (start/end).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'
import { teacherAbsentFlagsByLessonId } from '@/lib/lesson-attendance-summary'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireTeacher(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const teacher = await prisma.teacher.findFirst({
      where: { userId: auth.session.userId },
      select: { id: true },
    })

    if (!teacher) {
      return NextResponse.json(
        { ok: false, message: 'Professor não encontrado' },
        { status: 404 }
      )
    }

    const { searchParams } = new URL(request.url)
    const startParam = searchParams.get('start')
    const endParam = searchParams.get('end')

    if (!startParam || !endParam) {
      return NextResponse.json(
        { ok: false, message: 'Parâmetros start e end são obrigatórios' },
        { status: 400 }
      )
    }

    const startAt = new Date(startParam)
    const endAt = new Date(endParam)
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      return NextResponse.json(
        { ok: false, message: 'Datas inválidas' },
        { status: 400 }
      )
    }

    const lessonsRaw = await prisma.lesson.findMany({
      where: {
        teacherId: teacher.id,
        startAt: { gte: startAt, lte: endAt },
      },
      include: {
        enrollment: {
          select: {
            id: true,
            nome: true,
            frequenciaSemanal: true,
            tipoAula: true,
            nomeGrupo: true,
            curso: true,
            inactiveAt: true,
          },
        },
        teacher: { select: { id: true, nome: true } },
        record: { select: { id: true, criadoEm: true, atualizadoEm: true } },
        requests: {
          where: {
            status: { in: ['PENDING', 'TEACHER_APPROVED'] },
          },
          select: {
            id: true,
            type: true,
            status: true,
          },
        },
      },
      orderBy: { startAt: 'asc' },
    })

    // Para aulas em grupo, buscar nomes de todos os integrantes do grupo
    const groupNamesSeen = new Set<string>()
    for (const l of lessonsRaw) {
      const enr = l.enrollment
      if (enr?.tipoAula === 'GRUPO' && enr?.nomeGrupo?.trim()) {
        groupNamesSeen.add(enr.nomeGrupo.trim())
      }
    }
    const groupMembersMap = new Map<string, string[]>()
    if (groupNamesSeen.size > 0) {
      const enrollmentsInGroups = await prisma.enrollment.findMany({
        where: {
          tipoAula: 'GRUPO',
          nomeGrupo: { in: Array.from(groupNamesSeen) },
        },
        select: { nomeGrupo: true, nome: true },
      })
      for (const e of enrollmentsInGroups) {
        const key = (e.nomeGrupo || '').trim()
        if (!key) continue
        if (!groupMembersMap.has(key)) groupMembersMap.set(key, [])
        groupMembersMap.get(key)!.push(e.nome)
      }
    }

    const lessonIds = lessonsRaw.map((l) => l.id)
    const unlockRows =
      lessonIds.length > 0
        ? await prisma.lessonRecordUnlockRequest.findMany({
            where: { lessonId: { in: lessonIds }, teacherId: teacher.id },
            orderBy: { criadoEm: 'desc' },
            select: { id: true, lessonId: true, status: true, criadoEm: true, adminNotes: true },
          })
        : []
    const unlockByLessonId = new Map<string, (typeof unlockRows)[number]>()
    const approvedUnlockLessonIds = new Set<string>()
    for (const row of unlockRows) {
      if (!unlockByLessonId.has(row.lessonId)) unlockByLessonId.set(row.lessonId, row)
      if (row.status === 'APPROVED') approvedUnlockLessonIds.add(row.lessonId)
    }

    const attendanceRows =
      lessonIds.length > 0
        ? await prisma.lessonAttendance.findMany({
            where: { lessonId: { in: lessonIds } },
            select: {
              lessonId: true,
              role: true,
              joinedAt: true,
              leftAt: true,
              lastSeen: true,
              status: true,
            },
          })
        : []
    const teacherAbsentFlags = teacherAbsentFlagsByLessonId(
      lessonsRaw.map((l) => ({
        id: l.id,
        startAt: l.startAt,
        durationMinutes: l.durationMinutes ?? 60,
      })),
      attendanceRows,
      new Date(),
      'record-block'
    )

    const lessons = lessonsRaw.map((l) => {
      const enr = l.enrollment as { id: string; nome: string; tipoAula: string | null; nomeGrupo: string | null }
      const groupMemberNames = enr?.tipoAula === 'GRUPO' && enr?.nomeGrupo?.trim()
        ? (groupMembersMap.get(enr.nomeGrupo.trim()) || [])
        : undefined
      return {
        id: l.id,
        enrollmentId: l.enrollmentId,
        teacherId: l.teacherId,
        status: l.status,
        startAt: l.startAt.toISOString(),
        durationMinutes: l.durationMinutes ?? 60,
        notes: l.notes,
        createdByName: l.createdByName,
        enrollment: {
          ...enr,
          inactiveAt: (l.enrollment as { inactiveAt?: Date | null }).inactiveAt?.toISOString() ?? null,
          groupMemberNames,
        },
        teacher: l.teacher,
        record: l.record ? { id: l.record.id } : null,
        requests: (l.requests || []).map((r) => ({
          id: r.id,
          type: r.type,
          status: r.status,
        })),
        recordUnlockRequest: (() => {
          const u = unlockByLessonId.get(l.id)
          if (!u) return null
          return {
            id: u.id,
            status: u.status,
            criadoEm: u.criadoEm.toISOString(),
            adminNotes: u.adminNotes,
          }
        })(),
        teacherAbsentFromCall:
          (teacherAbsentFlags.get(l.id) ?? false) && !approvedUnlockLessonIds.has(l.id),
      }
    })

    return NextResponse.json({
      ok: true,
      data: { lessons },
    })
  } catch (error) {
    console.error('[api/professor/lessons GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar aulas' },
      { status: 500 }
    )
  }
}
