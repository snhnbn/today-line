/**
 * SyncManager — 로컬(IndexedDB, 항상 먼저) ↔ 구글 드라이브(worktimeline-data.json) 조율.
 *
 * - 스토어가 ready가 된 뒤 startSync()를 한 번 호출한다 (여러 번 불러도 안전).
 * - 로컬 변경 → 3초 디바운스 후 업로드. 업로드 전에 드라이브 version을 확인해
 *   다른 기기에서 바뀌었으면 덮어쓰지 않고 충돌 선택지를 띄운다.
 * - 창 포커스 복귀·약 90초마다 드라이브 변경을 확인해, 로컬이 그대로면 자동으로 받아온다.
 * - 드라이브 실패(오프라인·토큰 만료·서버 오류)는 상태만 바꾸고 로컬 사용은 막지 않는다.
 */
import type { AppData } from '../types'
import { useAppStore } from '../store/appStore'
import { useUiStore } from '../store/uiStore'
import { parseAppDataJson } from '../lib/appData'
import { AuthError, clearToken, getClientId, getToken, isGisLoaded, loadGis, requestToken } from '../storage/drive/gis'
import { DriveAdapter, DriveError, type RemoteMeta } from '../storage/drive/driveAdapter'
import { decideSync, hashAppData, isEmptyData, type SyncBase } from './logic'
import { useSyncStore, type SyncPhase, type VersionSummary } from './syncStore'

const DEBOUNCE_MS = 3_000
const POLL_MS = 90_000
const FOCUS_THROTTLE_MS = 10_000

/* ── 이 기기 전용 기록 (localStorage) ── */
const K_CONNECTED = 'todayline.sync.connected'
const K_BASE = 'todayline.sync.base'
const K_EMAIL = 'todayline.sync.email'
const K_LOCAL_CHANGED = 'todayline.sync.localChangedAt'

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function lsSet(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* 저장 불가 환경: 다음 실행 때 처음 기기처럼 동작할 뿐 데이터는 안전 */
  }
}

function loadBase(): SyncBase | null {
  const raw = lsGet(K_BASE)
  if (!raw) return null
  try {
    const b = JSON.parse(raw) as SyncBase
    return typeof b.fileId === 'string' && typeof b.version === 'string' && typeof b.hash === 'string' ? b : null
  } catch {
    return null
  }
}
function saveBase(meta: RemoteMeta, hash: string): void {
  const base: SyncBase = { fileId: meta.id, version: String(meta.version), modifiedTime: meta.modifiedTime, hash }
  lsSet(K_BASE, JSON.stringify(base))
}
const hasConnectedBefore = () => lsGet(K_CONNECTED) === '1'

/* ── 내부 상태 ── */
let started = false
let applyingRemote = false
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let lastFocusCheck = 0
let lastSyncedAt: string | null = null
let conflict: { remoteData: AppData | null; meta: RemoteMeta | null } | null = null
let chain: Promise<void> = Promise.resolve()
let queued = false

const sync = () => useSyncStore.getState()
const setPhase = (phase: SyncPhase) => sync().setPhase(phase)

/** 자동 동기화가 돌아도 되는 상태 */
function autoAllowed(): boolean {
  const k = sync().phase.kind
  return k === 'synced' || k === 'pending' || k === 'syncing' || k === 'offline' || k === 'error'
}

function serialize(data: AppData): string {
  return JSON.stringify(data, null, 2)
}

function summarize(data: Pick<AppData, 'projects' | 'blocks'>, modifiedAt: string | null): VersionSummary {
  return { projects: data.projects.length, blocks: data.blocks.length, modifiedAt }
}

function refreshDirty(): void {
  const base = loadBase()
  sync().setDirty(!base || hashAppData(useAppStore.getState()) !== base.hash)
}

function markSynced(): void {
  lastSyncedAt = new Date().toISOString()
  setPhase({ kind: 'synced', at: lastSyncedAt })
  refreshDirty()
}

/** 원격 데이터를 스토어에 반영한다. 이 변경은 다시 업로드를 유발하지 않는다. */
function applyRemote(data: AppData, modifiedTime: string): void {
  applyingRemote = true
  try {
    useAppStore.getState().replaceAll(data)
  } finally {
    applyingRemote = false
  }
  lsSet(K_LOCAL_CHANGED, modifiedTime)
}

function isEditing(): boolean {
  const ui = useUiStore.getState()
  return ui.editor !== null || ui.projectForm !== null
}

function handleError(err: unknown): void {
  console.warn('[sync]', err)
  if (err instanceof DriveError) {
    if (err.status === 401) {
      clearToken()
      setPhase({ kind: 'reconnect', reason: '로그인이 만료되었습니다.' })
      return
    }
    if (err.status === 0) {
      setPhase({ kind: 'offline' })
      return
    }
    setPhase({ kind: 'error', message: `구글 드라이브 응답 오류 (${err.status})` })
    return
  }
  setPhase({ kind: 'error', message: '동기화 중 문제가 생겼습니다.' })
}

/* ── 직렬 실행 큐: 동기화 작업은 한 번에 하나만 ── */
function exclusive(task: () => Promise<void>): Promise<void> {
  chain = chain.then(task).catch(handleError)
  return chain
}

function runSync(): Promise<void> {
  if (queued) return chain
  queued = true
  return exclusive(async () => {
    queued = false
    await syncOnce()
  })
}

async function syncOnce(): Promise<void> {
  if (!autoAllowed() || useAppStore.getState().status !== 'ready') return
  const token = getToken()
  if (!token) {
    setPhase({ kind: 'reconnect', reason: '로그인이 만료되었습니다.' })
    return
  }
  if (!navigator.onLine) {
    setPhase({ kind: 'offline' })
    return
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  setPhase({ kind: 'syncing' })
  await syncWithDrive(new DriveAdapter(token))
}

async function syncWithDrive(drive: DriveAdapter): Promise<void> {
  let base = loadBase()
  let meta = base ? await drive.getMeta(base.fileId) : null
  if (!meta) meta = await drive.findFile()
  if (base && meta && base.fileId !== meta.id) base = null

  const local = useAppStore.getState().toAppData()
  const localHash = hashAppData(local)

  let remoteData: AppData | null = null
  let remote: { hash: string; empty: boolean } | null = null
  if (meta) {
    if (base && base.version === String(meta.version)) {
      // 마지막 동기화 이후 드라이브 파일이 그대로 → 내려받을 필요 없음
      remote = { hash: base.hash, empty: false }
    } else {
      const text = await drive.download(meta.id)
      try {
        remoteData = parseAppDataJson(text)
      } catch {
        enterConflict(local, null, meta)
        return
      }
      remote = { hash: hashAppData(remoteData), empty: isEmptyData(remoteData) }
    }
  }

  // 받는 동안 사용자가 로컬을 고쳤으면 처음부터 다시 판단
  if (hashAppData(useAppStore.getState()) !== localHash) {
    void runSync()
    return
  }

  const decision = decideSync({ local: { hash: localHash, empty: isEmptyData(local) }, remote, base })
  switch (decision) {
    case 'create': {
      const created = await drive.createFile(serialize(local))
      saveBase(created, localHash)
      break
    }
    case 'push': {
      const updated = await drive.updateFile(meta!.id, serialize(local))
      saveBase(updated, localHash)
      break
    }
    case 'pull': {
      if (!remoteData || !meta || !remote) break
      if (isEditing()) {
        // 편집 창이 열려 있으면 받아오기를 미룬다 (다음 확인 때 반영)
        setPhase({ kind: 'synced', at: lastSyncedAt ?? new Date().toISOString() })
        return
      }
      applyRemote(remoteData, meta.modifiedTime)
      saveBase(meta, remote.hash)
      break
    }
    case 'noop':
      if (meta) saveBase(meta, localHash)
      break
    case 'conflict':
      enterConflict(local, remoteData, meta)
      return
  }
  markSynced()

  // 업로드하는 사이 생긴 로컬 변경은 다시 올린다
  if (hashAppData(useAppStore.getState()) !== loadBase()?.hash) schedulePush()
}

function enterConflict(local: AppData, remoteData: AppData | null, meta: RemoteMeta | null): void {
  conflict = { remoteData, meta }
  setPhase({
    kind: 'conflict',
    local: summarize(local, lsGet(K_LOCAL_CHANGED)),
    remote: remoteData && meta ? summarize(remoteData, meta.modifiedTime) : null,
  })
}

/* ── 이벤트 처리 ── */
function schedulePush(): void {
  if (!autoAllowed()) return
  if (debounceTimer) clearTimeout(debounceTimer)
  if (sync().phase.kind === 'synced') setPhase({ kind: 'pending' })
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void runSync()
  }, DEBOUNCE_MS)
}

function flushPending(): void {
  if (!debounceTimer) return
  clearTimeout(debounceTimer)
  debounceTimer = null
  void runSync()
}

function onStoreChange(
  state: ReturnType<typeof useAppStore.getState>,
  prev: ReturnType<typeof useAppStore.getState>,
): void {
  if (state.projects === prev.projects && state.blocks === prev.blocks) return
  if (applyingRemote) return
  lsSet(K_LOCAL_CHANGED, new Date().toISOString())
  refreshDirty()
  const phase = sync().phase
  if (phase.kind === 'conflict') {
    setPhase({ ...phase, local: summarize(state, lsGet(K_LOCAL_CHANGED)) })
    return
  }
  schedulePush()
}

function checkRemote(): void {
  const phase = sync().phase
  // 다른 탭에서 다시 연결해 토큰이 생겼으면 이어서 동기화
  if (phase.kind === 'reconnect' && getToken()) {
    setPhase({ kind: 'syncing' })
    void runSync()
    return
  }
  if (autoAllowed()) void runSync()
}

function onFocus(): void {
  const now = Date.now()
  if (now - lastFocusCheck < FOCUS_THROTTLE_MS) return
  lastFocusCheck = now
  checkRemote()
}

/* ── 공개 API ── */

/** 스토어 status가 'ready'가 된 뒤 한 번 호출한다. 클라이언트 ID가 없으면 아무 것도 하지 않는다. */
export function startSync(): void {
  if (started || useAppStore.getState().status !== 'ready') return
  started = true
  if (!getClientId()) {
    setPhase({ kind: 'disabled' })
    return
  }
  void loadGis().catch(() => {
    /* 오프라인이면 연결 버튼을 누를 때 다시 시도 */
  })

  useAppStore.subscribe(onStoreChange)
  window.addEventListener('online', checkRemote)
  window.addEventListener('offline', () => {
    if (autoAllowed()) setPhase({ kind: 'offline' })
  })
  window.addEventListener('focus', onFocus)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') onFocus()
    else flushPending() // 다른 창으로 옮길 때 대기 중인 변경을 바로 올린다
  })
  window.addEventListener('pagehide', flushPending)
  setInterval(() => {
    if (document.visibilityState === 'visible') checkRemote()
  }, POLL_MS)

  refreshDirty()
  if (!hasConnectedBefore()) setPhase({ kind: 'disconnected' })
  else if (!getToken()) setPhase({ kind: 'reconnect' })
  else {
    setPhase({ kind: 'syncing' })
    void runSync()
  }
}

function authMessage(err: unknown): string | null {
  if (err instanceof AuthError) {
    switch (err.code) {
      case 'popup_closed':
      case 'superseded':
        return null
      case 'popup_failed_to_open':
        return '팝업이 차단되었습니다. 주소창의 팝업 차단 표시에서 이 사이트를 허용한 뒤 다시 눌러 주세요.'
      case 'access_denied':
        return '연결이 취소되었습니다.'
      case 'scope_denied':
        return '구글 드라이브 접근을 허용해야 동기화할 수 있습니다. 다시 연결할 때 드라이브 항목에 체크해 주세요.'
      default:
        return `구글 로그인에 실패했습니다. (${err.code})`
    }
  }
  return '구글 로그인 서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.'
}

/**
 * "구글 드라이브 연결" / "다시 연결" 버튼의 onClick에서 바로 호출한다 (팝업 차단 방지).
 * 이 기기에서 연결한 적이 있으면 prompt '' + 이메일 힌트로 동의 화면 없이 토큰만 다시 받는다.
 */
export function connectDrive(): void {
  if (!getClientId()) return
  const s = sync()
  const before = s.phase.kind === 'connecting' ? null : s.phase
  const reconnecting = hasConnectedBefore()
  s.setNotice(null)
  setPhase({ kind: 'connecting' })

  const ask = () =>
    reconnecting ? requestToken('', lsGet(K_EMAIL) ?? undefined) : requestToken('select_account')
  // GIS가 이미 로드돼 있으면 클릭 처리 안에서 동기적으로 팝업을 연다
  const tokenPromise = isGisLoaded() ? ask() : loadGis().then(ask)

  tokenPromise
    .then((token) => {
      lsSet(K_CONNECTED, '1')
      void new DriveAdapter(token).getUserEmail().then((email) => {
        if (email) lsSet(K_EMAIL, email)
      })
      setPhase({ kind: 'syncing' })
      return runSync()
    })
    .catch((err: unknown) => {
      sync().setNotice(authMessage(err))
      if (sync().phase.kind !== 'connecting') return
      setPhase(before ?? (reconnecting ? { kind: 'reconnect' } : { kind: 'disconnected' }))
    })
}

/** 이 기기에서 연결 해제. 로컬 데이터는 그대로 두고, 이 기기의 토큰만 지운다. */
export function disconnectDrive(): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = null
  conflict = null
  clearToken()
  lsSet(K_CONNECTED, null)
  lsSet(K_EMAIL, null)
  sync().setNotice(null)
  setPhase({ kind: 'disconnected' })
}

/** "다시 시도" / "지금 동기화" */
export function syncNow(): void {
  if (sync().phase.kind === 'reconnect' && !getToken()) return
  if (sync().phase.kind === 'reconnect') setPhase({ kind: 'syncing' })
  if (autoAllowed()) void runSync()
}

/** 충돌 선택: 'remote' = 드라이브 버전 불러오기, 'local' = 이 기기 버전으로 덮어쓰기 */
export function resolveConflict(choice: 'remote' | 'local'): Promise<void> {
  if (sync().phase.kind !== 'conflict' || !conflict) return Promise.resolve()
  const { remoteData, meta } = conflict

  if (choice === 'remote') {
    if (!remoteData || !meta) return Promise.resolve()
    conflict = null
    const ui = useUiStore.getState()
    ui.closeEditor()
    ui.closeProjectForm()
    ui.select(null)
    applyRemote(remoteData, meta.modifiedTime)
    saveBase(meta, hashAppData(remoteData))
    markSynced()
    return Promise.resolve()
  }

  const token = getToken()
  conflict = null
  if (!token) {
    // 다시 연결하면 동기화가 다시 돌아 충돌을 다시 보여준다
    setPhase({ kind: 'reconnect', reason: '로그인이 만료되었습니다.' })
    return Promise.resolve()
  }
  setPhase({ kind: 'syncing' })
  return exclusive(async () => {
    const drive = new DriveAdapter(token)
    const local = useAppStore.getState().toAppData()
    const hash = hashAppData(local)
    const current = meta ? await drive.getMeta(meta.id) : null
    const saved = current ? await drive.updateFile(current.id, serialize(local)) : await drive.createFile(serialize(local))
    saveBase(saved, hash)
    markSynced()
  })
}
