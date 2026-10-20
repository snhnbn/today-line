import type { Block, ISODate, Project } from '../types'
import { diffDays } from './date'

export interface TodayItem {
  block: Block
  project: Project
  /** 기준 날짜 기준 종료일(마커는 그 날짜)까지 남은 일수. 지났으면 음수 */
  dDay: number
}

export interface TodayGroups {
  /** 시작일 ≤ 오늘 < 종료일인 미완료 기간 블럭 (종료일이 오늘이면 '오늘 마감'으로 감) */
  inProgress: TodayItem[]
  /** 오늘 날짜의 미완료 마커 + 종료일이 오늘인 미완료 기간 블럭 */
  dueToday: TodayItem[]
  /** 내일부터 N일 안의 미완료 마커 */
  upcoming: TodayItem[]
  /** 종료일/마커 날짜가 지난 미완료 항목 */
  overdue: TodayItem[]
}

/**
 * "오늘 할 일" 네 그룹을 계산하는 순수 함수.
 * 기준 날짜를 인자로 받아 테스트에서 날짜를 고정할 수 있다.
 * 보관(archived)된 프로젝트의 항목은 제외한다.
 */
export function computeTodayGroups(
  projects: Project[],
  blocks: Block[],
  today: ISODate,
  upcomingDays = 7,
): TodayGroups {
  const projectById = new Map(projects.filter((p) => !p.archived).map((p) => [p.id, p]))
  const groups: TodayGroups = { inProgress: [], dueToday: [], upcoming: [], overdue: [] }

  for (const block of blocks) {
    if (block.done) continue
    const project = projectById.get(block.projectId)
    if (!project) continue
    const dDay = diffDays(block.endDate, today)
    const item: TodayItem = { block, project, dDay }

    if (dDay < 0) {
      groups.overdue.push(item)
    } else if (dDay === 0) {
      if (block.kind === 'marker' || block.startDate <= today) groups.dueToday.push(item)
    } else if (block.kind === 'period') {
      if (block.startDate <= today) groups.inProgress.push(item)
    } else if (dDay <= upcomingDays) {
      groups.upcoming.push(item)
    }
  }

  const byEnd = (a: TodayItem, b: TodayItem) =>
    a.block.endDate.localeCompare(b.block.endDate) || a.block.title.localeCompare(b.block.title)
  groups.inProgress.sort(byEnd)
  groups.dueToday.sort((a, b) => a.project.order - b.project.order || byEnd(a, b))
  groups.upcoming.sort(byEnd)
  groups.overdue.sort(byEnd)
  return groups
}
