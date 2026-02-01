/**
 * API Route: GET /api/professor/lessons
 * Lista aulas do professor logado no período (start/end).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'

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
          },
        },
        teacher: { select: { id: true, nome: true } },
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

    const lessons = lessonsRaw.map((l) => {
      const enr = l.enrollment as { id: string; nome: string; tipoAula: string | null; nomeGrupo: string | null }
      const groupMemberNames = enr?.tipoAula === 'GRUPO' && enr?.nomeGrupo?.trim()
        ? (groupMembersMap.get(enr.nomeGrupo.trim()) || [])
        : undefined
      return {
        ...l,
        enrollment: {
          ...enr,
          groupMemberNames,
        },
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
