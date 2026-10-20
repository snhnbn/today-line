/**
 * 동기화 판단 로직 (순수 함수 — 브라우저·네트워크 의존 없음, tests/sync.test.ts에서 검증)
 */
import type { AppData } from '../types'

/** 키 순서와 배열 순서에 상관없이 같은 내용이면 같은 문자열 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function byId<T extends { id: string }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** cyrb53 — 빠른 53비트 문자열 해시 (보안용 아님, 변경 감지용) */
function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/**
 * 프로젝트·항목 내용으로만 계산한 해시.
 * 매번 바뀌는 최상위 updatedAt은 제외하고, 배열 순서와 키 순서에 영향받지 않는다.
 */
export function hashAppData(data: Pick<AppData, 'projects' | 'blocks'>): string {
  const text = canonical({ projects: byId(data.projects), blocks: byId(data.blocks) })
  return `${cyrb53(text)}-${text.length.toString(36)}`
}

export function isEmptyData(data: Pick<AppData, 'projects' | 'blocks'>): boolean {
  return data.projects.length === 0 && data.blocks.length === 0
}

/** 이 기기에서 마지막으로 동기화가 끝났을 때의 기준점 */
export interface SyncBase {
  fileId: string
  /** 드라이브 파일 version */
  version: string
  modifiedTime: string
  /** 그때 양쪽이 같았던 내용의 해시 */
  hash: string
}

export interface DecideInput {
  local: { hash: string; empty: boolean }
  /** 드라이브 파일이 없으면 null */
  remote: { hash: string; empty: boolean } | null
  /** 이 기기가 이 파일과 동기화한 적 없으면 null */
  base: { hash: string } | null
}

export type SyncDecision =
  | 'create' // 드라이브 파일이 없음 → 로컬로 만든다
  | 'push' // 로컬만 바뀜 → 업로드
  | 'pull' // 드라이브만 바뀜 → 받아서 반영
  | 'noop' // 같음 → 기준점만 갱신
  | 'conflict' // 양쪽 다 바뀜 → 사용자 선택

export function decideSync({ local, remote, base }: DecideInput): SyncDecision {
  if (!remote) return 'create'
  if (local.hash === remote.hash) return 'noop'

  if (!base) {
    // 이 기기에서 처음 동기화
    if (local.empty) return 'pull'
    if (remote.empty) return 'push'
    return 'conflict'
  }

  const localChanged = local.hash !== base.hash
  const remoteChanged = remote.hash !== base.hash
  if (localChanged && remoteChanged) return 'conflict'
  if (localChanged) return 'push'
  if (remoteChanged) return 'pull'
  return 'noop'
}
