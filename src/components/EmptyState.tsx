import { useAppStore } from '../store/appStore'
import { useUiStore } from '../store/uiStore'

export function EmptyState() {
  const loadSample = useAppStore((s) => s.loadSample)
  const today = useUiStore((s) => s.today)
  const openProjectForm = useUiStore((s) => s.openProjectForm)

  return (
    <div className="empty">
      <div className="empty__card">
        <h2>첫 프로젝트를 만들어 보세요</h2>
        <p>
          프로젝트를 만든 뒤 행의 빈 곳을 <b>가로로 드래그</b>하면 기간 블럭이,
          <b> 더블클릭</b>하면 시점 마커가 생깁니다. 오늘선에 걸린 일은 오른쪽 패널에 모입니다.
        </p>
        <div className="empty__actions">
          <button type="button" className="btn btn--primary" onClick={() => openProjectForm({ mode: 'create' })}>
            + 첫 프로젝트 만들기
          </button>
          <button type="button" className="btn" onClick={() => loadSample(today)}>
            샘플 데이터로 둘러보기
          </button>
        </div>
      </div>
    </div>
  )
}
