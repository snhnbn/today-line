/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 구글 OAuth 클라이언트 ID (웹 애플리케이션). 없으면 드라이브 동기화가 꺼진다. */
  readonly VITE_GOOGLE_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
