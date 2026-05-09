/**
 * PATCH /api/admin/books/[id]
 * Atualiza um livro (nome, nível, total de páginas, imprimível, PDF, capa).
 * PDF e capa são opcionais - se enviados, substituem os atuais.
 *
 * DELETE /api/admin/books/[id]
 * Remove o livro do catálogo. Em cascata, são removidos:
 *  - BookAudio (relação cascade)
 *  - BookAudioListen (relação cascade via BookAudio)
 * As BookRelease deste livro permanecem (bookId vira null), preservando o
 * histórico de que o aluno teve aquele livro liberado.
 * Os arquivos físicos em /public/uploads/books/{id} também são removidos.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { writeFile, mkdir, rm } from 'fs/promises'
import path from 'path'
import {
  releaseBookToActiveTeachersForLanguage,
  type TeacherLanguage,
} from '@/lib/teacher-book-releases'

const BOOK_LEVELS = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'B4', 'C1', 'C2'] as const
const BOOK_LANGUAGES = ['ENGLISH', 'SPANISH'] as const

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
    const languageRaw = formData.get('language')
    const language: TeacherLanguage | null =
      languageRaw != null &&
      BOOK_LANGUAGES.includes(String(languageRaw).toUpperCase() as (typeof BOOK_LANGUAGES)[number])
        ? (String(languageRaw).toUpperCase() as TeacherLanguage)
        : null
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
      language?: TeacherLanguage
      totalPaginas?: number
      imprimivel?: boolean
      pdfPath?: string
      capaPath?: string
    } = {}

    if (nome) updateData.nome = nome
    if (level && BOOK_LEVELS.includes(level as (typeof BOOK_LEVELS)[number])) {
      updateData.level = level
    }
    if (language) {
      updateData.language = language
    }
    if (totalPaginas != null && !isNaN(totalPaginas) && totalPaginas >= 1) {
      updateData.totalPaginas = totalPaginas
    }
    if (imprimivel !== null) updateData.imprimivel = imprimivel

    const baseDir = path.join(process.cwd(), 'public', 'uploads', 'books', bookId)

    if (pdfFile && pdfFile instanceof Blob && pdfFile.size > 0) {
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

    if (capaFile && capaFile instanceof Blob && capaFile.size > 0) {
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

    // Se o idioma foi definido/alterado, propagar liberações para os professores que ensinam o novo idioma.
    // Liberações antigas (de outro idioma) NÃO são removidas — admin pode revogar manualmente se quiser.
    let autoReleased = 0
    const languageChanged = updateData.language && updateData.language !== existing.language
    if (languageChanged && updated.language) {
      try {
        const result = await releaseBookToActiveTeachersForLanguage({
          bookId: updated.id,
          language: updated.language as TeacherLanguage,
          adminEmail: auth.session?.email || 'admin@seidmann',
        })
        autoReleased = result.released
      } catch (autoErr) {
        console.error('[api/admin/books/[id] PATCH] Falha ao auto-liberar livro:', autoErr)
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        id: updated.id,
        nome: updated.nome,
        level: updated.level,
        language: updated.language ?? null,
        totalPaginas: updated.totalPaginas,
        imprimivel: updated.imprimivel,
        pdfPath: updated.pdfPath,
        capaPath: updated.capaPath,
        autoReleasedToTeachers: autoReleased,
      },
      message:
        autoReleased > 0
          ? `Livro atualizado e liberado automaticamente para ${autoReleased} professor(es) do novo idioma.`
          : 'Livro atualizado com sucesso',
    })
  } catch (error) {
    console.error('[api/admin/books/[id]] Erro ao atualizar:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao atualizar livro' },
      { status: 500 }
    )
  }
}

export async function DELETE(
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

    const existing = await prisma.book.findUnique({
      where: { id: bookId },
      select: {
        id: true,
        nome: true,
        _count: { select: { releases: true, audios: true } },
      },
    })
    if (!existing) {
      return NextResponse.json(
        { ok: false, message: 'Livro não encontrado' },
        { status: 404 }
      )
    }

    // Remove o registro (BookAudio/BookAudioListen são removidos por cascade;
    // BookRelease.bookId vira null pela regra do schema, mas o registro fica).
    await prisma.book.delete({ where: { id: bookId } })

    // Tenta apagar a pasta de uploads do livro (PDF, capa, áudios). Best-effort.
    const baseDir = path.join(process.cwd(), 'public', 'uploads', 'books', bookId)
    try {
      await rm(baseDir, { recursive: true, force: true })
    } catch (rmErr) {
      console.warn('[api/admin/books/[id] DELETE] Não foi possível remover arquivos:', rmErr)
    }

    const releasesInfo =
      existing._count.releases > 0
        ? ` ${existing._count.releases} liberação(ões) anterior(es) ficou/ficaram registradas no histórico (sem o livro vinculado).`
        : ''

    return NextResponse.json({
      ok: true,
      message: `Livro "${existing.nome}" excluído com sucesso.${releasesInfo}`,
      data: {
        id: existing.id,
        releasesAffected: existing._count.releases,
        audiosRemoved: existing._count.audios,
      },
    })
  } catch (error) {
    console.error('[api/admin/books/[id] DELETE] Erro ao excluir livro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao excluir livro. Tente novamente.' },
      { status: 500 }
    )
  }
}
