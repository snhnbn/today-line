import { beforeEach, describe, expect, it } from 'vitest'
import { reorderProjects } from '../src/lib/projectOrder'
import { useAppStore } from '../src/store/appStore'
import type { AppData, Project, StorageAdapter } from '../src/types'

const OLD = '2026-01-01T00:00:00Z'
const NOW = '2026-10-20T09:00:00Z'

const project = (id: string, order: number, extra: Partial<Project> = {}): Project => ({
  id, name: `P${id}`, color: '#2563EB', startDate: '2026-01-01', endDate: '2026-12-31',
  order, archived: false, createdAt: OLD, updatedAt: OLD, ...extra,
})

/** 보관되지 않은 프로젝트를 order 순으로 나열한 id 목록 */
const activeIds = (ps: Project[]) => ps.filter((p) => !p.archived).sort((a, b) => a.order - b.order).map((p) => p.id)
const orderOf = (ps: Project[]) => Object.fromEntries(ps.map((p) => [p.id, p.order]))
const touched = (ps: Project[]) => ps.filter((p) => p.updatedAt === NOW).map((p) => p.id).sort()

const base = () => [project('a', 0), project('b', 1), project('c', 2), project('d', 3)]

describe('reorderProjects', () => {
  it('위로 이동', () => {
    const next = reorderProjects(base(), 'c', 1, NOW)
    expect(activeIds(next)).toEqual(['a', 'c', 'b', 'd'])
    expect(touched(next)).toEqual(['b', 'c'])
  })

  it('아래로 이동 (toIndex는 이동 후 기준)', () => {
    const next = reorderProjects(base(), 'a', 2, NOW)
    expect(activeIds(next)).toEqual(['b', 'c', 'a', 'd'])
    expect(touched(next)).toEqual(['a', 'b', 'c'])
  })

  it('맨 위 / 맨 아래', () => {
    expect(activeIds(reorderProjects(base(), 'd', 0, NOW))).toEqual(['d', 'a', 'b', 'c'])
    expect(activeIds(reorderProjects(base(), 'a', 3, NOW))).toEqual(['b', 'c', 'd', 'a'])
  })

  it('범위 밖 toIndex는 clamp', () => {
    expect(activeIds(reorderProjects(base(), 'c', -5, NOW))).toEqual(['c', 'a', 'b', 'd'])
    expect(activeIds(reorderProjects(base(), 'b', 99, NOW))).toEqual(['a', 'c', 'd', 'b'])
  })

  it('같은 위치면 입력을 그대로 반환', () => {
    const input = base()
    expect(reorderProjects(input, 'b', 1, NOW)).toBe(input)
    expect(reorderProjects(input, 'd', 10, NOW)).toBe(input) // clamp 후 같은 위치
    expect(reorderProjects(input, 'zzz', 0, NOW)).toBe(input) // 없는 id
  })

  it('보관 프로젝트가 섞인 경우: 활성은 0..n-1, 보관은 n.. 으로 상대 순서 유지', () => {
    const input = [
      project('x', 0, { archived: true }),
      project('a', 1),
      project('y', 2, { archived: true }),
      project('b', 3),
      project('c', 4),
    ]
    const next = reorderProjects(input, 'c', 0, NOW)
    expect(activeIds(next)).toEqual(['c', 'a', 'b'])
    expect(orderOf(next)).toEqual({ c: 0, a: 1, b: 2, x: 3, y: 4 })
    // 원래 배열 위치는 유지
    expect(next.map((p) => p.id)).toEqual(['x', 'a', 'y', 'b', 'c'])
    // order가 바뀐 프로젝트만 갱신 (b는 3→2, a는 1→1 그대로)
    expect(touched(next)).toEqual(['b', 'c', 'x', 'y'])
    expect(next.find((p) => p.id === 'a')).toBe(input[1])
  })

  it('보관된 프로젝트는 옮기지 않는다', () => {
    const input = [project('a', 0), project('x', 1, { archived: true })]
    expect(reorderProjects(input, 'x', 0, NOW)).toBe(input)
  })

  it('order 값에 틈이 있어도 정렬 순서로 해석한다', () => {
    const input = [project('a', 10), project('b', 5), project('c', 20)]
    const next = reorderProjects(input, 'c', 0, NOW)
    expect(orderOf(next)).toEqual({ c: 0, b: 1, a: 2 })
  })
})

describe('useAppStore.moveProject', () => {
  let saves: AppData[]

  beforeEach(async () => {
    saves = []
    const adapter: StorageAdapter = {
      load: async () => ({ schemaVersion: 1, updatedAt: OLD, projects: base(), blocks: [] }),
      save: async (data: AppData) => {
        saves.push(data)
      },
    } as StorageAdapter
    useAppStore.setState({ projects: [], blocks: [], status: 'idle', saveError: null })
    await useAppStore.getState().init(adapter)
  })

  it('이동하면 스토어에 반영되고 저장된다', async () => {
    useAppStore.getState().moveProject('d', 0)
    expect(activeIds(useAppStore.getState().projects)).toEqual(['d', 'a', 'b', 'c'])
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 0))
    expect(saves).toHaveLength(1)
    expect(activeIds(saves[0].projects)).toEqual(['d', 'a', 'b', 'c'])
  })

  it('같은 위치면 상태도 저장도 바뀌지 않는다', async () => {
    const before = useAppStore.getState().projects
    useAppStore.getState().moveProject('b', 1)
    await new Promise((r) => setTimeout(r, 0))
    expect(useAppStore.getState().projects).toBe(before)
    expect(saves).toHaveLength(0)
  })
})
