/**
 * Drive REST API v3 (fetch 직접 호출). drive.file 범위라 이 앱이 만든 파일만 보인다.
 * 같은 OAuth 클라이언트 ID를 쓰는 모든 기기에서 같은 파일이 보인다.
 */

export const DRIVE_FILE_NAME = 'worktimeline-data.json'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const META_FIELDS = 'id,version,modifiedTime,trashed'
const TIMEOUT_MS = 20_000

export interface RemoteMeta {
  id: string
  /** 파일이 바뀔 때마다 커지는 버전 번호(문자열) */
  version: string
  /** RFC 3339 */
  modifiedTime: string
  trashed?: boolean
}

export class DriveError extends Error {
  /** HTTP 상태 코드. 0이면 네트워크 오류(오프라인·시간 초과) */
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export class DriveAdapter {
  private readonly token: string

  constructor(accessToken: string) {
    this.token = accessToken
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    let res: Response
    try {
      res = await fetch(url, {
        ...init,
        headers: { Authorization: `Bearer ${this.token}`, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch {
      throw new DriveError(0, '네트워크에 연결할 수 없습니다.')
    }
    if (!res.ok) {
      let detail = res.statusText
      try {
        const body = (await res.json()) as { error?: { message?: string } }
        detail = body.error?.message ?? detail
      } catch {
        /* 본문 없음 */
      }
      throw new DriveError(res.status, detail || `HTTP ${res.status}`)
    }
    return res
  }

  /** 이 앱이 만든 worktimeline-data.json 중 가장 최근 것. 없으면 null */
  async findFile(): Promise<RemoteMeta | null> {
    const q = `name = '${DRIVE_FILE_NAME}' and trashed = false`
    const params = new URLSearchParams({
      q,
      spaces: 'drive',
      orderBy: 'modifiedTime desc',
      pageSize: '10',
      fields: `files(${META_FIELDS})`,
    })
    const res = await this.request(`${API}/files?${params}`)
    const body = (await res.json()) as { files?: RemoteMeta[] }
    return body.files?.[0] ?? null
  }

  /** 파일 메타데이터. 지워졌거나 휴지통에 있으면 null */
  async getMeta(fileId: string): Promise<RemoteMeta | null> {
    try {
      const res = await this.request(`${API}/files/${encodeURIComponent(fileId)}?fields=${META_FIELDS}`)
      const meta = (await res.json()) as RemoteMeta
      return meta.trashed ? null : meta
    } catch (err) {
      if (err instanceof DriveError && err.status === 404) return null
      throw err
    }
  }

  async download(fileId: string): Promise<string> {
    const res = await this.request(`${API}/files/${encodeURIComponent(fileId)}?alt=media`, { cache: 'no-store' })
    return res.text()
  }

  /** 새 파일 생성 (multipart 업로드: 메타데이터 + 내용) */
  async createFile(content: string): Promise<RemoteMeta> {
    const boundary = `todayline_${Math.random().toString(36).slice(2)}`
    const metadata = { name: DRIVE_FILE_NAME, mimeType: 'application/json' }
    const body =
      `--${boundary}\r\n` +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      `${content}\r\n` +
      `--${boundary}--`
    const res = await this.request(`${UPLOAD}/files?uploadType=multipart&fields=${META_FIELDS}`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    })
    return (await res.json()) as RemoteMeta
  }

  /** 기존 파일 내용 교체 (simple 업로드) */
  async updateFile(fileId: string, content: string): Promise<RemoteMeta> {
    const res = await this.request(
      `${UPLOAD}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=${META_FIELDS}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: content,
      },
    )
    return (await res.json()) as RemoteMeta
  }

  /** 다시 연결할 때 계정 선택을 건너뛰기 위한 힌트(이메일). 실패해도 무시 */
  async getUserEmail(): Promise<string | null> {
    try {
      const res = await this.request(`${API}/about?fields=user(emailAddress)`)
      const body = (await res.json()) as { user?: { emailAddress?: string } }
      return body.user?.emailAddress ?? null
    } catch {
      return null
    }
  }
}
