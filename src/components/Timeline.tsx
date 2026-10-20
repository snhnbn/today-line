import {
  useEffect, useLayoutEffect, useMemo, useRef, useState,
  type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent,
} from 'react'
import type { Block, ISODate, Project } from '../types'
import { useAppStore } from '../store/appStore'
import { useUiStore, type Zoom } from '../store/uiStore'
import { assignLanes, type LaneLayout } from '../lib/lanes'
import { blockColor, textColorOn, withAlpha } from '../lib/color'
import {
  addDaysISO, diffDays, endOfMonthISO, formatDotted, formatShort, formatShortWithDay, fromISO,
  maxISO, minISO, spanDays, startOfMonthISO, weekdayLabel, weekdayOf,
} from '../lib/date'
import { EmptyState } from './EmptyState'

const DAY_WIDTH: Record<Zoom, number> = { week: 120, month: 32, quarter: 10 }
const STEP_DAYS: Record<Zoom, number> = { week: 7, month: 30, quarter: 91 }
const NAME_W = 200
const HEADER_H = 52
const LANE_H = 30
const BLOCK_H = 24
const MARKER_H = 26
const ROW_PAD = 10
const MIN_ROW_H = 60
/** '오늘' 위치에서 오늘 왼쪽으로 보이는 날짜 수 */
const TODAY_LEAD_DAYS = 2
/** 마커 요소 왼쪽 끝 ~ ◆ 중심 거리 (◆ 12px + 좌우 여백 2px) */
const DIAMOND_HALF = 8
/** 같은 날짜에 겹친 ◆를 옆으로 어긋나게 놓는 간격 */
const STACK_STEP = 5
/** 겹친 ◆ 표시 최대 개수 (그 이상은 같은 자리에 겹친다) */
const STACK_MAX = 3
/** ◆와 라벨 사이 간격(.marker gap) + 다음 ◆ 앞 여백 */
const LABEL_GAP = 6
const NEXT_MARGIN = 10
/** 다음 마커가 없을 때 라벨 최대 폭 */
const LABEL_MAX_W = 240
/** 이보다 좁으면 라벨을 숨기고 ◆만 보인다 */
const LABEL_MIN_W = 18

type BlockDragType = 'move' | 'start' | 'end'
type Drag =
  | { type: 'create'; projectId: string; anchor: number; current: number; startX: number; x: number; y: number; moved: boolean }
  | { type: BlockDragType; blockId: string; kind: Block['kind']; origStart: ISODate; origEnd: ISODate; startX: number; delta: number; x: number; y: number; moved: boolean }

/** 이름 열을 잡고 행 순서를 바꾸는 드래그 */
interface RowDrag {
  projectId: string
  /** 드래그 시작 시 행 인덱스 */
  from: number
  startY: number
  y: number
  /** 4px 이상 움직여 실제 드래그가 시작됐는지 */
  active: boolean
  /** 삽입선 위치: 행 사이 경계 인덱스 0..n */
  slot: number
}

/** 이 거리 이상 세로로 움직이면 행 순서 드래그 시작 */
const ROW_DRAG_THRESHOLD = 4
/** 스크롤 영역 위/아래 가장자리에서 자동 스크롤이 시작되는 거리 */
const AUTO_SCROLL_EDGE = 40
const AUTO_SCROLL_MAX = 14

interface RowLayout {
  project: Project
  periods: Block[]
  markers: Block[]
  periodLanes: LaneLayout
  height: number
  top: number
}

function dragDates(d: Extract<Drag, { blockId: string }>): { start: ISODate; end: ISODate } {
  if (d.type === 'move') return { start: addDaysISO(d.origStart, d.delta), end: addDaysISO(d.origEnd, d.delta) }
  if (d.type === 'start') return { start: minISO(addDaysISO(d.origStart, d.delta), d.origEnd), end: d.origEnd }
  return { start: d.origStart, end: maxISO(addDaysISO(d.origEnd, d.delta), d.origStart) }
}

interface MarkerPlacement {
  /** 같은 날짜 묶음 안에서의 순서 (0이 대표) */
  index: number
  /** 같은 날짜 마커 수 */
  count: number
  /** ◆를 옆으로 어긋나게 놓는 거리(px) */
  offset: number
  /** 대표 마커만: 라벨 최대 폭(px). null이면 라벨 숨김 */
  labelMaxW: number | null
  /** 대표 마커만: 같은 날짜 마커 전체 제목 */
  titles: string[]
}

/**
 * 한 행의 마커를 한 줄에 놓는다. 같은 날짜 마커는 ◆를 조금씩 어긋나게 겹치고 첫 마커만 라벨('외 n개')을 단다.
 * 라벨은 오른쪽 가장 가까운 다른 날짜 마커의 ◆ 앞까지만 쓴다.
 */
function placeMarkers(
  items: { block: Block; day: number }[], dw: number, firstId: string | null,
): Map<string, MarkerPlacement> {
  const groups = new Map<number, Block[]>()
  for (const { block, day } of items) {
    const g = groups.get(day)
    // 드래그 중인 마커는 묶음의 대표(맨 앞)로 둔다
    if (g) g[block.id === firstId ? 'unshift' : 'push'](block)
    else groups.set(day, [block])
  }
  const days = [...groups.keys()].sort((a, b) => a - b)
  const result = new Map<string, MarkerPlacement>()
  days.forEach((day, i) => {
    const group = groups.get(day)!
    const count = group.length
    const stackW = Math.min(count - 1, STACK_MAX - 1) * STACK_STEP
    const next = days[i + 1]
    const avail = next === undefined
      ? LABEL_MAX_W
      : Math.min(LABEL_MAX_W, (next - day) * dw - DIAMOND_HALF - stackW - LABEL_GAP - NEXT_MARGIN)
    const labelMaxW = avail >= LABEL_MIN_W ? avail : null
    const titles = group.map((b) => b.title || '(제목 없음)')
    group.forEach((b, index) => {
      result.set(b.id, {
        index, count, offset: Math.min(index, STACK_MAX - 1) * STACK_STEP,
        labelMaxW: index === 0 ? labelMaxW : null, titles: index === 0 ? titles : [],
      })
    })
  })
  return result
}

function rangeLabel(start: ISODate, end: ISODate): string {
  return `${formatShort(start)} ~ ${formatShort(end)}, ${spanDays(start, end)}일`
}

export function Timeline() {
  const projects = useAppStore((s) => s.projects)
  const blocks = useAppStore((s) => s.blocks)
  const addBlock = useAppStore((s) => s.addBlock)
  const updateBlock = useAppStore((s) => s.updateBlock)

  const zoom = useUiStore((s) => s.zoom)
  const hideDone = useUiStore((s) => s.hideDone)
  const today = useUiStore((s) => s.today)
  const selectedId = useUiStore((s) => s.selectedId)
  const scrollRequest = useUiStore((s) => s.scrollRequest)
  const focusRequest = useUiStore((s) => s.focusRequest)
  const { select, openEditor, openProjectForm, setHideDone } = useUiStore.getState()

  const dw = DAY_WIDTH[zoom]
  const scrollRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const [flashId, setFlashId] = useState<string | null>(null)

  const updateDrag = (next: Drag | null) => {
    dragRef.current = next
    setDrag(next)
  }

  const visibleProjects = useMemo(
    () => projects.filter((p) => !p.archived).sort((a, b) => a.order - b.order),
    [projects],
  )

  // 표시 범위: 오늘 기준 앞 6개월·뒤 12개월, 데이터가 더 넓으면 넓힌다. 월 경계로 맞춘다.
  const range = useMemo(() => {
    let start = addDaysISO(today, -180)
    let end = addDaysISO(today, 365)
    for (const item of [...projects, ...blocks]) {
      start = minISO(start, addDaysISO(item.startDate, -30))
      end = maxISO(end, addDaysISO(item.endDate, 30))
    }
    start = startOfMonthISO(start)
    end = endOfMonthISO(end)
    return { start, end, days: spanDays(start, end) }
  }, [projects, blocks, today])

  const totalW = range.days * dw
  const xOf = (iso: ISODate) => diffDays(iso, range.start) * dw

  const rows = useMemo<RowLayout[]>(() => {
    let top = 0
    return visibleProjects.map((project) => {
      const items = blocks.filter((b) => b.projectId === project.id && !(hideDone && b.done))
      const periods = items.filter((b) => b.kind === 'period')
      const markers = items.filter((b) => b.kind === 'marker')
      const periodLanes = assignLanes(
        periods.map((b) => ({ id: b.id, start: diffDays(b.startDate, range.start), end: diffDays(b.endDate, range.start) })),
      )
      // 마커는 항상 한 줄 (없으면 줄도 없음)
      const markerRow = markers.length > 0 ? MARKER_H : 0
      const height = Math.max(MIN_ROW_H, ROW_PAD * 2 + periodLanes.laneCount * LANE_H + markerRow)
      const row = { project, periods, markers, periodLanes, height, top }
      top += height
      return row
    })
  }, [visibleProjects, blocks, hideDone, range.start])
  const bodyH = rows.reduce((h, r) => h + r.height, 0)

  // ── 스크롤: 보이는 영역 왼쪽 끝 날짜를 기억해 두었다가 줌·범위·창 크기가 바뀌면 그 날짜를 다시 왼쪽 끝에 둔다.
  // '오늘' 위치는 왼쪽 끝이 오늘-2일(전전날, 전날, 오늘 순으로 보임).
  const homeDate = addDaysISO(today, -TODAY_LEAD_DAYS)
  const leftRef = useRef<ISODate>(homeDate)
  const visibleW = () => (scrollRef.current ? scrollRef.current.clientWidth - NAME_W : 0)

  const scrollToDate = (iso: ISODate, behavior: ScrollBehavior) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: diffDays(iso, range.start) * dw, behavior })
  }

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    // 절반 이상 보이는 첫 날짜를 왼쪽 끝 날짜로 본다
    leftRef.current = addDaysISO(range.start, Math.round(el.scrollLeft / dw))
  }

  useLayoutEffect(() => {
    scrollToDate(leftRef.current, 'auto')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dw, range.start])

  // 창 크기가 바뀌어도 보던 날짜가 왼쪽 끝에 남도록 (오른쪽 끝에서 줄어들며 스크롤이 밀린 경우 복원)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let lastW = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === lastW) return
      const left = leftRef.current
      lastW = el.clientWidth
      el.scrollLeft = diffDays(left, range.start) * dw
      leftRef.current = left
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [dw, range.start])

  useEffect(() => {
    const el = scrollRef.current
    if (!scrollRequest || !el) return
    if (scrollRequest.command === 'today') scrollToDate(homeDate, 'smooth')
    else el.scrollBy({ left: (scrollRequest.command === 'next' ? 1 : -1) * STEP_DAYS[zoom] * dw, behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRequest?.nonce])

  // 오늘 할 일 패널에서 항목을 누르면 그 위치로 이동하고 잠깐 강조한다
  useEffect(() => {
    if (!focusRequest) return
    const block = blocks.find((b) => b.id === focusRequest.blockId)
    const el = scrollRef.current
    if (!block || !el) return
    if (hideDone && block.done) setHideDone(false)
    const row = rows.find((r) => r.project.id === block.projectId)
    // 항목이 이미 가로로 다 보이면 가로 위치는 그대로, 아니면 '오늘' 보기와 같은 규칙으로
    // 항목 시작일-2일을 왼쪽 끝에 둔다(긴 항목은 시작 부분부터 보인다).
    const blockL = xOf(block.startDate)
    const blockR = xOf(block.endDate) + dw
    const fullyVisible = blockL >= el.scrollLeft && blockR <= el.scrollLeft + visibleW()
    const left = fullyVisible ? el.scrollLeft : xOf(addDaysISO(block.startDate, -TODAY_LEAD_DAYS))
    el.scrollTo({ left, top: row ? Math.max(0, row.top - 20) : el.scrollTop, behavior: 'smooth' })
    setFlashId(block.id)
    const t = setTimeout(() => setFlashId(null), 1800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.nonce])

  // ── 드래그 (Pointer Events, 일 단위 스냅)
  const dayAt = (clientX: number) => {
    const el = scrollRef.current
    if (!el) return 0
    const x = clientX - el.getBoundingClientRect().left + el.scrollLeft - NAME_W
    return Math.min(range.days - 1, Math.max(0, Math.floor(x / dw)))
  }

  const dragging = drag !== null
  useEffect(() => {
    if (!dragging) return
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const moved = d.moved || Math.abs(e.clientX - d.startX) > 3
      if (d.type === 'create') updateDrag({ ...d, current: dayAt(e.clientX), x: e.clientX, y: e.clientY, moved })
      else updateDrag({ ...d, delta: Math.round((e.clientX - d.startX) / dw), x: e.clientX, y: e.clientY, moved })
    }
    const onUp = (e: PointerEvent) => {
      const d = dragRef.current
      updateDrag(null)
      if (!d) return
      if (d.type === 'create') {
        if (!d.moved) {
          select(null)
          return
        }
        const s = Math.min(d.anchor, d.current)
        const t = Math.max(d.anchor, d.current)
        const block = addBlock({
          projectId: d.projectId, kind: 'period', title: '새 일정',
          startDate: addDaysISO(range.start, s), endDate: addDaysISO(range.start, t),
        })
        openEditor({ blockId: block.id, x: e.clientX, y: e.clientY, isNew: true })
        return
      }
      if (!d.moved) {
        openEditor({ blockId: d.blockId, x: e.clientX, y: e.clientY, isNew: false })
        return
      }
      const { start, end } = dragDates(d)
      if (start !== d.origStart || end !== d.origEnd) updateBlock(d.blockId, { startDate: start, endDate: end })
      select(d.blockId)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      updateDrag(null)
    }
    const onCancel = () => updateDrag(null)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, dw, range.start, range.days])

  // ── 행 순서 드래그 (이름 열을 잡고 위아래로)
  const bodyRef = useRef<HTMLDivElement>(null)
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const [rowDrag, setRowDrag] = useState<RowDrag | null>(null)
  const rowDragRef = useRef<RowDrag | null>(null)
  /** 드래그 직후 이어지는 click으로 수정 창이 열리지 않게 막는다 */
  const suppressClickRef = useRef(false)

  const updateRowDrag = (next: RowDrag | null) => {
    rowDragRef.current = next
    setRowDrag(next)
  }

  /** 포인터 y로 삽입 경계 인덱스(0..n)를 구한다. 각 행의 세로 중앙보다 아래면 그 행 다음. */
  const slotAt = (clientY: number) => {
    const body = bodyRef.current
    if (!body) return 0
    const y = clientY - body.getBoundingClientRect().top
    let slot = 0
    for (const r of rowsRef.current) {
      if (y > r.top + r.height / 2) slot++
      else break
    }
    return slot
  }

  const suppressNextClick = () => {
    suppressClickRef.current = true
    setTimeout(() => { suppressClickRef.current = false }, 0)
  }

  /** Esc로 취소한 뒤: 아직 누르고 있는 버튼을 놓을 때 생기는 click까지 무시한다 */
  const suppressUntilRelease = () => {
    suppressClickRef.current = true
    const release = () => {
      window.removeEventListener('pointerup', release, true)
      window.removeEventListener('pointercancel', release, true)
      // click은 pointerup 직후 같은 흐름에서 발생하므로 다음 틱에 해제
      setTimeout(() => { suppressClickRef.current = false }, 0)
    }
    window.addEventListener('pointerup', release, true)
    window.addEventListener('pointercancel', release, true)
  }

  const rowDragging = rowDrag !== null
  useEffect(() => {
    if (!rowDragging) return
    let raf = 0
    const onMove = (e: PointerEvent) => {
      const d = rowDragRef.current
      if (!d) return
      const active = d.active || Math.abs(e.clientY - d.startY) >= ROW_DRAG_THRESHOLD
      updateRowDrag({ ...d, y: e.clientY, active, slot: active ? slotAt(e.clientY) : d.slot })
    }
    const onUp = () => {
      const d = rowDragRef.current
      updateRowDrag(null)
      if (!d || !d.active) return
      suppressNextClick()
      // 경계 인덱스 → 이동 후 인덱스 (아래로 옮길 때는 자기 자리가 빠진다)
      const toIndex = d.slot > d.from ? d.slot - 1 : d.slot
      if (toIndex !== d.from) useAppStore.getState().moveProject(d.projectId, toIndex)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      // 4px 전(누르고만 있는 상태)이든 드래그 중이든, 놓을 때의 click으로 수정 창이 열리지 않게 한다
      if (rowDragRef.current) suppressUntilRelease()
      updateRowDrag(null)
    }
    const onCancel = () => updateRowDrag(null)
    // 가장자리 근처면 세로 자동 스크롤
    const tick = () => {
      const d = rowDragRef.current
      const el = scrollRef.current
      if (d?.active && el) {
        const rect = el.getBoundingClientRect()
        const topEdge = rect.top + HEADER_H
        let dy = 0
        if (d.y < topEdge + AUTO_SCROLL_EDGE) dy = -Math.min(1, (topEdge + AUTO_SCROLL_EDGE - d.y) / AUTO_SCROLL_EDGE)
        else if (d.y > rect.bottom - AUTO_SCROLL_EDGE) dy = Math.min(1, (d.y - (rect.bottom - AUTO_SCROLL_EDGE)) / AUTO_SCROLL_EDGE)
        if (dy !== 0) {
          const before = el.scrollTop
          el.scrollTop += Math.round(dy * AUTO_SCROLL_MAX) || Math.sign(dy)
          if (el.scrollTop !== before) {
            const slot = slotAt(d.y)
            if (slot !== d.slot) updateRowDrag({ ...d, slot })
          }
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowDragging])

  const onNamePointerDown = (e: ReactPointerEvent, projectId: string, index: number) => {
    if (e.button !== 0) return
    updateRowDrag({ projectId, from: index, startY: e.clientY, y: e.clientY, active: false, slot: index })
  }

  const onNameClick = (projectId: string) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    openProjectForm({ mode: 'edit', projectId })
  }

  const rowDragActive = rowDrag?.active ? rowDrag : null
  // 제자리(자기 위·아래 경계)면 삽입선을 숨긴다
  const insertTop = rowDragActive && rowDragActive.slot !== rowDragActive.from && rowDragActive.slot !== rowDragActive.from + 1
    ? (rowDragActive.slot < rows.length ? rows[rowDragActive.slot].top : bodyH)
    : null

  const isEmptyTarget = (e: { target: EventTarget }) => (e.target as HTMLElement).dataset.empty !== undefined

  const onRowPointerDown = (e: ReactPointerEvent, projectId: string) => {
    if (e.button !== 0 || !isEmptyTarget(e)) return
    const day = dayAt(e.clientX)
    updateDrag({ type: 'create', projectId, anchor: day, current: day, startX: e.clientX, x: e.clientX, y: e.clientY, moved: false })
  }

  const onRowDoubleClick = (e: ReactMouseEvent, projectId: string) => {
    if (!isEmptyTarget(e)) return
    const date = addDaysISO(range.start, dayAt(e.clientX))
    const block = addBlock({ projectId, kind: 'marker', title: '새 마커', startDate: date, endDate: date })
    openEditor({ blockId: block.id, x: e.clientX, y: e.clientY, isNew: true })
  }

  const onBlockPointerDown = (e: ReactPointerEvent, block: Block) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const handle = (e.target as HTMLElement).dataset.handle as 'start' | 'end' | undefined
    updateDrag({
      type: block.kind === 'marker' ? 'move' : (handle ?? 'move'),
      blockId: block.id, kind: block.kind, origStart: block.startDate, origEnd: block.endDate,
      startX: e.clientX, delta: 0, x: e.clientX, y: e.clientY, moved: false,
    })
  }

  const datesOf = (b: Block) =>
    drag && drag.type !== 'create' && drag.blockId === b.id && drag.moved
      ? dragDates(drag)
      : { start: b.startDate, end: b.endDate }

  // ── 배경: 날짜 격자 + 주말 음영 (CSS 그라디언트로 그려 요소 수를 줄인다)
  const gridStyle = useMemo<CSSProperties>(() => {
    const firstMonday = ((1 - weekdayOf(range.start) + 7) % 7) * dw
    const layers = [`linear-gradient(to right, transparent ${5 * dw}px, var(--weekend) ${5 * dw}px)`]
    const sizes = [`${7 * dw}px 100%`]
    const positions = [`${firstMonday}px 0`]
    if (zoom !== 'quarter') {
      layers.unshift('linear-gradient(to right, var(--grid) 1px, transparent 1px)')
      sizes.unshift(`${dw}px 100%`)
      positions.unshift('0 0')
    }
    return { backgroundImage: layers.join(','), backgroundSize: sizes.join(','), backgroundPosition: positions.join(',') }
  }, [range.start, dw, zoom])

  const months = useMemo(() => {
    const list: { start: ISODate; days: number; label: string }[] = []
    let m = range.start
    while (m <= range.end) {
      const d = fromISO(m)
      const end = endOfMonthISO(m)
      list.push({
        start: m,
        days: spanDays(m, end),
        label: d.getMonth() === 0 || list.length === 0 ? `${d.getFullYear()}년 ${d.getMonth() + 1}월` : `${d.getMonth() + 1}월`,
      })
      m = addDaysISO(end, 1)
    }
    return list
  }, [range.start, range.end])

  const dayLabels = useMemo(() => {
    const labels: { iso: ISODate; text: string; kind: 'sun' | 'sat' | 'day' }[] = []
    for (let i = 0; i < range.days; i++) {
      const iso = addDaysISO(range.start, i)
      const wd = weekdayOf(iso)
      if (zoom === 'quarter' && wd !== 1) continue
      const date = fromISO(iso).getDate()
      const text = zoom === 'week' ? `${date} ${weekdayLabel(iso)}` : zoom === 'month' ? String(date) : formatShort(iso)
      labels.push({ iso, text, kind: zoom === 'quarter' ? 'day' : wd === 0 ? 'sun' : wd === 6 ? 'sat' : 'day' })
    }
    return labels
  }, [range.start, range.days, zoom])

  const draggingId = drag && drag.type !== 'create' && drag.moved ? drag.blockId : null
  const todayX = (diffDays(today, range.start) + 0.5) * dw
  const bubble = drag?.moved
    ? drag.type === 'create'
      ? rangeLabel(addDaysISO(range.start, Math.min(drag.anchor, drag.current)), addDaysISO(range.start, Math.max(drag.anchor, drag.current)))
      : drag.kind === 'marker'
        ? formatShortWithDay(dragDates(drag).start)
        : rangeLabel(dragDates(drag).start, dragDates(drag).end)
    : null

  return (
    <div className="timeline">
      <div
        ref={scrollRef}
        className={`timeline__scroll zoom-${zoom}${drag?.moved || rowDragActive ? ' is-dragging' : ''}`}
        onScroll={onScroll}
      >
        <div className="timeline__inner" style={{ width: NAME_W + totalW }}>
          {/* 상단 눈금 */}
          <div className="tl-header" style={{ height: HEADER_H }}>
            <div className="tl-header__corner" style={{ width: NAME_W }}>프로젝트</div>
            <div className="tl-header__scale" style={{ width: totalW }}>
              <div className="tl-months">
                {months.map((m) => (
                  <div key={m.start} className="tl-month" style={{ width: m.days * dw }}>
                    <span className="tl-month__label" style={{ left: NAME_W + 8 }}>{m.label}</span>
                  </div>
                ))}
              </div>
              <div className="tl-days">
                {dayLabels.map((d) => (
                  <span
                    key={d.iso}
                    className={`tl-day tl-day--${d.kind}${d.iso === today ? ' tl-day--today' : ''}`}
                    style={zoom === 'quarter' ? { left: xOf(d.iso) + 2 } : { left: xOf(d.iso), width: dw }}
                  >
                    {d.text}
                  </span>
                ))}
                <span className="tl-today-label" style={{ left: todayX }}>오늘</span>
              </div>
            </div>
          </div>

          {/* 프로젝트 행 */}
          <div ref={bodyRef} className="tl-body" style={{ height: Math.max(bodyH, 1) }}>
            {rows.map((row, rowIndex) => {
              const { project } = row
              const bandLeft = xOf(project.startDate)
              const bandW = spanDays(project.startDate, project.endDate) * dw
              const ghost = drag?.type === 'create' && drag.moved && drag.projectId === project.id ? drag : null
              // 드래그 중 날짜를 반영해 매 렌더마다 배치한다(마커 수가 적어 비용은 작다)
              const markerPlaces = placeMarkers(
                row.markers.map((b) => ({ block: b, day: diffDays(datesOf(b).start, range.start) })),
                dw,
                draggingId,
              )
              return (
                <div
                  key={project.id}
                  className={`tl-row${rowDragActive?.projectId === project.id ? ' is-lifted' : ''}`}
                  style={{ height: row.height }}
                  data-project={project.id}
                >
                  <button
                    type="button"
                    className="tl-row__name"
                    style={{ width: NAME_W }}
                    onPointerDown={(e) => onNamePointerDown(e, project.id, rowIndex)}
                    onClick={() => onNameClick(project.id)}
                    title="프로젝트 수정 (끌어서 순서 변경)"
                  >
                    <span className="tl-row__grip" aria-hidden="true" />
                    <span className="dot" style={{ background: project.color }} />
                    <span className="tl-row__text">
                      <span className="tl-row__title">{project.name}</span>
                      <span className="tl-row__dates">{formatDotted(project.startDate)} ~ {formatDotted(project.endDate)}</span>
                    </span>
                  </button>
                  <div
                    className="tl-row__canvas"
                    style={{ width: totalW, ...gridStyle }}
                    data-empty=""
                    onPointerDown={(e) => onRowPointerDown(e, project.id)}
                    onDoubleClick={(e) => onRowDoubleClick(e, project.id)}
                  >
                    <div
                      className="tl-band"
                      data-empty=""
                      style={{ left: bandLeft, width: bandW, background: withAlpha(project.color, 0.1), borderColor: withAlpha(project.color, 0.35) }}
                    />

                    {row.periods.map((b) => {
                      const { start, end } = datesOf(b)
                      const color = blockColor(b, project)
                      const lane = row.periodLanes.laneOf.get(b.id) ?? 0
                      const outside = start < project.startDate || end > project.endDate
                      const onToday = !b.done && start <= today && today <= end
                      const cls = [
                        'block',
                        b.done && 'is-done',
                        outside && 'is-outside',
                        onToday && 'is-today',
                        selectedId === b.id && 'is-selected',
                        flashId === b.id && 'is-flash',
                        drag?.type !== 'create' && drag?.blockId === b.id && drag.moved && 'is-dragging',
                      ].filter(Boolean).join(' ')
                      return (
                        <div
                          key={b.id}
                          className={cls}
                          data-block={b.id}
                          style={{
                            left: xOf(start) + 1,
                            width: spanDays(start, end) * dw - 2,
                            top: ROW_PAD + lane * LANE_H,
                            height: BLOCK_H,
                            background: color,
                            color: textColorOn(color),
                          }}
                          title={`${b.title}\n${rangeLabel(start, end)}${outside ? '\n⚠ 프로젝트 기간 밖' : ''}`}
                          onPointerDown={(e) => onBlockPointerDown(e, b)}
                        >
                          <span className="block__handle block__handle--start" data-handle="start" />
                          {b.done && <span className="block__check">✓</span>}
                          <span className="block__title">{b.title || '(제목 없음)'}</span>
                          <span className="block__handle block__handle--end" data-handle="end" />
                        </div>
                      )
                    })}

                    {row.markers.map((b) => {
                      const { start } = datesOf(b)
                      const color = blockColor(b, project)
                      const place = markerPlaces.get(b.id)
                      const offset = place?.offset ?? 0
                      const extra = place && place.index === 0 ? place.count - 1 : 0
                      const showLabel = !!place && place.index === 0 && place.labelMaxW !== null
                      const outside = start < project.startDate || start > project.endDate
                      const cls = [
                        'marker',
                        b.done && 'is-done',
                        outside && 'is-outside',
                        !b.done && start === today && 'is-today',
                        selectedId === b.id && 'is-selected',
                        flashId === b.id && 'is-flash',
                      ].filter(Boolean).join(' ')
                      return (
                        <div
                          key={b.id}
                          className={cls}
                          data-block={b.id}
                          style={{
                            left: xOf(start) + dw / 2 - DIAMOND_HALF + offset,
                            top: ROW_PAD + row.periodLanes.laneCount * LANE_H,
                            zIndex: draggingId === b.id ? 4 : place && place.index > 0 ? 1 : 2,
                          }}
                          title={`${b.title}\n${formatShortWithDay(start)}${outside ? '\n⚠ 프로젝트 기간 밖' : ''}${
                            extra > 0 ? `\n\n같은 날 마커 ${place!.count}개:\n${place!.titles.map((t) => `· ${t}`).join('\n')}` : ''
                          }`}
                          onPointerDown={(e) => onBlockPointerDown(e, b)}
                        >
                          <span className="marker__diamond" style={{ background: color }} />
                          {showLabel && (
                            <span
                              className="marker__label"
                              style={{
                                maxWidth: place!.labelMaxW!,
                                marginLeft: Math.min(place!.count - 1, STACK_MAX - 1) * STACK_STEP,
                              }}
                            >
                              {b.done && <span className="block__check">✓</span>}
                              <span className="marker__text">{b.title || '(제목 없음)'}</span>
                              {extra > 0 && <span className="marker__more">외 {extra}개</span>}
                            </span>
                          )}
                        </div>
                      )
                    })}

                    {ghost && (
                      <div
                        className="block is-ghost"
                        style={{
                          left: Math.min(ghost.anchor, ghost.current) * dw + 1,
                          width: (Math.abs(ghost.current - ghost.anchor) + 1) * dw - 2,
                          top: ROW_PAD,
                          height: BLOCK_H,
                          background: withAlpha(project.color, 0.45),
                        }}
                      />
                    )}
                  </div>
                </div>
              )
            })}

            {/* 월 경계선과 오늘선 */}
            {months.slice(1).map((m) => (
              <div key={m.start} className="tl-month-line" style={{ left: NAME_W + xOf(m.start) }} />
            ))}
            <div className="tl-today-line" style={{ left: NAME_W + todayX }} />
            {insertTop !== null && <div className="tl-insert-line" style={{ top: insertTop }} />}
          </div>
        </div>
      </div>

      {visibleProjects.length === 0 && <EmptyState />}

      {bubble && drag && (
        <div className="drag-bubble" style={{ left: drag.x + 14, top: drag.y - 34 }}>{bubble}</div>
      )}
    </div>
  )
}
