import {
  periodoTerminoRangeForCompetenceMonthBrt,
  teacherPaymentBoundsForCompetenceMonth,
  teacherPaymentCompetenceKeyFromPeriodoTermino,
} from '@/lib/teacher-paid-period'
import { pickTeacherPaymentMonthRowContaining } from '@/lib/teacher-payment-month-resolve'

const DUE_DAY_25 = 25

function dueDay25Rows() {
  const junho = teacherPaymentBoundsForCompetenceMonth(2026, 6, DUE_DAY_25)
  const julho = teacherPaymentBoundsForCompetenceMonth(2026, 7, DUE_DAY_25)
  return [
    { year: 2026, month: 6, periodoInicio: junho.inicio, periodoTermino: junho.termino },
    { year: 2026, month: 7, periodoInicio: julho.inicio, periodoTermino: julho.termino },
  ]
}

describe('teacherPaymentCompetenceKeyFromPeriodoTermino', () => {
  it('maio/2026 civil: termino 2026-06-01T03:00:00Z → competência 5/2026', () => {
    const key = teacherPaymentCompetenceKeyFromPeriodoTermino(
      new Date('2026-06-01T03:00:00.000Z')
    )
    expect(key).toEqual({ year: 2026, month: 5 })
  })

  it('abril/2026 due 25: termino 2026-04-25T00:00:00Z → competência 4/2026', () => {
    const key = teacherPaymentCompetenceKeyFromPeriodoTermino(new Date('2026-04-25T00:00:00.000Z'))
    expect(key).toEqual({ year: 2026, month: 4 })
  })
})

describe('teacherPaymentBoundsForCompetenceMonth', () => {
  it('due day 1: tela junho → período maio (termino 2026-06-01Z)', () => {
    const p = teacherPaymentBoundsForCompetenceMonth(2026, 6, 1)
    expect(p.inicio.toISOString()).toBe('2026-05-01T03:00:00.000Z')
    expect(p.termino.toISOString()).toBe('2026-06-01T03:00:00.000Z')
    expect(teacherPaymentCompetenceKeyFromPeriodoTermino(p.termino)).toEqual({
      year: 2026,
      month: 5,
    })
  })

  it('due day 1: tela março → período fevereiro', () => {
    const p = teacherPaymentBoundsForCompetenceMonth(2026, 3, 1)
    expect(p.termino.toISOString()).toBe('2026-03-01T03:00:00.000Z')
    expect(teacherPaymentCompetenceKeyFromPeriodoTermino(p.termino)).toEqual({
      year: 2026,
      month: 2,
    })
  })

  it('due day 25: competência maio → chave alinhada ao termino', () => {
    const p = teacherPaymentBoundsForCompetenceMonth(2026, 5, 25)
    expect(teacherPaymentCompetenceKeyFromPeriodoTermino(p.termino)).toEqual({
      year: 2026,
      month: 5,
    })
  })

  it('due day 10: tela junho → 10/05 a 10/06', () => {
    const p = teacherPaymentBoundsForCompetenceMonth(2026, 6, 10)
    expect(p.inicio.toISOString()).toBe('2026-05-10T03:00:00.000Z')
    expect(p.termino.toISOString()).toBe('2026-06-10T03:00:00.000Z')
  })
})

describe('pickTeacherPaymentMonthRowContaining', () => {
  const rows = dueDay25Rows()

  it('25/06 14h BRT: tolerância de junho vence julho recém-aberto', () => {
    const pick = pickTeacherPaymentMonthRowContaining(rows, new Date('2026-06-25T17:00:00.000Z'))
    expect(pick).toEqual(rows[0])
  })

  it('26/06: ainda na tolerância de junho', () => {
    const pick = pickTeacherPaymentMonthRowContaining(rows, new Date('2026-06-26T17:00:00.000Z'))
    expect(pick).toEqual(rows[0])
  })

  it('28/06: fora da tolerância de junho → julho (dentro)', () => {
    const pick = pickTeacherPaymentMonthRowContaining(rows, new Date('2026-06-28T17:00:00.000Z'))
    expect(pick).toEqual(rows[1])
  })

  it('24/06: junho ainda dentro do período', () => {
    const pick = pickTeacherPaymentMonthRowContaining(rows, new Date('2026-06-24T17:00:00.000Z'))
    expect(pick).toEqual(rows[0])
  })
})

describe('periodoTerminoRangeForCompetenceMonthBrt', () => {
  it('inclui termino dia 1 do mês (pagamento dia 1 na tela de junho)', () => {
    const range = periodoTerminoRangeForCompetenceMonthBrt(2026, 6)
    const mayPeriodEnd = new Date('2026-06-01T03:00:00.000Z')
    expect(mayPeriodEnd.getTime()).toBeGreaterThan(range.gt.getTime())
    expect(mayPeriodEnd.getTime()).toBeLessThanOrEqual(range.lte.getTime())
  })

  it('inclui termino de competência maio e exclui julho', () => {
    const range = periodoTerminoRangeForCompetenceMonthBrt(2026, 5)
    const mayEnd = new Date('2026-06-01T03:00:00.000Z')
    const julyStart = new Date('2026-07-01T03:00:00.000Z')
    expect(mayEnd.getTime()).toBeGreaterThan(range.gt.getTime())
    expect(mayEnd.getTime()).toBeLessThanOrEqual(range.lte.getTime())
    expect(julyStart.getTime()).toBeGreaterThan(range.lte.getTime())
  })
})
