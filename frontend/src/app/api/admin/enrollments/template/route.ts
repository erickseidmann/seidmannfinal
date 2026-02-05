/**
 * API Route: GET /api/admin/enrollments/template
 * Retorna arquivo CSV modelo para importação de alunos
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

const CSV_HEADERS =
  'nome,email,whatsapp,dataNascimento,cpf,nomeResponsavel,cpfResponsavel,curso,frequenciaSemanal,tempoAulaMinutos,tipoAula,nomeGrupo,cep,rua,cidade,estado,numero,complemento,moraNoExterior,enderecoExterior,valorMensalidade,metodoPagamento,diaPagamento,melhoresHorarios,melhoresDiasSemana,nomeVendedor,nomeEmpresaOuIndicador,observacoes,status,escolaMatricula,escolaMatriculaOutro'

// Valores reais: status = LEAD | ACTIVE | INACTIVE | PAUSED | ... | escolaMatricula = SEIDMANN | YOUBECOME | HIGHWAY | OUTRO (se OUTRO, preencha escolaMatriculaOutro)
const CSV_EXAMPLE_PARTICULAR =
  'João Silva,joao@email.com,19987654321,2005-03-15,,,,INGLES,2,60,PARTICULAR,,13050123,Rua Exemplo,100,Campinas,SP,100,Apto 1,0,,350.00,PIX,10,manhã,seg qua,,,Observação,ACTIVE,SEIDMANN,'
const CSV_EXAMPLE_GRUPO =
  'Maria Santos,maria@email.com,19991234567,2010-05-20,,,,ESPANHOL,1,60,GRUPO,Turma Kids,13050123,Rua B,200,Campinas,SP,50,,0,,280.00,PIX,5,tarde,sáb,,,Observação,LEAD,YOUBECOME,'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const csv = [CSV_HEADERS, CSV_EXAMPLE_PARTICULAR, CSV_EXAMPLE_GRUPO].join('\n')
    const BOM = '\uFEFF'
    const body = BOM + csv

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="alunos-modelo.csv"',
      },
    })
  } catch (error) {
    console.error('[api/admin/enrollments/template] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao gerar modelo' },
      { status: 500 }
    )
  }
}
