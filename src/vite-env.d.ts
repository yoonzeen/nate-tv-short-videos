/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 정적 배포에서 /service/api 경로가 없을 때 사용할 photoslides API 전체 URL */
  readonly VITE_NEWS_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
