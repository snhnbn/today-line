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

type BlockDragType = 'move' | 'start' | 'end'
type Drag =
  | { type: 'create'; projectId: string; anchor: number; current: number; startX: number; x: number; y: number; moved: boolean }
  | { type: BlockDragType; blockId: string; kind: Block['kind']; origStart: ISODate; origEnd: ISODate; startX: number; delta: number; x: number; y: number; moved: boolean }

interface RowLayout {
  project: Project
  periods: Block[]
  markers: Block[]
  periodLanes: LaneLayout
  markerLanes: LaneLayout
  height: number
  top: number
}

function dragDates(d: Extract<Drag, { blockId: string }>): { start: ISODate; end: ISODate } {
  if (d.type === 'move') return { start: addDaysISO(d.origStart, d.delta), end: addDaysISO(d.origEnd, d.delta) }
  if (d.type === 'start') return { start: minISO(addDaysISO(d.origStart, d.delta), d.origEnd), end: d.origEnd }
  return { start: d.origStart, end: maxISO(addDaysISO(d.origEnd, d.delta), d.origStart) }
}

/** 마커 라벨이 차지하는 대략적인 폭(px) */
function estimateLabelWidth(text: string): number {
  let w = 0
  for (const ch of text) w += ch.charCodeAt(0) > 0x1100 ? 12.5 : 7
  return Math.min(w, 220) + 26
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
      const markerLanes = assignLanes(
        markers.map((b) => {
          const s = diffDays(b.startDate, range.start)
          return { id: b.id, start: s, end: s + Math.ceil(estimateLabelWidth(b.title) / dw) }
        }),
      )
      const height = Math.max(MIN_ROW_H, ROW_PAD * 2 + periodLanes.laneCount * LANE_H + markerLanes.laneCount * MARKER_H)
      const row = { project, periods, markers, periodLanes, markerLanes, height, top }
      top += height
      return row
    })
  }, [visibleProjects, blocks, hideDone, range.start, dw])
  const bodyH = rows.reduce((h, r) => h + r.height, 0)

  // ── 스크롤: 화면 중앙 날짜를 기억해 두었다가 줌·범위가 바뀌면 그 날짜를 다시 중앙에 둔다
  const centerRef = useRef<ISODate>(today)
  const visibleW = () => (scrollRef.current ? scrollRef.current.clientWidth - NAME_W : 0)

  const scrollToDate = (iso: ISODate, behavior: ScrollBehavior) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: (diffDays(iso, range.start) + 0.5) * dw - visibleW() / 2, behavior })
  }

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const idx = Math.floor((el.scrollLeft + visibleW() / 2) / dw)
    centerRef.current = addDaysISO(range.start, idx)
  }

  useLayoutEffect(() => {
    scrollToDate(centerRef.current, 'auto')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dw, range.start])

  // 창 크기가 바뀌어도 보던 날짜가 중앙에 남도록
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let lastW = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === lastW) return
      const center = centerRef.current
      lastW = el.clientWidth
      el.scrollLeft = (diffDays(center, range.start) + 0.5) * dw - (el.clientWidth - NAME_W) / 2
      centerRef.current = center
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [dw, range.start])

  useEffect(() => {
    const el = scrollRef.current
    if (!scrollRequest || !el) return
    if (scrollRequest.command === 'today') scrollToDate(today, 'smooth')
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
    const blockW = spanDays(block.startDate, block.endDate) * dw
    const left = blockW < visibleW() * 0.8
      ? xOf(block.startDate) + blockW / 2 - visibleW() / 2
      : xOf(block.startDate) - 80
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
        className={`timeline__scroll zoom-${zoom}${drag?.moved ? ' is-dragging' : ''}`}
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
          <div className="tl-body" style={{ height: Math.max(bodyH, 1) }}>
            {rows.map((row) => {
              const { project } = row
              const bandLeft = xOf(project.startDate)
              const bandW = spanDays(project.startDate, project.endDate) * dw
              const ghost = drag?.type === 'create' && drag.moved && drag.projectId === project.id ? drag : null
              return (
                <div key={project.id} className="tl-row" style={{ height: row.height }} data-project={project.id}>
                  <button
                    type="button"
                    className="tl-row__name"
                    style={{ width: NAME_W }}
                    onClick={() => openProjectForm({ mode: 'edit', projectId: project.id })}
                    title="프로젝트 수정"
                  >
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
                      const lane = row.markerLanes.laneOf.get(b.id) ?? 0
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
                          style={{ left: xOf(start) + dw / 2 - 8, top: ROW_PAD + row.periodLanes.laneCount * LANE_H + lane * MARKER_H }}
                          title={`${b.title}\n${formatShortWithDay(start)}${outside ? '\n⚠ 프로젝트 기간 밖' : ''}`}
                          onPointerDown={(e) => onBlockPointerDown(e, b)}
                        >
                          <span className="marker__diamond" style={{ background: color }} />
                          <span className="marker__label">
                            {b.done && <span className="block__check">✓</span>}
                            {b.title || '(제목 없음)'}
                          </span>
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
