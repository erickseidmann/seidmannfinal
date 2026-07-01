import { toDateKeyInTZ } from '@/lib/datetime'
import {
  assignStableSeq,
  buildProviderPaymentId,
  addDaysToDateKey,
  parseSantanderTransactionDate,
  parseSantanderPayerNameFromComplement,
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

  it('getSantanderSyncDateWindow retorna hoje-3 até hoje+1', () => {
    const today = toDateKeyInTZ(new Date())
    const { initialDate, finalDate } = getSantanderSyncDateWindow()
    expect(initialDate).toBe(addDaysToDateKey(today, -3))
    expect(finalDate).toBe(addDaysToDateKey(today, 1))
  })

  it('parseSantanderPayerNameFromComplement ignora só documento ou CPF', () => {
    expect(parseSantanderPayerNameFromComplement('39241063807')).toBeUndefined()
    expect(parseSantanderPayerNameFromComplement('CPF')).toBeUndefined()
  })

  it('parseSantanderPayerNameFromComplement extrai nome quando houver texto', () => {
    expect(parseSantanderPayerNameFromComplement('Maria Silva 39241063807')).toBe(
      'Maria Silva'
    )
  })
})
