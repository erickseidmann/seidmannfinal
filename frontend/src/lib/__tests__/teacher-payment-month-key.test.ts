import {
  periodoTerminoRangeForCompetenceMonthBrt,
  teacherPaymentBoundsForCompetenceMonth,
  teacherPaymentCompetenceKeyFromPeriodoTermino,
} from '@/lib/teacher-paid-period'

describe('teacherPaymentCompetenceKeyFromPeriodoTermino', () => {
  it('maio/2026 civil: termino 2026-06-01T00:00:00Z → competência 5/2026', () => {
    const key = teacherPaymentCompetenceKeyFromPeriodoTermino(new Date('2026-06-01T00:00:00.000Z'))
    expect(key).toEqual({ year: 2026, month: 5 })
  })

  it('abril/2026 due 25: termino 2026-04-25T00:00:00Z → competência 4/2026', () => {
    const key = teacherPaymentCompetenceKeyFromPeriodoTermino(new Date('2026-04-25T00:00:00.000Z'))
    expect(key).toEqual({ year: 2026, month: 4 })
  })
})

describe('teacherPaymentBoundsForCompetenceMonth', () => {
  it('due day 1: competência março → termino 2026-04-01Z', () => {
    const p = teacherPaymentBoundsForCompetenceMonth(2026, 3, 1)
    expect(p.termino.toISOString()).toBe('2026-04-01T03:00:00.000Z')
    expect(teacherPaymentCompetenceKeyFromPeriodoTermino(p.termino)).toEqual({
      year: 2026,
      month: 3,
    })
  })

  it('due day 25: competência maio → chave alinhada ao termino', () => {
    const p = teacherPaymentBoundsForCompetenceMonth(2026, 5, 25)
    expect(teacherPaymentCompetenceKeyFromPeriodoTermino(p.termino)).toEqual({
      year: 2026,
      month: 5,
    })
  })
})

describe('periodoTerminoRangeForCompetenceMonthBrt', () => {
  it('inclui termino de competência maio e exclui junho', () => {
    const range = periodoTerminoRangeForCompetenceMonthBrt(2026, 5)
    const mayEnd = new Date('2026-06-01T00:00:00.000Z')
    const juneStart = new Date('2026-07-01T03:00:00.000Z')
    expect(mayEnd.getTime()).toBeGreaterThan(range.gt.getTime())
    expect(mayEnd.getTime()).toBeLessThanOrEqual(range.lte.getTime())
    expect(juneStart.getTime()).toBeGreaterThan(range.lte.getTime())
  })
})
