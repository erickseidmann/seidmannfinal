/**
 * API Route: GET /api/admin/teachers/template
 * Retorna arquivo CSV modelo para importação de professores
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

const CSV_HEADERS =
  'nome,email,nomePreferido,whatsapp,cpf,cnpj,valorPorHora,metodoPagamento,infosPagamento,nota,status'
const CSV_EXAMPLE =
  'Maria Silva,maria@email.com,Maria,11999999999,,,,,5,ACTIVE'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const csv = [CSV_HEADERS, CSV_EXAMPLE].join('\n')
    const BOM = '\uFEFF'
    const body = BOM + csv

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition':
          'attachment; filename="professores-modelo.csv"',
      },
    })
  } catch (error) {
    console.error('[api/admin/teachers/template] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao gerar modelo' },
      { status: 500 }
    )
  }
}
