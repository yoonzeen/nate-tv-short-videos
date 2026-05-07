# 배포 체크리스트

## SVN / 소스 업로드에 포함할 파일

```
index.html              # Vite 엔트리 HTML
vite.config.ts          # Vite 설정 (base, 프록시, out 디렉터리)
src/                    # React 앱 소스
server/                 # Express (API + 선택적 정적 서빙)
lib/                    # 네이트 뉴스 크롤링 (Node 전용)
data/                   # (있을 경우) 정적 데이터
public/                 # 정적 자산 (favicon, 이미지 등)
package.json
package-lock.json
tsconfig.json
eslint.config.mjs
.github/workflows/      # GitHub Pages 사용 시
.gitlab-ci.yml          # GitLab Pages 사용 시
README.md
AGENTS.md
SVN_UPLOAD_GUIDE.md
DEPLOYMENT_CHECKLIST.md
CLAUDE.md
```

## 제외할 것

```
node_modules/           # 배포 서버/CI에서 npm ci
out/                    # 빌드 산출물 (저장소에 넣지 않거나 CI에서만 생성)
dist/
.next/                  # 레거시 Next 산출물 (남아 있으면 무시)
.git/
.cursor/
*.log
.env*
```

## 서버에서 Node로 API + 정적 제공 (`npm run start`)

1. **의존성 설치**
   ```bash
   npm ci
   ```

2. **정적 Pages용으로 빌드한 경우** (`GITHUB_PAGES` / `GITLAB_PAGES` / `APP_BASE_PATH`로 `base=/shortnews/`):
   ```bash
   export GITHUB_PAGES=true   # 또는 GITLAB_PAGES=true
   npm run build
   ```
   로컬 루트 경로만 쓸 때는 환경변수 없이 `npm run build` (`base=/`).

3. **실행**
   ```bash
   npm run start
   ```
   - 기본 `PORT=3000`
   - **`/api/news`**, **`/shortnews/api/news`** 동일 응답
   - `out/`을 정적으로 서빙하고 나머지는 SPA 폴백

4. **확인**
   - `http://서버:PORT/` 또는 Pages base에 맞는 URL (예: `…/shortnews/`)
   - API: `http://서버:PORT/api/news`

## GitHub Pages / GitLab Pages (정적만)

- 빌드 시 **`GITLAB_PAGES=true`** 또는 **`GITHUB_PAGES=true`** 등으로 `vite.config.ts`의 `base`가 **`/shortnews/`** 가 되도록 맞출 것.
- 산출물: **`out/`** (GitHub Actions 아티팩트는 이 경로).
- GitLab Pages는 CI에서 **`out` → `public`** 으로 옮긴 뒤 아티팩트 업로드(`.gitlab-ci.yml` 참고).
- **정적 호스팅에는 `/api/news` 백엔드가 없습니다.** 피드가 필요하면:
  - GitLab CI **CI/CD Variables**에 **`VITE_NEWS_API_URL`** = 뉴스 API **절대 URL**을 넣고 빌드하거나,
  - **`npm run start`** / 별도 Node 호스팅으로 API를 제공하세요.

## 배포 전 테스트

- TypeScript / ESLint 통과: `npm run lint`
- 프로덕션 빌드: `npm run build`
- (API 필요 시) `npm run start` 후 피드·크롤링 확인
- 반응형·모바일 터치·라우트 `/` · `/news`

## 서버 환경

- **Node.js**: 20.9.0+ (권장 22 LTS)
- **메모리**: 512MB+ (크롤링·동시 요청 시 여유 권장)
- **포트**: 개발 API 8787, Vite 5173, `npm run start` 기본 3000
- **네트워크**: 네이트 API/HTML 접근 가능해야 함

## 주요 사용자 대면 경로

1. **뉴스 피드** — 앱 루트(`/`, base 붙이면 `/shortnews/` 등)
2. **`/news`** — 메인으로 리다이렉트(클라이언트 라우팅)
