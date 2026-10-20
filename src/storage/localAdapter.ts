import Dexie, { type EntityTable } from 'dexie'
import type { AppData, Block, Project, StorageAdapter } from '../types'
import { nowStamp } from '../lib/date'

interface MetaRow {
  key: string
  value: string
}

type TodayLineDB = Dexie & {
  projects: EntityTable<Project, 'id'>
  blocks: EntityTable<Block, 'id'>
  meta: EntityTable<MetaRow, 'key'>
}

export function createDb(name = 'today-line'): TodayLineDB {
  const db = new Dexie(name) as TodayLineDB
  db.version(1).stores({
    projects: 'id',
    blocks: 'id, projectId',
    meta: 'key',
  })
  return db
}

/** 1단계 저장소: 브라우저 IndexedDB (Dexie) */
export function createLocalAdapter(db: TodayLineDB = createDb()): StorageAdapter {
  return {
    async load(): Promise<AppData> {
      const [projects, blocks, updated] = await Promise.all([
        db.projects.toArray(),
        db.blocks.toArray(),
        db.meta.get('updatedAt'),
      ])
      return { schemaVersion: 1, updatedAt: updated?.value ?? nowStamp(), projects, blocks }
    },

    async save(data: AppData): Promise<void> {
      await db.transaction('rw', db.projects, db.blocks, db.meta, async () => {
        await db.projects.clear()
        await db.blocks.clear()
        await db.projects.bulkPut(data.projects)
        await db.blocks.bulkPut(data.blocks)
        await db.meta.put({ key: 'updatedAt', value: data.updatedAt })
      })
    },
  }
}
