import {
  enrollmentEligibleForBoleto,
  enrollmentPaysByBoleto,
  isCartaoPayment,
  isPixOnlyPayment,
} from '@/lib/boleto-eligibility'

describe('boleto-eligibility', () => {
  it('exclui cartão', () => {
    expect(isCartaoPayment('CARTAO', null)).toBe(true)
    expect(enrollmentEligibleForBoleto({ metodoPagamento: 'CARTAO' })).toBe(false)
  })

  it('exclui PIX exclusivo', () => {
    expect(isPixOnlyPayment('PIX', null)).toBe(true)
    expect(enrollmentEligibleForBoleto({ metodoPagamento: 'PIX' })).toBe(false)
  })

  it('inclui boleto explícito', () => {
    expect(enrollmentPaysByBoleto({ metodoPagamento: 'BOLETO' })).toBe(true)
    expect(enrollmentEligibleForBoleto({ metodoPagamento: 'BOLETO' })).toBe(true)
  })

  it('exclui bolsista e empresa', () => {
    expect(enrollmentEligibleForBoleto({ bolsista: true, metodoPagamento: 'BOLETO' })).toBe(false)
    expect(
      enrollmentEligibleForBoleto({ faturamentoTipo: 'EMPRESA', metodoPagamento: 'BOLETO' })
    ).toBe(false)
  })

  it('permite legado sem método (exceto PIX/cartão)', () => {
    expect(enrollmentEligibleForBoleto({ metodoPagamento: null })).toBe(true)
  })
})
