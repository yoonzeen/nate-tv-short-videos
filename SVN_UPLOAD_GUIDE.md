# SVN 업로드 가이드

## 포함해야 할 파일/폴더
- `app/` - Next.js 앱 라우터 파일들
- `components/` - React 컴포넌트들
- `lib/` - 유틸리티 함수들
- `data/` - 정적 데이터 파일들
- `public/` - 정적 자산들
- `package.json` - 의존성 정보
- `package-lock.json` - 정확한 의존성 버전
- `next.config.ts` - Next.js 설정
- `tsconfig.json` - TypeScript 설정
- `eslint.config.mjs` - ESLint 설정
- `README.md` - 프로젝트 문서
- `AGENTS.md` - 에이전트 규칙
- `CLAUDE.md` - Claude 규칙

## 제외해야 할 파일/폴더
- `node_modules/` - 의존성 패키지들 (용량 큼)
- `.next/` - 빌드 결과물
- `out/` - Static export 결과물
- `.git/` - Git 버전 관리 폴더
- `.github/` - GitHub Actions 설정
- `.cursor/` - Cursor IDE 설정
- `*.log` - 로그 파일들
- `.env*` - 환경변수 파일들

## 배포 후 서버에서 실행할 명령어
```bash
# 의존성 설치
npm install

# 프로덕션 빌드
npm run build

# 서버 실행
npm run start
```

## 서버 요구사항
- Node.js 18+ 
- npm 또는 yarn
- 3000번 포트 사용 가능