import {
  applyCompetenciaVinculadaMarker,
  parseCompetenciaVinculada,
  resolveCompetenciaExibicao,
} from '@/lib/admin-movimentacao'

describe('competencia vinculada movimentação', () => {
  it('parseia marcador MM/YYYY', () => {
    expect(
      parseCompetenciaVinculada('[COMPETENCIA_VINCULADA:03/2026] [TIPO:ENTRADA] pix')
    ).toEqual({ month: 3, year: 2026 })
  })

  it('aplica marcador quando referência difere do extrato', () => {
    expect(
      applyCompetenciaVinculadaMarker('[TIPO:ENTRADA] pix', {
        rowYear: 2026,
        rowMonth: 5,
        vinculadaYear: 2026,
        vinculadaMonth: 3,
        includeMarker: true,
      })
    ).toBe('[COMPETENCIA_VINCULADA:03/2026] [TIPO:ENTRADA] pix')
  })

  it('remove marcador quando referência igual ao extrato', () => {
    expect(
      applyCompetenciaVinculadaMarker('[COMPETENCIA_VINCULADA:05/2026] [TIPO:ENTRADA] pix', {
        rowYear: 2026,
        rowMonth: 5,
        vinculadaYear: 2026,
        vinculadaMonth: 5,
        includeMarker: true,
      })
    ).toBe('[TIPO:ENTRADA] pix')
  })

  it('exibe seta quando referência difere', () => {
    const exib = resolveCompetenciaExibicao(
      { year: 2026, month: 5, description: '[COMPETENCIA_VINCULADA:03/2026]' },
      { year: 2026, month: 3 }
    )
    expect(exib.referenciaDiferente).toBe(true)
    expect(exib.referencia).toBe('03/2026')
    expect(exib.extrato).toBe('05/2026')
  })
})
