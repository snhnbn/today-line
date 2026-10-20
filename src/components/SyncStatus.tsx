import { useState } from 'react'
import { useSyncStore, type VersionSummary } from '../sync/syncStore'
import { connectDrive, disconnectDrive, resolveConflict, syncNow } from '../sync/SyncManager'
import '../sync/syncStatus.css'

function formatTime(iso: string | null): string {
  if (!iso) return '알 수 없음'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '알 수 없음'
  const now = new Date()
  const time = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === now.toDateString()) return `오늘 ${time}`
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${time}`
}

function VersionCard({ title, v }: { title: string; v: VersionSummary | null }) {
  return (
    <div className="sync-conflict__card">
      <div className="sync-conflict__title">{title}</div>
      {v ? (
        <>
          <div>
            프로젝트 <b>{v.projects}</b>개 · 항목 <b>{v.blocks}</b>개
          </div>
          <div className="sync-conflict__time">마지막 수정: {formatTime(v.modifiedAt)}</div>
        </>
      ) : (
        <div className="sync-conflict__time">드라이브 파일을 읽을 수 없습니다(형식 오류).</div>
      )}
    </div>
  )
}

function ConflictDialog({
  local,
  remote,
  onLater,
}: {
  local: VersionSummary
  remote: VersionSummary | null
  onLater: () => void
}) {
  const [busy, setBusy] = useState(false)
  const choose = (choice: 'remote' | 'local') => {
    setBusy(true)
    void resolveConflict(choice).finally(() => setBusy(false))
  }
  return (
    <>
      <div className="backdrop" />
      <div className="modal sync-conflict" role="dialog" aria-modal="true" aria-labelledby="sync-conflict-title">
        <h2 id="sync-conflict-title">두 곳의 데이터가 서로 다릅니다</h2>
        <p className="sync-conflict__desc">
          마지막 동기화 이후 이 기기와 구글 드라이브(다른 컴퓨터)에서 각각 수정되었습니다. 남길 쪽을 고르세요.
          고르지 않은 쪽의 변경은 사라집니다.
        </p>
        <div className="sync-conflict__cards">
          <VersionCard title="이 기기" v={local} />
          <VersionCard title="구글 드라이브" v={remote} />
        </div>
        <p className="sync-conflict__tip">확실하지 않으면 먼저 [나중에]를 누르고 &lsquo;내보내기&rsquo;로 이 기기 데이터를 백업해 두세요.</p>
        <div className="modal__foot sync-conflict__foot">
          <button type="button" className="btn btn--primary" disabled={busy || !remote} onClick={() => choose('remote')}>
            드라이브 버전 불러오기
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => choose('local')}>
            이 기기 버전으로 덮어쓰기
          </button>
          <span className="spacer" />
          <button type="button" className="btn" disabled={busy} onClick={onLater}>
            나중에
          </button>
        </div>
      </div>
    </>
  )
}

/** 툴바 오른쪽에 두는 구글 드라이브 동기화 상태 표시 */
export function SyncStatus() {
  const phase = useSyncStore((s) => s.phase)
  const dirty = useSyncStore((s) => s.dirty)
  const notice = useSyncStore((s) => s.notice)
  const [menuOpen, setMenuOpen] = useState(false)
  const [conflictHidden, setConflictHidden] = useState(false)
  const [lastPhaseKind, setLastPhaseKind] = useState(phase.kind)

  // 새 충돌이 생기면 대화상자를 다시 띄운다
  if (phase.kind !== lastPhaseKind) {
    setLastPhaseKind(phase.kind)
    if (phase.kind === 'conflict') setConflictHidden(false)
  }

  const unsynced = dirty ? ' (이 기기에만 저장된 변경이 있습니다. 연결되면 자동으로 올립니다.)' : ''

  let tone = 'ok'
  let label = ''
  let title = ''
  let action: { text: string; onClick: () => void; primary?: boolean } | null = null
  let hasMenu = true

  switch (phase.kind) {
    case 'disabled':
      tone = 'off'
      label = '동기화 설정 안 됨'
      title = '구글 클라이언트 ID가 설정되지 않아 이 브라우저에만 저장합니다.'
      hasMenu = false
      break
    case 'disconnected':
      return (
        <div className="sync">
          <button type="button" className="btn" onClick={connectDrive} title="여러 컴퓨터에서 같은 데이터를 쓰려면 연결하세요">
            구글 드라이브 연결
          </button>
          {notice && <Notice text={notice} />}
        </div>
      )
    case 'connecting':
      tone = 'busy'
      label = '연결 중…'
      hasMenu = false
      break
    case 'syncing':
    case 'pending':
      tone = 'busy'
      label = '저장 중…'
      title = '구글 드라이브와 맞추는 중입니다.'
      break
    case 'synced':
      tone = 'ok'
      label = `동기화됨 · ${formatTime(phase.at).replace('오늘 ', '')}`
      title = `구글 드라이브와 동기화됨 (${formatTime(phase.at)})`
      break
    case 'offline':
      tone = 'warn'
      label = '오프라인'
      title = `인터넷 연결이 없어 이 기기에만 저장 중입니다. 연결되면 자동으로 올립니다.${unsynced}`
      break
    case 'reconnect':
      tone = 'warn'
      label = '다시 연결 필요'
      title = `${phase.reason ?? '구글 로그인이 만료되었습니다.'} 데이터는 이 기기에 안전하게 저장되고 있습니다.${unsynced}`
      action = { text: '다시 연결', onClick: connectDrive, primary: true }
      break
    case 'error':
      tone = 'warn'
      label = '동기화 오류'
      title = `${phase.message} 잠시 후 자동으로 다시 시도합니다.${unsynced}`
      action = { text: '다시 시도', onClick: syncNow }
      break
    case 'conflict':
      tone = 'danger'
      label = '충돌'
      title = '이 기기와 드라이브가 각각 수정되었습니다. 어느 쪽을 남길지 골라 주세요.'
      action = { text: '선택하기', onClick: () => setConflictHidden(false), primary: true }
      break
  }

  const canSyncNow = phase.kind === 'synced' || phase.kind === 'offline' || phase.kind === 'error'

  return (
    <div className="sync">
      {hasMenu ? (
        <button
          type="button"
          className={`sync__chip sync__chip--${tone} sync__chip--button`}
          title={title}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span className="sync__dot" aria-hidden="true" />
          {label}
        </button>
      ) : (
        <span className={`sync__chip sync__chip--${tone}`} title={title}>
          <span className="sync__dot" aria-hidden="true" />
          {label}
        </span>
      )}
      {action && (
        <button type="button" className={action.primary ? 'btn btn--primary' : 'btn'} onClick={action.onClick}>
          {action.text}
        </button>
      )}
      {notice && <Notice text={notice} />}

      {menuOpen && (
        <>
          <div className="backdrop backdrop--clear" onClick={() => setMenuOpen(false)} />
          <div className="sync__menu" role="menu">
            <p className="sync__menu-info">{title || '구글 드라이브의 worktimeline-data.json과 동기화합니다.'}</p>
            {canSyncNow && (
              <button
                type="button"
                role="menuitem"
                className="sync__menu-item"
                onClick={() => {
                  setMenuOpen(false)
                  syncNow()
                }}
              >
                지금 동기화
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className="sync__menu-item sync__menu-item--danger"
              onClick={() => {
                setMenuOpen(false)
                if (window.confirm('이 컴퓨터에서 구글 드라이브 연결을 해제할까요?\n이 컴퓨터의 데이터와 드라이브 파일은 지워지지 않습니다.')) {
                  disconnectDrive()
                }
              }}
            >
              연결 해제
            </button>
          </div>
        </>
      )}

      {phase.kind === 'conflict' && !conflictHidden && (
        <ConflictDialog local={phase.local} remote={phase.remote} onLater={() => setConflictHidden(true)} />
      )}
    </div>
  )
}

function Notice({ text }: { text: string }) {
  return (
    <span className="sync__notice" role="alert">
      {text}
      <button type="button" className="sync__notice-close" aria-label="닫기" onClick={() => useSyncStore.getState().setNotice(null)}>
        ×
      </button>
    </span>
  )
}
