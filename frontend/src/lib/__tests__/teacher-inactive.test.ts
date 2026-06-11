import { isTeacherPayableInMonth } from '../teacher-inactive'

describe('isTeacherPayableInMonth', () => {
  it('ativo sempre aparece', () => {
    expect(isTeacherPayableInMonth('ACTIVE', null, 2026, 5)).toBe(true)
  })

  it('inativo em abril: abril sim, maio não', () => {
    const inactiveAt = new Date('2026-04-15T12:00:00.000Z')
    expect(isTeacherPayableInMonth('INACTIVE', inactiveAt, 2026, 4)).toBe(true)
    expect(isTeacherPayableInMonth('INACTIVE', inactiveAt, 2026, 5)).toBe(false)
  })

  it('inativo sem data não aparece', () => {
    expect(isTeacherPayableInMonth('INACTIVE', null, 2026, 4)).toBe(false)
  })
})
