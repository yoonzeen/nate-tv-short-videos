# NATE News Story

**Vite + React** 기반의 세로형 풀스크린 뉴스 피드입니다.  
네이트 뉴스 **이모티콘(공감) 랭킹** 데이터로 카드를 채우고, 쇼츠처럼 위·아래로 넘기며 기사를 탐색할 수 있습니다.

## 주요 기능

- 세로형 전체 화면 스크롤 스냅 피드
- 자동 진행 progress bar와 일정 시간 후 다음 기사 자동 전환
- 휠, 터치 스와이프로 이전·다음 기사 이동
- 기사 제목, 언론사, 공감 수, 대표 댓글 표시
- 기사 원문(모바일/PC 링크) 새 창 이동
- 썸네일 켄번스 스타일 CSS 애니메이션(좌우 패닝·확대)
- 페이지·탭 비활성화 시 progress·애니메이션 일시정지 후 복귀 시 재개

## 데이터 수집 방식

**API와 HTML 크롤링을 함께** 사용합니다.

- 랭킹 목록과 메타(제목, 링크, 이미지, 언론사, 공감 수 등):  
  `http://api.news.nate.com:8080/ranks/emoticons` JSON API (실패 시 랭킹 HTML 페이지 파싱으로 폴백)
- 대표 댓글: 기사 페이지 HTML에서 `mid`를 찾은 뒤 댓글 HTML을 요청해 파싱

랭킹은 API 중심이고, 댓글은 기사·댓글 HTML 크롤링으로 보강합니다.  
크롤링 로직은 **Node.js 전용**이며 `lib/nateNews.ts`에서 수행하고, 브라우저는 **`GET /api/news`**(Express)로 JSON만 받습니다.

## 기술 스택

- `Vite` 6
- `React` 19, `react-router-dom` 7
- `TypeScript`
- `CSS Modules`
- `Express` — `/api/news` 및 프로덕션 정적 파일 서빙
- 서버 `fetch` + 정규식 기반 HTML 파싱 (`euc-kr` 디코딩)

## Node.js 버전

- 최소: `Node.js >= 20.9.0`
- 권장: `Node.js 22 LTS`

## 시작하기

1. 의존성 설치

```bash
npm install
```

2. 개발 실행 (API + Vite 동시)

```bash
npm run dev
```

3. 브라우저에서 확인

- 프론트: `http://localhost:5173`
- API는 Vite가 `/api`를 `http://localhost:8787`로 프록시합니다.

## 사용 가능한 스크립트

| 명령 | 설명 |
|------|------|
| `npm run dev` | Express(API, 포트 8787) + Vite dev 서버(5173) |
| `npm run build` | `out/`에 정적 빌드 (`vite build`) |
| `npm run preview` | 빌드 결과 미리보기(Vite) |
| `npm run start` | `out/` 정적 + `/api/news` — 기본 포트 3000 (`PORT` 환경변수로 변경) |
| `npm run lint` | ESLint |

## 라우트(클라이언트)

| 경로 | 설명 |
|------|------|
| `/` | 뉴스 랭킹 피드(메인) |
| `/news` | `/`로 **리다이렉트**(예전 링크 호환) |

정적 배포 시 앱 **base**가 `/shortnews/`이면 실제 URL은 호스트 설정에 따라  
`…/shortnews/`, `…/shortnews/news` 형태가 됩니다.

## API

`GET /api/news` — 쿼리 없음(랭킹 20건). Express `server/index.ts`에서 `buildNateNewsFeed` 결과를 JSON으로 반환합니다.  
프로덕션에서는 `/api/news`와 **`/shortnews/api/news`** 둘 다 같은 핸들러로 열려 있습니다.

```ts
type NateNewsItem = {
  id: string;
  rank: number;
  title: string;
  link: string;
  mobileLink?: string;
  pcLink?: string;
  imageUrl: string;
  sourceName: string | null;
  topComment: string | null;
  recommendationCount: number | null;
};

type NateNewsFeed = {
  items: NateNewsItem[];
};
```

## 앱 동작 요약

1. 클라이언트가 `/api/news`로 피드 JSON을 요청합니다. (개발 시 Vite 프록시 → 8787)
2. 서버가 네이트 이모티콘 랭킹으로 목록을 만들고, 설정에 따라 대표 댓글을 보강합니다.
3. `NewsFeed`가 세로 스냅 피드로 렌더링합니다.
4. 카드 progress가 끝나면 다음 카드로 자동 이동합니다.
5. 탭 전환·포커스 이탈 시 progress와 썸네일 모션이 멈췄다가 복귀 시 이어갑니다.

## 정적 배포 base 경로 (`/shortnews/`)

`vite.config.ts`에서 빌드 시 `base`는 다음 순서로 정해집니다.

1. **`APP_BASE_PATH`** — 예: `shortnews` 또는 `/shortnews`
2. 없으면 **`GITHUB_PAGES=true`** 또는 **`GITLAB_PAGES=true`** → `/shortnews/`
3. 그 외 로컬/일반 빌드 → `/`

- **GitHub Actions**: `.github/workflows/deploy-pages.yml`에서 `GITHUB_PAGES=true` 후 `npm run build`, 산출물은 `out/`.
- **GitLab Pages**: `.gitlab-ci.yml`에서 `GITLAB_PAGES=true` 후 빌드, `out`을 **`public`**으로 옮겨 업로드(Pages 규칙).

GitHub Pages·정적 호스팅만 쓰는 경우 **`/api/news`는 서버가 없어 동작하지 않습니다.**  
피드가 필요하면 Node 서버(`npm run start`) 등 API를 제공하는 호스팅을 쓰거나, 별도 백엔드를 두어야 합니다.

## 프로젝트 구조

```text
index.html
vite.config.ts
src/
  main.tsx
  App.tsx
  globals.css
  components/
    NewsFeed.tsx
    NewsFeed.module.css
server/
  index.ts             # Express: /api/news, (선택) out 정적 서빙
lib/
  nateNews.ts          # 랭킹·댓글 수집, buildNateNewsFeed
public/                # 정적 자산 (빌드 시 루트로 복사)
data/                  # (선택) 정적 데이터
```

## 핵심 파일

- `lib/nateNews.ts` — 랭킹 조회, 댓글 보강, `buildNateNewsFeed`
- `server/index.ts` — API 및 프로덕션 정적 서빙
- `src/App.tsx` — `BrowserRouter`, `/`·`/news`
- `src/components/NewsFeed.tsx` — 스냅 피드, 자동 전환, 스와이프·휠, 썸네일 모션
- `src/components/NewsFeed.module.css` — 뉴스 피드·카드 스타일

## 참고

- 네이트 HTML은 `euc-kr`일 수 있어 `TextDecoder("euc-kr")`로 디코딩합니다.
- 제목·댓글·언론사 문자열은 디코딩·태그 제거 등 정제 후 노출합니다.
- 이미지 URL은 네이트 썸네일 프리픽스를 보정해 사용합니다.
- 메타·OG 태그는 `index.html`에 정적으로 두었습니다(빌드 `base`에 맞춰 에셋 경로는 Vite가 처리).

## 검증

```bash
npm run lint
npm run build
```

정적 Pages용 확인 시:

```bash
# PowerShell 예시
$env:GITHUB_PAGES="true"; npm run build
# 또는
$env:GITLAB_PAGES="true"; npm run build
```
