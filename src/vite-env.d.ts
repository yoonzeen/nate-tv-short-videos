/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 정적 배포(GitLab Pages 등)에서 뉴스 API 전체 URL (예: https://xxx.vercel.app/api/news) */
  readonly VITE_NEWS_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
