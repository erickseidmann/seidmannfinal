import {
  assignStableSeq,
  buildProviderPaymentId,
  addDaysToDateKey,
  parseSantanderTransactionDate,
  getSantanderSyncDateWindow,
} from '../santander-statement'
import type { SantanderStatementEntry } from '../santander-statement'

describe('santander-statement', () => {
  it('parseSantanderTransactionDate DD/MM/YYYY', () => {
    const p = parseSantanderTransactionDate('05/06/2026')
    expect(p?.dateKey).toBe('2026-06-05')
  })

  it('addDaysToDateKey', () => {
    expect(addDaysToDateKey('2026-06-05', -1)).toBe('2026-06-04')
  })

  it('assignStableSeq numera duplicatas iguais', () => {
    const entries: SantanderStatementEntry[] = [
      {
        creditDebitType: 'CREDITO',
        transactionName: 'PIX RECEBIDO',
        historicComplement: '39241063807',
        amount: '10.00',
        transactionDate: '05/06/2026',
      },
      {
        creditDebitType: 'CREDITO',
        transactionName: 'PIX RECEBIDO',
        historicComplement: '39241063807',
        amount: '10.00',
        transactionDate: '05/06/2026',
      },
    ]
    const prepared = assignStableSeq(entries)
    expect(prepared).toHaveLength(2)
    expect(buildProviderPaymentId(prepared[0])).toBe(
      'SANT:2026-06-05:1000:39241063807:1'
    )
    expect(buildProviderPaymentId(prepared[1])).toBe(
      'SANT:2026-06-05:1000:39241063807:2'
    )
  })

  it('ignora DEBITO', () => {
    const prepared = assignStableSeq([
      {
        creditDebitType: 'DEBITO',
        transactionName: 'PIX',
        amount: '10.00',
        transactionDate: '05/06/2026',
      },
    ])
    expect(prepared).toHaveLength(0)
  })

  it('getSantanderSyncDateWindow retorna ontem e hoje', () => {
    const { initialDate, finalDate } = getSantanderSyncDateWindow()
    expect(initialDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(finalDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(addDaysToDateKey(finalDate, -1)).toBe(initialDate)
  })
})
