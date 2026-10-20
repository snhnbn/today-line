import type { Block, Project } from '../types'

/** 프리셋 10색: 서로 구분되고 흰 글자가 읽히는(대비 4.5:1 이상) 중간 명도 */
export const PALETTE: { name: string; value: string }[] = [
  { name: '파랑', value: '#2563EB' },
  { name: '빨강', value: '#DC2626' },
  { name: '초록', value: '#059669' },
  { name: '황토', value: '#B45309' },
  { name: '보라', value: '#7C3AED' },
  { name: '분홍', value: '#DB2777' },
  { name: '청록', value: '#0E7490' },
  { name: '올리브', value: '#4D7C0F' },
  { name: '주황', value: '#C2410C' },
  { name: '회청', value: '#475569' },
]

export const HEX_RE = /^#[0-9a-fA-F]{6}$/

export function blockColor(block: Block, project: Project | undefined): string {
  return block.color ?? project?.color ?? PALETTE[0].value
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

/** 배경색 위에서 읽히는 글자색 (직접 고른 밝은 색 대비) */
export function textColorOn(hex: string): string {
  if (!HEX_RE.test(hex)) return '#ffffff'
  const l = luminance(hex)
  const onWhite = 1.05 / (l + 0.05)
  const onDark = (l + 0.05) / 0.06
  return onWhite >= onDark ? '#ffffff' : '#1c1c1a'
}

/** "#RRGGBB" + 투명도 */
export function withAlpha(hex: string, alpha: number): string {
  if (!HEX_RE.test(hex)) return hex
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
  return `${hex}${a.toString(16).padStart(2, '0')}`
}
