import { describe, expect, it } from 'vitest'
import { addDaysISO, diffDays, formatKorean, fromISO, isValidISO, spanDays, todayISO } from '../src/lib/date'
import { assignLanes } from '../src/lib/lanes'
import { AppDataError, parseAppDataJson, validateAppData } from '../src/lib/appData'
import { createSampleData } from '../src/lib/sample'

describe('날짜 유틸', () => {
  it('YYYY-MM-DD를 로컬 날짜로 해석한다 (UTC로 하루 밀리지 않음)', () => {
    const d = fromISO('2026-10-20')
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 20])
  })

  it('자정 직후·직전 시각에도 오늘 날짜는 로컬 날짜', () => {
    expect(todayISO(new Date(2026, 9, 20, 0, 5))).toBe('2026-10-20')
    expect(todayISO(new Date(2026, 9, 20, 23, 59))).toBe('2026-10-20')
  })

  it('월말·연말을 넘어 날짜를 더한다', () => {
    expect(addDaysISO('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysISO('2027-03-01', -1)).toBe('2027-02-28')
    expect(addDaysISO('2028-03-01', -1)).toBe('2028-02-29')
  })

  it('일수 차이와 기간 일수', () => {
    expect(diffDays('2027-01-01', '2026-12-31')).toBe(1)
    expect(spanDays('2026-10-21', '2026-10-28')).toBe(8)
  })

  it('한국어 날짜 표기', () => {
    expect(formatKorean('2026-10-20')).toBe('10월 20일(화)')
  })

  it('날짜 형식 검사', () => {
    expect(isValidISO('2026-02-29')).toBe(false)
    expect(isValidISO('2026-10-20')).toBe(true)
    expect(isValidISO('2026-1-2')).toBe(false)
  })
})

describe('lane 배치', () => {
  it('겹치는 구간은 다른 줄, 겹치지 않으면 같은 줄을 재사용', () => {
    const { laneOf, laneCount } = assignLanes([
      { id: 'a', start: 0, end: 5 },
      { id: 'b', start: 3, end: 8 },
      { id: 'c', start: 6, end: 9 },
      { id: 'd', start: 5, end: 5 },
    ])
    expect(laneCount).toBe(3)
    expect(laneOf.get('a')).toBe(0)
    expect(laneOf.get('b')).toBe(1)
    expect(laneOf.get('d')).toBe(2)
    expect(laneOf.get('c')).toBe(0)
  })

  it('끝나는 날과 시작하는 날이 같으면 겹친 것으로 본다', () => {
    expect(assignLanes([{ id: 'a', start: 0, end: 3 }, { id: 'b', start: 3, end: 4 }]).laneCount).toBe(2)
  })
})

describe('JSON 불러오기 검증', () => {
  it('샘플 데이터는 검증을 통과하고 왕복 후 동일하다', () => {
    const data = createSampleData('2026-10-20')
    expect(parseAppDataJson(JSON.stringify(data))).toEqual(data)
  })

  it('schemaVersion이 다르면 거부', () => {
    const data = { ...createSampleData('2026-10-20'), schemaVersion: 2 }
    expect(() => validateAppData(data)).toThrow(AppDataError)
  })

  it('JSON이 아니면 거부', () => {
    expect(() => parseAppDataJson('not json')).toThrow(AppDataError)
  })

  it('없는 프로젝트를 가리키는 항목은 거부', () => {
    const data = createSampleData('2026-10-20')
    data.blocks[0].projectId = 'nope'
    expect(() => validateAppData(data)).toThrow(/프로젝트를 찾을 수 없습니다/)
  })
})
