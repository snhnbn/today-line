import { useLayoutEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { useUiStore } from '../store/uiStore'
import { isValidISO, spanDays } from '../lib/date'
import { ColorPicker } from './ColorPicker'

const WIDTH = 320

/** 블럭/마커 편집 팝오버. 바꾸는 즉시 저장된다. */
export function BlockEditor() {
  const editor = useUiStore((s) => s.editor)
  const closeEditor = useUiStore((s) => s.closeEditor)
  const select = useUiStore((s) => s.select)
  const block = useAppStore((s) => s.blocks.find((b) => b.id === editor?.blockId))
  const project = useAppStore((s) => s.projects.find((p) => p.id === block?.projectId))
  const updateBlock = useAppStore((s) => s.updateBlock)
  const deleteBlock = useAppStore((s) => s.deleteBlock)

  const ref = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const [pos, setPos] = useState({ left: 0, top: 0 })

  useLayoutEffect(() => {
    if (!editor || !ref.current) return
    const h = ref.current.offsetHeight
    const left = Math.min(Math.max(12, editor.x - WIDTH / 2), window.innerWidth - WIDTH - 12)
    const below = editor.y + 16
    const top = below + h > window.innerHeight - 12 ? Math.max(12, editor.y - h - 16) : below
    setPos({ left, top })
    if (editor.isNew) titleRef.current?.select()
    else titleRef.current?.focus()
  }, [editor])

  if (!editor || !block || !project) return null

  const isMarker = block.kind === 'marker'
  const onDelete = () => {
    if (!window.confirm(`"${block.title}"을(를) 삭제할까요?`)) return
    deleteBlock(block.id)
    select(null)
    closeEditor()
  }

  return (
    <>
      <div className="backdrop backdrop--clear" onPointerDown={closeEditor} />
      <div ref={ref} className="popover" style={{ ...pos, width: WIDTH }} role="dialog" aria-label="항목 편집">
        <div className="popover__head">
          <span className="dot" style={{ background: project.color }} />
          <span className="popover__project">{project.name}</span>
          <button type="button" className="icon-btn" onClick={closeEditor} aria-label="닫기">✕</button>
        </div>

        <label className="field">
          <span>제목</span>
          <input
            ref={titleRef}
            value={block.title}
            onChange={(e) => updateBlock(block.id, { title: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && closeEditor()}
          />
        </label>

        <div className="field">
          <span>유형</span>
          <div className="segmented">
            <button type="button" className={!isMarker ? 'is-active' : ''} onClick={() => updateBlock(block.id, { kind: 'period' })}>
              ▬ 기간
            </button>
            <button type="button" className={isMarker ? 'is-active' : ''} onClick={() => updateBlock(block.id, { kind: 'marker' })}>
              ◆ 마커
            </button>
          </div>
        </div>

        <div className="field-row">
          <label className="field">
            <span>{isMarker ? '날짜' : '시작일'}</span>
            <input
              type="date"
              value={block.startDate}
              onChange={(e) => {
                const v = e.target.value
                if (!isValidISO(v)) return
                updateBlock(block.id, isMarker ? { startDate: v, endDate: v } : { startDate: v, endDate: v > block.endDate ? v : block.endDate })
              }}
            />
          </label>
          {!isMarker && (
            <label className="field">
              <span>종료일</span>
              <input
                type="date"
                value={block.endDate}
                min={block.startDate}
                onChange={(e) => {
                  const v = e.target.value
                  if (isValidISO(v) && v >= block.startDate) updateBlock(block.id, { endDate: v })
                }}
              />
            </label>
          )}
        </div>
        {!isMarker && <div className="field__hint">{spanDays(block.startDate, block.endDate)}일</div>}

        <div className="field">
          <span>색상</span>
          <ColorPicker value={block.color} inheritColor={project.color} onChange={(color) => updateBlock(block.id, { color })} />
        </div>

        <label className="field">
          <span>메모</span>
          <textarea rows={2} value={block.note ?? ''} onChange={(e) => updateBlock(block.id, { note: e.target.value })} />
        </label>

        <div className="popover__foot">
          <label className="check">
            <input type="checkbox" checked={block.done} onChange={(e) => updateBlock(block.id, { done: e.target.checked })} />
            완료
          </label>
          <button type="button" className="btn btn--danger" onClick={onDelete}>삭제</button>
        </div>
      </div>
    </>
  )
}
