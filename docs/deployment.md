# Cloudflare Workers Builds

프론트와 백엔드를 각각 별도 Worker로 배포합니다. 두 Worker의 루트 디렉터리는 저장소 루트(`/`)로 설정합니다. 의존성 설치는 Cloudflare의 자동 `npm ci`를 사용합니다.

| 설정 | 프론트엔드 | 백엔드 |
| --- | --- | --- |
| Worker 이름 | `blog` | `21st-ark-api` |
| 빌드 명령 | `npm run build:frontend` | `npm run build:backend` |
| 배포 명령 | `npm run deploy:frontend` | `npm run deploy:backend` |

루트의 기본 배포 명령 `npx wrangler deploy`는 사용하지 않습니다. 전용 npm 명령은 해당 앱 디렉터리에서 Wrangler를 실행합니다. 전용 빌드 명령을 사용하면 프론트 CI에서 백엔드 이름을 덮어쓰는 경고도 방지합니다. Cloudflare 프로젝트 이름과 해당 앱의 `wrangler.jsonc` 내 `name`은 일치해야 합니다.

## 최초 배포 순서

운영 이미지 저장소는 R2 `21st-ark-media`이며 공개 주소는 `https://media.21stark.dev`입니다. 백엔드 바인딩 이름은 `MEDIA`입니다. 운영 화면의 사진·로고는 이 주소에서 읽고, 로컬 개발은 기존 `public/assets`를 사용합니다. 새 이미지를 추가할 때는 같은 파일 이름으로 R2에 업로드한 뒤 콘텐츠에서 참조합니다.

`blog`의 workers.dev 주소는 배포 설정으로 활성화합니다. 백엔드는 프론트의 `API` service binding으로 접근하므로 별도 공개 주소가 없어도 됩니다.

1. Cloudflare D1 데이터베이스 `21st-ark-db`를 생성합니다.
2. 반환된 실제 UUID를 `apps/backend/wrangler.jsonc`의 `database_id`에 넣습니다. 현재 운영 D1 ID는 반영되어 있습니다. 새 환경을 만들 때는 해당 환경의 UUID로 교체합니다.
3. `21st-ark-api` Worker를 먼저 배포합니다. `deploy:backend`는 D1 ID가 아직 자리표시자이면 배포를 중단합니다.
4. 프론트 `blog` Worker를 배포합니다. API service binding 대상인 `21st-ark-api`가 먼저 존재해야 합니다.

로컬에서 확인하려면 `npm run dev`를 실행합니다. `npm run check`는 코드 검사, `npm run test:render`는 기존 화면 렌더링 검사입니다. `npm run db:check`는 로컬 D1 연결만 검사하며, 운영 DB를 생성하거나 변경하지 않습니다.

참고: [Cloudflare 모노레포 설정](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/), [빌드 문제 해결](https://developers.cloudflare.com/workers/ci-cd/builds/troubleshoot/).
