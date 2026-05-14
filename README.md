# NATE News Story

**Vite + React** 기반의 세로형 풀스크린 뉴스 피드입니다.  
네이트 뉴스 **이모티콘(공감) 랭킹** 데이터로 카드를 채우고, 쇼츠처럼 위·아래로 넘기며 기사를 탐색할 수 있습니다.

## 주요 기능

- 세로형 전체 화면 스크롤 스냅 피드
- 자동 진행 progress bar와 일정 시간 후 다음 기사 자동 전환
- 휠, 터치 스와이프로 이전·다음 기사 이동
- 기사 제목, 언론사, 공감 수, 베플 표시
- 기사 원문(모바일/PC 링크) 새 창 이동
- 썸네일 켄번스 스타일 CSS 애니메이션(좌우 패닝·확대)
- 페이지·탭 비활성화 시 progress·애니메이션 일시정지 후 복귀 시 재개

## 데이터 수집 방식

**photoslides API를 직접** 사용합니다.

- 뉴스 목록과 메타(제목, 링크, 이미지, 언론사, 공감 수, 베플 등):  
  `/service/api/photoslides/firstItems` JSON API
- 베플: `firstItems` 응답의 `bestCmtContent`를 사용

브라우저가 photoslides API 응답을 받아 앱 내부 피드 형식으로 변환합니다.  
로컬 개발에서는 Vite 프록시가 `/service/api/*`를 Nate API로 전달합니다.

## 기술 스택

- `Vite` 6
- `React` 19, `react-router-dom` 7
- `TypeScript`
- `CSS Modules`

## Node.js 버전

- 최소: `Node.js >= 20.9.0`
- 권장: `Node.js 22 LTS`

## 시작하기

1. 의존성 설치

```bash
npm install
```

2. 개발 실행

```bash
npm run dev
```

3. 브라우저에서 확인

- 프론트: `http://localhost:5173`
- Vite가 `/service/api`를 Nate API로 프록시합니다.

## 사용 가능한 스크립트

| 명령 | 설명 |
|------|------|
| `npm run dev` | Vite dev 서버(5173) |
| `npm run build` | `out/`에 정적 빌드 (`vite build`) |
| `npm run preview` | 빌드 결과 미리보기(Vite) |
| `npm run start` | 빌드 결과 미리보기(Vite preview) |
| `npm run lint` | ESLint |

## 라우트(클라이언트)

| 경로 | 설명 |
|------|------|
| `/` | 뉴스 랭킹 피드(메인) |
| `/news` | `/`로 **리다이렉트**(예전 링크 호환) |

정적 배포 시 앱 **base**가 `/shortnews/`이면 실제 URL은 호스트 설정에 따라  
`…/shortnews/`, `…/shortnews/news` 형태가 됩니다.

## API

`GET /service/api/photoslides/firstItems` — photoslides 목록을 반환합니다.  
앱은 응답의 `data[]`를 내부 피드 아이템으로 변환합니다.

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

1. 클라이언트가 `/service/api/photoslides/firstItems`로 피드 JSON을 요청합니다.
2. `NewsFeed`가 photoslides API 응답을 앱 피드 형식으로 변환합니다.
3. `NewsFeed`가 세로 스냅 피드로 렌더링합니다.
4. 카드 progress가 끝나면 다음 카드로 자동 이동합니다.
5. 탭 전환·포커스 이탈 시 progress와 썸네일 모션이 멈췄다가 복귀 시 이어갑니다.

## 정적 배포 base 경로 (`/shortnews/`)

`vite.config.ts`에서 빌드 시 `base`는 다음 순서로 정해집니다.

1. **`APP_BASE_PATH`** — 예: `shortnews` 또는 `/shortnews`
2. 없으면 **`GITHUB_PAGES=true`** 또는 **`GITLAB_PAGES=true`** → `/shortnews/`
3. 그 외 로컬/일반 빌드 → `/`

- **GitHub Actions**: `.github/workflows/deploy-pages.yml`에서 `GITHUB_PAGES=true` 후 `npm run build`, 산출물은 `out/`.
- **GitLab Pages**: `.gitlab-ci.yml`에서 `GITLAB_PAGES=true` 후 빌드, `out`을 **`public`**으로 옮겨 업로드(Pages 규칙). 배포 환경에서 `/service/api/photoslides/firstItems` 경로가 열려 있지 않다면 **`VITE_NEWS_API_URL`**에 전체 API URL을 넣고 빌드하세요.

GitHub Pages·정적 호스팅만 쓰는 경우에도 마찬가지로, **`VITE_NEWS_API_URL`**로 접근 가능한 API 전체 URL을 지정하면 됩니다.

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
public/                # 정적 자산 (빌드 시 루트로 복사)
data/                  # (선택) 정적 데이터
```

## 핵심 파일

- `src/App.tsx` — `BrowserRouter`, `/`·`/news`
- `src/components/NewsFeed.tsx` — 스냅 피드, 자동 전환, 스와이프·휠, 썸네일 모션
- `src/components/NewsFeed.module.css` — 뉴스 피드·카드 스타일

## 참고

- 제목·베플·언론사 문자열은 디코딩·태그 제거 등 정제 후 노출합니다.
- 이미지 URL은 API 응답값을 그대로 사용합니다.
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
