import type { AppData, Block, ISODate, Project } from '../types'
import { addDaysISO, nowStamp } from './date'
import { PALETTE } from './color'

/** 오늘을 기준으로 한 샘플 데이터 3개 프로젝트 */
export function createSampleData(today: ISODate): AppData {
  const now = nowStamp()
  const d = (n: number) => addDaysISO(today, n)
  const project = (order: number, name: string, color: string, start: number, end: number): Project => ({
    id: crypto.randomUUID(), name, color, startDate: d(start), endDate: d(end),
    order, archived: false, createdAt: now, updatedAt: now,
  })
  const a = project(0, '기록화 사업', PALETTE[0].value, -40, 70)
  const b = project(1, '학술지 논문 투고', PALETTE[2].value, -25, 45)
  const c = project(2, '학회 발표 준비', PALETTE[4].value, -10, 30)

  const block = (p: Project, kind: Block['kind'], title: string, start: number, end = start, done = false): Block => ({
    id: crypto.randomUUID(), projectId: p.id, kind, title, startDate: d(start), endDate: d(kind === 'marker' ? start : end),
    done, ...(done ? { doneAt: now } : {}), createdAt: now, updatedAt: now,
  })

  return {
    schemaVersion: 1,
    updatedAt: now,
    projects: [a, b, c],
    blocks: [
      block(a, 'period', '착수보고 준비', -35, -12, true),
      block(a, 'marker', '착수보고', -10, -10, true),
      block(a, 'period', '현장 조사', -6, 8),
      block(a, 'period', '중간점검 자료 정리', -2, 12),
      block(a, 'marker', '중간보고', 4),
      block(b, 'period', '원고 작성', -20, 6),
      block(b, 'marker', '자료 요청 회신', -3),
      block(b, 'marker', '투고 마감', 14),
      block(c, 'period', '발표문 초안', -8, 0),
      block(c, 'marker', '초록 제출', 0),
      block(c, 'period', '슬라이드 제작', 3, 18),
    ],
  }
}
