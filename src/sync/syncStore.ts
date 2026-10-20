import { create } from 'zustand'

/** 충돌 대화상자에 보여줄 한쪽 버전 정보 */
export interface VersionSummary {
  projects: number
  blocks: number
  /** ISO datetime. 알 수 없으면 null */
  modifiedAt: string | null
}

export type SyncPhase =
  | { kind: 'disabled' } // 클라이언트 ID 없음
  | { kind: 'disconnected' } // 연결 안 됨
  | { kind: 'connecting' }
  | { kind: 'syncing' } // 확인·저장 중
  | { kind: 'pending' } // 변경 감지, 곧 업로드
  | { kind: 'synced'; at: string }
  | { kind: 'offline' }
  | { kind: 'reconnect'; reason?: string } // 토큰 만료 등 → 클릭 한 번 필요
  | { kind: 'error'; message: string }
  | { kind: 'conflict'; local: VersionSummary; remote: VersionSummary | null }

interface SyncState {
  phase: SyncPhase
  /** 드라이브에 아직 올라가지 않은 로컬 변경이 있는지 */
  dirty: boolean
  /** 연결 버튼 등에서 생긴 일회성 안내 (팝업 차단 등) */
  notice: string | null
  setPhase(phase: SyncPhase): void
  setDirty(dirty: boolean): void
  setNotice(notice: string | null): void
}

export const useSyncStore = create<SyncState>()((set) => ({
  phase: { kind: 'disabled' },
  dirty: false,
  notice: null,
  setPhase: (phase) => set({ phase }),
  setDirty: (dirty) => set({ dirty }),
  setNotice: (notice) => set({ notice }),
}))
