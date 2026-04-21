# 배포 체크리스트

## ✅ SVN 업로드 준비 완료

### 포함할 파일들
```
app/                    # Next.js App Router
components/             # React 컴포넌트
lib/                    # 유틸리티 (네이트 뉴스 크롤링)
data/                   # 정적 데이터
public/                 # 정적 자산 (이미지 등)
package.json           # 의존성 정보
package-lock.json      # 정확한 버전 고정
next.config.ts         # Next.js 설정
tsconfig.json          # TypeScript 설정
eslint.config.mjs      # 린팅 규칙
README.md              # 프로젝트 문서
AGENTS.md              # AI 에이전트 규칙
SVN_UPLOAD_GUIDE.md    # SVN 업로드 가이드
DEPLOYMENT_CHECKLIST.md # 이 파일
```

### 제외할 파일들
```
node_modules/          # 의존성 (서버에서 설치)
.next/                 # 빌드 결과 (서버에서 생성)
.git/                  # Git 관련
.github/               # GitHub Actions
.cursor/               # Cursor IDE 설정
*.log                  # 로그 파일
.env*                  # 환경변수
```

## 🚀 서버 배포 후 실행 순서

1. **의존성 설치**
   ```bash
   npm install
   ```

2. **프로덕션 빌드**
   ```bash
   npm run build
   ```

3. **서버 실행**
   ```bash
   npm run start
   ```

4. **확인**
   - 브라우저: `http://서버주소:3000`
   - 메인 페이지: `/` (IssuePlus)
   - 뉴스 페이지: `/news` (실시간 네이트 뉴스)

## 📋 테스트 완료 항목

- ✅ TypeScript 컴파일
- ✅ 린팅 통과
- ✅ 프로덕션 빌드 성공
- ✅ 네이트 뉴스 크롤링 동작
- ✅ 광고 삽입 시스템
- ✅ 동적 OG 태그
- ✅ 반응형 UI
- ✅ 모바일 터치 지원

## 🔧 서버 환경

- **Node.js**: 20.9.0+ (권장: 22 LTS)
- **메모리**: 512MB+
- **포트**: 3000 (변경 가능)
- **네트워크**: 외부 API 접근 필요

## 📱 지원 기능

1. **네이트 뉴스 피드** (`/news`)
   - 실시간 1-100위 랭킹
   - 광고 삽입 (10개마다)
   - 소셜 공유
   - 자동 슬라이드

2. **IssuePlus 피드** (`/issueplus`)
   - 정적 콘텐츠
   - 영상 자동재생
   - 세로형 스크롤

업로드 준비 완료! 🎉