# NateTV Shorts

네이트TV 쇼츠형 영상 피드용 `Next.js` 프로젝트입니다.

세로형 전체 화면 피드에서 현재 보이는 영상만 자동 재생되며, 각 영상은 앞 `15초`까지만 재생한 뒤 다음 영상으로 자동 이동합니다.

## 주요 기능

- 세로형 `100vh` 스냅 피드
- 현재 화면의 영상만 자동 재생
- 각 영상 `15초 프리뷰` 재생 후 다음 영상으로 자동 이동
- `다시 보기` 버튼 제공
- `이 영상 보러가기` 버튼으로 `https://m.tv.nate.com/clip/{id}` 이동
- 영상 목록을 `data/videos.ts`에서 간단히 관리

## 기술 스택

- `Next.js 16`
- `React 19`
- `TypeScript`
- `CSS Modules`

## Node.js 버전

- 최소 버전: `Node.js >= 20.9.0`
- 현재 개발 확인 버전: `Node.js v22.14.0`

`Next.js 16.2.1` 기준으로 `Node.js 20.9.0` 이상이 필요합니다.
가능하면 `Node.js 22 LTS` 사용을 권장합니다.

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
```

## 프로젝트 구조

```text
app/
  layout.tsx
  page.tsx
  globals.css
components/
  ShortsFeed.tsx
  ShortsFeed.module.css
  ShortVideoCard.tsx
  ShortVideoCard.module.css
data/
  videos.ts
```

## 영상 데이터 관리

영상 목록은 `data/videos.ts`에서 관리합니다.

데이터 형식:

```ts
type VideoItem = {
  id: string;
  title: string;
  channel: string;
  description: string;
  src: string;
};
```

- `id`: 네이트TV 클립 ID
- `title`: 영상 제목
- `channel`: 채널명
- `description`: 보조 설명
- `src`: 미리보기 재생용 mp4 주소

예를 들어 `id`가 `5457957`이면 `이 영상 보러가기` 버튼은 아래 주소로 이동합니다.

```text
https://m.tv.nate.com/clip/5457957
```

## 동작 방식

1. 피드에서 현재 화면에 가장 많이 보이는 카드가 활성화됩니다.
2. 활성 카드의 영상은 자동으로 처음부터 재생됩니다.
3. 영상이 `15초`에 도달하면 재생을 멈추고 다음 카드로 부드럽게 이동합니다.
4. 마지막 영상까지 도달하면 다시 첫 번째 영상으로 돌아갑니다.

## 참고 사항

- 모바일 자동 재생 안정성을 위해 영상은 `muted`, `playsInline` 속성으로 재생됩니다.
- 실제 운영 시에는 `data/videos.ts`를 API 응답 구조 또는 CMS 데이터로 교체할 수 있습니다.
- 원본 영상 길이와 관계없이 프런트엔드에서 `15초 프리뷰`만 재생합니다.

## 검증

아래 항목으로 기본 검증을 완료했습니다.

```bash
npm run lint
npm run build
```
