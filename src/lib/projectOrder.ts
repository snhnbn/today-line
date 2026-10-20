import type { Project } from '../types'

/** order 오름차순(같으면 원래 배열 순서 유지)으로 정렬한 새 배열 */
function sortByOrder(projects: Project[]): Project[] {
  return projects
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p.order - b.p.order || a.i - b.i)
    .map(({ p }) => p)
}

/**
 * 보관되지 않은 프로젝트 목록(order 오름차순)에서 id 프로젝트를 toIndex 위치로 옮긴다.
 *
 * - toIndex: 0부터 시작하는, 이동 "후" 목록 기준 인덱스. 범위를 벗어나면 0..n-1로 clamp.
 * - 이동 후 보관되지 않은 프로젝트는 order 0..n-1, 보관된 프로젝트는 상대 순서를 유지해 n.. 으로 재번호.
 * - order가 실제로 바뀐 프로젝트만 updatedAt을 now로 갱신한다.
 * - 반환 배열은 입력 배열의 원래 위치 순서를 유지한다.
 * - id가 없거나 보관된 프로젝트이거나, 이동 전후 위치가 같으면 입력 배열을 그대로(같은 참조) 반환한다.
 */
export function reorderProjects(projects: Project[], id: string, toIndex: number, now: string): Project[] {
  const sorted = sortByOrder(projects)
  const active = sorted.filter((p) => !p.archived)
  const archived = sorted.filter((p) => p.archived)

  const from = active.findIndex((p) => p.id === id)
  if (from === -1) return projects

  const target = Number.isFinite(toIndex) ? Math.min(Math.max(Math.trunc(toIndex), 0), active.length - 1) : from
  if (target === from) return projects

  const nextActive = [...active]
  const [moved] = nextActive.splice(from, 1)
  nextActive.splice(target, 0, moved)

  const newOrder = new Map<string, number>()
  nextActive.forEach((p, i) => newOrder.set(p.id, i))
  archived.forEach((p, i) => newOrder.set(p.id, nextActive.length + i))

  return projects.map((p) => {
    const order = newOrder.get(p.id) ?? p.order
    return order === p.order ? p : { ...p, order, updatedAt: now }
  })
}
