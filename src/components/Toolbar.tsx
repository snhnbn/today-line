import { useRef } from 'react'
import { useAppStore } from '../store/appStore'
import { useUiStore, type Zoom } from '../store/uiStore'
import { downloadAppData, readAppDataFile } from '../storage/jsonFile'
import { AppDataError } from '../lib/appData'
import { SyncStatus } from './SyncStatus'

const ZOOMS: { key: Zoom; label: string }[] = [
  { key: 'week', label: '주' },
  { key: 'month', label: '월' },
  { key: 'quarter', label: '분기' },
]

export function Toolbar() {
  const zoom = useUiStore((s) => s.zoom)
  const hideDone = useUiStore((s) => s.hideDone)
  const { setZoom, setHideDone, requestScroll, openProjectForm, closeEditor, select } = useUiStore.getState()
  const saveError = useAppStore((s) => s.saveError)
  const fileRef = useRef<HTMLInputElement>(null)

  const onExport = () => downloadAppData(useAppStore.getState().toAppData())

  const onImportFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const data = await readAppDataFile(file)
      const ok = window.confirm(
        `프로젝트 ${data.projects.length}개, 항목 ${data.blocks.length}개를 불러옵니다.\n지금 브라우저에 있는 데이터는 모두 이 파일 내용으로 바뀝니다. 계속할까요?`,
      )
      if (!ok) return
      closeEditor()
      select(null)
      useAppStore.getState().replaceAll(data)
      requestScroll('today')
    } catch (err) {
      window.alert(err instanceof AppDataError ? `불러오지 못했습니다.\n${err.message}` : '파일을 읽는 중 문제가 생겼습니다.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <header className="toolbar">
      <div className="toolbar__brand">
        <span className="brand-mark" aria-hidden="true" />
        Today Line
      </div>
      <button type="button" className="btn btn--primary" onClick={() => openProjectForm({ mode: 'create' })}>
        + 프로젝트
      </button>

      <div className="segmented" role="group" aria-label="보기 단위">
        {ZOOMS.map((z) => (
          <button key={z.key} type="button" className={zoom === z.key ? 'is-active' : ''} onClick={() => setZoom(z.key)}>
            {z.label}
          </button>
        ))}
      </div>

      <div className="nav">
        <button type="button" className="btn btn--icon" onClick={() => requestScroll('prev')} aria-label="이전">◀</button>
        <button type="button" className="btn" onClick={() => requestScroll('today')}>오늘</button>
        <button type="button" className="btn btn--icon" onClick={() => requestScroll('next')} aria-label="다음">▶</button>
      </div>

      <label className="check toolbar__toggle">
        <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
        완료 숨기기
      </label>

      <span className="spacer" />
      <SyncStatus />
      {saveError && <span className="save-error" role="alert">{saveError}</span>}
      <button type="button" className="btn" onClick={onExport}>내보내기</button>
      <button type="button" className="btn" onClick={() => fileRef.current?.click()}>불러오기</button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => void onImportFile(e.target.files?.[0])}
      />
    </header>
  )
}
