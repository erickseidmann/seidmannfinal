/**
 * GET /api/admin/chat/conversations – lista conversas do usuário atual
 * POST /api/admin/chat/conversations – cria conversa (DIRECT ou GROUP)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.session ? 403 : 401 }
      )
    }

    const currentUserId = auth.session.sub
    const all = request.nextUrl.searchParams.get('all') === 'true'

    const roleLabel: Record<string, string> = {
      ADMIN: 'Funcionário',
      TEACHER: 'Professor',
      STUDENT: 'Aluno',
    }

    if (all) {
      const conversations = await prisma.conversation.findMany({
        orderBy: { criadoEm: 'desc' },
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
      })

      const list = conversations.map((conv) => {
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
        const isParticipant = conv.participants.some((p) => p.userId === currentUserId)
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
          unreadCount: isParticipant ? 0 : 0,
          lastReadAt: null as string | null,
          isParticipant,
        }
      })

      return NextResponse.json({ ok: true, data: { conversations: list } })
    }

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
    console.error('[api/admin/chat/conversations GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar conversas' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.session ? 403 : 401 }
      )
    }

    const currentUserId = auth.session.sub
    const body = await request.json().catch(() => ({}))
    const { type, participantIds, name } = body

    const convType = type === 'GROUP' ? 'GROUP' : 'DIRECT'
    const ids = Array.isArray(participantIds)
      ? participantIds.filter((id: unknown) => typeof id === 'string' && id !== currentUserId)
      : []

    if (convType === 'DIRECT' && ids.length !== 1) {
      return NextResponse.json(
        { ok: false, message: 'Conversa direta deve ter exatamente um outro participante' },
        { status: 400 }
      )
    }
    if (convType === 'GROUP' && ids.length < 1) {
      return NextResponse.json(
        { ok: false, message: 'Grupo deve ter pelo menos um outro participante' },
        { status: 400 }
      )
    }

    const allUserIds = [currentUserId, ...ids]
    const usersExist = await prisma.user.findMany({
      where: { id: { in: allUserIds } },
      select: { id: true },
    })
    if (usersExist.length !== allUserIds.length) {
      return NextResponse.json(
        { ok: false, message: 'Um ou mais usuários não encontrados' },
        { status: 400 }
      )
    }

    // Se DIRECT, verificar se já existe conversa entre os dois
    if (convType === 'DIRECT') {
      const myParticipations = await prisma.conversationParticipant.findMany({
        where: { userId: currentUserId },
        select: { conversationId: true },
      })
      const convIds = myParticipations.map((p) => p.conversationId)
      const directConvs = await prisma.conversation.findMany({
        where: { id: { in: convIds }, type: 'DIRECT' },
        include: {
          participants: { include: { user: { select: { id: true, nome: true, email: true, role: true } } } },
        },
      })
      for (const conv of directConvs) {
        const participantIdsInConv = conv.participants.map((p) => p.userId)
        if (
          participantIdsInConv.length === 2 &&
          participantIdsInConv.includes(currentUserId) &&
          participantIdsInConv.includes(ids[0])
        ) {
          const roleLabel: Record<string, string> = {
            ADMIN: 'Funcionário',
            TEACHER: 'Professor',
            STUDENT: 'Aluno',
          }
          return NextResponse.json({
            ok: true,
            data: {
              conversation: {
                id: conv.id,
                type: conv.type,
                name: conv.name,
                criadoEm: conv.criadoEm.toISOString(),
                participants: conv.participants
                  .filter((x) => x.userId !== currentUserId)
                  .map((x) => ({
                    id: x.user.id,
                    nome: x.user.nome,
                    email: x.user.email,
                    role: x.user.role,
                    roleLabel: roleLabel[x.user.role] ?? x.user.role,
                  })),
                lastMessage: null,
              },
            },
            message: 'Conversa já existia',
          })
        }
      }
    }

    const conversation = await prisma.conversation.create({
      data: {
        type: convType,
        name: convType === 'GROUP' ? (name && String(name).trim()) || null : null,
        participants: {
          create: allUserIds.map((userId: string) => ({ userId })),
        },
      },
      include: {
        participants: {
          include: { user: { select: { id: true, nome: true, email: true, role: true } } },
        },
      },
    })

    const roleLabel: Record<string, string> = {
      ADMIN: 'Funcionário',
      TEACHER: 'Professor',
      STUDENT: 'Aluno',
    }

    return NextResponse.json({
      ok: true,
      data: {
        conversation: {
          id: conversation.id,
          type: conversation.type,
          name: conversation.name,
          criadoEm: conversation.criadoEm.toISOString(),
          participants: conversation.participants
            .filter((x) => x.userId !== currentUserId)
            .map((x) => ({
              id: x.user.id,
              nome: x.user.nome,
              email: x.user.email,
              role: x.user.role,
              roleLabel: roleLabel[x.user.role] ?? x.user.role,
            })),
          lastMessage: null,
        },
      },
    })
  } catch (error) {
    console.error('[api/admin/chat/conversations POST]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao criar conversa' },
      { status: 500 }
    )
  }
}
