import {
  parseExtratoAllLines,
  validateExtratoCompetencia,
} from '@/lib/bank-extrato-parse'

const CSV_MAIO = `Data;Transação;Tipo Transação;Identificação;Valor
01/05/2026;Pix recebido;Crédito;Cliente A;100,00
15/05/2026;Tarifa;Débito;Banco;-5,00`

const CSV_JUNHO = `Data;Transação;Tipo Transação;Identificação;Valor
01/06/2026;Pix recebido;Crédito;Cliente B;200,00`

describe('validateExtratoCompetencia', () => {
  it('aceita CSV da competência selecionada', () => {
    const result = validateExtratoCompetencia(CSV_JUNHO, '.csv', 2026, 6)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.lines).toHaveLength(1)
      expect(result.format).toBe('csv')
    }
  })

  it('rejeita CSV de outro mês', () => {
    const result = validateExtratoCompetencia(CSV_MAIO, '.csv', 2026, 6)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('Maio/2026')
      expect(result.message).toContain('Junho/2026')
    }
  })

  it('rejeita CSV sem linhas válidas', () => {
    const result = validateExtratoCompetencia('col1;col2\n', '.csv', 2026, 6)
    expect(result.ok).toBe(false)
  })

  it('permite PDF/imagem sem validar datas', () => {
    const result = validateExtratoCompetencia('%PDF-1.4', '.pdf', 2026, 6)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.format).toBe('none')
      expect(result.lines).toHaveLength(0)
    }
  })
})

describe('parseExtratoAllLines', () => {
  it('lê todas as linhas do CSV sem filtrar mês', () => {
    const { lines, format } = parseExtratoAllLines(CSV_MAIO, '.csv')
    expect(format).toBe('csv')
    expect(lines).toHaveLength(2)
    expect(lines.every((l) => l.month === 5 && l.year === 2026)).toBe(true)
  })
})
