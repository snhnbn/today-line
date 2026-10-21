import type { Block, Project } from '../types'

/**
 * 프리셋 10색: 로즈우드/모브/웜그레이 무드의 뮤트 톤.
 * 색상각과 명도를 분산해 프로젝트끼리 구분되고, 흰 글자 대비 4.5:1 이상.
 */
export const PALETTE: { name: string; value: string }[] = [
  { name: '와인', value: '#7A4950' },
  { name: '모브', value: '#7A5F73' },
  { name: '플럼', value: '#5E4560' },
  { name: '블루그레이', value: '#56677A' },
  { name: '세이지', value: '#5C6E5E' },
  { name: '올리브', value: '#636249' },
  { name: '토프', value: '#75675F' },
  { name: '클레이', value: '#8E5A48' },
  { name: '슬레이트', value: '#4F5862' },
  { name: '차콜', value: '#3F3838' },
]

/** 이전 버전 프리셋. 같은 인덱스의 새 프리셋으로 표시만 바꾼다(저장값은 그대로). */
export const LEGACY_PALETTE: readonly string[] = [
  '#2563EB', '#DC2626', '#059669', '#B45309', '#7C3AED',
  '#DB2777', '#0E7490', '#4D7C0F', '#C2410C', '#475569',
]

/** 어두운 글자색(다크 브라운) */
export const DARK_TEXT = '#3A3030'

export const HEX_RE = /^#[0-9a-fA-F]{6}$/

const LEGACY_MAP = new Map(LEGACY_PALETTE.map((hex, i) => [hex.toLowerCase(), PALETTE[i].value]))

/** 표시용 색: 옛 프리셋이면 같은 인덱스의 새 프리셋, 아니면 그대로 */
export function displayColor(hex: string): string {
  return LEGACY_MAP.get(hex.toLowerCase()) ?? hex
}

/** 프로젝트 표시 색 */
export function projectColor(project: Project): string {
  return displayColor(project.color)
}

/** 블럭 표시 색: 블럭 색 → 프로젝트 색 → 첫 프리셋 */
export function blockColor(block: Block, project: Project | undefined): string {
  return displayColor(block.color ?? project?.color ?? PALETTE[0].value)
}

export function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

/** WCAG 대비 비율 */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** 배경색 위에서 읽히는 글자색 (직접 고른 밝은 색 대비) */
export function textColorOn(hex: string): string {
  if (!HEX_RE.test(hex)) return '#ffffff'
  return contrastRatio(hex, '#ffffff') >= contrastRatio(hex, DARK_TEXT) ? '#ffffff' : DARK_TEXT
}

/** "#RRGGBB" + 투명도 */
export function withAlpha(hex: string, alpha: number): string {
  if (!HEX_RE.test(hex)) return hex
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
  return `${hex}${a.toString(16).padStart(2, '0')}`
}
