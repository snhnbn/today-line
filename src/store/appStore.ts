import { create } from 'zustand'
import type { AppData, Block, ISODate, Project, StorageAdapter } from '../types'
import { nowStamp } from '../lib/date'
import { createSampleData } from '../lib/sample'

export type NewProject = Pick<Project, 'name' | 'color' | 'startDate' | 'endDate'> & { memo?: string }
export type ProjectPatch = Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>>
export type NewBlock = Pick<Block, 'projectId' | 'kind' | 'title' | 'startDate' | 'endDate'> &
  Partial<Pick<Block, 'color' | 'note'>>
export type BlockPatch = Partial<Omit<Block, 'id' | 'createdAt' | 'updatedAt'>>

type Status = 'idle' | 'loading' | 'ready' | 'error'

export interface AppState {
  projects: Project[]
  blocks: Block[]
  status: Status
  /** 마지막 저장 실패 메시지 (성공하면 null) */
  saveError: string | null

  init(adapter: StorageAdapter): Promise<void>
  addProject(input: NewProject): Project
  updateProject(id: string, patch: ProjectPatch): void
  /** 프로젝트와 그 안의 항목을 함께 지운다 */
  deleteProject(id: string): void
  addBlock(input: NewBlock): Block
  updateBlock(id: string, patch: BlockPatch): void
  deleteBlock(id: string): void
  /** done을 지정하지 않으면 반전 */
  toggleDone(id: string, done?: boolean): void
  /** 불러오기: 전체 데이터를 교체 */
  replaceAll(data: AppData): void
  loadSample(today: ISODate): void
  toAppData(): AppData
}

let adapter: StorageAdapter | null = null
let saveChain: Promise<void> = Promise.resolve()

/** 마감·마커 날짜 규칙을 맞춘다: 마커는 하루, 기간은 시작 ≤ 종료 */
function normalizeBlock(b: Block): Block {
  if (b.kind === 'marker') return b.endDate === b.startDate ? b : { ...b, endDate: b.startDate }
  if (b.startDate > b.endDate) return { ...b, startDate: b.endDate, endDate: b.startDate }
  return b
}

function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T
}

export const useAppStore = create<AppState>()((set, get) => {
  const persist = () => {
    if (!adapter) return
    const target = adapter
    const data = get().toAppData()
    saveChain = saveChain
      .then(() => target.save(data))
      .then(() => {
        if (get().saveError) set({ saveError: null })
      })
      .catch((err: unknown) => {
        console.error(err)
        set({ saveError: '브라우저에 저장하지 못했습니다. 내보내기로 백업해 두세요.' })
      })
  }

  const commit = (partial: Partial<Pick<AppState, 'projects' | 'blocks'>>) => {
    set(partial)
    persist()
  }

  return {
    projects: [],
    blocks: [],
    status: 'idle',
    saveError: null,

    async init(a) {
      if (get().status !== 'idle') return
      adapter = a
      set({ status: 'loading' })
      try {
        const data = await a.load()
        set({ projects: data.projects, blocks: data.blocks, status: 'ready' })
      } catch (err) {
        console.error(err)
        set({ status: 'error' })
      }
    },

    addProject(input) {
      const now = nowStamp()
      const { projects } = get()
      const project: Project = stripUndefined({
        id: crypto.randomUUID(),
        name: input.name,
        color: input.color,
        startDate: input.startDate <= input.endDate ? input.startDate : input.endDate,
        endDate: input.startDate <= input.endDate ? input.endDate : input.startDate,
        order: projects.reduce((m, p) => Math.max(m, p.order + 1), 0),
        memo: input.memo || undefined,
        archived: false,
        createdAt: now,
        updatedAt: now,
      })
      commit({ projects: [...projects, project] })
      return project
    },

    updateProject(id, patch) {
      commit({
        projects: get().projects.map((p) => {
          if (p.id !== id) return p
          const next = stripUndefined({ ...p, ...patch, updatedAt: nowStamp() })
          if (patch.memo === '') delete next.memo
          return next
        }),
      })
    },

    deleteProject(id) {
      commit({
        projects: get().projects.filter((p) => p.id !== id),
        blocks: get().blocks.filter((b) => b.projectId !== id),
      })
    },

    addBlock(input) {
      const now = nowStamp()
      const block = normalizeBlock(
        stripUndefined({ ...input, id: crypto.randomUUID(), done: false, createdAt: now, updatedAt: now }),
      )
      commit({ blocks: [...get().blocks, block] })
      return block
    },

    updateBlock(id, patch) {
      commit({
        blocks: get().blocks.map((b) => {
          if (b.id !== id) return b
          const next: Block = { ...b, ...patch, updatedAt: nowStamp() }
          if ('color' in patch && patch.color === undefined) delete next.color
          if (patch.note === '') delete next.note
          if (patch.done === true && !b.done) next.doneAt = nowStamp()
          if (patch.done === false) delete next.doneAt
          return normalizeBlock(next)
        }),
      })
    },

    deleteBlock(id) {
      commit({ blocks: get().blocks.filter((b) => b.id !== id) })
    },

    toggleDone(id, done) {
      const block = get().blocks.find((b) => b.id === id)
      if (!block) return
      get().updateBlock(id, { done: done ?? !block.done })
    },

    replaceAll(data) {
      commit({ projects: data.projects, blocks: data.blocks })
    },

    loadSample(today) {
      const data = createSampleData(today)
      commit({ projects: [...get().projects, ...data.projects], blocks: [...get().blocks, ...data.blocks] })
    },

    toAppData() {
      const { projects, blocks } = get()
      return { schemaVersion: 1, updatedAt: nowStamp(), projects, blocks }
    },
  }
})
