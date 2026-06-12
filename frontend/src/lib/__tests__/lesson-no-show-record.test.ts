import {
  getCancelamentoAntecedenciaHoras,
  isLessonCancelamentoTardio,
} from '@/lib/lesson-no-show-record'

describe('isLessonCancelamentoTardio', () => {
  it('considera tardio quando falta menos de 6h (padrão)', () => {
    const lessonStart = new Date('2026-06-12T12:00:00.000Z')
    const now = new Date('2026-06-12T11:54:00.000Z')
    expect(
      isLessonCancelamentoTardio(lessonStart, null, null, now)
    ).toBe(true)
  })

  it('não é tardio com antecedência suficiente', () => {
    const lessonStart = new Date('2026-06-12T18:00:00.000Z')
    const now = new Date('2026-06-12T08:00:00.000Z')
    expect(
      isLessonCancelamentoTardio(lessonStart, null, null, now)
    ).toBe(false)
  })

  it('usa horas personalizadas da matrícula', () => {
    expect(getCancelamentoAntecedenciaHoras('YOUBECOME', null)).toBe(24)
    expect(getCancelamentoAntecedenciaHoras(null, 12)).toBe(12)
  })
})
