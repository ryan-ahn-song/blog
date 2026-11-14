# 필자 로그인

왼쪽 설정 버튼 아래의 프로필 아이콘으로 로그인 창을 엽니다. 로그인 후에는 이름·이메일·역할과 로그아웃 버튼을 표시합니다. 모바일에서는 하단 메뉴 오른쪽에 프로필을 표시합니다.

로그인 상태는 D1 세션과 HttpOnly 쿠키로 7일간 유지됩니다. 운영 쿠키는 Secure, SameSite=Lax, __Host- 접두사를 사용합니다. 세션 토큰 원문이나 비밀번호는 D1에 저장하지 않습니다. 비밀번호는 scrypt(N=16384, r=8, p=5)로 해시하고 세션 토큰은 SHA-256 해시만 저장합니다. 로그인·로그아웃 POST는 Origin을 검사하며 로그인 실패 횟수는 D1에서 제한합니다.

## 로컬 계정 등록

```sh
npm run db:migrate:local
npm run auth:create-user -- --local --admin
```

이메일, 표시 이름, 비밀번호를 터미널에서 입력합니다. 비밀번호 입력은 화면에 표시하지 않으며 명령 인자로 받지 않습니다. 12–256자 비밀번호를 사용합니다. `--admin`을 생략하면 필자 계정입니다. 이미 있는 이메일을 덮어쓰지 않습니다. 공개 회원가입과 비밀번호 재설정·이메일 전송은 구현하지 않았습니다.

## 운영 계정 등록

백엔드 배포 명령은 D1 마이그레이션을 먼저 적용합니다. Cloudflare 빌드 토큰에 D1 쓰기 권한이 필요합니다. 운영 계정은 Cloudflare에 로그인한 개발자 터미널에서 아래 명령으로 만듭니다.

```sh
npm run auth:create-user -- --remote --admin
```

비밀번호는 채팅이나 GitHub에 올리지 않습니다. 운영용 기본 계정·공용 비밀번호는 만들지 않았습니다. 필자를 추가할 때는 동일 명령에서 `--admin`을 생략합니다. 로컬과 운영 D1 계정은 별개입니다.

## 검증

`npm run test:auth`는 실제 workerd와 격리된 임시 D1으로 인증 흐름을 검사합니다. 운영 데이터나 기존 로컬 D1을 수정하지 않습니다.

API: `GET /api/auth/me`, `POST /api/auth/login`, `POST /api/auth/logout`. 응답은 캐시하지 않습니다. 실제 글 작성 API는 후속 작업에서 세션과 역할을 검사하도록 연결해야 합니다.

## Google 로그인 준비

Google OAuth 클라이언트 ID는 백엔드 `wrangler.jsonc`의 `vars.GOOGLE_CLIENT_ID`에 설정합니다. 이 값은 공개 식별자이며 로컬 Wrangler 실행과 운영 배포에 함께 적용됩니다. 프론트엔드는 백엔드를 통해 인증할 예정이므로 별도 클라이언트 ID 환경 변수를 두지 않습니다.

Google 로그인 경로와 UI는 아직 구현하지 않았습니다. Google Cloud의 해당 웹 OAuth 클라이언트에 아래 주소들을 등록하고, 구현 시 접속한 도메인에 맞는 등록된 콜백을 사용하도록 맞춥니다.

| 환경 | 승인된 JavaScript 원본 | 승인된 리디렉션 URI |
| --- | --- | --- |
| 운영 | `https://21stark.dev` | `https://21stark.dev/api/auth/callback/google` |
| 추가 운영 도메인 | `https://21st-ark.dev` | `https://21st-ark.dev/api/auth/callback/google` |
| 로컬 | `http://127.0.0.1:3000` | `http://127.0.0.1:3000/api/auth/callback/google` |

기존 주소를 유지하고 새 도메인 주소를 각각 추가합니다. OAuth 동의 화면의 승인된 도메인 목록을 사용하는 경우에도 `21stark.dev`와 `21st-ark.dev`를 모두 등록합니다. 두 운영 도메인은 서로 다른 사이트이므로 로그인 세션 쿠키는 도메인별로 유지됩니다.

클라이언트 보안 비밀번호는 `GOOGLE_CLIENT_SECRET`이라는 이름으로 운영 Cloudflare Worker `21st-ark-api`의 Secret에 저장하고, 로컬에서는 Git에서 제외되는 `apps/backend/.dev.vars`에 저장합니다. 보안 비밀번호는 현재 미설정이며 저장소에 커밋하지 않습니다.
