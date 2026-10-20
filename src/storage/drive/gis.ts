/**
 * Google Identity Services(GIS) 토큰 모델 래퍼.
 * - 범위는 drive.file 하나만 요청한다.
 * - 클라이언트 ID는 VITE_GOOGLE_CLIENT_ID 환경변수에서만 읽는다(하드코딩 금지, 시크릿 없음).
 * - 액세스 토큰(약 1시간 유효)은 이 기기 localStorage에 만료 시각과 함께 보관해
 *   새로고침·새 탭에서 다시 클릭하지 않도록 한다. 만료되면 버린다.
 */

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const GIS_SRC = 'https://accounts.google.com/gsi/client'
const TOKEN_KEY = 'todayline.sync.token'
/** 만료 직전 토큰은 쓰지 않는다 (요청 도중 만료 방지) */
const EXPIRY_MARGIN_MS = 2 * 60 * 1000

/* ── GIS 최소 타입 (공식 문서의 TokenClientConfig / TokenResponse 중 쓰는 부분만) ── */
interface TokenResponse {
  access_token?: string
  expires_in?: number | string
  scope?: string
  error?: string
  error_description?: string
}

interface GisNonOAuthError {
  type: 'popup_failed_to_open' | 'popup_closed' | 'unknown' | string
}

interface OverridableTokenClientConfig {
  prompt?: '' | 'none' | 'consent' | 'select_account'
  login_hint?: string
}

interface TokenClient {
  callback: (resp: TokenResponse) => void
  error_callback?: (err: GisNonOAuthError) => void
  requestAccessToken(overrideConfig?: OverridableTokenClientConfig): void
}

interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string
    scope: string
    callback: (resp: TokenResponse) => void
    error_callback?: (err: GisNonOAuthError) => void
    include_granted_scopes?: boolean
  }): TokenClient
  hasGrantedAllScopes(resp: TokenResponse, firstScope: string, ...rest: string[]): boolean
}

function gisOAuth2(): GoogleOAuth2 | null {
  const g = (window as unknown as { google?: { accounts?: { oauth2?: GoogleOAuth2 } } }).google
  return g?.accounts?.oauth2 ?? null
}

/* ── 클라이언트 ID ── */
export function getClientId(): string {
  return (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim()
}

/* ── 스크립트 동적 로드 ── */
let loadPromise: Promise<void> | null = null

export function loadGis(): Promise<void> {
  if (gisOAuth2()) return Promise.resolve()
  if (loadPromise) return loadPromise
  loadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.defer = true
    script.onload = () => (gisOAuth2() ? resolve() : reject(new Error('GIS 로드 실패')))
    script.onerror = () => {
      script.remove()
      reject(new Error('GIS 스크립트를 불러오지 못했습니다'))
    }
    document.head.appendChild(script)
  }).catch((err: unknown) => {
    loadPromise = null // 오프라인이었다면 다음에 다시 시도
    throw err
  })
  return loadPromise
}

export function isGisLoaded(): boolean {
  return gisOAuth2() !== null
}

/* ── 토큰 보관 ── */
export interface StoredToken {
  accessToken: string
  expiresAt: number // epoch ms
}

export function getValidToken(now = Date.now()): string | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const t = JSON.parse(raw) as StoredToken
    if (typeof t.accessToken !== 'string' || typeof t.expiresAt !== 'number') return null
    if (t.expiresAt - EXPIRY_MARGIN_MS <= now) {
      localStorage.removeItem(TOKEN_KEY)
      return null
    }
    return t.accessToken
  } catch {
    return null
  }
}

function storeToken(t: StoredToken): void {
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(t))
  } catch {
    /* 저장 실패해도 이번 세션 메모리 토큰으로 계속 */
  }
  memoryToken = t
}

let memoryToken: StoredToken | null = null

/** localStorage가 막힌 환경에서도 이번 페이지 동안은 토큰을 쓸 수 있게 */
export function getToken(now = Date.now()): string | null {
  const stored = getValidToken(now)
  if (stored) return stored
  if (memoryToken && memoryToken.expiresAt - EXPIRY_MARGIN_MS > now) return memoryToken.accessToken
  return null
}

export function clearToken(): void {
  memoryToken = null
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* noop */
  }
}

/* ── 토큰 요청 ── */
export class AuthError extends Error {
  /** popup_failed_to_open | popup_closed | scope_denied | access_denied 등 */
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

let client: TokenClient | null = null
let pending: { resolve: (t: string) => void; reject: (e: AuthError) => void } | null = null

function getClient(): TokenClient {
  const oauth2 = gisOAuth2()
  if (!oauth2) throw new AuthError('not_loaded', '구글 로그인 스크립트가 아직 준비되지 않았습니다.')
  if (client) return client
  client = oauth2.initTokenClient({
    client_id: getClientId(),
    scope: DRIVE_SCOPE,
    include_granted_scopes: false,
    callback: (resp) => {
      const p = pending
      pending = null
      if (!p) return
      if (resp.error || !resp.access_token) {
        p.reject(new AuthError(resp.error ?? 'unknown', resp.error_description ?? resp.error ?? '토큰을 받지 못했습니다.'))
        return
      }
      if (!oauth2.hasGrantedAllScopes(resp, DRIVE_SCOPE)) {
        p.reject(new AuthError('scope_denied', '구글 드라이브 접근 권한이 허용되지 않았습니다.'))
        return
      }
      const seconds = Number(resp.expires_in ?? 3600)
      storeToken({ accessToken: resp.access_token, expiresAt: Date.now() + (Number.isFinite(seconds) ? seconds : 3600) * 1000 })
      p.resolve(resp.access_token)
    },
    error_callback: (err) => {
      const p = pending
      pending = null
      p?.reject(new AuthError(err.type, err.type))
    },
  })
  return client
}

/**
 * 토큰 요청. 브라우저 팝업이 열리므로 반드시 버튼 클릭 처리기 안에서 (await 없이 바로) 호출한다.
 * - prompt: 'select_account' — 처음 연결(계정 선택 + 동의)
 * - prompt: '' — 이전에 동의한 사용자는 동의 화면 없이 팝업이 잠깐 열렸다 닫힌다(다시 연결용)
 */
export function requestToken(prompt: '' | 'select_account' | 'consent', loginHint?: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let c: TokenClient
    try {
      c = getClient()
    } catch (err) {
      reject(err as AuthError)
      return
    }
    pending?.reject(new AuthError('superseded', '새 요청으로 대체되었습니다.'))
    pending = { resolve, reject }
    c.requestAccessToken(loginHint ? { prompt, login_hint: loginHint } : { prompt })
  })
}
