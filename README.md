# NATE News Story

`Next.js` 기반의 **세로형 풀스크린 뉴스 피드** 프로젝트입니다.  
네이트 뉴스 **이모티콘(공감) 랭킹** 데이터를 바탕으로 카드를 구성하고, 쇼츠처럼 위·아래로 넘기며 기사를 탐색할 수 있습니다.

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

## 기술 스택

- `Next.js 16`
- `React 19`
- `TypeScript`
- `CSS Modules`
- 서버 `fetch` + 정규식 기반 HTML 파싱 (`euc-kr` 디코딩)

## Node.js 버전

- 최소: `Node.js >= 20.9.0`
- 권장: `Node.js 22 LTS`

## 시작하기

1. 의존성 설치

```bash
npm install
```

2. 개발 서버 실행

```bash
npm run dev
```

3. 브라우저에서 확인

```text
http://localhost:3000
```

## 사용 가능한 스크립트

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run build:check
```

## 주요 라우트

| 경로 | 설명 |
|------|------|
| `/` | 뉴스 랭킹 피드(메인) |
| `/news` | `/`로 **영구 리다이렉트**(예전 링크 호환) |
| `/api/news` | 뉴스 피드 JSON(동일 `buildNateNewsFeed` 결과) |

## 홈(`/`) 동작 요약

1. 서버에서 네이트 이모티콘 랭킹으로 기사 목록을 가져옵니다.
2. 설정에 따라 상위 구간 기사에 대해 대표 댓글을 보강합니다.
3. 클라이언트는 받은 순서 그대로 세로 스냅 피드로 렌더링합니다.
4. 카드 progress가 끝나면 다음 카드로 자동 이동합니다.
5. 탭 전환·포커스 이탈 등에는 progress와 썸네일 모션이 멈췄다가 복귀 시 이어갑니다.

## API 응답 형태

`GET /api/news` — 쿼리 문자열 없음(랭킹 20건, 상세 모드 기본값).

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

## 프로젝트 구조

```text
app/
  api/news/route.ts    # 뉴스 JSON API
  news/page.tsx        # / → 영구 리다이렉트
  page.tsx             # 뉴스 피드(메인)
  globals.css
  layout.tsx
components/
  NewsFeed.tsx
  NewsFeed.module.css
lib/
  nateNews.ts          # 랭킹·댓글 수집, 피드 빌드
public/
  og-image.png
  images/
    ico-reple.png
```

## 핵심 파일

- `lib/nateNews.ts` — 랭킹 조회, 댓글 보강, `buildNateNewsFeed`
- `app/page.tsx` — 서버에서 초기 피드 로드 후 `NewsFeed` 렌더
- `app/news/page.tsx` — `permanentRedirect("/")`
- `app/api/news/route.ts` — 클라이언트 보조용 동일 피드 JSON
- `components/NewsFeed.tsx` — 스냅 피드, 자동 전환, 스와이프·휠, 썸네일 모션
- `components/NewsFeed.module.css` — 뉴스 피드·카드 스타일

## 참고

- 네이트 HTML은 `euc-kr`일 수 있어 `TextDecoder("euc-kr")`로 디코딩합니다.
- 제목·댓글·언론사 문자열은 디코딩·태그 제거 등 정제 후 노출합니다.
- 이미지 URL은 네이트 썸네일 프리픽스를 보정해 사용합니다.
- GitHub Pages 등 정적 내보내기는 `next.config.ts`의 `GITHUB_PAGES` 설정을 참고하세요.

## 검증

```bash
npm run lint
npm run build
npm run build:check
```
