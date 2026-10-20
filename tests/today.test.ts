import { describe, expect, it } from 'vitest'
import { computeTodayGroups } from '../src/lib/today'
import type { Block, Project } from '../src/types'

const project: Project = {
  id: 'p1', name: 'A', color: '#2563EB', startDate: '2026-01-01', endDate: '2027-12-31',
  order: 0, archived: false, createdAt: '', updatedAt: '',
}

let seq = 0
function period(startDate: string, endDate: string, extra: Partial<Block> = {}): Block {
  return { id: `b${++seq}`, projectId: 'p1', kind: 'period', title: `기간${seq}`, startDate, endDate, done: false, createdAt: '', updatedAt: '', ...extra }
}
function marker(date: string, extra: Partial<Block> = {}): Block {
  return period(date, date, { kind: 'marker', title: `마커${seq}`, ...extra })
}

const ids = (items: { block: Block }[]) => items.map((i) => i.block.id)

describe('computeTodayGroups', () => {
  it('시작일 당일의 기간 블럭은 진행 중', () => {
    const b = period('2026-10-20', '2026-10-25')
    const g = computeTodayGroups([project], [b], '2026-10-20')
    expect(ids(g.inProgress)).toEqual([b.id])
    expect(g.inProgress[0].dDay).toBe(5)
  })

  it('종료일 당일의 기간 블럭은 오늘 마감 (진행 중에 중복되지 않음)', () => {
    const b = period('2026-10-15', '2026-10-20')
    const g = computeTodayGroups([project], [b], '2026-10-20')
    expect(ids(g.dueToday)).toEqual([b.id])
    expect(g.inProgress).toEqual([])
  })

  it('하루짜리 기간 블럭이 오늘이면 오늘 마감', () => {
    const b = period('2026-10-20', '2026-10-20')
    const g = computeTodayGroups([project], [b], '2026-10-20')
    expect(ids(g.dueToday)).toEqual([b.id])
  })

  it('아직 시작하지 않은 기간 블럭은 어느 그룹에도 없음', () => {
    const b = period('2026-10-21', '2026-10-30')
    const g = computeTodayGroups([project], [b], '2026-10-20')
    expect([...g.inProgress, ...g.dueToday, ...g.upcoming, ...g.overdue]).toEqual([])
  })

  it('오늘 마커는 오늘 마감, 7일 이내 마커는 D-n, 8일 뒤는 제외', () => {
    const today = marker('2026-10-20')
    const d1 = marker('2026-10-21')
    const d7 = marker('2026-10-27')
    const d8 = marker('2026-10-28')
    const g = computeTodayGroups([project], [today, d1, d7, d8], '2026-10-20')
    expect(ids(g.dueToday)).toEqual([today.id])
    expect(ids(g.upcoming)).toEqual([d1.id, d7.id])
    expect(g.upcoming.map((i) => i.dDay)).toEqual([1, 7])
  })

  it('지난 미완료 항목은 지난 미완료, 완료한 항목은 제외', () => {
    const late = period('2026-10-01', '2026-10-19')
    const lateMarker = marker('2026-10-10')
    const doneLate = period('2026-10-01', '2026-10-10', { done: true })
    const g = computeTodayGroups([project], [late, lateMarker, doneLate], '2026-10-20')
    expect(ids(g.overdue)).toEqual([lateMarker.id, late.id])
    expect(g.overdue.map((i) => i.dDay)).toEqual([-10, -1])
  })

  it('완료한 진행 중 블럭은 표시하지 않음', () => {
    const b = period('2026-10-10', '2026-10-30', { done: true })
    const g = computeTodayGroups([project], [b], '2026-10-20')
    expect(g.inProgress).toEqual([])
  })

  it('월말 경계: 10/31 → 11/1 마커는 D-1, 10/31에 끝나는 블럭은 11/1에 지난 미완료', () => {
    const m = marker('2026-11-01')
    const b = period('2026-10-20', '2026-10-31')
    expect(computeTodayGroups([project], [m, b], '2026-10-31').upcoming[0].dDay).toBe(1)
    expect(ids(computeTodayGroups([project], [m, b], '2026-10-31').dueToday)).toEqual([b.id])
    const next = computeTodayGroups([project], [m, b], '2026-11-01')
    expect(ids(next.dueToday)).toEqual([m.id])
    expect(ids(next.overdue)).toEqual([b.id])
  })

  it('연말 경계: 해를 넘기는 블럭과 마커', () => {
    const span = period('2026-12-28', '2027-01-03')
    const newYear = marker('2027-01-01')
    const g = computeTodayGroups([project], [span, newYear], '2026-12-31')
    expect(ids(g.inProgress)).toEqual([span.id])
    expect(g.inProgress[0].dDay).toBe(3)
    expect(g.upcoming[0].dDay).toBe(1)
    const g2 = computeTodayGroups([project], [span, newYear], '2027-01-01')
    expect(ids(g2.dueToday)).toEqual([newYear.id])
  })

  it('윤년이 아닌 2월 말 경계', () => {
    const m = marker('2027-03-01')
    expect(computeTodayGroups([project], [m], '2027-02-28').upcoming[0].dDay).toBe(1)
  })

  it('보관한 프로젝트의 항목은 제외', () => {
    const archived = { ...project, id: 'p2', archived: true }
    const b = period('2026-10-10', '2026-10-30', { projectId: 'p2' })
    const g = computeTodayGroups([project, archived], [b], '2026-10-20')
    expect(g.inProgress).toEqual([])
  })
})
