import { useState, type FormEvent } from 'react'
import { useAppStore } from '../store/appStore'
import { useUiStore } from '../store/uiStore'
import { PALETTE } from '../lib/color'
import { addDaysISO, isValidISO } from '../lib/date'
import { ColorPicker } from './ColorPicker'

/** 프로젝트 추가·수정 대화상자 */
export function ProjectForm() {
  const form = useUiStore((s) => s.projectForm)
  const close = useUiStore((s) => s.closeProjectForm)
  const today = useUiStore((s) => s.today)
  const requestScroll = useUiStore((s) => s.requestScroll)
  const projects = useAppStore((s) => s.projects)
  const blockCount = useAppStore((s) => s.blocks.filter((b) => form?.mode === 'edit' && b.projectId === form.projectId).length)
  const { addProject, updateProject, deleteProject } = useAppStore.getState()

  const existing = form?.mode === 'edit' ? projects.find((p) => p.id === form.projectId) : undefined
  const [name, setName] = useState(existing?.name ?? '')
  const [color, setColor] = useState(existing?.color ?? PALETTE[projects.length % PALETTE.length].value)
  const [startDate, setStartDate] = useState(existing?.startDate ?? today)
  const [endDate, setEndDate] = useState(existing?.endDate ?? addDaysISO(today, 90))
  const [memo, setMemo] = useState(existing?.memo ?? '')
  const [error, setError] = useState('')

  if (!form) return null

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('프로젝트 이름을 입력하세요.')
    if (!isValidISO(startDate) || !isValidISO(endDate)) return setError('착수일과 종료일을 입력하세요.')
    if (startDate > endDate) return setError('종료일이 착수일보다 빠릅니다.')
    const input = { name: name.trim(), color, startDate, endDate, memo: memo.trim() }
    if (existing) updateProject(existing.id, input)
    else {
      addProject(input)
      requestScroll('today')
    }
    close()
  }

  const onDelete = () => {
    if (!existing) return
    const msg = blockCount > 0
      ? `"${existing.name}" 프로젝트와 그 안의 항목 ${blockCount}개를 모두 삭제할까요? 되돌릴 수 없습니다.`
      : `"${existing.name}" 프로젝트를 삭제할까요?`
    if (!window.confirm(msg)) return
    deleteProject(existing.id)
    close()
  }

  return (
    <>
      <div className="backdrop" onPointerDown={close} />
      <form className="modal" onSubmit={onSubmit} role="dialog" aria-label={existing ? '프로젝트 수정' : '새 프로젝트'}>
        <h2>{existing ? '프로젝트 수정' : '새 프로젝트'}</h2>
        <label className="field">
          <span>이름</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 기록화 사업" />
        </label>
        <div className="field">
          <span>색상</span>
          <ColorPicker value={color} onChange={(c) => c && setColor(c)} />
          {existing && <span className="field__hint">색을 바꾸면 색을 따로 정하지 않은 블럭·마커도 함께 바뀝니다.</span>}
        </div>
        <div className="field-row">
          <label className="field">
            <span>착수일</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="field">
            <span>종료일</span>
            <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>메모</span>
          <textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal__foot">
          {existing && <button type="button" className="btn btn--danger" onClick={onDelete}>삭제</button>}
          <span className="spacer" />
          <button type="button" className="btn" onClick={close}>취소</button>
          <button type="submit" className="btn btn--primary">{existing ? '저장' : '만들기'}</button>
        </div>
      </form>
    </>
  )
}
