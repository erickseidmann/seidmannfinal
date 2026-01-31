/**
 * API: GET /api/admin/lesson-records/[id]
 *      PATCH /api/admin/lesson-records/[id]
 *      DELETE /api/admin/lesson-records/[id]
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function GET(
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

    const { id } = await params
    const record = await (prisma as any).lessonRecord.findUnique({
      where: { id },
      include: {
        studentPresences: { include: { enrollment: { select: { id: true, nome: true } } } },
        lesson: {
          include: {
            enrollment: { select: { id: true, nome: true, tipoAula: true, nomeGrupo: true } },
            teacher: { select: { id: true, nome: true } },
          },
        },
      },
    })

    if (!record) {
      return NextResponse.json(
        { ok: false, message: 'Registro não encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json({ ok: true, data: { record } })
  } catch (error) {
    console.error('[api/admin/lesson-records/[id] GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao buscar registro' },
      { status: 500 }
    )
  }
}

export async function PATCH(
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

    const { id } = await params
    const body = await request.json()
    const {
      status: statusBody,
      presence,
      studentsPresence,
      lessonType,
      curso,
      tempoAulaMinutos,
      book,
      lastPage,
      assignedHomework,
      homeworkDone,
      conversationDescription,
      notes,
      notesForStudent,
      notesForParents,
      gradeGrammar,
      gradeSpeaking,
      gradeListening,
      gradeUnderstanding,
    } = body

    const updateData: Record<string, unknown> = {}
    if (statusBody != null && ['CONFIRMED', 'CANCELLED', 'REPOSICAO'].includes(statusBody)) updateData.status = statusBody
    if (presence != null && ['PRESENTE', 'NAO_COMPARECEU', 'ATRASADO'].includes(presence)) updateData.presence = presence
    if (lessonType != null && ['NORMAL', 'CONVERSAÇÃO', 'REVISAO', 'AVALIACAO'].includes(lessonType)) updateData.lessonType = lessonType
    if (curso !== undefined) updateData.curso = ['INGLES', 'ESPANHOL', 'INGLES_E_ESPANHOL'].includes(curso) ? curso : null
    if (tempoAulaMinutos !== undefined) updateData.tempoAulaMinutos = tempoAulaMinutos === '' || tempoAulaMinutos == null ? null : Number(tempoAulaMinutos)
    if (book !== undefined) updateData.book = book?.trim() || null
    if (lastPage !== undefined) updateData.lastPage = lastPage?.trim() || null
    if (assignedHomework !== undefined) updateData.assignedHomework = assignedHomework?.trim() || null
    if (homeworkDone !== undefined) updateData.homeworkDone = ['SIM', 'NAO', 'PARCIAL', 'NAO_APLICA'].includes(homeworkDone) ? homeworkDone : null
    if (conversationDescription !== undefined) updateData.conversationDescription = conversationDescription?.trim() || null
    if (notes !== undefined) updateData.notes = notes?.trim() || null
    if (notesForStudent !== undefined) updateData.notesForStudent = notesForStudent?.trim() || null
    if (notesForParents !== undefined) updateData.notesForParents = notesForParents?.trim() || null
    if (gradeGrammar !== undefined) updateData.gradeGrammar = gradeGrammar === '' || gradeGrammar == null ? null : Number(gradeGrammar)
    if (gradeSpeaking !== undefined) updateData.gradeSpeaking = gradeSpeaking === '' || gradeSpeaking == null ? null : Number(gradeSpeaking)
    if (gradeListening !== undefined) updateData.gradeListening = gradeListening === '' || gradeListening == null ? null : Number(gradeListening)
    if (gradeUnderstanding !== undefined) updateData.gradeUnderstanding = gradeUnderstanding === '' || gradeUnderstanding == null ? null : Number(gradeUnderstanding)

    const record = await (prisma as any).lessonRecord.update({
      where: { id },
      data: updateData,
      include: {
        studentPresences: { include: { enrollment: { select: { id: true, nome: true } } } },
        lesson: {
          include: {
            enrollment: { select: { id: true, nome: true, tipoAula: true, nomeGrupo: true } },
            teacher: { select: { id: true, nome: true } },
          },
        },
      },
    })

    if (Array.isArray(studentsPresence) && studentsPresence.length > 0) {
      const LessonRecordStudent = (prisma as any).lessonRecordStudent
      if (LessonRecordStudent?.deleteMany && LessonRecordStudent?.createMany) {
        await LessonRecordStudent.deleteMany({ where: { lessonRecordId: id } })
        const validPresences = studentsPresence
          .filter((s: { enrollmentId: string; presence: string }) => s.enrollmentId && ['PRESENTE', 'NAO_COMPARECEU', 'ATRASADO'].includes(s.presence))
          .map((s: { enrollmentId: string; presence: string }) => ({
            lessonRecordId: id,
            enrollmentId: s.enrollmentId,
            presence: s.presence,
          }))
        if (validPresences.length > 0) {
          await LessonRecordStudent.createMany({ data: validPresences })
        }
        const updated = await (prisma as any).lessonRecord.findUnique({
          where: { id },
          include: {
            studentPresences: { include: { enrollment: { select: { id: true, nome: true } } } },
            lesson: {
              include: {
                enrollment: { select: { id: true, nome: true, tipoAula: true, nomeGrupo: true } },
                teacher: { select: { id: true, nome: true } },
              },
            },
          },
        })
        if (updated) return NextResponse.json({ ok: true, data: { record: updated } })
      }
    }

    return NextResponse.json({ ok: true, data: { record } })
  } catch (error) {
    console.error('[api/admin/lesson-records/[id] PATCH]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao atualizar registro' },
      { status: 500 }
    )
  }
}

export async function DELETE(
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

    const { id } = await params
    await (prisma as any).lessonRecord.delete({
      where: { id },
    })

    return NextResponse.json({ ok: true, data: { deleted: id } })
  } catch (error) {
    console.error('[api/admin/lesson-records/[id] DELETE]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao excluir registro' },
      { status: 500 }
    )
  }
}
