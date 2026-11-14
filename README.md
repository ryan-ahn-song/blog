# 21st ARK

React 프론트엔드와 Cloudflare Workers 백엔드를 분리한 npm workspaces 프로젝트입니다. 기존 화면·예시 데이터·검색·필자 필터·글 상세·좋아요·저장 동작을 유지합니다. 새 디자인과 서비스 기능은 추가하지 않았습니다.

## 구성

```text
apps/
  frontend/               React + Vite, 독립 배포: 21st-ark-web
    src/                  React 화면, 기존 스타일, 예시 데이터
    public/assets/        이미지와 제공받은 로고
    worker.ts             /api/* → 별도 백엔드 Worker로 전달
    wrangler.jsonc        정적 파일 + API service binding
  backend/                TypeScript Worker, 독립 배포: 21st-ark-api
    src/index.ts          서버 진입점, 개발 상태 확인용 /api/health
    migrations/           향후 D1 스키마 변경 파일
    wrangler.jsonc        백엔드 전용 D1 DB 바인딩
scripts/
  deploy-backend.mjs       실제 D1 ID 설정 확인 후 배포
```

화면은 React 컴포넌트와 상태로 렌더링합니다. 기존 HTML 문자열 삽입·전역 이벤트 방식은 제거했습니다. 현재 데이터는 프론트엔드의 예시이며, 좋아요·저장은 기존처럼 브라우저 localStorage를 사용합니다. 데이터베이스에 글을 저장하는 API, 로그인, 댓글은 구현하지 않았습니다.

## 개발 시작

Node.js 22.12 이상과 npm을 사용합니다. 저장소 루트에서 실행합니다.

```sh
npm ci
npm run dev
```

- 프론트엔드: http://localhost:3000
- 백엔드: http://127.0.0.1:8787/api/health
- 로컬 프론트엔드의 `/api/*` 요청은 Vite proxy로 백엔드에 전달됩니다.
- 배포 후에는 프론트엔드 Worker의 service binding으로 별도 백엔드에 전달됩니다. 브라우저에서 다른 도메인으로 직접 요청하지 않습니다.
- 한쪽만 실행: `npm run dev:frontend`, `npm run dev:backend`
- 상태 확인 API는 프로세스 응답 확인용이며 DB 연결 성공을 의미하지 않습니다.

## 검증과 빌드

```sh
npm run check
npm run test:render
npm run build
npm run db:check
```

`check`는 TypeScript 서버 코드와 프론트엔드 배포 Worker를 확인합니다. React JSX는 Vite 빌드로 구문·모듈 연결을 확인합니다. 프론트엔드는 `apps/frontend/dist`, 백엔드는 `apps/backend/dist`에 배포 산출물을 생성합니다. 백엔드 빌드는 Wrangler dry-run으로 실제 배포 없이 검증합니다.

## D1 개발 환경

`apps/backend/wrangler.jsonc`의 `DB`는 Cloudflare D1 바인딩입니다. 현재 `database_id`의 0으로 된 UUID는 로컬 개발용 자리표시자이며 실제 클라우드 DB를 의미하지 않습니다. Wrangler 로컬 개발과 `db:check`는 로컬 D1을 사용하며 로그인이나 원격 DB가 필요 없습니다.

```sh
npm run db:check
npm run db:migrate:local
```

마이그레이션 폴더는 준비만 했으며 서비스 테이블이나 예시 데이터를 D1에 추가하지 않았습니다. 실제 테이블 설계는 글 작성·계정 기능을 구현할 때 진행합니다.

## Cloudflare 배포 준비

프론트엔드와 백엔드는 서로 다른 Workers로 독립 배포합니다. D1 접근 권한은 백엔드에만 둡니다. 원격 리소스 생성·배포는 아직 실행하지 않았습니다.

1. `npx wrangler login`으로 Cloudflare 계정에 로그인합니다.
2. `npx wrangler d1 create 21st-ark-db`로 실제 D1을 만듭니다.
3. 반환된 UUID를 `apps/backend/wrangler.jsonc`의 `database_id`에 넣습니다.
4. 루트에서 `npm run deploy:backend`를 실행합니다.
5. 루트에서 `npm run deploy:frontend`를 실행합니다.

프론트엔드의 `services[].service`는 백엔드의 Worker 이름과 일치해야 합니다. 향후 운영용 마이그레이션은 `apps/backend`에서 `npx wrangler d1 migrations apply DB --remote`로 명시적으로 적용합니다. 현재 자동 실행하지 않습니다. 비밀 값은 로컬 `.dev.vars`와 Cloudflare secrets로 관리하고 Git에 올리지 않습니다.

Cloudflare Git 빌드 연결 시 루트에서 `npm ci` 후, 프론트엔드는 `npm run deploy:frontend`, 백엔드는 `npm run deploy:backend`를 각각 실행하도록 설정합니다. 각 Worker의 변경 경로는 `apps/frontend/**`, `apps/backend/**`이고 공통 설치 파일은 루트 `package.json`, `package-lock.json`입니다.

참고: [Workers 정적 파일과 서버](https://developers.cloudflare.com/workers/static-assets/), [D1 로컬 개발](https://developers.cloudflare.com/d1/best-practices/local-development/).
