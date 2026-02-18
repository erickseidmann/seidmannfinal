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
 * Gets a Date object representing a date in the given timezone.
 * Uses UTC noon internally so the result is consistent regardless of user's browser timezone.
 * Essential for professors in different countries (e.g. South Africa) to see correct dates.
 */
export function getDateInTZ(date: Date | string, tz: string = BRAZIL_TZ): Date {
  const d = typeof date === 'string' ? new Date(date) : date
  const ymd = ymdInTZ(d, tz)
  const [year, month, day] = ymd.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
}

/**
 * Returns YYYY-MM-DD for a date in the given timezone (for use as date keys, holidays, etc.)
 */
export function toDateKeyInTZ(date: Date | string, tz: string = BRAZIL_TZ): string {
  return ymdInTZ(date, tz)
}

/**
 * Gets the start of the week (Sunday 00:00) in the given timezone for calendar display.
 * Ensures professors in different countries see the same week boundaries as Brazil.
 */
export function getStartOfWeekInTZ(date: Date | string, tz: string = BRAZIL_TZ): Date {
  const d = typeof date === 'string' ? new Date(date) : date
  const ymd = ymdInTZ(d, tz)
  const [year, month, day] = ymd.split('-').map(Number)
  const dateInTz = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' })
  const weekday = formatter.format(dateInTz)
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const dayOfWeek = dayMap[weekday] ?? 0
  const result = new Date(Date.UTC(year, month - 1, day - dayOfWeek, 12, 0, 0))
  return result
}

/**
 * Gets the start of the month in the given timezone for calendar display.
 */
export function getStartOfMonthInTZ(date: Date | string, tz: string = BRAZIL_TZ): Date {
  const d = typeof date === 'string' ? new Date(date) : date
  const ymd = ymdInTZ(d, tz)
  const [year, month] = ymd.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, 1, 12, 0, 0))
}

/**
 * Adds n days to a Date (UTC-based, for use with getStartOfWeekInTZ etc.).
 */
export function addDaysInTZ(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000)
}

/**
 * Adds n months to a Date (UTC-based).
 */
export function addMonthsInTZ(d: Date, n: number): Date {
  const r = new Date(d)
  r.setUTCMonth(r.getUTCMonth() + n)
  return r
}

/**
 * Day of week (0=Sun, 6=Sat) in the given timezone.
 */
export function getDayOfWeekInTZ(date: Date | string, tz: string = BRAZIL_TZ): number {
  const d = typeof date === 'string' ? new Date(date) : date
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' })
  const weekday = formatter.format(d)
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return dayMap[weekday] ?? 0
}

/**
 * Day number (1-31), month (0-11), year in the given timezone.
 */
export function getDatePartsInTZ(date: Date | string, tz: string = BRAZIL_TZ): { day: number; month: number; year: number } {
  const d = typeof date === 'string' ? new Date(date) : date
  const ymd = ymdInTZ(d, tz)
  const [year, month, day] = ymd.split('-').map(Number)
  return { day, month: month - 1, year }
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
