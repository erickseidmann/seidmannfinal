/**
 * PATCH /api/admin/books/[id]
 * Atualiza um livro (nome, nível, total de páginas, imprimível, PDF, capa).
 * PDF e capa são opcionais - se enviados, substituem os atuais.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

const BOOK_LEVELS = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'B4', 'C1', 'C2'] as const

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

    const { id: bookId } = await params

    const existing = await prisma.book.findUnique({ where: { id: bookId } })
    if (!existing) {
      return NextResponse.json(
        { ok: false, message: 'Livro não encontrado' },
        { status: 404 }
      )
    }

    const formData = await request.formData().catch(() => null)
    if (!formData) {
      return NextResponse.json(
        { ok: false, message: 'Envie os dados via FormData' },
        { status: 400 }
      )
    }

    const nomeRaw = formData.get('nome')
    const nome = nomeRaw != null ? String(nomeRaw).trim() : null
    const levelRaw = formData.get('level')
    const level = levelRaw != null ? String(levelRaw).toUpperCase() : null
    const totalPaginasRaw = formData.get('totalPaginas')
    const totalPaginas =
      totalPaginasRaw != null ? parseInt(String(totalPaginasRaw), 10) : null
    const imprimivelRaw = formData.get('imprimivel')
    const imprimivel =
      imprimivelRaw === 'true' || imprimivelRaw === '1' ? true : imprimivelRaw === 'false' || imprimivelRaw === '0' ? false : null
    const pdfFile = formData.get('pdf') as File | null
    const capaFile = formData.get('capa') as File | null

    const updateData: {
      nome?: string
      level?: string
      totalPaginas?: number
      imprimivel?: boolean
      pdfPath?: string
      capaPath?: string
    } = {}

    if (nome) updateData.nome = nome
    if (level && BOOK_LEVELS.includes(level as (typeof BOOK_LEVELS)[number])) {
      updateData.level = level
    }
    if (totalPaginas != null && !isNaN(totalPaginas) && totalPaginas >= 1) {
      updateData.totalPaginas = totalPaginas
    }
    if (imprimivel !== null) updateData.imprimivel = imprimivel

    const baseDir = path.join(process.cwd(), 'public', 'uploads', 'books', bookId)

    if (pdfFile && pdfFile instanceof File && pdfFile.size > 0) {
      const pdfExt = path.extname(pdfFile.name).toLowerCase()
      if (pdfExt === '.pdf') {
        await mkdir(baseDir, { recursive: true })
        const pdfPath = `livro${pdfExt}`
        const pdfFullPath = path.join(baseDir, pdfPath)
        const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer())
        await writeFile(pdfFullPath, pdfBuffer)
        updateData.pdfPath = `/uploads/books/${bookId}/${pdfPath}`
      }
    }

    if (capaFile && capaFile instanceof File && capaFile.size > 0) {
      const capaExt = path.extname(capaFile.name).toLowerCase()
      const allowedCapa = ['.jpg', '.jpeg', '.png', '.webp']
      if (allowedCapa.includes(capaExt)) {
        await mkdir(baseDir, { recursive: true })
        const capaPath = `capa${capaExt}`
        const capaFullPath = path.join(baseDir, capaPath)
        const capaBuffer = Buffer.from(await capaFile.arrayBuffer())
        await writeFile(capaFullPath, capaBuffer)
        updateData.capaPath = `/uploads/books/${bookId}/${capaPath}`
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { ok: false, message: 'Nenhum campo válido para atualizar' },
        { status: 400 }
      )
    }

    const updated = await prisma.book.update({
      where: { id: bookId },
      data: updateData,
    })

    return NextResponse.json({
      ok: true,
      data: {
        id: updated.id,
        nome: updated.nome,
        level: updated.level,
        totalPaginas: updated.totalPaginas,
        imprimivel: updated.imprimivel,
        pdfPath: updated.pdfPath,
        capaPath: updated.capaPath,
      },
      message: 'Livro atualizado com sucesso',
    })
  } catch (error) {
    console.error('[api/admin/books/[id]] Erro ao atualizar:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao atualizar livro' },
      { status: 500 }
    )
  }
}
