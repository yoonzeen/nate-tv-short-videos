# NateTV Shorts

`Next.js` 기반의 세로형 쇼츠 스타일 피드 프로젝트입니다.  
현재는 Nate 뉴스 랭킹 피드를 중심으로, `/news`와 `/news?id={articleId}` 진입을 지원하는 뉴스 쇼츠 UI를 제공합니다.

## 주요 기능

- 세로형 전체 화면 스냅 피드
- 자동 진행 progress bar와 다음 기사 자동 전환
- 휠, 터치 스와이프 기반 이전/다음 기사 이동
- `/news?id={articleId}` 딥링크 진입 지원
- 기사 제목, 언론사, 공감 수, 대표 댓글 노출
- 공유 버튼, 기사 원문 이동 버튼 제공
- 페이지 비활성화 시 progress 일시정지 후 복귀 시 재개
- 10개 단위 광고 카드 삽입

## 데이터 수집 방식

이 프로젝트는 **API + HTML 크롤링을 결합한 하이브리드 방식**으로 구현되어 있습니다.

- 랭킹 뉴스 기본 목록, 제목, 링크, 이미지, 언론사, 공감 수:
  `http://api.news.nate.com:8080/ranks/emoticons`
- 대표 댓글:
  Nate 기사 HTML에서 `mid`를 추출한 뒤 댓글 HTML을 요청해 파싱
- 딥링크 기사 상세(`/news?id=...`):
  기사 상세 페이지 HTML에서 제목, 이미지, 언론사를 직접 파싱

즉, **랭킹/공감 수는 API 중심**, **댓글/딥링크 상세는 선택적 크롤링 중심** 구조입니다.

## 기술 스택

- `Next.js 16`
- `React 19`
- `TypeScript`
- `CSS Modules`
- 서버 측 `fetch`
- 정규식 기반 HTML 파싱

## Node.js 버전

- 최소 버전: `Node.js >= 20.9.0`
- 권장 버전: `Node.js 22 LTS`

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

## 주요 페이지

- `/` - NateTV 스타일 홈 피드
- `/issueplus` - 이슈플러스 피드
- `/news` - Nate 뉴스 랭킹 피드
- `/news?id={articleId}` - 특정 기사를 첫 카드로 보여주는 딥링크
- `/api/news` - 뉴스 피드 JSON API

## `/news` 동작 방식

1. 서버에서 Nate 랭킹 API를 호출해 뉴스 기본 목록을 가져옵니다.
2. 필요한 기사에 한해 대표 댓글을 크롤링해 데이터를 보강합니다.
3. `id` 쿼리가 있으면 해당 기사를 첫 카드로 구성한 뒤, 랭킹 뉴스는 그 다음부터 이어 붙입니다.
4. 클라이언트는 서버가 내려준 순서를 그대로 세로형 스냅 피드로 렌더링합니다.
5. 각 카드의 progress가 끝나면 다음 카드로 자동 이동합니다.
6. 탭 전환, 포커스 이탈, 기사 원문 확인 중에는 progress가 일시정지됩니다.

## API 응답 형태

`/api/news`는 아래 구조의 JSON을 반환합니다.

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
  isAd?: boolean;
};

type NateNewsFeed = {
  items: NateNewsItem[];
  leadArticleId?: string;
};
```

예시:

```text
/api/news
/api/news?id=20260503n12961
/api/news?quick=true
```

## 프로젝트 구조

```text
app/
  api/news/route.ts
  issueplus/page.tsx
  news/page.tsx
  globals.css
  layout.tsx
  page.tsx
components/
  IssuePlusFeed.tsx
  IssuePlusFeed.module.css
  NewsFeed.tsx
  ShortsFeed.tsx
  ShortVideoCard.tsx
lib/
  nateNews.ts
public/
  og-image.png
  images/
    ad-banner.png
    btn-link.png
    ico-reple.png
```

## 핵심 파일 설명

- `lib/nateNews.ts`
  Nate 뉴스 데이터 수집, HTML 파싱, 댓글 보강, 딥링크 기사 병합 로직
- `app/api/news/route.ts`
  뉴스 피드 JSON 응답 API
- `app/news/page.tsx`
  서버에서 초기 뉴스 피드를 받아 렌더링하는 페이지
- `components/NewsFeed.tsx`
  세로형 뉴스 피드 UI, 자동 전환, URL 동기화, progress 제어
- `components/IssuePlusFeed.tsx`
  이슈플러스용 세로형 피드

## 참고 사항

- Nate 문서는 `euc-kr` 인코딩일 수 있어 `TextDecoder("euc-kr")`로 디코딩합니다.
- 기사 제목/댓글/언론사는 HTML 정리와 문자열 정제 과정을 거쳐 화면에 노출됩니다.
- 이미지 URL은 Nate 썸네일 프리픽스를 제거해 절대 경로 형태로 정규화합니다.
- 광고 카드는 뉴스 10개마다 1개씩 삽입됩니다.

## 검증

기본 검증 명령:

```bash
npm run lint
npm run build
npm run build:check
```
