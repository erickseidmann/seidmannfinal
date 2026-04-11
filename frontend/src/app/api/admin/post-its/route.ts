/**
 * GET  /api/admin/post-its — lista post-its do admin logado
 * PUT  /api/admin/post-its — substitui o quadro (máx. 20 notas)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

const MAX_NOTES = 20
const MAX_TEXT_PER_NOTE = 20000
const MAX_HUE = 5

type BoardNote = { id: string; text: string; hue: number }

function newNoteId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `n-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

function parseBoard(raw: unknown): BoardNote[] | null {
  if (raw == null) return null
  if (typeof raw !== 'object' || raw === null) return null
  const notes = (raw as { notes?: unknown }).notes
  if (!Array.isArray(notes)) return null
  const out: BoardNote[] = []
  for (const n of notes) {
    if (!n || typeof n !== 'object') continue
    const o = n as Record<string, unknown>
    const id = typeof o.id === 'string' && o.id.length > 0 ? o.id : newNoteId()
    let text = typeof o.text === 'string' ? o.text : ''
    if (text.length > MAX_TEXT_PER_NOTE) text = text.slice(0, MAX_TEXT_PER_NOTE)
    let hue = typeof o.hue === 'number' && Number.isFinite(o.hue) ? Math.floor(o.hue) : 0
    if (hue < 0 || hue > MAX_HUE) hue = 0
    out.push({ id, text, hue })
  }
  return out.slice(0, MAX_NOTES)
}

function sanitizeIncoming(body: unknown): BoardNote[] | null {
  if (!body || typeof body !== 'object') return null
  const notes = (body as { notes?: unknown }).notes
  if (!Array.isArray(notes)) return null
  if (notes.length > MAX_NOTES) return null
  const out: BoardNote[] = []
  for (const n of notes) {
    if (!n || typeof n !== 'object') return null
    const o = n as Record<string, unknown>
    const id = typeof o.id === 'string' && o.id.length <= 128 ? o.id : newNoteId()
    let text = typeof o.text === 'string' ? o.text : ''
    if (text.length > MAX_TEXT_PER_NOTE) text = text.slice(0, MAX_TEXT_PER_NOTE)
    let hue = typeof o.hue === 'number' && Number.isFinite(o.hue) ? Math.floor(o.hue) : 0
    if (hue < 0 || hue > MAX_HUE) hue = 0
    out.push({ id, text, hue })
  }
  return out
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const userId = auth.session.sub
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { adminPostItsBoard: true },
    })

    const parsed = parseBoard(user?.adminPostItsBoard)
    const notes =
      parsed && parsed.length > 0
        ? parsed
        : [{ id: newNoteId(), text: '', hue: 0 }]

    return NextResponse.json({ ok: true, data: { notes } })
  } catch (e) {
    console.error('[api/admin/post-its GET]', e)
    return NextResponse.json({ ok: false, message: 'Erro ao carregar post-its' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ ok: false, message: 'JSON inválido' }, { status: 400 })
    }

    const notes = sanitizeIncoming(body)
    if (!notes) {
      return NextResponse.json(
        { ok: false, message: `Envie { notes } com até ${MAX_NOTES} itens` },
        { status: 400 }
      )
    }

    const userId = auth.session.sub
    await prisma.user.update({
      where: { id: userId },
      data: { adminPostItsBoard: { version: 1, notes } },
    })

    return NextResponse.json({ ok: true, data: { notes } })
  } catch (e) {
    console.error('[api/admin/post-its PUT]', e)
    return NextResponse.json({ ok: false, message: 'Erro ao salvar post-its' }, { status: 500 })
  }
}
