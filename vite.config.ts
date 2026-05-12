import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/**
 * 프로덕션 정적 배포 시 앱 base (에셋·라우터).
 * - `APP_BASE_PATH`가 있으면 최우선 (예: `shortnews` 또는 `/shortnews`).
 * - 없으면 GitHub Pages / GitLab Pages CI에서 `/shortnews/` 사용.
 */
function resolveBase(options: { isBuild: boolean }): string {
  const explicit = process.env.APP_BASE_PATH?.trim();
  if (explicit) {
    const withLead = explicit.startsWith("/") ? explicit : `/${explicit}`;
    return withLead.endsWith("/") ? withLead : `${withLead}/`;
  }
  const staticPagesSubpath =
    process.env.GITHUB_PAGES === "true" ||
    process.env.GITLAB_PAGES === "true";

  // Nate shortform 배포는 기본이 /shortnews/ 하위 경로라서,
  // 별도 설정이 없으면 build 시에는 /shortnews/를 기본값으로 둔다.
  if (options.isBuild) {
    return staticPagesSubpath ? "/shortnews/" : "/shortnews/";
  }

  return staticPagesSubpath ? "/shortnews/" : "/";
}

export default defineConfig(({ command }) => {
  const base = resolveBase({ isBuild: command === "build" });

  return {
    plugins: [react()],
    base,
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "out",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      /* 루트 base (일반 dev) */
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
      /* base=/shortnews/ 로 dev/미리보기 할 때 */
      "/shortnews/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/shortnews/, ""),
      },
    },
  },
  };
});
