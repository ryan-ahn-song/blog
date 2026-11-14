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

## Google 로그인과 권한

Google OAuth 클라이언트 ID는 백엔드 `wrangler.jsonc`의 `vars.GOOGLE_CLIENT_ID`에 설정합니다. 이 값은 공개 식별자이며 로컬 Wrangler 실행과 운영 배포에 함께 적용됩니다. 프론트엔드는 백엔드를 통해 인증할 예정이므로 별도 클라이언트 ID 환경 변수를 두지 않습니다.

Google Cloud의 해당 웹 OAuth 클라이언트에 아래 주소들을 등록합니다. 각 운영 도메인은 같은 도메인의 콜백으로 돌아옵니다. 로컬 Google 로그인은 `http://127.0.0.1:3000`에서 사용합니다.

| 환경 | 승인된 JavaScript 원본 | 승인된 리디렉션 URI |
| --- | --- | --- |
| 운영 | `https://21stark.dev` | `https://21stark.dev/api/auth/callback/google` |
| 추가 운영 도메인 | `https://21st-ark.dev` | `https://21st-ark.dev/api/auth/callback/google` |
| 로컬 | `http://127.0.0.1:3000` | `http://127.0.0.1:3000/api/auth/callback/google` |

기존 주소를 유지하고 새 도메인 주소를 각각 추가합니다. OAuth 동의 화면의 승인된 도메인 목록을 사용하는 경우에도 `21stark.dev`와 `21st-ark.dev`를 모두 등록합니다. 두 운영 도메인은 서로 다른 사이트이므로 로그인 세션 쿠키는 도메인별로 유지됩니다.

클라이언트 보안 비밀번호는 `GOOGLE_CLIENT_SECRET`이라는 이름으로 운영 Cloudflare Worker `21st-ark-api` → Settings → Runtime variables and secrets → Add variable → Secret에 저장합니다. 빌드 변수가 아닌 런타임 Secret입니다. 로컬에서는 Git에서 제외되는 `apps/backend/.dev.vars`에 저장합니다. 시크릿은 저장소에 커밋하지 않습니다. 시크릿이 없으면 로그인 버튼은 준비 중으로 표시되고 인증 요청은 503을 반환합니다.

로그인은 Authorization Code + PKCE(S256)를 사용합니다. D1의 10분 만료 상태와 HttpOnly 쿠키를 비교하고, 상태를 한 번만 사용합니다. Google JWKS로 ID 토큰의 RS256 서명, 발급자, 클라이언트 ID, 만료, nonce, 이메일 인증 여부를 검증합니다. Google 사용자 식별은 이메일 대신 `sub`를 사용합니다. Google 액세스 토큰이나 리프레시 토큰은 저장하지 않습니다.

| 권한 | 가능한 작업 |
| --- | --- |
| 열람자 (`reader`) | 발행된 글 열람, 본인 프로필, 로그아웃 |
| 작성자 (`author`) | 열람자 기능, 글 작성, 본인 글 임시저장·발행·수정·발행 취소, 이미지 업로드 |
| 관리자 (`admin`) | 작성자 기능, 다른 작성자의 글 수정, 열람자·작성자·관리자 명단 검색 및 권한 변경, 계정 이용 중지·해제 |

새 Google 계정은 기본적으로 열람자입니다. `BOOTSTRAP_ADMIN_EMAIL`에 지정한 `ryansong0805@gmail.com`은 최초 가입 시에만 관리자 권한으로 생성됩니다. 기존 계정은 로그인할 때 권한을 다시 승격하지 않습니다. 최초 관리자 로그인 후 해당 환경 변수를 제거해도 계정 권한은 유지됩니다. 먼저 가입한 사용자를 자동으로 관리자로 지정하지 않습니다.

기존 이메일/비밀번호 계정과 이메일이 같아도 자동 연결하지 않습니다. 해당 계정으로 먼저 로그인하고 프로필의 Google 계정 연결을 사용해야 하며, 동일 이메일의 Google 계정만 연결할 수 있습니다. 기존 계정이 최초 관리자 이메일을 사용한다면 기존 관리자로 로그인한 뒤 연결합니다.

작성자와 관리자는 로그인 직후 글쓰기 화면으로 이동합니다. 프로필과 상단 메뉴에서 글 쓰기·나의 글·멤버 관리에 접근할 수 있습니다. 권한은 모든 API 요청에서 D1 세션과 현재 사용자 정보로 다시 검사합니다. 관리자는 본인의 권한을 변경하거나 본인을 중지할 수 없으며, 마지막 활성 관리자 제거도 막습니다. 권한 변경은 다음 요청부터 적용되며, 이용 중지 시 세션을 폐기합니다. 명단은 30명 단위로 조회하고 관리자에게만 이메일을 표시합니다.

## 글 작성과 이미지

글은 D1 `posts`에 저장합니다. 제목 최대 160자, 소개 280자, 본문 80,000자이며 본문은 일반 텍스트로 표시해 HTML을 실행하지 않습니다. 초안은 본인과 관리자만 조회할 수 있습니다. 수정 시 `revision`을 비교해 다른 창의 변경을 덮어쓰지 않으며, 발행 취소 시 공개 목록에서 제외합니다. 첫 글 발행 전에는 기존 예시 피드를 표시하고 발행 이후 실제 글을 표시합니다.

작성 중인 글은 해당 사용자·글별로 브라우저에 백업하고, 임시저장 버튼으로 D1에 저장합니다. 글쓰기 화면 이탈이나 창 닫기 전에는 저장하지 않은 변경을 알립니다. 이미지 업로드는 작성자·관리자만 사용할 수 있고 파일 내용과 MIME 형식을 검사합니다. 최대 8MB의 JPG·PNG·WebP를 R2 `posts/{사용자 ID}/{UUID}`에 저장하며 운영 공개 주소는 `https://media.21stark.dev`입니다. 공개 R2의 이미지 URL을 아는 사람은 초안 이미지도 볼 수 있으므로 비공개 문서를 업로드하지 않습니다.

추가 API: `GET /api/auth/providers`, `GET /api/auth/google`, `GET /api/auth/callback/google`, `GET /api/writers`, `GET/POST /api/posts`, `GET/PUT /api/posts/:id`, `POST /api/media`, `GET /api/admin/users`, `PATCH /api/admin/users/:id`.

`npm run test:features`는 실제 workerd·D1·R2와 가짜 Google 제공자를 사용해 서명된 JWT, PKCE, 상태 재사용, 계정 연결, 권한과 글 작성 흐름을 통합 검사합니다. 실제 Google 계정 로그인은 운영 시크릿 및 콜백 등록 후 브라우저에서 별도로 확인합니다.

참고: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [jose JWT 검증](https://github.com/panva/jose).
