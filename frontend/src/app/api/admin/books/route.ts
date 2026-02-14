/**
 * API Route: GET /api/admin/books - Lista livros do catálogo
 * POST /api/admin/books - Cria livro (FormData: nome, level, totalPaginas, imprimivel, pdf, capa)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

const BOOK_LEVELS = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'B4', 'C1', 'C2'] as const

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    if (!prisma.book) {
      return NextResponse.json(
        { ok: false, message: 'Modelo Book não disponível. Execute: npx prisma generate' },
        { status: 503 }
      )
    }

    const books = await prisma.book.findMany({
      orderBy: [{ level: 'asc' }, { nome: 'asc' }],
    })

    return NextResponse.json({
      ok: true,
      data: books.map((b) => ({
        id: b.id,
        nome: b.nome,
        level: b.level,
        totalPaginas: b.totalPaginas,
        imprimivel: b.imprimivel,
        pdfPath: b.pdfPath,
        capaPath: b.capaPath,
        criadoEm: b.criadoEm.toISOString(),
      })),
    })
  } catch (error) {
    console.error('[api/admin/books] Erro ao listar:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar livros' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    if (!prisma.book) {
      return NextResponse.json(
        { ok: false, message: 'Modelo Book não disponível. Execute: npx prisma generate' },
        { status: 503 }
      )
    }

    const formData = await request.formData().catch(() => null)
    if (!formData) {
      return NextResponse.json(
        { ok: false, message: 'Envie os dados via FormData' },
        { status: 400 }
      )
    }

    const nome = String(formData.get('nome') || '').trim()
    const level = String(formData.get('level') || '').toUpperCase()
    const totalPaginas = parseInt(String(formData.get('totalPaginas') || '0'), 10)
    const imprimivel = formData.get('imprimivel') === 'true' || formData.get('imprimivel') === '1'
    const pdfFile = formData.get('pdf') as File | null
    const capaFile = formData.get('capa') as File | null

    if (!nome) {
      return NextResponse.json(
        { ok: false, message: 'Nome é obrigatório' },
        { status: 400 }
      )
    }
    if (!BOOK_LEVELS.includes(level as (typeof BOOK_LEVELS)[number])) {
      return NextResponse.json(
        { ok: false, message: `Nível inválido. Use: ${BOOK_LEVELS.join(', ')}` },
        { status: 400 }
      )
    }
    if (isNaN(totalPaginas) || totalPaginas < 1) {
      return NextResponse.json(
        { ok: false, message: 'Total de páginas deve ser um número positivo' },
        { status: 400 }
      )
    }
    if (!pdfFile || !(pdfFile instanceof File) || pdfFile.size === 0) {
      return NextResponse.json(
        { ok: false, message: 'Arquivo PDF é obrigatório' },
        { status: 400 }
      )
    }
    const pdfExt = path.extname(pdfFile.name).toLowerCase()
    if (pdfExt !== '.pdf') {
      return NextResponse.json(
        { ok: false, message: 'O arquivo deve ser PDF' },
        { status: 400 }
      )
    }
    if (!capaFile || !(capaFile instanceof File) || capaFile.size === 0) {
      return NextResponse.json(
        { ok: false, message: 'Imagem de capa é obrigatória' },
        { status: 400 }
      )
    }
    const capaExt = path.extname(capaFile.name).toLowerCase()
    const allowedCapa = ['.jpg', '.jpeg', '.png', '.webp']
    if (!allowedCapa.includes(capaExt)) {
      return NextResponse.json(
        { ok: false, message: 'Capa deve ser JPG, PNG ou WebP' },
        { status: 400 }
      )
    }

    const book = await prisma.book.create({
      data: {
        nome,
        level,
        totalPaginas,
        imprimivel,
        pdfPath: null,
        capaPath: null,
      },
    })

    const baseDir = path.join(process.cwd(), 'public', 'uploads', 'books', book.id)
    await mkdir(baseDir, { recursive: true })

    const pdfPath = `livro${pdfExt}`
    const capaPath = `capa${capaExt}`
    const pdfFullPath = path.join(baseDir, pdfPath)
    const capaFullPath = path.join(baseDir, capaPath)

    const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer())
    const capaBuffer = Buffer.from(await capaFile.arrayBuffer())
    await writeFile(pdfFullPath, pdfBuffer)
    await writeFile(capaFullPath, capaBuffer)

    const relativePdfPath = `/uploads/books/${book.id}/${pdfPath}`
    const relativeCapaPath = `/uploads/books/${book.id}/${capaPath}`

    await prisma.book.update({
      where: { id: book.id },
      data: {
        pdfPath: relativePdfPath,
        capaPath: relativeCapaPath,
      },
    })

    return NextResponse.json(
      {
        ok: true,
        data: {
          id: book.id,
          nome,
          level,
          totalPaginas,
          imprimivel,
          pdfPath: relativePdfPath,
          capaPath: relativeCapaPath,
        },
        message: 'Livro cadastrado com sucesso',
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[api/admin/books] Erro ao criar:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao cadastrar livro' },
      { status: 500 }
    )
  }
}
