/**
 * GET /api/student/chat/conversations – lista conversas do aluno logado
 * POST /api/student/chat/conversations – cria conversa direta com professor ou funcionário (ou retorna existente)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStudent } from '@/lib/auth'

function getSectorLabelFromPages(adminPages: unknown): string | null {
  const pages = Array.isArray(adminPages) ? (adminPages as string[]) : []
  if (pages.includes('financeiro')) return 'Financeiro'
  if (pages.some((p) => p === 'calendario' || p === 'registros-aulas')) return 'Gestão de aulas'
  if (pages.includes('livros')) return 'Material'
  return null
}

const roleLabel: Record<string, string> = {
  ADMIN: 'Funcionário',
  TEACHER: 'Professor',
  STUDENT: 'Aluno',
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireStudent(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.session ? 403 : 401 }
      )
    }

    const currentUserId = auth.session.userId

    const participants = await prisma.conversationParticipant.findMany({
      where: { userId: currentUserId },
      include: {
        conversation: {
          include: {
            participants: {
              include: {
                user: { select: { id: true, nome: true, email: true, role: true } },
              },
            },
            messages: {
              orderBy: { criadoEm: 'desc' },
              take: 1,
              select: { id: true, content: true, criadoEm: true, senderId: true },
            },
          },
        },
      },
      orderBy: { conversation: { criadoEm: 'desc' } },
    })

    const conversationsWithMeta = await Promise.all(
      participants.map(async (p) => {
        const conv = p.conversation
        const others = conv.participants
          .filter((x) => x.userId !== currentUserId)
          .map((x) => ({
            id: x.user.id,
            nome: x.user.nome,
            email: x.user.email,
            role: x.user.role,
            roleLabel: roleLabel[x.user.role] ?? x.user.role,
          }))
        const lastMsg = conv.messages[0]
        const since = p.lastReadAt ?? new Date(0)
        const unreadCount = await prisma.chatMessage.count({
          where: {
            conversationId: conv.id,
            senderId: { not: currentUserId },
            criadoEm: { gt: since },
          },
        })
        return {
          id: conv.id,
          type: conv.type,
          name: conv.name,
          criadoEm: conv.criadoEm.toISOString(),
          participants: others,
          lastMessage: lastMsg
            ? {
                id: lastMsg.id,
                content: lastMsg.content,
                criadoEm: lastMsg.criadoEm.toISOString(),
                senderId: lastMsg.senderId,
              }
            : null,
          unreadCount,
          lastReadAt: p.lastReadAt?.toISOString() ?? null,
          isParticipant: true,
        }
      })
    )

    return NextResponse.json({ ok: true, data: { conversations: conversationsWithMeta } })
  } catch (error) {
    console.error('[api/student/chat/conversations GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar conversas' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStudent(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.session ? 403 : 401 }
      )
    }

    const currentUserId = auth.session.userId
    const body = await request.json().catch(() => ({}))
    const participantIds = Array.isArray(body.participantIds) ? body.participantIds : []
    const ids = participantIds.filter((id): id is string => typeof id === 'string').slice(0, 1)

    if (ids.length !== 1) {
      return NextResponse.json(
        { ok: false, message: 'Selecione uma pessoa para iniciar a conversa' },
        { status: 400 }
      )
    }

    const allUserIds = [currentUserId, ...ids]
    const usersExist = await prisma.user.findMany({
      where: { id: { in: allUserIds } },
      select: { id: true, role: true, nome: true, email: true, adminPages: true },
    })
    if (usersExist.length !== allUserIds.length) {
      return NextResponse.json(
        { ok: false, message: 'Usuário não encontrado' },
        { status: 400 }
      )
    }

    const otherUser = usersExist.find((u) => u.id === ids[0])
    if (otherUser?.role !== 'TEACHER' && otherUser?.role !== 'ADMIN') {
      return NextResponse.json(
        { ok: false, message: 'Só é possível iniciar conversa com professor ou funcionário' },
        { status: 403 }
      )
    }

    const myParticipations = await prisma.conversationParticipant.findMany({
      where: { userId: currentUserId },
      select: { conversationId: true },
    })
    const convIds = myParticipations.map((p) => p.conversationId)
    const directConvs = await prisma.conversation.findMany({
      where: { id: { in: convIds }, type: 'DIRECT' },
      include: {
        participants: { include: { user: { select: { id: true, nome: true, email: true, role: true, adminPages: true } } } },
      },
    })
    for (const conv of directConvs) {
      const participantIdsInConv = conv.participants.map((p) => p.userId)
      if (
        participantIdsInConv.length === 2 &&
        participantIdsInConv.includes(currentUserId) &&
        participantIdsInConv.includes(ids[0])
      ) {
        const others = conv.participants
          .filter((x) => x.userId !== currentUserId)
          .map((x) => {
            const u = x.user as { id: string; nome: string; email: string; role: string; adminPages?: unknown }
            const sector = u.role === 'ADMIN' ? getSectorLabelFromPages(u.adminPages) : null
            return {
              id: u.id,
              nome: u.nome,
              email: u.email,
              role: u.role,
              roleLabel: sector ?? roleLabel[u.role] ?? u.role,
            }
          })
        return NextResponse.json({
          ok: true,
          data: {
            conversation: {
              id: conv.id,
              type: conv.type,
              name: conv.name,
              criadoEm: conv.criadoEm.toISOString(),
              participants: others,
              lastMessage: null,
              unreadCount: 0,
              lastReadAt: null,
            },
            message: 'Conversa já existia',
          },
        })
      }
    }

    const conversation = await prisma.conversation.create({
      data: {
        type: 'DIRECT',
        name: null,
        participants: {
          create: allUserIds.map((userId: string) => ({ userId })),
        },
      },
      include: {
        participants: {
          include: { user: { select: { id: true, nome: true, email: true, role: true, adminPages: true } } },
        },
      },
    })

    const others = conversation.participants
      .filter((x) => x.userId !== currentUserId)
      .map((x) => {
        const u = x.user as { id: string; nome: string; email: string; role: string; adminPages?: unknown }
        const sector = u.role === 'ADMIN' ? getSectorLabelFromPages(u.adminPages) : null
        return {
          id: u.id,
          nome: u.nome,
          email: u.email,
          role: u.role,
          roleLabel: sector ?? roleLabel[u.role] ?? u.role,
        }
      })

    return NextResponse.json({
      ok: true,
      data: {
        conversation: {
          id: conversation.id,
          type: conversation.type,
          name: conversation.name,
          criadoEm: conversation.criadoEm.toISOString(),
          participants: others,
          lastMessage: null,
          unreadCount: 0,
          lastReadAt: null,
        },
      },
    })
  } catch (error) {
    console.error('[api/student/chat/conversations POST]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao criar conversa' },
      { status: 500 }
    )
  }
}
