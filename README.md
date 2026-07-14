# Cloudscope

Google 계정으로 직접 인증해 Google Cloud와 Firebase 프로젝트의 사용량을
조회하는 개인용 대시보드입니다. 특정 Firebase 프로젝트나 특정 사용자 계정에
종속되지 않으며, 브랜드와 OAuth 설정을 배포 환경별로 바꿀 수 있습니다.

## 동작 구조

- `app/page.tsx`: Google Identity Services 로그인, 프로젝트 조회, Monitoring 및
  Billing API 조회를 담당하는 브라우저 UI
- `app/site-config.ts`: 환경 변수 기반의 Next/Cloudflare 브랜드 설정
- `worker/index.ts`: vinext 앱을 Cloudflare Worker에서 실행하는 진입점
- `firebase-dist/`: 서버 없이 Firebase Hosting에 올릴 수 있는 정적 버전
- `db/`: 현재 앱에서는 사용하지 않는 선택형 D1/Drizzle 골격

OAuth 액세스 토큰은 React 상태 또는 정적 페이지의 메모리에만 존재합니다.
서버와 데이터베이스에는 토큰을 전송하거나 저장하지 않습니다. 브라우저에는
공개 값인 OAuth 클라이언트 ID만 저장합니다.

## 로컬 실행

Node.js 22.13 이상이 필요합니다.

```bash
npm install
cp .env.example .env.local
npm run dev
```

환경 설정 없이 실행해도 됩니다. 이 경우 첫 화면에서 각 사용자가 자신의 OAuth
클라이언트 ID를 입력합니다.

## 내 환경에 맞추기

`.env.example`을 `.env.local`로 복사하고 필요한 값만 바꿉니다.

| 변수 | 용도 | 기본값 |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_NAME` | 헤더, 푸터, 페이지 제목 | `Cloudscope` |
| `NEXT_PUBLIC_APP_BADGE` | 브랜드 옆 배지 | `PERSONAL` |
| `NEXT_PUBLIC_APP_MARK` | 로고 상자의 1~2글자 | `C` |
| `NEXT_PUBLIC_OWNER_LABEL` | 첫 화면 상단 라벨 | `MY CLOUD` |
| `NEXT_PUBLIC_APP_DESCRIPTION` | 검색/공유 설명 | 기본 한국어 설명 |
| `NEXT_PUBLIC_ACCENT_COLOR` | 메인 색상(6자리 HEX) | `#2962ff` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | 배포 공용 OAuth 클라이언트 ID(선택) | 없음 |
| `NEXT_PUBLIC_STORAGE_KEY` | 브라우저 저장 키 | 앱 기본 키 |

`NEXT_PUBLIC_*` 값과 OAuth 클라이언트 ID는 브라우저 번들에서 공개됩니다. 여기에
클라이언트 보안 비밀이나 서비스 계정 키를 넣으면 안 됩니다.

지표를 추가하거나 제거하려면 `app/page.tsx`의 `metricDefs`를 수정합니다. 각 항목은
Cloud Monitoring metric type, 표시 단위와 색상을 정의합니다.

## Google OAuth 준비

1. Google Cloud Console에서 OAuth 동의 화면을 구성합니다.
2. OAuth 클라이언트 유형을 **웹 애플리케이션**으로 생성합니다.
3. 로컬 주소(예: `http://localhost:3000`)와 실제 배포 주소를 **승인된
   JavaScript 원본**에 추가합니다.
4. OAuth 동의 화면에 사용하는 계정을 테스트 사용자로 추가하거나 앱을
   프로덕션으로 게시합니다.
5. 연결할 프로젝트에서 Cloud Resource Manager, Cloud Monitoring, Cloud Billing,
   Service Usage API를 필요에 따라 활성화합니다.

앱이 요청하는 범위는 프로젝트, Monitoring, 결제 상태에 대한 읽기 전용
범위입니다. 사용자의 IAM 권한으로 볼 수 없는 프로젝트나 지표는 표시되지 않습니다.

## 빌드와 검증

```bash
npm run lint
npm run build
npm test
```

## Firebase Hosting 정적 배포

정적 버전은 Next 앱과 별도의 구현입니다.

1. `firebase-dist/config.js`에서 브랜드와 선택적인 `googleClientId`를 수정합니다.
2. `.firebaserc`의 `YOUR_FIREBASE_PROJECT_ID`를 자신의 Firebase 프로젝트 ID로
   교체하거나 `firebase use --add`를 실행합니다.
3. OAuth 클라이언트의 승인된 JavaScript 원본에 Firebase Hosting 주소를 넣습니다.
4. `firebase deploy --only hosting`으로 배포합니다.

정적 설정 화면에는 현재 `location.origin`이 표시되므로 특정 배포 도메인에
하드코딩되어 있지 않습니다.

## Cloudflare/vinext 배포

이 저장소는 vinext와 Cloudflare Vite 플러그인을 사용합니다. `.openai/hosting.json`
의 D1/R2는 현재 모두 선택 사항이며 대시보드 핵심 기능에는 필요하지 않습니다.
배포 환경에 `.env.local`과 같은 공개 설정 값을 등록한 후 `npm run build`로
검증하세요.
