import {
  hasPreviousMonthPaymentPendingCurrent,
  paymentReferenceMonth,
} from '../recebimento-mes-anterior-pendente'

describe('recebimento mes anterior pendente', () => {
  it('detecta pagamento de maio recebido em junho com junho em aberto', () => {
    const dataPagamento = new Date('2026-06-04T09:00:00')
    const ref = paymentReferenceMonth(dataPagamento)
    expect(ref).toEqual({ year: 2026, month: 6 })

    const map = new Map<string, string | null>([['enr1', 'PENDING']])
    expect(
      hasPreviousMonthPaymentPendingCurrent(
        dataPagamento,
        [{ enrollmentId: 'enr1', paidYear: 2026, paidMonth: 5 }],
        null,
        map
      )
    ).toBe(true)
  })

  it('não alerta quando o mês da data também está pago', () => {
    const dataPagamento = new Date('2026-06-04T09:00:00')
    const map = new Map<string, string | null>([['enr1', 'PAGO']])
    expect(
      hasPreviousMonthPaymentPendingCurrent(
        dataPagamento,
        [{ enrollmentId: 'enr1', paidYear: 2026, paidMonth: 5 }],
        null,
        map
      )
    ).toBe(false)
  })

  it('não alerta quando quitou o mesmo mês da data', () => {
    const dataPagamento = new Date('2026-06-04T09:00:00')
    const map = new Map<string, string | null>([['enr1', 'PENDING']])
    expect(
      hasPreviousMonthPaymentPendingCurrent(
        dataPagamento,
        [{ enrollmentId: 'enr1', paidYear: 2026, paidMonth: 6 }],
        null,
        map
      )
    ).toBe(false)
  })
})
