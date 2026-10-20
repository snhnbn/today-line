/** 시간 없는 날짜 문자열 "YYYY-MM-DD". Date 객체나 UTC 타임스탬프로 저장하지 않는다. */
export type ISODate = string

export interface Project {
  id: string
  name: string
  color: string // "#RRGGBB"
  startDate: ISODate // 착수일
  endDate: ISODate // 종료일
  order: number // 세로 정렬 순서
  memo?: string
  archived: boolean // 종료된 프로젝트 숨김용
  createdAt: string // ISO datetime
  updatedAt: string
}

export type BlockKind = 'period' | 'marker'

export interface Block {
  id: string
  projectId: string
  kind: BlockKind
  title: string
  startDate: ISODate
  endDate: ISODate // marker는 startDate와 동일
  color?: string // 없으면 프로젝트 색상 상속
  note?: string
  done: boolean
  doneAt?: string
  createdAt: string
  updatedAt: string
}

/** 내보내기·드라이브 동기화 단위 */
export interface AppData {
  schemaVersion: 1
  updatedAt: string
  projects: Project[]
  blocks: Block[]
}

/** 스토어만 호출한다. UI는 이 인터페이스를 직접 쓰지 않는다. */
export interface StorageAdapter {
  load(): Promise<AppData>
  save(data: AppData): Promise<void>
}
