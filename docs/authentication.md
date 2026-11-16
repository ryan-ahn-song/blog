# 로그인과 권한

로그인은 Google과 GitHub OAuth로 제공합니다. 이메일·비밀번호 로그인은 종료되었으며 `POST /api/auth/login`은 410을 반환합니다. 기존 비밀번호 해시는 마이그레이션 호환을 위해 보존되지만 인증에 사용하지 않습니다. 계정 권한은 OAuth 로그인과 별개로 D1에서 관리합니다.

새 회원은 열람자로 가입합니다. `BOOTSTRAP_ADMIN_EMAIL`과 인증된 이메일이 같은 신규 계정은 최초 가입 시 관리자 권한을 받습니다. 기존 계정의 권한은 다시 승격하지 않습니다. 작성자 지정은 관리자 전용 멤버 관리에서 처리합니다. 로그인 세션은 해시로 D1에 저장하고, 브라우저 쿠키에는 HttpOnly·SameSite=Lax·운영 Secure를 적용합니다.

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

이메일이 같더라도 서로 다른 소셜 계정을 자동 연결하지 않습니다. 기존에 연결한 서비스로 로그인한 뒤 더 보기 → 계정 및 설정에서 같은 인증 이메일의 다른 계정을 연결합니다. 소셜 연결이 없는 기존 비밀번호 전용 계정은 이메일 로그인 종료로 관리자 확인을 거친 별도 복구가 필요합니다.

작성자와 관리자는 로그인 직후 글쓰기 화면으로 이동합니다. 프로필과 상단 메뉴에서 글 쓰기·나의 글·멤버 관리에 접근할 수 있습니다. 권한은 모든 API 요청에서 D1 세션과 현재 사용자 정보로 다시 검사합니다. 관리자는 본인의 권한을 변경하거나 본인을 중지할 수 없으며, 마지막 활성 관리자 제거도 막습니다. 권한 변경은 다음 요청부터 적용되며, 이용 중지 시 세션을 폐기합니다. 명단은 30명 단위로 조회하고 관리자에게만 이메일을 표시합니다.

## 글 작성과 이미지

글은 D1 `posts`에 저장합니다. 제목 최대 160자, 소개 280자, 본문 80,000자이며 본문은 일반 텍스트로 표시해 HTML을 실행하지 않습니다. 초안은 본인과 관리자만 조회할 수 있습니다. 수정 시 `revision`을 비교해 다른 창의 변경을 덮어쓰지 않으며, 발행 취소 시 공개 목록에서 제외합니다. 홈·검색·필자·저장한 글은 실제 DB 조회 결과만 표시하며, 글이 없는 경우 빈 상태를 표시합니다.

작성 중인 글은 해당 사용자·글별로 브라우저에 백업하고, 임시저장 버튼으로 D1에 저장합니다. 글쓰기 화면 이탈이나 창 닫기 전에는 저장하지 않은 변경을 알립니다. 이미지 업로드는 작성자·관리자만 사용할 수 있고 파일 내용과 MIME 형식을 검사합니다. 최대 8MB의 JPG·PNG·WebP를 R2 `posts/{사용자 ID}/{UUID}`에 저장하며 운영 공개 주소는 `https://media.21stark.dev`입니다. 공개 R2의 이미지 URL을 아는 사람은 초안 이미지도 볼 수 있으므로 비공개 문서를 업로드하지 않습니다.

추가 API: `GET /api/auth/providers`, `GET /api/auth/google`, `GET /api/auth/callback/google`, `GET /api/writers`, `GET/POST /api/posts`, `GET/PUT /api/posts/:id`, `POST /api/media`, `GET /api/admin/users`, `PATCH /api/admin/users/:id`.

프로필의 표시 이름·소개는 `PATCH /api/auth/profile`로 본인 계정에 저장합니다. 이름이나 소개를 바꾸어도 권한과 이메일은 변경할 수 없습니다. 좋아요와 북마크는 로그인한 사용자만 `PUT /api/posts/:id/like`, `PUT /api/posts/:id/bookmark`로 변경합니다. 요청의 `active` 값으로 상태를 지정해 재시도해도 중복 행을 만들지 않습니다. 저장한 글은 `GET /api/posts?bookmarked=1`로 현재 사용자만 조회하며, 다른 기기에서도 같은 계정으로 조회합니다. 이전 목업용 브라우저 저장 값은 사용하지 않습니다.

검색(`q`)·필자(`author`)·분류(`category`)·주제(`topic`)·페이지(`page`)는 D1에서 전체 글에 적용합니다. 주제 목록과 실제 발행 글 수는 `GET /api/topics`로 제공하고, 편집기의 선택값은 `posts.topic_ids`에 저장합니다. 인기 관심사는 발행 글 수를 기준으로 표시하며 초안을 포함하지 않습니다. 필자 목록에는 활성 작성자·관리자의 실제 이름·소개·발행 글 수만 표시하고, 글이 없는 필자도 조회합니다. 임의의 직업 소개나 썸네일 이미지는 표시하지 않습니다.

`npm run test:features`는 실제 workerd·D1·R2와 가짜 Google 제공자를 사용해 서명된 JWT, PKCE, 상태 재사용, 계정 연결, 권한과 글 작성 흐름을 통합 검사합니다. 실제 Google 계정 로그인은 운영 시크릿 및 콜백 등록 후 브라우저에서 별도로 확인합니다.

참고: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [jose JWT 검증](https://github.com/panva/jose).


## Writer profiles

`GET /api/writers/:id` returns public display name, bio, avatar/cover URLs and the number of published posts. It never returns email, roles, password hashes or session information. Active writers are public; readers without published posts can view their own profile only. Suspended accounts are hidden. Published posts are loaded through `GET /api/posts?author=:id`; drafts stay in the existing private editor flow.

Profile pages use `/#writer-:id` links. Writer names and avatars, writer cards and the signed-in sidebar avatar open these pages. The standalone profile-management sidebar shortcut has been removed. The owner can edit the page; account settings and logout remain accessible through the page's account button.

Migration `0004_writer_profiles.sql` adds nullable `avatar_key` and `cover_key` fields. Image uploads use `POST /api/media?purpose=avatar|cover` and are stored under `profiles/{userId}/{purpose}-{uuid}.{ext}` in R2. Readers may upload profile images without gaining post-writing permissions. The existing MIME/signature checks, 8 MB size limit, CSRF protection and upload rate limit apply. `PATCH /api/auth/profile` checks image ownership, image purpose, object existence and profile version before saving. Removing an image clears its profile reference. Local development uses the local D1/R2 stores and `/api/media/` URLs.


## Block documents

Migration `0005_block_documents.sql` adds `posts.body_format` (`plain` or `markdown`) and nullable `posts.body_doc` (BlockNote JSON). Existing posts remain `plain`. The block editor stores Markdown in `body` for search and export, together with the full JSON document for lossless editing and reading. Both fields are saved in the same D1 insert/update and share the existing revision guard and author/admin ownership rules. The API bounds document size, nesting and node counts, checks supported block/inline types and rejects unsafe link/image protocols and duplicate block IDs. Plain-text clients may continue to omit the new fields.

The editor loads on demand, with article settings on the left and the document canvas on the right. Supported blocks include paragraphs, headings, lists, checklists, toggles, quotes, code, dividers, tables and images. BlockNote provides the slash menu, block dragging, selection formatting, Markdown input rules and undo/redo. Markdown source editing and `.md` import/export are also available. Editing Markdown source reparses the document; untouched source/preview switches preserve the original block structure. Inline images use the same authenticated R2 upload endpoint and limits as cover images. The reader renders the stored block document as read-only; older text posts retain their original text layout.

References: [BlockNote React](https://www.blocknotejs.org/docs/react/overview), [durable document formats](https://www.blocknotejs.org/docs/foundations/supported-formats).


## Inline image uploads

The document toolbar's image button supports multiple files (up to ten per selection), and BlockNote's image blocks also support file drop/paste. Uploads go through authenticated `POST /api/media` to the R2 binding; no storage credentials are sent to the browser. JPG/PNG/WebP files are limited to 8 MB each and checked for MIME type, signature, CSRF and author/admin permissions. The editor queues uploads so a batch does not create many simultaneous Worker buffers. Saving is disabled until queued uploads finish.

The upload response includes `key`, display `url` and the stable `source` path `/api/media/posts/{userId}/{uuid}.{ext}`. Inline blocks and their Markdown reference the stable path, preserving image references across local development, aliases and media-domain changes. Managed image URLs are normalized to that path on save; the API checks ownership, object existence and a maximum of fifty managed images per document. Captions, ordering and image dimensions remain in the block JSON. Markdown downloads expand image paths to absolute site URLs.

Local media requests serve the uploaded bytes from local R2. In production the same stable endpoint verifies the object and redirects to the configured `MEDIA_BASE_URL` (currently `https://media.21stark.dev`), allowing R2's custom-domain cache to serve the binary. The redirect is cacheable for one hour; object keys are unique and the objects retain immutable cache metadata. This is a public-image model: knowledge of an image URL permits access even if the containing post is a draft. Deleting a block only removes its document reference; physical R2 deletion is deferred so undo and other references remain valid. Automatic unreferenced-object cleanup is not yet implemented.


## Writer subscriptions and trending

Migration `0006_writer_subscriptions.sql` stores subscriber/writer pairs with unique constraints, foreign-key cleanup and a self-subscription check. Any active signed-in account can subscribe or unsubscribe through `PUT /api/writers/:id/subscription` with `{active: boolean}`. Writes validate the request origin and target, enforce a per-account rate limit and are idempotent. Disabled/private unpublished-reader targets cannot be newly subscribed.

`GET /api/subscriptions` is private to the session user and returns public writer details plus each subscribed writer's latest published post. It excludes suspended writers and never returns email or account roles. `GET /api/posts?subscribed=1` returns the existing paginated post feed restricted to the current user's subscriptions; drafts remain private. The right sidebar shows up to six subscribed writers, ordered by latest publication, and links to the full subscription feed. Subscribe controls live on other writers' profile pages.

`GET /api/trending` ranks topics by published-post count over the past seven days, then by latest publication and catalog order. Drafts, older posts and suspended writers do not contribute. The page header now keeps search, the current writer's posts and writing actions; member management remains available through the existing account/admin flow. The old sidebar author directory and footer links/copyright block have been removed.


## Author dashboard and reading analytics

Migration `0007_post_reads.sql` stores a hashed visitor identity, Korean calendar date, timestamps and deduplicated view count per post/day. `POST /api/posts/:id/view` is called when the reader opens an uploaded post. It validates the request origin and JSON body, excludes drafts, suspended authors, the post's own author, obvious bots and DNT/GPC requests. Logged-in readers are identified by a hash of their account ID; other readers use a random first-party visitor cookie (`HttpOnly`, `SameSite=Lax`, secure `__Host-` cookie in production, rolling 30-day expiry). Raw IP addresses, user agents and emails are not stored in reading records. Anonymous visitors who later log in, or use different browsers, may be counted separately.

Within each Korean calendar day, a repeat open by the same identity is counted as a new view after a gap of at least 30 minutes. The first open of a new day starts a new daily count. Reader counts are distinct identities, not completed-reading confirmations. Dashboard totals deduplicate identities across multiple posts, while the daily chart deduplicates within each Korean day. Tracking starts when this feature is enabled; earlier traffic is not reconstructed. Post deletion removes reading rows via the foreign key.

`GET /api/author/dashboard` requires an active author/admin session and always scopes every query to that account's own posts, including for administrators. It provides 7/28/90-day reader/view totals, current saves and likes, a daily visitor series, draft/uploaded counts, searchable/status-filtered paginated posts, and each post's lifetime reader/save/like counts plus a 14-day sparkline. Saved counts use the existing account bookmarks and exclude suspended accounts. Status/search/order affect the post list; the summary and chart cover all of the author's posts. Historical readings remain visible when a post is moved back to draft.

The dashboard loads when opened or its filters change, and offers a manual refresh control. It does not poll or refresh when returning to the tab. It cancels obsolete requests, does not overlap refresh requests and only renders data for the current session owner. The list has a full-post fetch before editing, preserving stored block documents. The duplicate new-post button has been removed.


## Account menu and public profile statistics

The rail More menu opens account settings, local reading preferences and help. Member management is visible to administrators only; the API still enforces administrator access. Sign-out uses the existing POST endpoint and preserves the unsaved-editor confirmation. The public profile no longer has a separate Account button.

`GET /api/auth/account` requires a current session and returns only that account, Google/GitHub linkage and provider configuration availability. It does not return Google subjects, password hashes or credentials, and ignores caller-supplied account selectors.

Public writer details include `total_views`, the sum of recorded views across currently published posts by that writer. Unpublished posts and raw reader identifiers are excluded from this public response. Counts begin with the first-party read tracking feature; historical traffic is not synthesized.

Cover guidance is 1500 x 500 pixels (3:1), and avatar guidance is 400 x 400 pixels (1:1, shown in a circle). Both use existing authenticated R2 uploads and the revision-checked profile-save endpoint. Recommendations do not reject other dimensions. Reading font size, article width and reduced motion are stored in this browser only.


## GitHub OAuth 설정

GitHub OAuth App의 Homepage URL은 `https://21stark.dev`로 등록합니다. 콜백 URL은 필요한 환경을 모두 추가합니다.

| 환경 | 서비스 URL | GitHub 콜백 | Google 콜백 |
|---|---|---|---|
| 로컬 | `http://127.0.0.1:3000` | `http://127.0.0.1:3000/api/auth/callback/github` | `http://127.0.0.1:3000/api/auth/callback/google` |
| 운영 | `https://21stark.dev` | `https://21stark.dev/api/auth/callback/github` | `https://21stark.dev/api/auth/callback/google` |
| 추가 도메인 | `https://21st-ark.dev` | `https://21st-ark.dev/api/auth/callback/github` | `https://21st-ark.dev/api/auth/callback/google` |

로컬은 `.dev.vars`에 `GITHUB_CLIENT_ID`와 `GITHUB_CLIENT_SECRET`을 저장합니다. 운영 배포 시 API Worker에 같은 이름의 설정을 추가해야 하며, 시크릿은 반드시 Secret 형식으로 설정합니다. 현재 작업에서는 운영 배포나 운영 설정 변경을 하지 않습니다. 인증 요청은 접속 중인 허용 도메인의 콜백 주소를 명시합니다. 콜백 URL 와일드카드는 필요하지 않습니다.

`0008_github_login.sql`은 GitHub 사용자 ID 연결과 10분 만료 OAuth 상태를 별도 테이블에 보관합니다. state는 단일 사용이며 HttpOnly 쿠키·origin에 바인딩하고 PKCE S256을 사용합니다. 토큰은 서버에서만 교환하며 저장하거나 브라우저에 반환하지 않습니다. 최소 읽기 권한 `read:user user:email`로 사용자 ID와 인증된 기본 이메일을 확인합니다. 비공개 이메일도 지원하며, 인증되지 않은 이메일은 거절합니다. GitHub 이름·이메일만으로 기존 계정을 자동 병합하지 않습니다. 연결은 기존 계정의 인증 세션과 같은 이메일을 요구합니다.

참고: [GitHub OAuth App 등록](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app), [OAuth 인증과 PKCE](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [인증된 이메일 조회](https://docs.github.com/en/rest/users/emails).

## 글 삭제

내 글 관리의 삭제 버튼은 확인 후 `DELETE /api/posts/:id`로 현재 `revision`을 보냅니다. 작성자 본인과 관리자만 삭제할 수 있고, 버전 충돌은 409를 반환합니다. 삭제한 글의 좋아요·북마크·조회 기록은 외래키로 함께 제거합니다. R2 이미지는 다른 글에서 재사용할 수 있어 자동 삭제하지 않습니다. 작업 중인 브라우저 백업은 해당 글의 키만 지웁니다.


## 필자별 개인 분류와 태그

전체 분류(`topics`)는 공용 탐색 기준으로 유지합니다. 필자는 자신의 글에 개인 분류 하나와 태그 최대 10개를 별도로 지정할 수 있습니다. 이름은 필자별로 독립적이며, 개인 분류는 50개, 태그는 200개까지 관리합니다. 개인 분류 이름은 40자, 태그 이름은 30자까지이고 공백·태그 접두사·Unicode 표기를 정규화해 중복을 막습니다.

`0009_writer_taxonomy.sql`은 `writer_labels`, `post_writer_labels`와 소유권·분류 개수 제약을 추가합니다. 복합 외래키로 글과 라벨의 필자가 같음을 검사하며, 부분 유일 인덱스로 글당 개인 분류 하나를 보장합니다. 글 본문과 라벨 연결은 하나의 D1 batch로 저장합니다. 요청마다 임의 write token을 사용해 revision 충돌 시 라벨만 덮어쓰는 일을 막습니다. 이 내부 토큰은 API 응답에 포함하지 않습니다.

- `GET /api/writers/:id/taxonomy`: 업로드된 글에 사용된 분류·태그와 공개 글 수.
- `GET /api/writers/:id/taxonomy?scope=manage`: 소유자 또는 관리자가 빈 항목·초안용 항목까지 조회.
- `POST /api/writers/:id/taxonomy`: 본인의 분류 또는 태그 생성 (`kind`, `name`).
- `PATCH /api/writers/:id/taxonomy/:labelId`: 본인 항목의 이름 변경.
- `DELETE /api/writers/:id/taxonomy/:labelId`: 본인 항목을 삭제하고 글에서 해제. 글과 전체 분류는 유지.
- 글 저장의 `writer_category_id`와 `writer_tag_ids`: 명시하면 교체하며, 기존 클라이언트가 필드를 생략하면 현재 값을 유지.
- `GET /api/posts?author=:id&writer_category=:categoryId&writer_tag=:tagId`: 한 필자의 개인 분류·태그 교집합으로 필터링. 초안은 공개되지 않음.

프로필 오른쪽에서 분류와 태그별로 탐색하고, 소유자에게만 관리 버튼을 제공합니다. 글쓰기에서 분류·태그를 바로 만들 수 있습니다. 이름 변경은 같은 ID를 사용하는 모든 글에 반영됩니다. 공용 검색도 공개 글에 지정된 개인 분류·태그 이름을 찾습니다. `npm run test:taxonomy`는 권한, 초안 노출 방지, 이름 충돌, 검색·필터·카운트, DB 제약, 이름 변경·삭제와 revision 충돌의 원자성을 검사합니다.


## 글 읽기 화면

`#post-:id`는 왼쪽 공통 메뉴와 상단 메뉴를 유지한 전체 본문 화면으로 표시합니다. 글을 모달로 열지 않으며 읽기 중에도 사이드 메뉴로 다른 페이지에 이동할 수 있습니다. 제목·필자·대표 이미지·블록 본문·개인 분류와 태그, 좋아요·저장·공유를 표시하고 기존 권한에 따라 글 수정 버튼을 제공합니다. 읽기 설정의 본문 크기와 너비를 유지합니다.

목록에서 글을 열 때 현재 탐색 조건과 스크롤을 브라우저 history에 저장하고, 목록 DOM을 숨긴 채 보존합니다. 화면의 뒤로 버튼과 브라우저 뒤로·앞으로 이동은 검색어·주제·개인 분류/태그 필터와 스크롤 위치를 복원합니다. 직접 링크 진입 시에도 같은 본문 화면을 제공하고, 이전 목록이 없다면 필자의 프로필로 돌아갑니다. 요청 순서 토큰으로 이전 글의 늦은 응답이 현재 화면을 덮어쓰지 못하게 합니다. 읽기 실패는 본문 화면 안에 재시도·뒤로 가기를 제공합니다.


## 댓글

`0010_post_comments.sql`은 글·댓글 작성자와 연결된 댓글 본문, revision과 작성·수정 시각을 저장합니다. 글 읽기 화면 아래에서 댓글 수, 최신 댓글, 작성란과 수동 새로고침·더 보기를 제공합니다. 자동 폴링은 하지 않습니다.

- `GET /api/posts/:id/comments`: 공개 글의 댓글을 최신순으로 20개씩 조회. `next_cursor`를 다음 요청의 `cursor`로 전달합니다. 작성 시각과 ID로 정렬해 같은 시각의 댓글도 빠뜨리거나 중복하지 않습니다.
- `POST /api/posts/:id/comments`: 로그인한 열람자·작성자·관리자가 `body`로 댓글을 등록합니다. 본문은 최대 3,000자이며 HTML을 실행하지 않는 일반 텍스트입니다.
- `PATCH /api/posts/:id/comments/:commentId`: 본인만 `body`, `revision`으로 수정합니다. 관리자는 다른 사용자의 댓글을 대신 수정할 수 없습니다.
- `DELETE /api/posts/:id/comments/:commentId`: 본인 또는 관리자가 `revision`으로 삭제합니다. 변경된 버전에 대한 요청은 409로 거절합니다.

초안, 없는 글과 이용 중지된 필자의 댓글은 공개·작성되지 않습니다. 이용 중지된 사용자의 댓글은 목록과 댓글 수에서 제외합니다. 댓글 작성자 응답에는 ID·이름·프로필 이미지 주소만 포함하며 이메일·권한은 노출하지 않습니다. 수정·삭제 가능 여부는 현재 세션에 맞게 계산합니다. 모든 변경은 Origin 검사와 인증을 거치고, 사용자당 15분에 60회로 제한합니다. 글 삭제 시 댓글도 외래키로 함께 삭제됩니다.

본문에서 로그인을 시작하면 현재 글 ID와 시각만 세션 저장소에 임시 기록해, 로그인 성공 후 30분 이내의 해당 글로 복귀합니다. 인증 실패 창을 닫으면 이 복귀 정보도 지웁니다. `npm run test:comments`는 댓글 권한·충돌·공개 범위·본문 길이·페이지 나누기·요청 제한을 실제 workerd/D1 환경에서 검사합니다.
