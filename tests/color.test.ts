import { describe, expect, it } from 'vitest'
import {
  DARK_TEXT, LEGACY_PALETTE, PALETTE, blockColor, contrastRatio, displayColor, projectColor, textColorOn,
} from '../src/lib/color'
import type { Block, Project } from '../src/types'

const project: Project = {
  id: 'p1', name: 'A', color: '#2563EB', startDate: '2026-01-01', endDate: '2026-12-31',
  order: 0, archived: false, createdAt: '', updatedAt: '',
}
const block = (extra: Partial<Block> = {}): Block => ({
  id: 'b1', projectId: 'p1', kind: 'period', title: 'B', startDate: '2026-02-01', endDate: '2026-02-10',
  done: false, createdAt: '', updatedAt: '', ...extra,
})

describe('PALETTE', () => {
  it('10색, 이름·값 중복 없음', () => {
    expect(PALETTE).toHaveLength(10)
    expect(new Set(PALETTE.map((c) => c.value.toLowerCase())).size).toBe(10)
    expect(new Set(PALETTE.map((c) => c.name)).size).toBe(10)
  })

  it.each(PALETTE)('$name($value) 위 흰 글자 대비 4.5 이상', ({ value }) => {
    expect(contrastRatio(value, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(textColorOn(value)).toBe('#ffffff')
  })

  it('옛 프리셋과 겹치지 않음', () => {
    const legacy = new Set(LEGACY_PALETTE.map((h) => h.toLowerCase()))
    for (const c of PALETTE) expect(legacy.has(c.value.toLowerCase())).toBe(false)
  })
})

describe('displayColor', () => {
  it('옛 프리셋 → 같은 인덱스의 새 프리셋', () => {
    LEGACY_PALETTE.forEach((hex, i) => expect(displayColor(hex)).toBe(PALETTE[i].value))
  })
  it('대소문자 무시', () => {
    expect(displayColor('#2563eb')).toBe(PALETTE[0].value)
    expect(displayColor('#c2410C')).toBe(PALETTE[8].value)
  })
  it('프리셋이 아니면 그대로', () => {
    expect(displayColor('#123456')).toBe('#123456')
    expect(displayColor(PALETTE[3].value)).toBe(PALETTE[3].value)
  })
})

describe('blockColor / projectColor', () => {
  it('블럭 색이 없으면 프로젝트 색 상속(표시 변환 적용)', () => {
    expect(blockColor(block(), project)).toBe(PALETTE[0].value)
    expect(projectColor(project)).toBe(PALETTE[0].value)
  })
  it('블럭 자체 색 우선, 옛 프리셋이면 변환', () => {
    expect(blockColor(block({ color: '#DC2626' }), project)).toBe(PALETTE[1].value)
    expect(blockColor(block({ color: '#abcdef' }), project)).toBe('#abcdef')
  })
  it('프로젝트가 없으면 첫 프리셋', () => {
    expect(blockColor(block(), undefined)).toBe(PALETTE[0].value)
  })
  it('저장값은 바꾸지 않음', () => {
    const b = block({ color: '#DC2626' })
    blockColor(b, project)
    projectColor(project)
    expect(b.color).toBe('#DC2626')
    expect(project.color).toBe('#2563EB')
  })
})

describe('textColorOn', () => {
  it('밝은 배경에는 다크 브라운 글자', () => {
    expect(textColorOn('#E3DED9')).toBe(DARK_TEXT)
    expect(textColorOn('#C4B1B5')).toBe(DARK_TEXT)
  })
})
