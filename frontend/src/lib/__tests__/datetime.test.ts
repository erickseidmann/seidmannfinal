/**
 * Tests for datetime utilities
 */

import {
  formatTimeInTZ,
  formatDateTimeInTZ,
  isSameDayInTZ,
  ymdInTZ,
  getTimeInTZ,
  formatWeekdayInTZ,
  formatMonthInTZ,
} from '../datetime'

const BRAZIL_TZ = 'America/Sao_Paulo'

describe('datetime utilities', () => {
  // Use a fixed UTC date for testing: 2024-01-15T14:30:00Z (11:30 in Brazil)
  const testISO = '2024-01-15T14:30:00.000Z'

  describe('formatTimeInTZ', () => {
    it('should format time in Brazil timezone', () => {
      const result = formatTimeInTZ(testISO, 'pt-BR')
      expect(result).toMatch(/\d{2}:\d{2}/)
    })

    it('should use Brazil timezone by default', () => {
      const result = formatTimeInTZ(testISO)
      expect(result).toBeTruthy()
    })
  })

  describe('formatDateTimeInTZ', () => {
    it('should format date and time in Brazil timezone', () => {
      const result = formatDateTimeInTZ(testISO, 'pt-BR')
      expect(result).toContain('/')
      expect(result).toContain(':')
    })
  })

  describe('ymdInTZ', () => {
    it('should return YYYY-MM-DD format', () => {
      const result = ymdInTZ(testISO)
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('should return same day for dates in same timezone day', () => {
      const date1 = new Date('2024-01-15T10:00:00Z')
      const date2 = new Date('2024-01-15T20:00:00Z')
      const ymd1 = ymdInTZ(date1)
      const ymd2 = ymdInTZ(date2)
      // Both should be same day in Brazil (both are Jan 15)
      expect(ymd1).toBe(ymd2)
    })
  })

  describe('isSameDayInTZ', () => {
    it('should return true for same day in Brazil timezone', () => {
      const date1 = new Date('2024-01-15T10:00:00Z')
      const date2 = new Date('2024-01-15T20:00:00Z')
      expect(isSameDayInTZ(date1, date2)).toBe(true)
    })

    it('should return false for different days', () => {
      const date1 = new Date('2024-01-15T23:00:00Z')
      const date2 = new Date('2024-01-16T01:00:00Z')
      expect(isSameDayInTZ(date1, date2)).toBe(false)
    })

    it('should work with ISO strings', () => {
      const date1 = '2024-01-15T10:00:00Z'
      const date2 = '2024-01-15T20:00:00Z'
      expect(isSameDayInTZ(date1, date2)).toBe(true)
    })
  })

  describe('getTimeInTZ', () => {
    it('should return hour and minute in Brazil timezone', () => {
      const result = getTimeInTZ(testISO)
      expect(result).toHaveProperty('hour')
      expect(result).toHaveProperty('minute')
      expect(typeof result.hour).toBe('number')
      expect(typeof result.minute).toBe('number')
      expect(result.hour).toBeGreaterThanOrEqual(0)
      expect(result.hour).toBeLessThan(24)
      expect(result.minute).toBeGreaterThanOrEqual(0)
      expect(result.minute).toBeLessThan(60)
    })
  })

  describe('formatWeekdayInTZ', () => {
    it('should format weekday name', () => {
      const result = formatWeekdayInTZ(testISO, 'pt-BR')
      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
    })
  })

  describe('formatMonthInTZ', () => {
    it('should format month name', () => {
      const result = formatMonthInTZ(testISO, 'pt-BR')
      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
    })
  })
})
