/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 기본 API 대신 사용할 photoslides API 전체 URL */
  readonly VITE_NEWS_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
