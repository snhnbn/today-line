import type { AppData, Block, Project } from '../types'
import { isValidISO } from './date'
import { HEX_RE } from './color'

export class AppDataError extends Error {}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function req(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new AppDataError(msg)
}

function checkProject(p: unknown, i: number): Project {
  const at = `프로젝트 ${i + 1}번`
  req(isObj(p), `${at}의 형식이 올바르지 않습니다.`)
  req(typeof p.id === 'string' && p.id !== '', `${at}: id가 없습니다.`)
  req(typeof p.name === 'string', `${at}: 이름이 없습니다.`)
  req(typeof p.color === 'string' && HEX_RE.test(p.color), `${at}: 색상 값이 올바르지 않습니다.`)
  req(isValidISO(p.startDate) && isValidISO(p.endDate), `${at}: 날짜 형식이 올바르지 않습니다.`)
  req(p.startDate <= p.endDate, `${at}: 착수일이 종료일보다 늦습니다.`)
  req(typeof p.order === 'number', `${at}: 순서 값이 없습니다.`)
  req(typeof p.archived === 'boolean', `${at}: archived 값이 없습니다.`)
  req(p.memo === undefined || typeof p.memo === 'string', `${at}: 메모 형식이 올바르지 않습니다.`)
  req(typeof p.createdAt === 'string' && typeof p.updatedAt === 'string', `${at}: 생성/수정 시각이 없습니다.`)
  return p as unknown as Project
}

function checkBlock(b: unknown, i: number, projectIds: Set<string>): Block {
  const at = `항목 ${i + 1}번`
  req(isObj(b), `${at}의 형식이 올바르지 않습니다.`)
  req(typeof b.id === 'string' && b.id !== '', `${at}: id가 없습니다.`)
  req(typeof b.projectId === 'string' && projectIds.has(b.projectId), `${at}: 속한 프로젝트를 찾을 수 없습니다.`)
  req(b.kind === 'period' || b.kind === 'marker', `${at}: 유형이 올바르지 않습니다.`)
  req(typeof b.title === 'string', `${at}: 제목이 없습니다.`)
  req(isValidISO(b.startDate) && isValidISO(b.endDate), `${at}: 날짜 형식이 올바르지 않습니다.`)
  req(b.startDate <= b.endDate, `${at}: 시작일이 종료일보다 늦습니다.`)
  req(b.kind === 'period' || b.startDate === b.endDate, `${at}: 마커의 시작일과 종료일이 다릅니다.`)
  req(b.color === undefined || (typeof b.color === 'string' && HEX_RE.test(b.color)), `${at}: 색상 값이 올바르지 않습니다.`)
  req(b.note === undefined || typeof b.note === 'string', `${at}: 메모 형식이 올바르지 않습니다.`)
  req(typeof b.done === 'boolean', `${at}: 완료 값이 없습니다.`)
  req(typeof b.createdAt === 'string' && typeof b.updatedAt === 'string', `${at}: 생성/수정 시각이 없습니다.`)
  return b as unknown as Block
}

/** 불러온 JSON이 이 앱의 데이터 형식(schemaVersion 1)인지 검사한다. 문제가 있으면 AppDataError를 던진다. */
export function validateAppData(raw: unknown): AppData {
  req(isObj(raw), 'Today Line 데이터 파일이 아닙니다.')
  req(raw.schemaVersion === 1, `지원하지 않는 데이터 버전입니다 (schemaVersion: ${String(raw.schemaVersion)}).`)
  req(Array.isArray(raw.projects) && Array.isArray(raw.blocks), '프로젝트 또는 항목 목록이 없습니다.')
  const projects = raw.projects.map(checkProject)
  const ids = new Set(projects.map((p) => p.id))
  req(ids.size === projects.length, '중복된 프로젝트 id가 있습니다.')
  const blocks = raw.blocks.map((b, i) => checkBlock(b, i, ids))
  req(new Set(blocks.map((b) => b.id)).size === blocks.length, '중복된 항목 id가 있습니다.')
  return {
    schemaVersion: 1,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    projects,
    blocks,
  }
}

export function parseAppDataJson(text: string): AppData {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new AppDataError('JSON 파일을 읽을 수 없습니다.')
  }
  return validateAppData(raw)
}
