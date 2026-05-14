# 배포 체크리스트

## SVN / 소스 업로드에 포함할 파일

```
index.html              # Vite 엔트리 HTML
vite.config.ts          # Vite 설정 (base, 프록시, out 디렉터리)
src/                    # React 앱 소스
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

## 정적 앱 빌드/미리보기

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

3. **미리보기**
   ```bash
   npm run start
   ```
   - Vite preview로 `out/` 산출물을 확인합니다.

4. **확인**
   - Pages base에 맞는 URL (예: `…/shortnews/`)
   - 피드 API: `/service/api/photoslides/firstItems` 또는 `VITE_NEWS_API_URL`

## GitHub Pages / GitLab Pages (정적만)

- 빌드 시 **`GITLAB_PAGES=true`** 또는 **`GITHUB_PAGES=true`** 등으로 `vite.config.ts`의 `base`가 **`/shortnews/`** 가 되도록 맞출 것.
- 산출물: **`out/`** (GitHub Actions 아티팩트는 이 경로).
- GitLab Pages는 CI에서 **`out` → `public`** 으로 옮긴 뒤 아티팩트 업로드(`.gitlab-ci.yml` 참고).
- 배포 환경에 `/service/api/photoslides/firstItems` 경로가 없다면 GitLab CI **CI/CD Variables**에 **`VITE_NEWS_API_URL`** = photoslides API **절대 URL**을 넣고 빌드하세요.

## 배포 전 테스트

- TypeScript / ESLint 통과: `npm run lint`
- 프로덕션 빌드: `npm run build`
- `npm run start` 후 피드 표시 확인
- 반응형·모바일 터치·라우트 `/` · `/news`

## 실행 환경

- **Node.js**: 20.9.0+ (권장 22 LTS)
- **포트**: Vite dev 5173, Vite preview 기본 포트
- **네트워크**: `/service/api/photoslides/firstItems` 또는 `VITE_NEWS_API_URL` 접근 가능해야 함

## 주요 사용자 대면 경로

1. **뉴스 피드** — 앱 루트(`/`, base 붙이면 `/shortnews/` 등)
2. **`/news`** — 메인으로 리다이렉트(클라이언트 라우팅)
