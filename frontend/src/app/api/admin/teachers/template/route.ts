/**
 * API Route: GET /api/admin/teachers/template
 * Retorna arquivo CSV modelo para importação de professores
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

// metodoPagamento: PIX | CARTAO | OUTRO | status: ACTIVE | INACTIVE | nota: 1 a 5
const CSV_HEADERS =
  'nome,email,nomePreferido,whatsapp,cpf,cnpj,valorPorHora,metodoPagamento,infosPagamento,nota,status'

const CSV_EXAMPLE_1 =
  'Maria Silva,maria.silva@email.com,Maria,19987654321,12345678901,,85.50,PIX,Chave PIX: maria@email.com,5,ACTIVE'
const CSV_EXAMPLE_2 =
  'João Santos,joao@email.com,João,19991234567,,,100.00,CARTAO,,4,ACTIVE'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const csv = [CSV_HEADERS, CSV_EXAMPLE_1, CSV_EXAMPLE_2].join('\n')
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
