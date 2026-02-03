/**
 * GET /api/student/chat/conversations/[id]/messages – lista mensagens
 * POST /api/student/chat/conversations/[id]/messages – envia mensagem
 * PATCH – marca como lido
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStudent } from '@/lib/auth'

const roleLabel: Record<string, string> = {
  ADMIN: 'Funcionário',
  TEACHER: 'Professor',
  STUDENT: 'Aluno',
}

function getCurrentUserId(auth: { session: { userId: string } | null }) {
  return auth.session!.userId
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireStudent(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.session ? 403 : 401 }
      )
    }

    const currentUserId = getCurrentUserId(auth)
    const { id: conversationId } = await params
    const { searchParams } = new URL(request.url)
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)))
    const before = searchParams.get('before') || undefined

    const participant = await prisma.conversationParticipant.findFirst({
      where: { conversationId, userId: currentUserId },
    })
    if (!participant) {
      return NextResponse.json(
        { ok: false, message: 'Conversa não encontrada' },
        { status: 404 }
      )
    }

    const where: { conversationId: string; criadoEm?: { lt: Date } } = { conversationId }
    if (before) {
      const beforeMsg = await prisma.chatMessage.findFirst({
        where: { id: before, conversationId },
      })
      if (beforeMsg) {
        where.criadoEm = { lt: beforeMsg.criadoEm }
      }
    }

    const messages = await prisma.chatMessage.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      take: limit,
      include: {
        sender: { select: { id: true, nome: true, role: true } },
      },
    })

    const list = messages.reverse().map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      senderNome: m.sender.nome,
      senderRole: m.sender.role,
      senderRoleLabel: roleLabel[m.sender.role] ?? m.sender.role,
      content: m.content,
      criadoEm: m.criadoEm.toISOString(),
      isOwn: m.senderId === currentUserId,
    }))

    return NextResponse.json({ ok: true, data: { messages: list } })
  } catch (error) {
    console.error('[api/student/chat/conversations/[id]/messages GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar mensagens' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireStudent(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.session ? 403 : 401 }
      )
    }

    const currentUserId = getCurrentUserId(auth)
    const { id: conversationId } = await params
    const body = await request.json().catch(() => ({}))
    const content = typeof body.content === 'string' ? body.content.trim() : ''

    if (!content) {
      return NextResponse.json(
        { ok: false, message: 'Mensagem não pode ser vazia' },
        { status: 400 }
      )
    }

    const participant = await prisma.conversationParticipant.findFirst({
      where: { conversationId, userId: currentUserId },
    })
    if (!participant) {
      return NextResponse.json(
        { ok: false, message: 'Conversa não encontrada ou sem acesso' },
        { status: 404 }
      )
    }

    const message = await prisma.chatMessage.create({
      data: {
        conversationId,
        senderId: currentUserId,
        content,
      },
      include: {
        sender: { select: { id: true, nome: true, role: true } },
      },
    })

    return NextResponse.json({
      ok: true,
      data: {
        message: {
          id: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          senderNome: message.sender.nome,
          senderRole: message.sender.role,
          senderRoleLabel: roleLabel[message.sender.role] ?? message.sender.role,
          content: message.content,
          criadoEm: message.criadoEm.toISOString(),
          isOwn: true,
        },
      },
    })
  } catch (error) {
    console.error('[api/student/chat/conversations/[id]/messages POST]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao enviar mensagem' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireStudent(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.session ? 403 : 401 }
      )
    }

    const currentUserId = getCurrentUserId(auth)
    const { id: conversationId } = await params

    await prisma.conversationParticipant.updateMany({
      where: { conversationId, userId: currentUserId },
      data: { lastReadAt: new Date() },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/student/chat/conversations/[id]/messages PATCH]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao marcar como lido' },
      { status: 500 }
    )
  }
}
