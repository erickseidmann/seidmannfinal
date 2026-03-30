/**
 * API Route: POST /api/admin/announcements/[id]/send
 *
 * Envia anúncio: envia e-mail aos destinatários conforme audiência.
 * Resposta em NDJSON (application/x-ndjson): eventos `progress`, depois `done` ou `error`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { sendEmail } from '@/lib/email'

export const maxDuration = 120

type NdProgress = { type: 'progress'; sent: number; total: number; percent: number }
type NdDone = {
  type: 'done'
  ok: true
  data: {
    announcement: { id: string; status: string; sentAt: string | null }
  }
}
type NdError = { type: 'error'; message: string }

function ndjsonLine(obj: NdProgress | NdDone | NdError) {
  return JSON.stringify(obj) + '\n'
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

    const { id } = await params

    if (!prisma.announcement) {
      return NextResponse.json(
        { ok: false, message: 'Modelo Announcement não disponível. Execute: npx prisma generate' },
        { status: 503 }
      )
    }

    const announcement = await prisma.announcement.findUnique({
      where: { id },
    })

    if (!announcement) {
      return NextResponse.json({ ok: false, message: 'Anúncio não encontrado' }, { status: 404 })
    }

    if (announcement.status === 'SENT') {
      return NextResponse.json({ ok: false, message: 'Anúncio já foi enviado' }, { status: 400 })
    }

    if (announcement.status === 'CANCELED') {
      return NextResponse.json(
        { ok: false, message: 'Anúncio cancelado não pode ser enviado' },
        { status: 400 }
      )
    }

    const subject = announcement.title
    const text = announcement.message

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const push = (obj: NdProgress | NdDone | NdError) => {
          controller.enqueue(encoder.encode(ndjsonLine(obj)))
        }

        try {
          if (announcement.channel === 'EMAIL') {
            const audience = announcement.audience
            const sendToTeachers =
              audience === 'TEACHERS' || audience === 'ALL' || audience === 'ACTIVE_ONLY'
            const sendToStudents =
              audience === 'STUDENTS' || audience === 'ALL' || audience === 'ACTIVE_ONLY'
            const activeOnly = audience === 'ACTIVE_ONLY'

            const recipients: { email: string; nome: string }[] = []

            if (sendToTeachers) {
              const teacherWhere = activeOnly ? { status: 'ACTIVE' as const } : {}
              const teachers = await prisma.teacher.findMany({
                where: teacherWhere,
                select: { email: true, nome: true },
              })
              for (const t of teachers) {
                const em = t.email?.trim()
                if (em) recipients.push({ email: em, nome: t.nome })
              }
            }

            if (sendToStudents) {
              const enrollmentWhere = activeOnly ? { status: 'ACTIVE' as const } : {}
              const enrollments = await prisma.enrollment.findMany({
                where: enrollmentWhere,
                select: { email: true, nome: true },
              })
              const seen = new Set<string>()
              for (const e of enrollments) {
                const email = e.email?.trim()
                if (email && !seen.has(email.toLowerCase())) {
                  seen.add(email.toLowerCase())
                  recipients.push({ email, nome: e.nome })
                }
              }
            }

            const total = recipients.length
            push({
              type: 'progress',
              sent: 0,
              total,
              percent: total === 0 ? 100 : 0,
            })

            for (let i = 0; i < recipients.length; i++) {
              const r = recipients[i]
              try {
                await sendEmail({
                  to: r.email,
                  subject,
                  text: `Olá, ${r.nome}\n\n${text}`,
                })
              } catch (err) {
                console.error('[api/admin/announcements/send] Erro ao enviar e-mail:', r.email, err)
              }
              const sent = i + 1
              const percent = total === 0 ? 100 : Math.round((sent / total) * 100)
              push({ type: 'progress', sent, total, percent })
            }
          } else {
            push({ type: 'progress', sent: 0, total: 0, percent: 100 })
          }

          const updated = await prisma.announcement.update({
            where: { id },
            data: {
              status: 'SENT',
              sentAt: new Date(),
            },
          })

          push({
            type: 'done',
            ok: true,
            data: {
              announcement: {
                id: updated.id,
                status: updated.status,
                sentAt: updated.sentAt?.toISOString() ?? null,
              },
            },
          })
        } catch (error) {
          console.error('[api/admin/announcements/[id]/send] Erro ao enviar anúncio:', error)
          push({
            type: 'error',
            message:
              error instanceof Error ? error.message : 'Erro ao enviar anúncio',
          })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[api/admin/announcements/[id]/send] Erro ao enviar anúncio:', error)
    return NextResponse.json({ ok: false, message: 'Erro ao enviar anúncio' }, { status: 500 })
  }
}
