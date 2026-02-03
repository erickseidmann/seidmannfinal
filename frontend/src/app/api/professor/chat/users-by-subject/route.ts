/**
 * GET /api/professor/chat/users-by-subject?subject=aula|financeiro|gestao-aulas|material
 * Lista usuários por assunto para o professor iniciar conversa ou grupo.
 * - aula: alunos (STUDENT)
 * - financeiro: funcionários ADM com acesso a Financeiro
 * - gestao-aulas: funcionários ADM com Calendário e/ou Registros de aulas
 * - material: funcionários ADM com acesso a Livros (material)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'

const SUBJECTS = ['aula', 'financeiro', 'gestao-aulas', 'material'] as const

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
    const subject = request.nextUrl.searchParams.get('subject')?.toLowerCase()

    if (!subject || !SUBJECTS.includes(subject as (typeof SUBJECTS)[number])) {
      return NextResponse.json(
        { ok: false, message: 'Assunto inválido. Use: aula, financeiro, gestao-aulas, material' },
        { status: 400 }
      )
    }

    const roleLabel: Record<string, string> = {
      ADMIN: 'Funcionário',
      TEACHER: 'Professor',
      STUDENT: 'Aluno',
    }

    // Para ADMIN na lista "Por assunto", exibir o setor (ex: Financeiro) em vez de "Funcionário"
    const subjectLabel: Record<string, string> = {
      aula: 'Aula',
      financeiro: 'Financeiro',
      'gestao-aulas': 'Gestão de aulas',
      material: 'Material',
    }
    const sectorLabel = subjectLabel[subject] ?? roleLabel.ADMIN

    if (subject === 'aula') {
      const users = await prisma.user.findMany({
        where: {
          id: { not: currentUserId },
          role: 'STUDENT',
          status: 'ACTIVE',
        },
        select: { id: true, nome: true, email: true, role: true },
        orderBy: { nome: 'asc' },
        take: 200,
      })
      return NextResponse.json({
        ok: true,
        data: users.map((u) => ({
          id: u.id,
          nome: u.nome,
          email: u.email,
          role: u.role,
          roleLabel: roleLabel[u.role] ?? u.role,
        })),
      })
    }

    if (subject === 'financeiro') {
      const users = await prisma.user.findMany({
        where: { id: { not: currentUserId }, role: 'ADMIN' },
        select: { id: true, nome: true, email: true, role: true, adminPages: true },
        orderBy: { nome: 'asc' },
        take: 200,
      })
      const withFinanceiro = users.filter((u) => {
        const pages = Array.isArray(u.adminPages) ? u.adminPages : []
        return pages.includes('financeiro')
      })
      return NextResponse.json({
        ok: true,
        data: withFinanceiro.map((u) => ({
          id: u.id,
          nome: u.nome,
          email: u.email,
          role: u.role,
          roleLabel: sectorLabel,
        })),
      })
    }

    if (subject === 'gestao-aulas') {
      const users = await prisma.user.findMany({
        where: { id: { not: currentUserId }, role: 'ADMIN' },
        select: { id: true, nome: true, email: true, role: true, adminPages: true },
        orderBy: { nome: 'asc' },
        take: 200,
      })
      const withGestao = users.filter((u) => {
        const pages = Array.isArray(u.adminPages) ? u.adminPages : []
        return pages.includes('calendario') || pages.includes('registros-aulas')
      })
      return NextResponse.json({
        ok: true,
        data: withGestao.map((u) => ({
          id: u.id,
          nome: u.nome,
          email: u.email,
          role: u.role,
          roleLabel: sectorLabel,
        })),
      })
    }

    if (subject === 'material') {
      const users = await prisma.user.findMany({
        where: { id: { not: currentUserId }, role: 'ADMIN' },
        select: { id: true, nome: true, email: true, role: true, adminPages: true },
        orderBy: { nome: 'asc' },
        take: 200,
      })
      const withLivros = users.filter((u) => {
        const pages = Array.isArray(u.adminPages) ? u.adminPages : []
        return pages.includes('livros')
      })
      return NextResponse.json({
        ok: true,
        data: withLivros.map((u) => ({
          id: u.id,
          nome: u.nome,
          email: u.email,
          role: u.role,
          roleLabel: sectorLabel,
        })),
      })
    }

    return NextResponse.json({ ok: true, data: [] })
  } catch (error) {
    console.error('[api/professor/chat/users-by-subject GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar usuários por assunto' },
      { status: 500 }
    )
  }
}
