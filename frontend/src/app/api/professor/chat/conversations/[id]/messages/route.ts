/**
 * GET /api/professor/chat/conversations/[id]/messages – lista mensagens (paginação)
 * POST /api/professor/chat/conversations/[id]/messages – envia mensagem
 * PATCH /api/professor/chat/conversations/[id]/messages – marca como lido (atualiza lastReadAt)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'

/** Para ADMIN: retorna setor (Financeiro, Gestão de aulas, Material) a partir de adminPages */
function getSectorLabelFromPages(adminPages: unknown): string | null {
  const pages = Array.isArray(adminPages) ? adminPages as string[] : []
  if (pages.includes('financeiro')) return 'Financeiro'
  if (pages.some((p) => p === 'calendario' || p === 'registros-aulas')) return 'Gestão de aulas'
  if (pages.includes('livros')) return 'Material'
  return null
}

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
    const { searchParams } = new URL(request.url)
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)))
    const before = searchParams.get('before') || undefined

    const participant = await prisma.conversationParticipant.findFirst({
      where: { conversationId, userId: currentUserId },
    })
    if (!participant) {
      return NextResponse.json(
        { ok: false, message: 'Conversa não encontrada ou sem acesso' },
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
        sender: { select: { id: true, nome: true, role: true, adminPages: true } },
      },
    })

    const roleLabel: Record<string, string> = {
      ADMIN: 'Funcionário',
      TEACHER: 'Professor',
      STUDENT: 'Aluno',
    }

    const list = messages.reverse().map((m) => {
      const sender = m.sender as { id: string; nome: string; role: string; adminPages?: unknown }
      const sector = sender.role === 'ADMIN' ? getSectorLabelFromPages(sender.adminPages) : null
      const displayLabel = sector ?? (roleLabel[sender.role] ?? sender.role)
      return {
        id: m.id,
        conversationId: m.conversationId,
        senderId: m.senderId,
        senderNome: sender.nome,
        senderRole: sender.role,
        senderRoleLabel: displayLabel,
        content: m.content,
        criadoEm: m.criadoEm.toISOString(),
        isOwn: m.senderId === currentUserId,
      }
    })

    return NextResponse.json({ ok: true, data: { messages: list } })
  } catch (error) {
    console.error('[api/professor/chat/conversations/[id]/messages GET]', error)
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
    const auth = await requireTeacher(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.session ? 403 : 401 }
      )
    }

    const currentUserId = auth.session.userId
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
        sender: { select: { id: true, nome: true, role: true, adminPages: true } },
      },
    })

    const roleLabel: Record<string, string> = {
      ADMIN: 'Funcionário',
      TEACHER: 'Professor',
      STUDENT: 'Aluno',
    }
    const sender = message.sender as { id: string; nome: string; role: string; adminPages?: unknown }
    const sector = sender.role === 'ADMIN' ? getSectorLabelFromPages(sender.adminPages) : null
    const displayLabel = sector ?? (roleLabel[sender.role] ?? sender.role)

    return NextResponse.json({
      ok: true,
      data: {
        message: {
          id: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          senderNome: sender.nome,
          senderRole: sender.role,
          senderRoleLabel: displayLabel,
          content: message.content,
          criadoEm: message.criadoEm.toISOString(),
          isOwn: true,
        },
      },
    })
  } catch (error) {
    console.error('[api/professor/chat/conversations/[id]/messages POST]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao enviar mensagem' },
      { status: 500 }
    )
  }
}

/** Marca a conversa como lida (atualiza lastReadAt) para diminuir o contador do sininho */
export async function PATCH(
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

    await prisma.conversationParticipant.updateMany({
      where: { conversationId, userId: currentUserId },
      data: { lastReadAt: new Date() },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/professor/chat/conversations/[id]/messages PATCH]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao marcar como lido' },
      { status: 500 }
    )
  }
}
