import { normalizeMeetingLinkKey } from '../teacher-link-sala-pool'

describe('normalizeMeetingLinkKey', () => {
  it('normaliza e ignora vazio', () => {
    expect(normalizeMeetingLinkKey('  https://meet.google.com/abc  ')).toBe(
      'https://meet.google.com/abc'
    )
    expect(normalizeMeetingLinkKey('')).toBeNull()
    expect(normalizeMeetingLinkKey(null)).toBeNull()
  })

  it('trata links iguais com caixa diferente como o mesmo', () => {
    expect(normalizeMeetingLinkKey('HTTPS://MEET.GOOGLE.COM/ABC')).toBe(
      normalizeMeetingLinkKey('https://meet.google.com/abc')
    )
  })
})
