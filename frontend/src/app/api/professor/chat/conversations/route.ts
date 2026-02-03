/**
 * GET /api/professor/chat/conversations – lista conversas do professor
 * POST /api/professor/chat/conversations – cria conversa (DIRECT ou GROUP)
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

export async function GET(request: NextRequest) {
  try {
    const auth = await requireTeacher(request)
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
                user: { select: { id: true, nome: true, email: true, role: true, adminPages: true } },
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

    const roleLabel: Record<string, string> = {
      ADMIN: 'Funcionário',
      TEACHER: 'Professor',
      STUDENT: 'Aluno',
    }

    const conversationsWithMeta = await Promise.all(
      participants.map(async (p) => {
        const conv = p.conversation
        const others = conv.participants
          .filter((x) => x.userId !== currentUserId)
          .map((x) => {
            const user = x.user as { id: string; nome: string; email: string; role: string; adminPages?: unknown }
            const sector = user.role === 'ADMIN' ? getSectorLabelFromPages(user.adminPages) : null
            const displayLabel = sector ?? (roleLabel[user.role] ?? user.role)
            return {
              id: user.id,
              nome: user.nome,
              email: user.email,
              role: user.role,
              roleLabel: displayLabel,
            }
          })
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
        }
      })
    )

    return NextResponse.json({ ok: true, data: { conversations: conversationsWithMeta } })
  } catch (error) {
    console.error('[api/professor/chat/conversations GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar conversas' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireTeacher(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.session ? 403 : 401 }
      )
    }

    const currentUserId = auth.session.userId
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
      select: { id: true, role: true },
    })
    if (usersExist.length !== allUserIds.length) {
      return NextResponse.json(
        { ok: false, message: 'Um ou mais usuários não encontrados' },
        { status: 400 }
      )
    }

    // Validar: professor não pode criar conversa direta com outro professor
    if (convType === 'DIRECT') {
      const otherUser = usersExist.find((u) => u.id === ids[0])
      if (otherUser?.role === 'TEACHER') {
        return NextResponse.json(
          { ok: false, message: 'Professores não podem conversar diretamente entre si. Use um grupo criado pelo admin.' },
          { status: 403 }
        )
      }
    }

    if (convType === 'DIRECT') {
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
          const roleLabelMap: Record<string, string> = {
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
                  .map((x) => {
                    const u = x.user as { id: string; nome: string; email: string; role: string; adminPages?: unknown }
                    const sector = u.role === 'ADMIN' ? getSectorLabelFromPages(u.adminPages) : null
                    return {
                      id: u.id,
                      nome: u.nome,
                      email: u.email,
                      role: u.role,
                      roleLabel: sector ?? roleLabelMap[u.role] ?? u.role,
                    }
                  }),
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
          include: { user: { select: { id: true, nome: true, email: true, role: true, adminPages: true } } },
        },
      },
    })

    const roleLabelMap: Record<string, string> = {
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
            .map((x) => {
              const u = x.user as { id: string; nome: string; email: string; role: string; adminPages?: unknown }
              const sector = u.role === 'ADMIN' ? getSectorLabelFromPages(u.adminPages) : null
              return {
                id: u.id,
                nome: u.nome,
                email: u.email,
                role: u.role,
                roleLabel: sector ?? roleLabelMap[u.role] ?? u.role,
              }
            }),
          lastMessage: null,
        },
      },
    })
  } catch (error) {
    console.error('[api/professor/chat/conversations POST]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao criar conversa' },
      { status: 500 }
    )
  }
}
