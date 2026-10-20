import { addDays, differenceInCalendarDays, endOfMonth, format, startOfMonth } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { ISODate } from '../types'

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** "YYYY-MM-DD"를 로컬 자정 Date로 변환한다. (new Date("YYYY-MM-DD")는 UTC로 해석되므로 쓰지 않는다) */
export function fromISO(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toISO(date: Date): ISODate {
  return format(date, 'yyyy-MM-dd')
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISO(now)
}

export function isValidISO(value: unknown): value is ISODate {
  if (typeof value !== 'string') return false
  const m = ISO_RE.exec(value)
  if (!m) return false
  return toISO(fromISO(value)) === value
}

export function addDaysISO(iso: ISODate, days: number): ISODate {
  return toISO(addDays(fromISO(iso), days))
}

/** a - b (일 단위) */
export function diffDays(a: ISODate, b: ISODate): number {
  return differenceInCalendarDays(fromISO(a), fromISO(b))
}

/** 시작일과 종료일을 모두 포함한 일수 */
export function spanDays(start: ISODate, end: ISODate): number {
  return diffDays(end, start) + 1
}

export function minISO(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b
}

export function maxISO(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b
}

export function startOfMonthISO(iso: ISODate): ISODate {
  return toISO(startOfMonth(fromISO(iso)))
}

export function endOfMonthISO(iso: ISODate): ISODate {
  return toISO(endOfMonth(fromISO(iso)))
}

/** 0=일 ... 6=토 */
export function weekdayOf(iso: ISODate): number {
  return fromISO(iso).getDay()
}

/** "10월 20일(화)" */
export function formatKorean(iso: ISODate): string {
  return format(fromISO(iso), 'M월 d일(EEE)', { locale: ko })
}

/** "10/20" */
export function formatShort(iso: ISODate): string {
  return format(fromISO(iso), 'M/d')
}

/** "10/20(화)" */
export function formatShortWithDay(iso: ISODate): string {
  return format(fromISO(iso), 'M/d(EEE)', { locale: ko })
}

/** "2026.10.20" */
export function formatDotted(iso: ISODate): string {
  return format(fromISO(iso), 'yyyy.M.d')
}

export function weekdayLabel(iso: ISODate): string {
  return format(fromISO(iso), 'EEE', { locale: ko })
}

export function nowStamp(): string {
  return new Date().toISOString()
}
