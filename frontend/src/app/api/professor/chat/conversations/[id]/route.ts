/**
 * GET /api/professor/chat/conversations/[id] – detalhes da conversa
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireTeacher(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.session ? 403 : 401 }
      )
    }

    const currentUserId = auth.session.userId
    const { id: conversationId } = await params

    const participant = await prisma.conversationParticipant.findFirst({
      where: { conversationId, userId: currentUserId },
    })
    if (!participant) {
      return NextResponse.json(
        { ok: false, message: 'Conversa não encontrada ou sem acesso' },
        { status: 404 }
      )
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: { user: { select: { id: true, nome: true, email: true, role: true } } },
        },
      },
    })
    if (!conversation) {
      return NextResponse.json(
        { ok: false, message: 'Conversa não encontrada' },
        { status: 404 }
      )
    }

    const roleLabel: Record<string, string> = {
      ADMIN: 'Funcionário',
      TEACHER: 'Professor',
      STUDENT: 'Aluno',
    }

    return NextResponse.json({
      ok: true,
      data: {
        id: conversation.id,
        type: conversation.type,
        name: conversation.name,
        criadoEm: conversation.criadoEm.toISOString(),
        participants: conversation.participants
          .filter((p) => p.userId !== currentUserId)
          .map((p) => ({
            id: p.user.id,
            nome: p.user.nome,
            email: p.user.email,
            role: p.user.role,
            roleLabel: roleLabel[p.user.role] ?? p.user.role,
          })),
      },
    })
  } catch (error) {
    console.error('[api/professor/chat/conversations/[id] GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao obter conversa' },
      { status: 500 }
    )
  }
}
