# OWASP 재점검 및 운영 적용

기준: 2026-11-16, OWASP Cheat Sheet Series의 Authentication, Session Management, Authorization, File Upload, CSRF, CSP 원칙. 점검은 관련 경로의 코드·회귀 테스트·운영 설정 확인이며 모든 OWASP 항목의 인증이나 완전한 침투 테스트를 의미하지 않습니다.

## 이번에 추가한 보강

- assets.run_worker_first=true: HTML을 포함한 실제 응답이 보안 헤더 코드와 canonical 리다이렉트를 통과하도록 수정.
- 21st-ark.dev를 메인으로 정하고 canonical/og:url/도메인 순서를 변경. 이전 도메인은 308 이동, 진행 중인 이전 OAuth callback은 원래 호스트에서 검증. 도메인 간 인증 쿠키·요청 본문은 전달하지 않음.
- 로고/파비콘은 앱의 /assets로 이동하여 비공개 R2 전환 후에도 정상 표시.
- API/웹 workers.dev 및 미리보기 URL 차단. API는 웹의 service binding으로만 호출.
- 서버에서 권한별 idle/absolute 세션 만료 적용. 관리자 30분/8시간, 작성자 1시간/24시간, 열람자 4시간/7일. 활동 갱신 쓰기는 5분에 한 번 이하로 제한.
- API 오류 로그 활성화. invocation request 로그와 traces는 비활성화하여 OAuth 코드·쿠키를 로그로 수집하지 않음.
- 기존의 최근 인증 일회성, 세션 버전·회전, CSRF/소유권/역할 검사, 문서·링크 검증, R2 용량/픽셀 제한, 계정별 메모리 캐시 격리를 회귀 검증.

## 운영 확인 기록

- Cloudflare API Worker의 공개 Production URL 및 Preview URL 비활성화: 브라우저에서 적용.
- R2 Public Development URL: 기존 비활성 상태 확인.
- R2 `media.21stark.dev` Custom Domain의 Access를 Disabled로 변경. 공개 개발 URL도 Disabled 유지. 기존 객체를 삭제하거나 도메인을 제거하지 않음.
- **R2 Access를 꺼도 기존 이미지가 CDN HIT로 200 응답하는 것을 추가 검사에서 발견.** 이전 도메인 zone에 `http.host eq "media.21stark.dev"` → Block custom rule을 Active로 배포하고 해당 호스트만 Custom Purge 실행. 최종적으로 실제 포스트 이미지의 공개 원본은 403, 같은 이미지의 `/api/media`는 200/private,no-store 확인. 규칙 ID `089914add08a41e79eb83230be78a257`. 이 차단 규칙을 해제하지 말 것. 외부에 이미 복사되거나 브라우저에 저장된 파일은 회수할 수 없음.
- 메인 도메인 WAF Rate limiting `API burst protection` 활성화: `starts_with(http.request.uri.path, "/api/")`, IP당 200 requests/10 seconds 초과 시 10 seconds Block. 무료 제공 한도 안에서 구성했으며 서버의 사용자/작업별 제한과 함께 적용. 운영 부하 테스트로 차단을 고의 유발하지는 않음.
- 두 도메인 모두 SSL/TLS Full (strict), Always Use HTTPS On, Minimum TLS 1.2, TLS 1.3 On 확인. HSTS는 앱 응답에서 max-age=31536000 적용. preload/includeSubDomains는 추가하지 않음.
- 코드 커밋 `04c12e6`의 Cloudflare 연결 빌드 성공 확인. API 빌드 `535ebd95-8a88-45cb-b567-c8ed4b3b280a`는 원격 D1 마이그레이션 후 배포하는 `npm run deploy:backend` 실행. 0014/0015/0016을 포함한 새 API 동작 및 웹 보안 헤더를 운영에서 확인.
- `https://21st-ark.dev/` 200, 실제 HTML CSP/HSTS/DENY/nosniff/canonical 확인. `https://21stark.dev/` 308 → 메인 도메인. API/웹 workers.dev 직접 주소는 각각 404.
- 익명 `/api/auth/me`는 no-store, 공개 포스트 목록은 body/body_doc를 제외한 작은 DTO. 실제 운영 브라우저에서 홈/트렌딩/포스트 이미지가 정상 표시됨을 확인.
- Google 계정 선택 화면과 GitHub 로그인 화면까지 메인 도메인 callback으로 정상 진입. 실제 계정 인증·동의·2FA를 대신 완료하지 않았으므로 제공자 로그인 후 귀환 전체 흐름은 사용자 확인이 필요함.
- 민감한 Cloudflare 스크린샷은 `artifacts/`에 로컬 보관하고 Git에서 제외. 운영 사용자/포스트를 변경하거나 삭제하여 테스트하지 않음.

## 별도 한계

서버의 이미지 전체 디코딩·재인코딩/EXIF 제거는 아직 없으며, 악성 파일 스캔·외부 이미지 처리 서비스를 새로 구매하거나 활성화하지 않았습니다. 현재는 JPG/PNG/WebP만 허용하고 파일 크기·시그니처·치수·저장 한도, 권한 프록시, 고정 Content-Type/nosniff로 방어합니다. 세션 재인증은 연결된 동일 OAuth ID를 검증하며 제공자의 비밀번호/MFA 재입력을 강제하지 않습니다. 법적 문서의 처리 지역·국외 이전 고지는 운영자 검토가 필요합니다.

## 근거

- https://github.com/OWASP/CheatSheetSeries
- https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html
