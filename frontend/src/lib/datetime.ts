/**
 * DateTime utilities for consistent timezone handling
 * 
 * All dates are stored in UTC in the database and transmitted as ISO strings.
 * All rendering uses America/Sao_Paulo timezone for consistency.
 * 
 * This ensures teachers/students in different countries see the same times
 * relative to Brazil timezone.
 */

const BRAZIL_TZ = 'America/Sao_Paulo'

/**
 * Formats a time (HH:MM) from an ISO string in Brazil timezone
 */
export function formatTimeInTZ(iso: string, locale: string = 'pt-BR'): string {
  const date = new Date(iso)
  return new Intl.DateTimeFormat(locale, {
    timeZone: BRAZIL_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

/**
 * Formats date and time from an ISO string in Brazil timezone
 */
export function formatDateTimeInTZ(iso: string, locale: string = 'pt-BR'): string {
  const date = new Date(iso)
  return new Intl.DateTimeFormat(locale, {
    timeZone: BRAZIL_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/**
 * Formats date only (YYYY-MM-DD) from an ISO string in Brazil timezone
 */
export function ymdInTZ(date: Date | string, tz: string = BRAZIL_TZ): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/**
 * Checks if two dates are the same day in Brazil timezone
 */
export function isSameDayInTZ(a: Date | string, b: Date | string, tz: string = BRAZIL_TZ): boolean {
  return ymdInTZ(a, tz) === ymdInTZ(b, tz)
}

/**
 * Gets a Date object representing a date in Brazil timezone
 * Useful for day comparisons and calendar operations
 * Returns a Date at midnight local time representing the date in the timezone
 */
export function getDateInTZ(date: Date | string, tz: string = BRAZIL_TZ): Date {
  const d = typeof date === 'string' ? new Date(date) : date
  const ymd = ymdInTZ(d, tz)
  const [year, month, day] = ymd.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * Gets hours and minutes from an ISO string in Brazil timezone
 */
export function getTimeInTZ(iso: string, tz: string = BRAZIL_TZ): { hour: number; minute: number } {
  const date = new Date(iso)
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(date)
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10)
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10)
  return { hour, minute }
}

/**
 * Formats weekday name in Brazil timezone
 */
export function formatWeekdayInTZ(date: Date | string, locale: string, tz: string = BRAZIL_TZ): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    weekday: 'short',
  }).format(d)
}

/**
 * Formats month name in Brazil timezone
 */
export function formatMonthInTZ(date: Date | string, locale: string, tz: string = BRAZIL_TZ): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    month: 'long',
  }).format(d)
}
