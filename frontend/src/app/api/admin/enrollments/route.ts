/**
 * API Route: GET /api/admin/enrollments
 * 
 * Lista enrollments com filtros por status e busca.
 * Requer autenticação admin via header Authorization: Bearer <ADMIN_TOKEN>
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    // Verificar autenticação admin (sessão + role)
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        {
          ok: false,
          message: auth.message || 'Não autorizado',
        },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const statusParam = searchParams.get('status') // Pode ser null (todos)
    const searchParam = searchParams.get('search')?.trim() || ''

    // Construir filtro de status
    const statusFilter: any = statusParam
      ? { status: statusParam }
      : {} // Se não especificado, busca todos

    // Construir filtro de busca (nome, email, whatsapp)
    // MySQL não suporta mode: 'insensitive', mas aceita contains (case-sensitive)
    // Para case-insensitive, usar lower() no banco ou normalizar no código
    const searchFilter: any = searchParam
      ? {
          OR: [
            { nome: { contains: searchParam } },
            { email: { contains: searchParam } },
            { whatsapp: { contains: searchParam } },
          ],
        }
      : {}

    // Combinar filtros
    const whereClause: any = {
      ...statusFilter,
      ...searchFilter,
    }

    // Buscar enrollments
    const enrollments = await prisma.enrollment.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            nome: true,
            email: true,
            whatsapp: true,
          },
        },
        paymentInfo: true,
      },
      orderBy: {
        criadoEm: 'desc',
      },
    })

    return NextResponse.json(
      {
        ok: true,
        data: {
          enrollments: enrollments.map((e) => ({
            id: e.id,
            nome: e.nome,
            email: e.email,
            whatsapp: e.whatsapp,
            idioma: e.idioma,
            nivel: e.nivel,
            objetivo: e.objetivo,
            disponibilidade: e.disponibilidade,
            status: e.status,
            trackingCode: e.trackingCode,
            contractAcceptedAt: e.contractAcceptedAt?.toISOString(),
            contractVersion: e.contractVersion,
            criadoEm: e.criadoEm.toISOString(),
            atualizadoEm: e.atualizadoEm.toISOString(),
            user: e.user,
            paymentInfo: e.paymentInfo ? {
              id: e.paymentInfo.id,
              plan: e.paymentInfo.plan,
              valorMensal: e.paymentInfo.valorMensal?.toString(),
              monthlyValue: e.paymentInfo.monthlyValue?.toString(),
              metodo: e.paymentInfo.metodo,
              dueDay: e.paymentInfo.dueDay,
              paymentStatus: e.paymentInfo.paymentStatus,
              reminderEnabled: e.paymentInfo.reminderEnabled,
              paidAt: e.paymentInfo.paidAt?.toISOString(),
              transactionRef: e.paymentInfo.transactionRef,
            } : null,
          })),
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[api/admin/enrollments] Erro ao listar enrollments:', error)
    return NextResponse.json(
      {
        ok: false,
        message: 'Erro ao listar enrollments'
      },
      { status: 500 }
    )
  }
}
