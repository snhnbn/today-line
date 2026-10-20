import { describe, expect, it } from 'vitest'
import { decideSync, hashAppData, isEmptyData } from '../src/sync/logic'
import type { Block, Project } from '../src/types'

const project = (id: string, extra: Partial<Project> = {}): Project => ({
  id, name: `P${id}`, color: '#2563EB', startDate: '2026-01-01', endDate: '2026-12-31',
  order: 0, archived: false, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...extra,
})
const block = (id: string, extra: Partial<Block> = {}): Block => ({
  id, projectId: 'p1', kind: 'period', title: `B${id}`, startDate: '2026-10-01', endDate: '2026-10-10',
  done: false, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...extra,
})

const A = { projects: [project('p1')], blocks: [block('b1')] }
const B = { projects: [project('p1')], blocks: [block('b1'), block('b2')] }
const C = { projects: [project('p1', { name: '이름 바꿈' })], blocks: [block('b1')] }
const EMPTY = { projects: [], blocks: [] }

const snap = (d: typeof A) => ({ hash: hashAppData(d), empty: isEmptyData(d) })

describe('hashAppData', () => {
  it('최상위 updatedAt은 무시한다', () => {
    expect(hashAppData({ ...A, updatedAt: '2026-01-01' } as never)).toBe(hashAppData({ ...A, updatedAt: '2026-10-20' } as never))
  })
  it('배열 순서·키 순서와 무관하다', () => {
    const reordered = { projects: A.projects, blocks: [...B.blocks].reverse() }
    expect(hashAppData(reordered)).toBe(hashAppData(B))
    const keysShuffled = { projects: [{ ...Object.fromEntries(Object.entries(project('p1')).reverse()) } as Project], blocks: A.blocks }
    expect(hashAppData(keysShuffled)).toBe(hashAppData(A))
  })
  it('내용이 바뀌면 달라진다', () => {
    expect(hashAppData(A)).not.toBe(hashAppData(B))
    expect(hashAppData(A)).not.toBe(hashAppData(C))
    expect(hashAppData({ projects: A.projects, blocks: [block('b1', { done: true })] })).not.toBe(hashAppData(A))
  })
})

describe('decideSync', () => {
  const base = { hash: hashAppData(A) }

  it('변경 없음 → noop', () => {
    expect(decideSync({ local: snap(A), remote: snap(A), base })).toBe('noop')
  })
  it('로컬만 변경 → push', () => {
    expect(decideSync({ local: snap(B), remote: snap(A), base })).toBe('push')
  })
  it('원격만 변경 → pull', () => {
    expect(decideSync({ local: snap(A), remote: snap(B), base })).toBe('pull')
  })
  it('둘 다 다르게 변경 → conflict', () => {
    expect(decideSync({ local: snap(B), remote: snap(C), base })).toBe('conflict')
  })
  it('둘 다 같은 내용으로 변경 → noop', () => {
    expect(decideSync({ local: snap(B), remote: snap(B), base })).toBe('noop')
  })
  it('원격 파일 없음 → create (로컬이 비어 있어도)', () => {
    expect(decideSync({ local: snap(A), remote: null, base })).toBe('create')
    expect(decideSync({ local: snap(EMPTY), remote: null, base: null })).toBe('create')
  })

  describe('이 기기에서 처음 동기화 (base 없음)', () => {
    it('로컬이 비어 있으면 드라이브 것을 받는다', () => {
      expect(decideSync({ local: snap(EMPTY), remote: snap(B), base: null })).toBe('pull')
    })
    it('로컬에도 드라이브에도 다른 데이터가 있으면 conflict', () => {
      expect(decideSync({ local: snap(A), remote: snap(C), base: null })).toBe('conflict')
    })
    it('드라이브 파일이 비어 있으면 로컬을 올린다', () => {
      expect(decideSync({ local: snap(A), remote: snap(EMPTY), base: null })).toBe('push')
    })
    it('양쪽 내용이 같으면 noop', () => {
      expect(decideSync({ local: snap(A), remote: snap(A), base: null })).toBe('noop')
    })
  })
})
